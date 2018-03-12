/// <reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
export default class GoogleStackdriverDatasource {
    private $q;
    private templateSrv;
    private timeSrv;
    type: string;
    name: string;
    clientId: string;
    defaultProjectId: string;
    scopes: any;
    discoveryDocs: any;
    initialized: boolean;
    gapi: any;
    /** @ngInject */
    constructor(instanceSettings: any, $q: any, templateSrv: any, timeSrv: any);
    query(options: any): any;
    metricFindQuery(query: any): any;
    testDatasource(): any;
    load(): any;
    initialize(): any;
    performTimeSeriesQuery(target: any, options: any): any;
    performMetricDescriptorsQuery(target: any, options: any): any;
    performGroupsQuery(target: any, options: any): any;
    performGroupsMembersQuery(target: any, options: any): any;
    filterSeries(target: any, response: any): any;
    getSeriesFilterValue(target: any, series: any): any;
    getMetricLabel(aliasPattern: any, series: any): any;
    convertTime(date: any, roundUp: any): any;
}
