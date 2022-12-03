(function() {
    const mod = angular.module('ndoc.module.settings', []);

    mod.config(function($stateProvider) {
        $stateProvider.state('app.settings', {
            url: '/settings',
            data: {
                nav: {
                    title: ('Настройки'),
                    order: 20
                }
            },
            templateUrl: 'modules/settings/template.html'
        });
    });


    mod.controller('SettingsCtrl', function($state, Store, Currencies, Banks, Alert) {
        const vm = this;
        vm.init = init;
        vm.onSubmit = onSubmit;
        vm.clearSettings = clearSettings;

        vm.currencies = Currencies.get();
        vm.banks = Banks.get();

        init();

        function init() {
            vm.settings = Store.get('settings') || {};

            if (vm.settings.accounts) {
                vm.accounts = vm.settings.accounts.join(', ');
            }
        }

        function onSubmit() {
            try {
                vm.settings.accounts = vm.accounts
                    .split(',')
                    .map((item) => {
                        return item.trim()
                    });

                Store.set('settings', vm.settings);
                Alert.info('Cохранено');
                $state.go('app.index');
            } catch (err) {
                console.log(err);
                Alert.error(`Ошибка сохранения: ${err.toString()}`);
            }
        }

        function clearSettings() {
            Store.clear('settings');
            vm.settings = {};
            Alert.info('Настройки удалены');
        }
    });
})();
