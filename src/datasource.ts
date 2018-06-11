///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import * as dateMath from 'app/core/utils/datemath';
import appEvents from 'app/core/app_events';
import TableModel from 'app/core/table_model';

System.config({
  meta: {
    'https://apis.google.com/js/api.js': {
      exports: 'gapi',
      format: 'global'
    }
  }
});

export default class GoogleStackdriverDatasource {
  type: string;
  name: string;
  id: string;
  access: string;
  clientId: string;
  defaultProjectId: string;
  maxAvailableToken: number;
  token: number;
  provideTokenInterval: number;
  tokenTimer: any;
  scopes: any;
  discoveryDocs: any;
  initialized: boolean;
  gapi: any;

  /** @ngInject */
  constructor(instanceSettings, private $q, private templateSrv, private timeSrv, private backendSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.id = instanceSettings.id;
    this.access = instanceSettings.jsonData.access;
    this.clientId = instanceSettings.jsonData.clientId;
    this.defaultProjectId = instanceSettings.jsonData.defaultProjectId;
    this.maxAvailableToken = ((instanceSettings.jsonData.quota && instanceSettings.jsonData.quota.requestsPerMinutePerUser) || 6000) / 60;
    this.token = this.maxAvailableToken;
    this.provideTokenInterval = 1000 / this.maxAvailableToken;
    this.tokenTimer = null;
    this.scopes = [
      //'https://www.googleapis.com/auth/cloud-platform',
      //'https://www.googleapis.com/auth/monitoring',
      'https://www.googleapis.com/auth/monitoring.read'
    ].join(' ');
    this.discoveryDocs = ["https://monitoring.googleapis.com/$discovery/rest?version=v3"];
    this.initialized = false;
  }

  query(options) {
    return this.initialize().then(() => {
      return Promise.all(options.targets
        .filter(target => !target.hide)
        .map(target => {
          target = angular.copy(target);
          let filter = 'metric.type = "' + this.templateSrv.replace(target.metricType, options.scopedVars || {}) + '"';
          if (target.filter) {
            filter += ' AND ' + this.templateSrv.replace(target.filter, options.scopedVars || {});
          }
          target.filter = filter;
          return this.performTimeSeriesQuery(target, options).then(response => {
            appEvents.emit('ds-request-response', response);
            response.timeSeries.forEach(series => {
              series.target = target;
            });
            return this.filterSeries(target, response);
          });
        })).then((responses: any) => {
          let timeSeries = _.flatten(responses.filter(response => {
            return !!response.timeSeries;
          }).map(response => {
            return response.timeSeries;
          }));
          if (options.targets[0].format === 'table') {
            return this.transformMetricDataToTable(timeSeries);
          } else {
            return this.transformMetricData(timeSeries);
          }
        }, err => {
          console.log(err);
          err = JSON.parse(err.body);
          appEvents.emit('ds-request-error', err);
          throw err.error;
        });
    });
  }

  provideToken() {
    if (this.token < this.maxAvailableToken) {
      let tokenCount = 1;
      if (this.provideTokenInterval < 10) { // setInterval's minumum interval is 10
        tokenCount = Math.floor(10 / this.provideTokenInterval);
      }
      this.token += tokenCount;
      if (this.token === this.maxAvailableToken) {
        clearInterval(this.tokenTimer);
        this.tokenTimer = null;
      }
    }
  }

