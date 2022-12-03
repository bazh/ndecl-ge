const fetch = require('node-fetch');
const moment = require('moment');
const uuid = require('uuid');

const bus = require('./bus');


const API_URL = 'https://eapi.rs.ge';

const CURRENCIES = [
    'usd',
    'eur',
    'gel',
    'rub'
];

class RSGE {
    constructor(key, secret) {
        this.key = key;
        this.secret = secret;
    }

    async authenticate() {
        if (!this.key && !this.secret) {
            throw new Error('key or secret are not provided');
        }

        return await fetch(`${API_URL}/Users/Authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                USERNAME: this.key,
                PASSWORD: this.secret,
            })
        })
        .then(async (res) => {
            const data = await res.json();

            if (data.STATUS.ID !== 0) {
                throw new Error(`${data.STATUS.TEXT} (Code: ${data.STATUS.ID})`);
            }

            const pin = await bus.Prompt('Код из СМС');
            return {
                pin: pin,
                token: data.DATA.PIN_TOKEN
            }
        })
        .then((data) => {
            console.log({
                PIN: data.pin,
                PIN_TOKEN: data.token,
            })
            return fetch(`${API_URL}/Users/AuthenticatePin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    PIN: data.pin,
                    PIN_TOKEN: data.token,
                })
            })
        })
        .then((res) => {
            return res.json();
        })
        .then((res) => {
            console.log(res);
        });
    }

    __resetToken() {
        this.__token = '';
    }

    async __request( method, path, body) {
        const headers = new fetch.Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Authorization', `bearer ${this.__token}`);

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

module.exports = RSGE;
