const {ipcMain, dialog} = require('electron');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const moment = require('moment');
const puppeteer = require('puppeteer');

const store = require('./lib/store');
const NBG = require('./lib/nbg');
const BOG = require('./lib/bog');
const RSGE = require('./lib/rsge-web');

let nbg, bog, rsge;

ipcMain.handle('ndoc.GetCurrencyRates', async (ev, date) => {
    return await nbg.getRates(moment(date));
});

ipcMain.handle('ndoc.LoadTransactions', async (ev, gte, lte) => {
    const settings = store.get('settings');
    switch (settings.bankId) {
        case 'bog':
            let res = [];
            for (acc in settings.accounts) {
                let data = await bog.getStatement(settings.accounts[acc], gte, lte);
                res = res.concat(data);
            }

            return res;
    }

    throw new Error(`Unknown bankId ${bankId}`);
});

ipcMain.handle('ndoc.PayTax', async (ev, val, msg) => {
    const settings = store.get('settings');
    switch (settings.bankId) {
        case 'bog':
            return await bog.payTax(settings.tin, settings.payAccount, val, msg);
    }

    throw new Error(`Unknown bankId ${bankId}`);
});

ipcMain.handle('ndoc.GetBalance', async (msg) => {
    const settings = store.get('settings');
    switch (settings.bankId) {
        case 'bog':
            return await bog.getBalance(settings.payAccount);
    }

    throw new Error(`Unknown bankId ${bankId}`);
});

ipcMain.handle('ndoc.GetDeclarations', async (ev, period) => {
    const data = await rsge.getDeclarations(period);

    return data;
});

ipcMain.handle('ndoc.InitClients', async (ev) => {
    const settings = store.get('settings');
    nbg = new NBG();
    bog = new BOG(settings.bankLogin, settings.bankPassword);
    rsge = new RSGE(settings.rsLogin, settings.rsPassword);
});

ipcMain.handle('ndoc.OpenDeclarations', async (ev) => {
    try {
        const url = await rsge.getDeclarationAppURL();

        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null
        });

        const page = await browser.newPage();
        await page.goto(url, {waitUntil: 'networkidle0'});
        await page.evaluate(() => {
            change_lang_h();
        }, {waitUntil: 'networkidle0'});
    } catch(err) {
        throw new Error(err);
    }
});
