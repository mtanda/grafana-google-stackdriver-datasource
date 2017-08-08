import {GoogleStackdriverDatasource} from './datasource';
import {GoogleStackdriverQueryCtrl} from './query_ctrl';

class GoogleStackdriverConfigCtrl {}
GoogleStackdriverConfigCtrl.templateUrl = 'partials/config.html';

export {
  GoogleStackdriverDatasource as Datasource,
  GoogleStackdriverConfigCtrl as ConfigCtrl,
  GoogleStackdriverQueryCtrl as QueryCtrl
};
