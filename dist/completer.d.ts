/// <reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
export default class GoogleStackdriverCompleter {
    private timeSrv;
    datasource: any;
    target: any;
    filterQueryCache: any;
    filterKeyCache: any;
    filterValueCache: any;
    constructor(datasource: any, timeSrv: any, target: any);
    getCompletions(editor: any, session: any, pos: any, prefix: any, callback: any): void;
    getFilterKeyAndValueForMetric(metricType: any): any;
    transformToCompletions(words: any, meta: any): any;
    findToken(session: any, row: any, column: any, target: any, value: any, guard: any): any;
    getFilterKeys(obj: any, prefix: any, keys: any): any;
}
