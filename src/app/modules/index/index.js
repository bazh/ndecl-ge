(function() {
    const mod = angular.module('ndoc.module.index', []);

    mod.config(function($stateProvider) {
        $stateProvider.state('app.index', {
            url: '/index',
            data: {
                nav: {
                    title: ('Декларация'),
                    order: 10
                }
            },
            templateUrl: 'modules/index/template.html'
        });
    });

    mod.controller('IndexCtrl', function($q, Store, Banks, Alert, Electron, moment, Currencies, NBG) {
        const vm = this;


        vm.init = init;
        vm.getBankName = getBankName;
        vm.loadTransactions = loadTransactions;
        vm.getDeclarations = getDeclarations;
        vm.getDate = getDate;
        vm.getCurSymb = Currencies.getSymbol;
        vm.calcTax = calcTax;
        vm.calcSumTax = calcSumTax;
        vm.calcSum = calcSum;
        vm.getMonthHuman = getMonthHuman;
        vm.OpenDeclaration = OpenDeclaration;
        vm.overrideTax = overrideTax;
        vm.payTax = payTax;
        vm.getPayTaxMessage = getPayTaxMessage;

        init();

        function init() {
            const settings = Store.get('settings', {});
            vm.settings = settings;
            if (!settings.bankId || !settings.bankLogin || !settings.bankPassword ||
                !settings.accounts.length) {
                vm.notReady = true;
                return;
            }

            Electron.call('ndoc.InitClients');
        }

        function OpenDeclaration() {
            vm.declarationLoading = true;
            Electron
                .call('ndoc.OpenDeclarations')
                .finally(() => {
                    vm.declarationLoading = false;
                });
        }

        function overrideTax() {
            return smalltalk
                .prompt('Изменить налог', vm.calcSumTax(vm.transactions, true) + '')
                .then((val) => {
                    vm.overridedTax = parseFloat(val);
                })
                .catch(() => {});
        }

        function getBankName() {
            return Banks.getValue(vm.settings.bankId);
        }

        function getDate(ts) {
            return moment(ts).format('DD.MM.YYYY');
        }

        function round(x) {
            return Math.round(x * 100) / 100;
        }

        function calcTax(item, inGel) {
            const tax = round(item?.amount * vm.settings.taxBase / 100);

            if (inGel) {
                return round(tax * item?.rate);
            }

            return tax;
        }

        function calcSumTax(items, inGel) {
            return round(calcSum(items, inGel) * vm.settings.taxBase / 100);
        }

        function calcSum(items, inGel) {
            items = items || [];

            let acc;
            if (inGel) {
                acc = (a, b) => b?.amount * (b?.rate || 0) + a;
            } else {
                acc = (a, b) => b?.amount + a;
            }

            const sum = items.reduce(acc, 0) || 0;

            return round(sum);
        }

        function getMonthHuman(ts) {
            const d = ts ? moment(ts) : moment().subtract(1, 'month');
            return d.format('MMMM YYYY');
        }

        function loadTransactions() {
            const gte = moment()
                .subtract(1, 'month')
                .startOf('month')
                .format('yyyy-MM-DD');
            const lte = moment()
                .subtract(1, 'month')
                .endOf('month')
                .format('yyyy-MM-DD');
            const yearStart = moment()
                .subtract(1, 'month')
                .startOf('year')
                .format('yyyy-MM-DD');

            vm.transactionsLoading = true;
            vm.transactionsRequested = true;

            Electron
                .call('ndoc.LoadTransactions', yearStart, lte)
                .then((res) => {
                    const items = res.map((item) => {
                        item.rateLoading = true;
                        return NBG.get(item.currency, item.date)
                            .then((v) => {
                                item.rate = v;
                                item.amountGel = round(item.rate * item.amount);
                                return item;
                            })
                            .finally(() => {
                                item.rateLoading = false;
                            });
                    });
                    return $q.all(items);
                })
                .then((res) => {
                    vm.transactionsYear = res;
                    vm.transactions = res.filter((item) => {
                        return item.date >= gte && item.date <= lte
                    });

                    vm.accumulatedIncome = calcSum(vm.transactionsYear, true);
                    vm.monthTax = calcSumTax(vm.transactions, true);
                })
                .finally(() => vm.transactionsLoading = false)
        }

        function getDeclarations() {
            const period = moment()
                .subtract(1, 'month')
                .toISOString();

            vm.declarationLoading = true;
            Electron
                .call('ndoc.GetDeclarations',
                    period
                ).then((res) => {
                    if (!res.length) {
                        if (!vm.awaitDeclaration) {
                            Electron
                                .call('ndoc.OpenDeclarations')
                        }

                        vm.awaitDeclaration = true;
                        return setTimeout(getDeclarations, 1000);
                    }

                    vm.awaitDeclaration = false;
                    vm.declaration = res[0];
                })
                .catch(Alert.error)
                .finally(() => vm.declarationLoading = false);
        }

        function getPayTaxMessage() {
            return `${vm.settings.tin} Small Business Tax for ${vm.getMonthHuman()}`
        }

        function payTax(val) {
            vm.payTaxLoading = true;
            Electron
                .call('ndoc.PayTax', val, getPayTaxMessage())
                .then((res) => {
                    console.log(res);
                })
                .catch(Alert.error)
                .finally(() => vm.payTaxLoading = false);
        }
    });
})();
