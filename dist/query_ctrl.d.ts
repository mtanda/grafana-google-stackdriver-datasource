/// <reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
import { QueryCtrl } from 'app/plugins/sdk';
export declare class GoogleStackdriverQueryCtrl extends QueryCtrl {
    static templateUrl: string;
    constructor($scope: any, $injector: any);
    getDefaultFormat(): string;
}
