import GoogleStackdriverDatasource from './datasource';
import {GoogleStackdriverQueryCtrl} from './query_ctrl';

class GoogleStackdriverConfigCtrl {
  static templateUrl = 'partials/config.html';
}

export {
  GoogleStackdriverDatasource as Datasource,
  GoogleStackdriverConfigCtrl as ConfigCtrl,
  GoogleStackdriverQueryCtrl as QueryCtrl
};