  delay(func, retryCount, wait) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        func(retryCount).then(resolve, reject);
      }, wait);
    });
  }

  retryable(retryCount, func) {
    let promise = Promise.reject({}).catch(() => func(retryCount));
    for (let i = 0; i < retryCount; i++) {
      ((i) => {
        promise = promise.catch(err => func(i + 1));
      })(i);
    }
    return promise;
  }

  calculateRetryWait(initialWait, retryCount) {
    return initialWait * Math.min(10, Math.pow(2, retryCount)) +
      Math.floor(Math.random() * 1000);
  }

  transformMetricData(timeSeries) {
    return {
      data: timeSeries.map(series => {
        let aliasPattern = series.target.alias;
        let valueKey = series.valueType.toLowerCase() + 'Value';

        if (valueKey != 'distributionValue') {
          let datapoints = [];
          let metricLabel = this.getMetricLabel(aliasPattern, series);
          for (let point of series.points) {
            let value = point.value[valueKey];
            if (!value) {
              continue;
            }
            switch (valueKey) {
              case 'boolValue':
                value = value ? 1 : 0; // convert bool value to int
                break;
            }
            datapoints.push([value, Date.parse(point.interval.endTime).valueOf()]);
          }
          // Stackdriver API returns series in reverse chronological order.
          datapoints.reverse();
          return [{ target: metricLabel, datapoints: datapoints }];
        } else {
          let buckets = [];

          for (let point of series.points) {
            if (!point.value.distributionValue.bucketCounts) {
              continue;
            }
            for (let i = 0; i < point.value.distributionValue.bucketCounts.length; i++) {
              let value = parseInt(point.value.distributionValue.bucketCounts[i], 10);
              if (!buckets[i]) {
                // set lower bounds
                // https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries#Distribution
                let bucketBound = this.calcBucketBound(point.value.distributionValue.bucketOptions, i);
                buckets[i] = {
                  target: this.getMetricLabel(aliasPattern, _.extend(series, { bucket: bucketBound })),
                  datapoints: []
                };
              }
              buckets[i].datapoints.push([value, Date.parse(point.interval.endTime).valueOf()])
            }

            // fill empty bucket
            let n = _.max(_.keys(buckets));
            for (let i = 0; i < n; i++) {
              if (!buckets[i]) {
                let bucketBound = this.calcBucketBound(point.value.distributionValue.bucketOptions, i);
                buckets[i] = {
                  target: this.getMetricLabel(aliasPattern, _.extend(series, { bucket: bucketBound })),
                  datapoints: []
                };
              }
            }
          }
          return buckets;
        }
      }).flatten().filter(series => {
        return series.datapoints.length > 0;
      })
    };
  }

  transformMetricDataToTable(md) {
    var table = new TableModel();
    var i, j;
    var metricLabels = {};

    if (md.length === 0) {
      return table;
    }

    // Collect all labels across all metrics
    metricLabels['metric.type'] = 1;
    metricLabels['resource.type'] = 1;
    _.each(md, function (series) {
      [
        'metric.labels',
        'resource.labels',
        'metadata.systemLabels',
        'metadata.userLabels',
      ].forEach(path => {
        _.map(md, _.property(path)).forEach(labels => {
          if (labels) {
            _.keys(labels).forEach(k => {
              let label = path + '.' + k;
              if (!metricLabels.hasOwnProperty(label)) {
                metricLabels[label] = 1;
              }
            });
          }
        });
      });
    });

    // Sort metric labels, create columns for them and record their index
    var sortedLabels = _.keys(metricLabels).sort();
    table.columns.push({ text: 'Time', type: 'time' });
    _.each(sortedLabels, function (label, labelIndex) {
      metricLabels[label] = labelIndex + 1;
      table.columns.push({ text: label });
    });
    table.columns.push({ text: 'Value' });

    // Populate rows, set value to empty string when label not present.
    _.each(md, function (series) {
      if (series.points) {
        for (i = 0; i < series.points.length; i++) {
          var point = series.points[i];
          var reordered: any = [Date.parse(point.interval.endTime).valueOf()];
          for (j = 0; j < sortedLabels.length; j++) {
            var label = sortedLabels[j];
            reordered.push(_.get(series, label) || '');
          }
          reordered.push(point.value[_.keys(point.value)[0]]);
          table.rows.push(reordered);
        }
      }
    });

    return { data: [table] };
  }

  metricFindQuery(query) {
    return this.initialize().then(() => {
      let metricsQuery = query.match(/^metrics\((([^,]+), *)?(.*)\)/);
      if (metricsQuery) {
        let projectId = metricsQuery[2] || this.defaultProjectId;
        let filter = metricsQuery[3];
        let params = {
          projectId: this.templateSrv.replace(projectId),
          filter: this.templateSrv.replace(filter)
        };
        return this.performMetricDescriptorsQuery(params, {}).then(response => {
          return this.$q.when(response.metricDescriptors.map(d => {
            return { text: d.type };
          }));
        });
      }

      let labelQuery = query.match(/^label_values\((([^,]+), *)?([^,]+), *(.*)\)/);
      if (labelQuery) {
        let projectId = labelQuery[2] || this.defaultProjectId;
        let targetProperty = labelQuery[3];
        let filter = labelQuery[4];
        let params = {
          projectId: this.templateSrv.replace(projectId),
          filter: this.templateSrv.replace(filter),
          view: 'HEADERS'
        };
        return this.performTimeSeriesQuery(params, { range: this.timeSrv.timeRange() }).then(response => {
          let valuePicker = _.property(targetProperty);
          return this.$q.when(response.timeSeries.map(d => {
            return { text: valuePicker(d) };
          }));
        }, err => {
          console.log(err);
          err = JSON.parse(err.body);
          throw err.error;
        });
      }

      let groupsQuery = query.match(/^groups\(([^,]+)?\)/);
      if (groupsQuery) {
        let projectId = groupsQuery[1] || this.defaultProjectId;
        let params = {
          projectId: this.templateSrv.replace(projectId)
        };
        return this.performGroupsQuery(params, {}).then(response => {
          return this.$q.when(response.group.map(d => {
            return {
              //text: d.displayName
              text: d.name.split('/')[3]
            };
          }));
        }, err => {
          console.log(err);
          err = JSON.parse(err.body);
          throw err.error;
        });
      }

      let groupMembersQuery = query.match(/^group_members\((([^,]+), *)?([^,]+), *([^,]+), *(.*)\)/);
      if (groupMembersQuery) {
        let projectId = groupMembersQuery[2] || this.defaultProjectId;
        let groupId = groupMembersQuery[3];
        let targetProperty = groupMembersQuery[4];
        let filter = groupMembersQuery[5];
        let params = {
          projectId: this.templateSrv.replace(projectId),
          groupId: this.templateSrv.replace(groupId),
          filter: this.templateSrv.replace(filter)
        };
        return this.performGroupsMembersQuery(params, { range: this.timeSrv.timeRange() }).then(response => {
          let valuePicker = _.property(targetProperty);
          return this.$q.when(response.members.map(d => {
            return { text: valuePicker(d) };
          }));
        }, err => {
          console.log(err);
          err = JSON.parse(err.body);
          throw err.error;
        });
      }

      return Promise.reject(new Error('Invalid query, use one of: metrics(), label_values(), groups(), group_members()'));
    });
  }

  testDatasource() {
    return this.initialize().then(() => {
      if (this.access === 'proxy' && this.defaultProjectId) {
        let params = {
          projectId: this.defaultProjectId,
          filter: ''
        };
        return this.performMetricDescriptorsQuery(params, {}).then(response => {
          return { status: 'success', message: 'Data source is working', title: 'Success' };
        });
      } else {
        return { status: 'success', message: 'Data source is working', title: 'Success' };
      }
    }).catch(err => {
      console.log(err);
      return { status: "error", message: err.message, title: "Error" };
    });
  }

  load() {
    let deferred = this.$q.defer();
    System.import('https://apis.google.com/js/api.js').then((gapi) => {
      this.gapi = gapi;
      this.gapi.load('client:auth2', () => {
        return deferred.resolve();
      });
    });
    return deferred.promise;
  }

  initialize() {
    if (this.access == 'proxy') {
      return Promise.resolve([]);
    }
    if (this.initialized) {
      return Promise.resolve(this.gapi.auth2.getAuthInstance().currentUser.get());
    }

    return this.load().then(() => {
      return this.gapi.client.init({
        clientId: this.clientId,
        scope: this.scopes,
        discoveryDocs: this.discoveryDocs
      }).then(() => {
        let authInstance = this.gapi.auth2.getAuthInstance();
        if (!authInstance) {
          throw { message: 'failed to initialize' };
        }
        let isSignedIn = authInstance.isSignedIn.get();
        if (isSignedIn) {
          this.initialized = true;
          return authInstance.currentUser.get();
        }
        return authInstance.signIn().then(user => {
          this.initialized = true;
          return user;
        });
      }, err => {
        console.log(err);
        throw { message: 'failed to initialize' };
      });
    });
  }

  backendPluginRawRequest(params) {
    return this.backendSrv.datasourceRequest(params).then(response => {
      return {
        result: response.data.results[""].meta
      };
    }).catch(err => {
      throw {
        body: JSON.stringify({
          error: {
            message: err.data.results[""].error
          }
        })
      };
    });
  }

  performTimeSeriesQuery(target, options) {
    if (this.token === 0) {
      return this.delay((retryCount) => {
        return this.performTimeSeriesQuery(target, options);
      }, 0, Math.ceil(this.provideTokenInterval));
    }

    target = angular.copy(target);
    let params: any = {};
    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
    params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
    if (target.aggregation) {
      for (let key of Object.keys(target.aggregation)) {
        if (_.isArray(target.aggregation[key])) {
          params['aggregation.' + key] = target.aggregation[key].map(aggregation => {
            return this.templateSrv.replace(aggregation, options.scopedVars || {});
          });
        } else if (target.aggregation[key] !== '') {
          params['aggregation.' + key] = this.templateSrv.replace(target.aggregation[key], options.scopedVars || {});
        }
      }
      // auto period
      if (params['aggregation.perSeriesAligner'] !== 'ALIGN_NONE' && !params['aggregation.alignmentPeriod']) {
        params['aggregation.alignmentPeriod'] = Math.max((options.intervalMs / 1000), 60) + 's';
      }
    }
    if (target.view) {
      params.view = target.view;
    }
    if (target.pageToken) {
      params.pageToken = target.pageToken;
    }
    params['interval.startTime'] = this.convertTime(options.range.from, false);
    params['interval.endTime'] = this.convertTime(options.range.to, true);


    this.token--;
    if (this.tokenTimer === null) {
      this.tokenTimer = setInterval(() => {
        this.provideToken();
      }, Math.max(10, Math.ceil(this.provideTokenInterval)));
    }
    return ((params) => {
      if (this.access != 'proxy') {
        return this.gapi.client.monitoring.projects.timeSeries.list(params);
      } else {
        return this.backendPluginRawRequest({
          url: '/api/tsdb/query',
          method: 'POST',
          data: {
            from: options.range.from.valueOf().toString(),
            to: options.range.to.valueOf().toString(),
            queries: [
              _.extend({
                queryType: 'raw',
                api: 'monitoring.projects.timeSeries.list',
                refId: target.refId,
                datasourceId: this.id
              }, params)
            ],
          }
        });
      }
    })(params).then(response => {
      response = response.result;
      if (!response.timeSeries) {
        return { timeSeries: [] };
      }
      if (!response.nextPageToken) {
        return response;
      }
      target.pageToken = response.nextPageToken;
      return this.performTimeSeriesQuery(target, options).then(nextResponse => {
        response.timeSeries = response.timeSeries.concat(nextResponse.timeSeries);
        return response;
      });
    }, err => {
      let e = JSON.parse(err.body);
      if (e.error.message.indexOf('The query rate is too high.') >= 0) {
        this.token = 0;
        return this.retryable(3, (retryCount) => {
          return this.delay((retryCount) => {
            return this.performTimeSeriesQuery(target, options);
          }, retryCount, this.calculateRetryWait(1000, retryCount));
        });
      }
      throw err;
    });
  }

  performMetricDescriptorsQuery(target, options) {
    target = angular.copy(target);
    let params: any = {};
    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
    params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
    if (target.pageToken) {
      params.pageToken = target.pageToken;
    }
    return ((params) => {
      if (this.access != 'proxy') {
        return this.gapi.client.monitoring.projects.metricDescriptors.list(params);
      } else {
        return this.backendPluginRawRequest({
          url: '/api/tsdb/query',
          method: 'POST',
          data: {
            queries: [
              _.extend({
                queryType: 'raw',
                api: 'monitoring.projects.metricDescriptors.list',
                refId: '',
                datasourceId: this.id
              }, params)
            ],
          }
        });
      }
    })(params).then(response => {
      response = response.result;
      if (!response.metricDescriptors) {
        return { metricDescriptors: [] };
      }
      if (!response.nextPageToken) {
        return response;
      }
      target.pageToken = response.nextPageToken;
      return this.performMetricDescriptorsQuery(target, options).then(nextResponse => {
        response = response.metricDescriptors.concat(nextResponse.metricDescriptors);
        return response;
      });
    });
  }

  performGroupsQuery(target, options) {
    target = angular.copy(target);
    let params: any = {};
    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
    if (target.pageToken) {
      params.pageToken = target.pageToken;
    }
    return ((params) => {
      if (this.access != 'proxy') {
        return this.gapi.client.monitoring.projects.groups.list(params);
      } else {
        return this.backendPluginRawRequest({
          url: '/api/tsdb/query',
          method: 'POST',
          data: {
            queries: [
              _.extend({
                queryType: 'raw',
                api: 'monitoring.projects.groups.list',
                refId: '',
                datasourceId: this.id
              }, params)
            ],
          }
        });
      }
    })(params).then(response => {
      response = response.result;
      if (!response.group) {
        return { group: [] };
      }
      if (!response.nextPageToken) {
        return response;
      }
      target.pageToken = response.nextPageToken;
      return this.performGroupsQuery(target, options).then(nextResponse => {
        response = response.group.concat(nextResponse.group);
        return response;
      });
    });
  }

  performGroupsMembersQuery(target, options) {
    target = angular.copy(target);
    let params: any = {};
    params.name = this.templateSrv.replace('projects/'
      + (target.projectId || this.defaultProjectId)
      + '/groups/'
      + target.groupId, options.scopedVars || {});
    params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
    if (target.pageToken) {
      params.pageToken = target.pageToken;
    }
    params['interval.startTime'] = this.convertTime(options.range.from, false);
    params['interval.endTime'] = this.convertTime(options.range.to, true);
    return ((params) => {
      if (this.access != 'proxy') {
        return this.gapi.client.monitoring.projects.groups.members.list(params);
      } else {
        return this.backendPluginRawRequest({
          url: '/api/tsdb/query',
          method: 'POST',
          data: {
            from: options.range.from.valueOf().toString(),
            to: options.range.to.valueOf().toString(),
            queries: [
              _.extend({
                queryType: 'raw',
                api: 'monitoring.projects.groups.members.list',
                refId: '',
                datasourceId: this.id
              }, params)
            ],
          }
        });
      }
    })(params).then(response => {
      response = response.result;
      if (!response.members) {
        return { members: [] };
      }
      if (!response.nextPageToken) {
        return response;
      }
      target.pageToken = response.nextPageToken;
      return this.performGroupsMembersQuery(target, options).then(nextResponse => {
        response = response.members.concat(nextResponse.members);
        return response;
      });
    });
  }

  filterSeries(target, response) {
    if (!_.has(target, 'seriesFilter') ||
      target.seriesFilter.mode === 'NONE' ||
      target.seriesFilter.type === 'NONE' ||
      target.seriesFilter.param === '') {
      return response;
    }

    let param = _.toNumber(target.seriesFilter.param);
    if (_.isNaN(param)) return response;

    response.timeSeries.forEach(series => {
      series['filterValue'] = this.getSeriesFilterValue(target, series);
    });

    switch (target.seriesFilter.mode) {
      case 'TOP':
        response.timeSeries.sort(function (a, b) {
          return b.filterValue - a.filterValue;
        });
        response.timeSeries = response.timeSeries.slice(0, param);
        return response;
      case 'BOTTOM':
        response.timeSeries.sort(function (a, b) {
          return a.filterValue - b.filterValue;
        });
        response.timeSeries = response.timeSeries.slice(0, param);
        return response;
      case 'BELOW':
        response.timeSeries = response.timeSeries.filter(function (elem) {
          return elem.filterValue < param;
        });
        return response;
      case 'ABOVE':
        response.timeSeries = response.timeSeries.filter(function (elem) {
          return elem.filterValue > param;
        });
        return response;
      default:
        console.log(`Unknown series filter mode: ${target.seriesFilter.mode}`);
        return response;
    }
  }

  getSeriesFilterValue(target, series) {
    // For empty timeseries return filter value that will push them out first.
    if (series.points.length == 0) {
      if (target.seriesFilter.mode === 'BOTTOM' ||
        target.seriesFilter.mode === 'BELOW') {
        return Number.MAX_VALUE;
      } else {
        return Number.MIN_VALUE;
      }
    }
    let valueKey = series.valueType.toLowerCase() + 'Value';
    switch (target.seriesFilter.type) {
      case 'MAX':
        return series.points.reduce(function (acc, elem) {
          return Math.max(acc, elem.value[valueKey]);
        }, Number.MIN_VALUE);
      case 'MIN':
        return series.points.reduce(function (acc, elem) {
          return Math.min(acc, elem.value[valueKey]);
        }, Number.MAX_VALUE);
      case 'AVERAGE':
        return series.points.reduce(function (acc, elem) {
          return acc + elem.value[valueKey];
        }, 0) / series.points.length;
      case 'CURRENT':
        return series.points[0].value[valueKey];
      default:
        console.log(`Unknown series filter type: ${target.seriesFilter.type}`);
        return 0;
    }
  }

  getMetricLabel(alias, series) {
    let aliasData = {
      metric: series.metric,
      resource: series.resource
    };
    if (!_.isUndefined(series.bucket)) {
      aliasData['bucket'] = series.bucket;
    }
    if (alias === '') {
      return JSON.stringify(aliasData);
    }
    let aliasRegex = /\{\{(.+?)\}\}/g;
    alias = alias.replace(aliasRegex, (match, g1) => {
      let matchedValue = _.property(g1)(aliasData);
      if (!_.isUndefined(matchedValue)) {
        return matchedValue;
      }
      return g1;
    });
    let aliasSubRegex = /sub\(([^,]+), "([^"]+)", "([^"]+)"\)/g;
    alias = alias.replace(aliasSubRegex, (match, g1, g2, g3) => {
      try {
        let matchedValue = _.property(g1)(aliasData);
        let labelRegex = new RegExp(g2);
        if (!_.isUndefined(matchedValue)) {
          return matchedValue.replace(labelRegex, g3);
        }
      } catch (e) {
        // if regexp compilation fails, we'll return original string below
      }
      return `sub(${g1}, "${g2}", "${g3}")`;
    });
    return alias;
  }

  calcBucketBound(bucketOptions, n) {
    let bucketBound = 0;
    if (n === 0) {
      return bucketBound;
    }

    if (bucketOptions.linearBuckets) {
      bucketBound = bucketOptions.linearBuckets.offset + (bucketOptions.linearBuckets.width * (n - 1));
    } else if (bucketOptions.exponentialBuckets) {
      bucketBound = bucketOptions.exponentialBuckets.scale * (Math.pow(bucketOptions.exponentialBuckets.growthFactor, (n - 1)));
    } else if (bucketOptions.explicitBuckets) {
      bucketBound = bucketOptions.explicitBuckets.bounds[(n - 1)];
    }
    return bucketBound;
  }

  convertTime(date, roundUp) {
    if (_.isString(date)) {
      date = dateMath.parse(date, roundUp);
    }
    return date.toISOString();
  };
}
