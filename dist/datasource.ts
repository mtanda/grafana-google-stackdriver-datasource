///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import * as dateMath from 'app/core/utils/datemath';

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
            let aliasPattern = '{{resource.type}} - {{metric.type}}';
            if (series.target.alias) {
              aliasPattern = series.target.alias;
            }
            let metricLabel = this.getMetricLabel(aliasPattern, series);

            let datapoints = [];
            let valueKey = series.valueType.toLowerCase() + 'Value';
            for (let point of series.points) {
              datapoints.push([point.value[valueKey], Date.parse(point.interval.endTime).valueOf()]);
            }
            // Stackdriver API returns series in reverse chronological order.
            datapoints.reverse();
            return { target: metricLabel, datapoints: datapoints };
          })
        };
      }, err => {
        err = JSON.parse(err.body);
        console.log(err);
        throw err.error;
      });
    });
  }

  metricFindQuery(query) {
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
      });
    }

    return this.$q.when([]);
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
        response = response.timeSeries.concat(nextResponse.timeSeries);
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
    case "TOP":
      response.timeSeries.sort(function(a, b) {
        return b.filterValue - a.filterValue;
      });
      response.timeSeries = response.timeSeries.slice(0, param);
      return response;
    case "BOTTOM":
      response.timeSeries.sort(function(a, b) {
        return a.filterValue - b.filterValue;
      });
      response.timeSeries = response.timeSeries.slice(0, param);
      return response;
    case "BELOW":
      response.timeSeries = response.timeSeries.filter(function(elem) {
        return elem.filterValue < param;
      });
      return response;
    case "ABOVE":
      response.timeSeries = response.timeSeries.filter(function(elem) {
        return elem.filterValue > param;
      });
      return response;
    }
  }

  getSeriesFilterValue(target, series) {
    let valueKey = series.valueType.toLowerCase() + 'Value';
    switch(target.seriesFilter.type) {
    case "MAX":
      return series.points.reduce(function(acc, elem) {
        return Math.max(acc, elem.value[valueKey]);
      }, Number.MIN_VALUE);
    case "MIN":
      return series.points.reduce(function(acc, elem) {
        return Math.min(acc, elem.value[valueKey]);
      }, Number.MAX_VALUE);
    case "AVERAGE":
      if (series.points.length == 0) return 0;
      return series.points.reduce(function(acc, elem) {
        return acc + elem.value[valueKey];
        }, 0) / series.points.length;
    case "CURRENT":
      if (series.points.length == 0) return 0;
      return series.points[0].value[valueKey];
    }
  }

  getMetricLabel(alias, series) {
    let aliasData = {
      metric: series.metric,
      resource: series.resource
    };
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
