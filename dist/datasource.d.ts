/// <reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
export default class GoogleStackdriverDatasource {
    private $q;
    private templateSrv;
    private timeSrv;
    private backendSrv;
    type: string;
    name: string;
    id: string;
    access: string;
    clientId: string;
    defaultProjectId: string;
    scopes: any;
    discoveryDocs: any;
    initialized: boolean;
    gapi: any;
    /** @ngInject */
    constructor(instanceSettings: any, $q: any, templateSrv: any, timeSrv: any, backendSrv: any);
    query(options: any): any;
    transformMetricData(timeSeries: any): {
        data: any;
    };
    transformMetricDataToTable(md: any): any;
    metricFindQuery(query: any): any;
    testDatasource(): any;
    load(): any;
    initialize(): any;
    backendPluginRawRequest(params: any): any;
    performTimeSeriesQuery(target: any, options: any): any;
    performMetricDescriptorsQuery(target: any, options: any): any;
    performGroupsQuery(target: any, options: any): any;
    performGroupsMembersQuery(target: any, options: any): any;
    filterSeries(target: any, response: any): any;
    getSeriesFilterValue(target: any, series: any): any;
    getMetricLabel(alias: any, series: any): any;
    calcBucketBound(bucketOptions: any, n: any): number;
    convertTime(date: any, roundUp: any): any;
}
