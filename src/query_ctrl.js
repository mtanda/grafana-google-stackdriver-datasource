import './query_parameter_ctrl';
import _ from 'lodash';
import {QueryCtrl} from 'app/plugins/sdk';

export class GoogleStackdriverQueryCtrl extends QueryCtrl {
  constructor($scope, $injector) {
    super($scope, $injector);
  }
}

GoogleStackdriverQueryCtrl.templateUrl = 'partials/query.editor.html';
