const util = require('util');
const fetch = require('node-fetch');
const moment = require('moment');

const store = require('./store');

const API_URL = `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?date=%s`

const CURRENCIES = [
    'USD',
    'EUR',
    'RUB'
];

class NBG {
    constructor() {
        this.__store = store;
    }

    setCache(k, v) {
        this.__store.setCache(`NBG_${k}`, v);
    }

    getCache(k) {
        return this.__store.getCache(`NBG_${k}`);
    }

    /**
     * Get currency rate (currency --> GEL) for specified day
     * Original info is taken from National Bank of Georgia
     *
     * @param {Date}   date
     */
    async getRates(date) {
        const strDate = dateToStr(date);

        if (this.getCache(strDate)) {
            return this.getCache(strDate);
        }

        let req, res, parsed;
        try {
            const url = util.format(API_URL, strDate);
            req = await fetch(url);
            res = await req.json();
        } catch(err) {
            throw new Error(`Error getting currency rates for ${strDate}: ${err.toString()}`);
        }

        if (!res[0]?.currencies?.length) {
            throw new Error(`Error getting currency rates for ${strDate}: wrong format of response`);
        }

        const data = {};
        res[0]?.currencies.forEach((v) => {
            if (CURRENCIES.indexOf(v.code) !== -1) {
                const id = v.code.toLowerCase();
                data[id] = v.rate / v.quantity;
            }
        });

        this.setCache(strDate, data);

        return data;
    }
}

function dateToStr(date) {
    return moment(date).format('yyyy.MM.DD');
}

module.exports = NBG;
