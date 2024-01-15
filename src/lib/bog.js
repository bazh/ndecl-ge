const fetch = require('node-fetch');
const moment = require('moment');
const uuid = require('uuid');

const bus = require('./bus');


const API_URL = 'https://api.businessonline.ge/api';
const AUTH_URL = 'https://account.bog.ge/auth/realms/bog/protocol/openid-connect/token';

const PAGE_SIZE = 1000;

const CURRENCIES = [
    'usd',
    'eur',
    'gel',
    'rub'
];

// Unified treasury code - budget tax
const TREASURY_BENEFICIARY_NAME = 'ერთიანი სახაზინო კოდი - საბიუჯეტო გადასახადი';
const TREASURY_BANK_CODE = 'TRESGE22';
const TREASURY_TAX_CODE = '101001000';

class BOG {
    constructor(key, secret) {
        this.key = key;
        this.secret = secret;
    }

    async authenticate() {
        if (!this.key && !this.secret) {
            throw new Error('key or secret are not provided');
        }

        const headers = new fetch.Headers();
        headers.append('Content-Type', 'application/x-www-form-urlencoded');
        headers.append('Authorization', 'Basic ' + Buffer.from(`${this.key}:${this.secret}`).toString('base64'))

        return await fetch(AUTH_URL, {
            method: 'POST',
            headers: headers,
            body: 'grant_type=client_credentials'
        })
        .then(async (res) => {
            const data = await res.json();
            if (data.error) {
                throw new Error(data.error_description || data.error);
            }

            this.__token = data.access_token;
            this.__tokenType = data.token_type;

            // Simple token reset after expiration time
            const timeout = (data.expires_in - 10) * 1000;
            this.__timer = setTimeout(this.__resetToken, timeout);
        });
    }

    async payTax(tin, acct, val, comment) {
        if (!comment) {
            throw new Error('Comment is required');
        }

        const data = this.parseAccount(acct)

        const req = [{
            Amount: val,
            Nomination: comment,
            ValueDate: (new Date()).toISOString(),
            SourceAccountNumber: data.account,

            PayerInn: '',

            UniqueId: uuid.v4(),
            DocumentNo: moment().format('YYMMDDhhmm'),

            DispatchType: "BULK",

            BeneficiaryAccountNumber: TREASURY_TAX_CODE,
            BeneficiaryBankCode: TREASURY_BANK_CODE,
            BeneficiaryName: TREASURY_BENEFICIARY_NAME,
            BeneficiaryInn: ''
        }];


        const res = await this.__request('POST', `documents/domestic`, JSON.stringify(req));

        if (!Array.isArray(res) || res.length !== 1) {
            throw new Error(`Something went wrong (create payment action, invalid response): ${JSON.stringify(res)}`);
        }

        if (res[0].ResultCode !== 0) {
            throw new Error(`Something went wrong (create payment action, ResultCode): ${JSON.stringify(res)}`);
        }

        const docKey = res[0].UniqueKey;
        if (!docKey) {
            throw new Error(`Something went wrong (create payment action, UniqueKey): ${JSON.stringify(res)}`);
        }

        await this.signDoc(docKey);

        return docKey;
    }

    async requestOtp(docKey) {
        const res = await this.__request('POST', `otp/request`, {
            ObjectKey: docKey,
            ObjectType: 0
        });

        const pin = await bus.Prompt('Код из СМС');
        if (!pin) {
            throw new Error('pin is required');
        }

        return pin;
    }

    async signDoc(docKey) {
        const pin = await this.requestOtp(docKey);

        const res = await this.__request('POST', `sign/document`, {
            ObjectKey: docKey,
            Otp: pin
        });
    }

    async getBalance(acc) {
        const data = this.parseAccount(acc)
        const res = await this.__request('GET', `accounts/${data.account}/${data.currency}`);

        return res.AvailableBalance;
    }

    async getStatement(acc, gte, lte) {
        const data = this.parseAccount(acc)
        const res = await this.__request('GET', `statement/${data.account}/${data.currency}/${gte}/${lte}`);

        if (res.Count === 0 ) {
            return [];
        }

        let items = res.Records.map(formatStatementItem);

        if (res.Count > PAGE_SIZE) {
            const __getStatementPage = async function(id, page) {
                const res = await this.__request('GET', `statement/${data.account}/${data.currency}/${id}/${page}`);
                return res.map(formatStatementItem);
            }

            let pres = [];
            let page = 2;
            while (page !== 0) {
                pres = await __getStatementPage(req.Id, page);
                if (pres.length) {
                    items = items.concat(pres);
                    page++;
                } else {
                    page = 0;
                }
            }
        }

        // Filter out all negative amounts (aka sendings)
        items = items.filter((item) => {
            return item.amount > 0;
        });

        return items;
    }

    close() {
        if (this.__timer) {
            clearTimeout(this.__timer);
        }
    }

    parseAccount(acc) {
        if (!acc) {
            throw new Error('Account number is required');
        }

        if (acc.length <= 3) {
            throw new Error('Invalid account number');
        }

        const cur = acc.slice(-3);
        const acct = acc.slice(0, -3);

        if (CURRENCIES.indexOf(cur.toLowerCase(cur)) === -1) {
            throw new Error(`Invalid currency: ${cur}`);
        }

        return {
            account: acct,
            currency: cur
        };
    }

    __resetToken() {
        this.__token = '';
        this.__tokenType = '';
        clearTimeout(this.__timer);
    }

    async __request( method, path, body) {
        if (!this.__token) {
            await this.authenticate();
        }

        const headers = new fetch.Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Authorization', `${this.__tokenType} ${this.__token}`);

        return await fetch(`${API_URL}/${path}`, {
            method: method,
            headers: headers,
            body: body
        })
        .then((res) => {
            return res.json();
        });
    }
}

function formatStatementItem(item) {
    return {
        date: moment(item.EntryDate).format('yyyy-MM-DD'),
        account: item.BeneficiaryDetails.AccountNumber,
        sender: item.SenderDetails.Name,
        comment: item.DocumentInformation,
        currency: item.DocumentSourceCurrency.toLowerCase(),
        amount: item.EntryAmount
    }

}

module.exports = BOG;
