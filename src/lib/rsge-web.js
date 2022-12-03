const fetch = require('node-fetch');
const moment = require('moment');
const uuid = require('uuid');

const bus = require('./bus');

const LOGIN_URL = 'https://eservices.rs.ge/Login.aspx';
const AUTH_URL = 'https://eservices.rs.ge/WebServices/hsUsers.ashx';
const REDIRECT_URL = 'https://eservices.rs.ge/Redirect.ashx?Module=';

const API_URL = 'https://decl.rs.ge/sys_service.asmx';

const DEFAULT_HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
}

const ERRORS = {
    'დადასტურების კოდი არ არის სწორი. ': 'Invalid pin code'
};

class RSGE {
    constructor(key, secret) {
        this.key = key;
        this.secret = secret;
    }

    async authenticate() {
        if (!this.key && !this.secret) {
            throw new Error('key or secret is not provided');
        }

        // Starting a new web session
        let res = await fetch(LOGIN_URL);
        const cookies = res.headers.raw()['set-cookie'][0];
        if (!cookies) {
            console.warn('headers', res.headers.raw())
            throw new Error('unable to extract cookies');
        }

        // Extract main session id
        this.__sessionId = this.__extractSessionId(cookies);

        if (!this.__sessionId) {
            throw new Error('unable to extract main session id');
        }

        const pageId = uuid.v4();

        // Login
        res = await fetch(`${AUTH_URL}/Authenticate`, {
            method: 'POST',
            headers: this.__getHeaders(this.__sessionId),
            body: JSON.stringify({
                username: this.key,
                password: this.secret,
                SessionID: this.__sessionId,
                PageID: pageId,
                pageID: pageId,
                check: '0',
                screen: '2048',
                vcode: null,
                latitude: '',
                longitude: ''
            })
        });

        let data = await res.json();

        if (data.d.AuthenticationStep !== 1 || data.d.secretWord !== 1) {
            console.warn('auth response', data);
            throw new Error('unexpected authentication flow');
        }

        // PIN
        const pin = await bus.Prompt('Код из СМС');
        if (!pin) {
            throw new Error('pin is required');
        }

        res = await fetch(`${AUTH_URL}/ConfirmAuthenticate`, {
            method: 'POST',
            headers: this.__getHeaders(this.__sessionId),
            body: JSON.stringify({
                confirmText: pin,
                SessionID: this.__sessionId,
                PageID: pageId,
                pageID: pageId,
                check: '0',
                os: 'Linux',
                browser: 'Chrome',
                address: 'Error : User denied the request for Geolocation.',
                vcode: null
            })
        });

        data = await res.json();
        if (getError(data.d)) {
            throw new Error(getError(data.d));
        }

        if (!data.d?.userToken) {
            console.warn('auth token response', data);
            throw new Error('unable to get token');
        }
        this.__token = data.d.userToken;

        // Redirect to declaration module and obtain new sessionId
        const loc = await this.getDeclarationAppURL();

        res = await fetch(loc, {
            method: 'GET',
            redirect: 'manual',
            // headers: this.__getHeaders(sessionId),
        });

        const declCook = res.headers.raw()['set-cookie'][0];
        if (!declCook) {
            console.warn('headers', res.headers.raw())
            throw new Error('unable to extract DECL cookies');
        }

        // Extract session id
        this.__declSessionId = this.__extractSessionId(declCook);
    }

    async getDeclarationAppURL() {
        if (!this.__sessionId) {
            await this.authenticate();
        }

        const res = await fetch(`${REDIRECT_URL}DECL`, {
            method: 'GET',
            redirect: 'manual',
            headers: this.__getHeaders(this.__sessionId),
        });

        if (res.status !== 302 && res.status !== 301) {
            console.warn('DECL redirect headers', res.headers.raw());
            throw new Error('unable to obtain DECL session');
        }

        const loc = res.headers.get('location');
        if (!loc) {
            console.warn('DECL redirect headers', res.headers.raw());
            throw new Error('DECL redirect URL is not found');
        }

        return loc;
    }

    async getDeclarations(ts) {
        if (!this.__sessionId) {
            await this.authenticate();
        }

        const res = await this.__request('POST', 'get_grid_r_data', {
            grid_id: 3,
            page_size: 1000,

            // Not a typo!
            curent_page: 1,

            guid: uuid.v4(),
            order_by: [{
                x_name: 'warm_tar',
                sord_direction: '2',
                sort_priority: '2'
            }],
            filters: [
                {x_name: 'gad_kod', value: '58', filter_type: '0'},
                {x_name: 'sag_periodi', value: moment(ts).format('yyyyMM'), filter_type: '0'},
                {x_name: 'tax_type', value: '1', filter_type: '0'}
            ]
        });

        return res.list
            .map((item) => {
                return {
                    id: item.DOC_MOS_NOM,
                    status: item.STATUS,
                    tin: item.SEND_USER,
                    date: item.WARM_TAR.split(' ')[0],
                    period: item.SAG_PERIODI,
                    amount: item.DAR
                };
            });
    }

    async submitDeclaration() {
        // POST https://decl.rs.ge/sys_service.asmx/save_object
        // { 'obg' : '{"kscs":{"c_id":253,"kscs":[{"c_id":254,"kscs":[],"ROW":{"SEQ_NUM":"49716581","COL_15":"105612.61","COL_16":"1","COL_17":"16583.01","COL_18_TYPE":"2","COL_18":"0.00","COL_19":"165.83","COL_21":"[CDATA[data]]"}}],"ROW":{"SEQ_NUM":"49716581","DAR":"165.83","SHEM":"0","STOP_WORK":"[CDATA[data]]","STOP_STID":"0"}}}' }
    }

    async __request(method, path, body) {
        if (!this.__sessionId) {
            await this.authenticate();
        }

        return await fetch(`${API_URL}/${path}`, {
            method: method,
            headers: this.__getHeaders(this.__declSessionId),
            body: JSON.stringify(body)
        })
        .then(async (res) => {
            const txt = await res.text();
            let data;
            try {
                data = JSON.parse(txt);
            } catch(err) {
                console.warn(`${API_URL}/${path}`, txt);
                throw new Error(`Unexpected response for API/${path}`)
            }

            if (!data.d) {
                console.warn(`${API_URL}/${path}`, txt);
                throw new Error(`Invalid response for ${path}: ${data.Message}`)
            }

            let out;
            try {
                out = JSON.parse(data.d);
            } catch(err) {
                console.warn(`${API_URL}/${path}`, data.d);
                throw new Error(`Unexpected response for API/${path}.d object`)
            }

            if (getError(out)) {
                console.warn(`${API_URL}/${path}`, txt);
                throw new Error(`Unexpected response for ${path}: ${getError(out)}`)

            }

            return out;
        });
    }

    __extractSessionId(cookies) {
        let res = '';
        cookies
            .split(';')
            .forEach((item) => {
                const d = item.split('=').map((v) => v.trim());
                if (d.length === 2 && d[0] === 'ASP.NET_SessionId') {
                    res = d[1];
                }
            });

        return res;
    }

    __resetToken() {
        this.__token = '';
        this.__sessionId = '';
        this.__declSessionId = '';
    }

    __getHeaders(sessionId) {
        return {
            ...DEFAULT_HEADERS,
            // 'Authorization': `bearer ${this.__token}`,
            'Cookie': `ASP.NET_SessionId=${sessionId}`
        };
    }
}

function getError(d) {
    if (!d || typeof d !== 'object') {
        return 'Invalid response';
    }

    return ERRORS[d.ErrorText];
}

module.exports = RSGE;
