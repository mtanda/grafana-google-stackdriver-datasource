///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import './query_parameter_ctrl';
import './mode-stackdriver';
import _ from 'lodash';
import {QueryCtrl} from 'app/plugins/sdk';

export class GoogleStackdriverQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';

  constructor($scope, $injector) {
    super($scope, $injector);
  }
}
