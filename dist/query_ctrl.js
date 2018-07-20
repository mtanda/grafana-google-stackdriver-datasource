///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
System.register(['./query_parameter_ctrl', './mode-stackdriver', 'app/plugins/sdk', './snippets/stackdriver'], function(exports_1) {
    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var sdk_1;
    var GoogleStackdriverQueryCtrl;
    return {
        setters:[
            function (_1) {},
            function (_2) {},
            function (sdk_1_1) {
                sdk_1 = sdk_1_1;
            },
            function (_3) {}],
        execute: function() {
            GoogleStackdriverQueryCtrl = (function (_super) {
                __extends(GoogleStackdriverQueryCtrl, _super);
                function GoogleStackdriverQueryCtrl($scope, $injector) {
                    _super.call(this, $scope, $injector);
                    var target = this.target;
                    target.format = target.format || this.getDefaultFormat();
                }
                GoogleStackdriverQueryCtrl.prototype.getDefaultFormat = function () {
                    if (this.panelCtrl.panel.type === 'table') {
                        return 'table';
                    }
                    return 'time_series';
                };
                GoogleStackdriverQueryCtrl.templateUrl = 'partials/query.editor.html';
                return GoogleStackdriverQueryCtrl;
            })(sdk_1.QueryCtrl);
            exports_1("GoogleStackdriverQueryCtrl", GoogleStackdriverQueryCtrl);
        }
    }
});
//# sourceMappingURL=query_ctrl.js.map