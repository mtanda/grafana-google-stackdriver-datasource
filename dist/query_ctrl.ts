///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import './query_parameter_ctrl';
import './mode-stackdriver';
import { QueryCtrl } from 'app/plugins/sdk';
import './snippets/stackdriver';

export class GoogleStackdriverQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';

  constructor($scope, $injector) {
    super($scope, $injector);

    let target = this.target;
    target.format = target.format || this.getDefaultFormat();
  }

  getDefaultFormat() {
    if (this.panelCtrl.panel.type === 'table') {
      return 'table';
    }

    return 'time_series';
  }
}
