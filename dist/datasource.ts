///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import * as dateMath from 'app/core/utils/datemath';
import appEvents from 'app/core/app_events';

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
  clientId: string;
  defaultProjectId: string;
  scopes: any;
  discoveryDocs: any;
  initialized: boolean;
  gapi: any;

  /** @ngInject */
  constructor(instanceSettings, private $q, private templateSrv, private timeSrv) {
    this.type = instanceSettings.type;
    this.name = instanceSettings.name;
    this.clientId = instanceSettings.jsonData.clientId;
    this.defaultProjectId = instanceSettings.jsonData.defaultProjectId;
    this.scopes = [
      //'https://www.googleapis.com/auth/cloud-platform',
      //'https://www.googleapis.com/auth/monitoring',
      'https://www.googleapis.com/auth/monitoring.read'
    ].join(' ');
    this.discoveryDocs = [ "https://monitoring.googleapis.com/$discovery/rest?version=v3" ];
    this.initialized = false;
  }

  query(options) {
    return this.initialize().then(() => {
      return Promise.all(options.targets.map(target => {
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
              let bucketBounds = [];

              let bucketOptions = series.points[0].value.distributionValue.bucketOptions;
              // set lower bounds
              // https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries#Distribution
              bucketBounds[0] = 0;
              if (bucketOptions.linearBuckets) {
                for (let i = 1; i < bucketOptions.linearBuckets.numFiniteBuckets + 2; i++) {
                  bucketBounds[i] = bucketOptions.linearBuckets.offset + (bucketOptions.linearBuckets.width * (i - 1));
                }
              } else if (bucketOptions.exponentialBuckets) {
                for (let i = 1; i < bucketOptions.exponentialBuckets.numFiniteBuckets + 2; i++) {
                  bucketBounds[i] = bucketOptions.exponentialBuckets.scale * (Math.pow(bucketOptions.exponentialBuckets.growthFactor, (i - 1)));
                }
              } else if (bucketOptions.explicitBuckets) {
                for (let i = 1; i < bucketOptions.explicitBuckets.bounds.length + 1; i++) {
                  bucketBounds[i] = bucketOptions.explicitBuckets.bounds[(i - 1)];
                }
              }
              for (let i = 0; i < bucketBounds.length; i++) {
                buckets[i] = {
                  target: this.getMetricLabel(aliasPattern, _.extend(series, { bucket: bucketBounds[i] })),
                  datapoints: []
                };
              }
              for (let point of series.points) {
                for (let i = 0; i < point.value.distributionValue.bucketCounts.length; i++) {
                  let value = parseInt(point.value.distributionValue.bucketCounts[i], 10);
                  if (value !== 0) {
                    buckets[i].datapoints.push([value, Date.parse(point.interval.endTime).valueOf()])
                  }
                }
              }
              return buckets;
            }
          }).flatten().filter(series => {
            return series.datapoints.length > 0;
          })
        };
      }, err => {
        console.log(err);
        err = JSON.parse(err.body);
        appEvents.emit('ds-request-error', err);
        throw err.error;
      });
    });
  }

  metricFindQuery(query) {
    return this.initialize().then(() => {
      let metricsQuery = query.match(/^metrics\((([^,]+), *)?(.*)\)/);
      if (metricsQuery) {
        let projectId = metricsQuery[2] || this.defaultProjectId;
        let filter = metricsQuery[3];
        let params = {
          projectId: projectId,
          filter: filter
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
          projectId: projectId,
          filter: filter,
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
          projectId: projectId
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
          projectId: projectId,
          groupId: groupId,
          filter: filter
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
      return { status: 'success', message: 'Data source is working', title: 'Success' };
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

  performTimeSeriesQuery(target, options) {
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
    return this.gapi.client.monitoring.projects.timeSeries.list(params).then(response => {
      response = JSON.parse(response.body);
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
    return this.gapi.client.monitoring.projects.metricDescriptors.list(params).then(response => {
      response = JSON.parse(response.body);
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
    return this.gapi.client.monitoring.projects.groups.list(params).then(response => {
      response = JSON.parse(response.body);
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
    return this.gapi.client.monitoring.projects.groups.members.list(params).then(response => {
      response = JSON.parse(response.body);
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

    switch(target.seriesFilter.mode) {
    case 'TOP':
      response.timeSeries.sort(function(a, b) {
        return b.filterValue - a.filterValue;
      });
      response.timeSeries = response.timeSeries.slice(0, param);
      return response;
    case 'BOTTOM':
      response.timeSeries.sort(function(a, b) {
        return a.filterValue - b.filterValue;
      });
      response.timeSeries = response.timeSeries.slice(0, param);
      return response;
    case 'BELOW':
      response.timeSeries = response.timeSeries.filter(function(elem) {
        return elem.filterValue < param;
      });
      return response;
    case 'ABOVE':
      response.timeSeries = response.timeSeries.filter(function(elem) {
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
    switch(target.seriesFilter.type) {
    case 'MAX':
      return series.points.reduce(function(acc, elem) {
        return Math.max(acc, elem.value[valueKey]);
      }, Number.MIN_VALUE);
    case 'MIN':
      return series.points.reduce(function(acc, elem) {
        return Math.min(acc, elem.value[valueKey]);
      }, Number.MAX_VALUE);
    case 'AVERAGE':
      return series.points.reduce(function(acc, elem) {
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
    if (series.bucket) {
      aliasData['bucket'] = series.bucket;
    }
    if (alias === '') {
      return JSON.stringify(aliasData);
    }
    let aliasRegex = /\{\{(.+?)\}\}/g;
    alias = alias.replace(aliasRegex, (match, g1) => {
      let matchedValue = _.property(g1)(aliasData);
      if (matchedValue) {
        return matchedValue;
      }
      return g1;
    });
    let aliasSubRegex = /sub\(([^,]+), "([^"]+)", "([^"]+)"\)/g;
    alias = alias.replace(aliasSubRegex, (match, g1, g2, g3) => {
      try {
        let matchedValue = _.property(g1)(aliasData);
        let labelRegex = new RegExp(g2);
        if (matchedValue) {
          return matchedValue.replace(labelRegex, g3);
        }
      } catch (e) {
        // if regexp compilation fails, we'll return original string below
      }
      return `sub(${g1}, "${g2}", "${g3}")`;
    });
    return alias;
  }

  convertTime(date, roundUp) {
    if (_.isString(date)) {
      date = dateMath.parse(date, roundUp);
    }
    return date.toISOString();
  };
}
