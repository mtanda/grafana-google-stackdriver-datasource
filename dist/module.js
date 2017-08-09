'use strict';

System.register(['./datasource', './query_ctrl'], function (_export, _context) {
  "use strict";

  var GoogleStackdriverDatasource, GoogleStackdriverQueryCtrl, GoogleStackdriverConfigCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_datasource) {
      GoogleStackdriverDatasource = _datasource.GoogleStackdriverDatasource;
    }, function (_query_ctrl) {
      GoogleStackdriverQueryCtrl = _query_ctrl.GoogleStackdriverQueryCtrl;
    }],
    execute: function () {
      _export('ConfigCtrl', GoogleStackdriverConfigCtrl = function GoogleStackdriverConfigCtrl() {
        _classCallCheck(this, GoogleStackdriverConfigCtrl);
      });

      GoogleStackdriverConfigCtrl.templateUrl = 'partials/config.html';

      _export('Datasource', GoogleStackdriverDatasource);

      _export('ConfigCtrl', GoogleStackdriverConfigCtrl);

      _export('QueryCtrl', GoogleStackdriverQueryCtrl);
    }
  };
});
//# sourceMappingURL=module.js.map
