'use strict';

System.register(['./query_parameter_ctrl', 'lodash', 'app/plugins/sdk'], function (_export, _context) {
  "use strict";

  var _, QueryCtrl, GoogleStackdriverQueryCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _possibleConstructorReturn(self, call) {
    if (!self) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return call && (typeof call === "object" || typeof call === "function") ? call : self;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  }

  return {
    setters: [function (_query_parameter_ctrl) {}, function (_lodash) {
      _ = _lodash.default;
    }, function (_appPluginsSdk) {
      QueryCtrl = _appPluginsSdk.QueryCtrl;
    }],
    execute: function () {
      _export('GoogleStackdriverQueryCtrl', GoogleStackdriverQueryCtrl = function (_QueryCtrl) {
        _inherits(GoogleStackdriverQueryCtrl, _QueryCtrl);

        function GoogleStackdriverQueryCtrl($scope, $injector) {
          _classCallCheck(this, GoogleStackdriverQueryCtrl);

          return _possibleConstructorReturn(this, (GoogleStackdriverQueryCtrl.__proto__ || Object.getPrototypeOf(GoogleStackdriverQueryCtrl)).call(this, $scope, $injector));
        }

        return GoogleStackdriverQueryCtrl;
      }(QueryCtrl));

      _export('GoogleStackdriverQueryCtrl', GoogleStackdriverQueryCtrl);

      GoogleStackdriverQueryCtrl.templateUrl = 'partials/query.editor.html';
    }
  };
});
//# sourceMappingURL=query_ctrl.js.map
