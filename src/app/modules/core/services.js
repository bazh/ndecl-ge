(function() {
    const mod = angular.module('ndoc.module.core', []);
    const Store = require('../lib/store');
    const electron = require('electron');
    const _ = require('lodash');
    const moment = require('moment');
    const uuid = require('uuid');

    // Shortcuts
    mod.service('Store', function() {
        return Store;
    });

    mod.service('_', function() {
        return _;
    });

    mod.service('moment', function() {
        return moment;
    });

    mod.service('uuid', function() {
        return uuid.v1;
    });

    mod.factory('Electron', function($q) {
        return {
            call: function(chan, ...args) {
                const defer = $q.defer();
                electron.ipcRenderer
                    .invoke(chan, ...args)
                    .then(defer.resolve)
                    .catch(defer.reject);

                return defer.promise;
            }
        }
    });

    mod.factory('Currencies', function() {
        const c = [{
            id: 'usd',
            val: 'USD',
            sym: '$'
        }, {
            id: 'eur',
            val: 'EUR',
            sym: '€'
        }];

        return {
            get: function() {
                return c;
            },
            getSymbol: function(v) {
                v = v || '?';
                for (let i = 0; i < c.length; i++) {
                    if (v.toLowerCase() === c[i].id) {
                        return c[i].sym;
                    }
                }
                return v;
            }
        }
    });

    mod.factory('Banks', function() {
        const c = [{
            id: 'bog',
            val: 'Bank of Georgia',
        }];

        return {
            get: function() {
                return c;
            },
            getValue: function(v) {
                for (let i = 0; i < c.length; i++) {
                    if (v == c[i].id) {
                        return c[i].val;
                    }
                }
                return v;
            }
        }
    });

    mod.service('NBG', function(Electron, moment) {
        function get(cur, date) {
            return Electron
                .call('ndoc.GetCurrencyRates', date)
                .then((res) => {
                    return res[cur] || 0;
                })
        }

        return {
            get
        };
    });

    mod.service('Alert', function() {
        return {
            error: function(msg) {
                smalltalk.alert('Ошибка', msg.toString());
            },
            info: function(msg) {
                smalltalk.alert('Инфо', msg.toString());
            }
        };
    });

    // Prompt request from main process
    electron.ipcRenderer.on('ndoc.Prompt', (event, message) => {
        return smalltalk
            .prompt('', message)
            .then((val) => {
                electron.ipcRenderer.send('ndoc.Prompt', val);
            })
            .catch(() => {
                electron.ipcRenderer.send('ndoc.Prompt', '');
            });
    });
})();
