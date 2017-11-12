System.register(['./datasource', './query_ctrl'], function(exports_1) {
    var datasource_1, query_ctrl_1;
    var GoogleStackdriverConfigCtrl;
    return {
        setters:[
            function (datasource_1_1) {
                datasource_1 = datasource_1_1;
            },
            function (query_ctrl_1_1) {
                query_ctrl_1 = query_ctrl_1_1;
            }],
        execute: function() {
            GoogleStackdriverConfigCtrl = (function () {
                function GoogleStackdriverConfigCtrl() {
                }
                GoogleStackdriverConfigCtrl.templateUrl = 'partials/config.html';
                return GoogleStackdriverConfigCtrl;
            })();
            exports_1("Datasource", datasource_1.default);
            exports_1("ConfigCtrl", GoogleStackdriverConfigCtrl);
            exports_1("QueryCtrl", query_ctrl_1.GoogleStackdriverQueryCtrl);
        }
    }
});
//# sourceMappingURL=module.js.map