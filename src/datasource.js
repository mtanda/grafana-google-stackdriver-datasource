import _ from 'lodash';
import moment from 'moment';
import angular from 'angular';
import scriptjs from './libs/script.js';
import dateMath from 'app/core/utils/datemath';

export class GoogleStackdriverDatasource {
  constructor(instanceSettings, $q, templateSrv, timeSrv) {
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
    this.q = $q;
    this.templateSrv = templateSrv;
    this.timeSrv = timeSrv;
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
          return response;
        });
      })).then(responses => {
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
        return this.q.when(response.metricDescriptors.map(d => {
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
        return this.q.when(response.timeSeries.map(d => {
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
        return this.q.when(response.group.map(d => {
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
        return this.q.when(response.members.map(d => {
          return { text: valuePicker(d) };
        }));
      });
    }

    return this.q.when([]);
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
    let deferred = this.q.defer();
    scriptjs('https://apis.google.com/js/api.js', () => {
      gapi.load('client:auth2', () => {
        return deferred.resolve();
      });
    });
    return deferred.promise;
  }

  initialize() {
    if (this.initialized) {
      return Promise.resolve(gapi.auth2.getAuthInstance().currentUser.get());
    }

    return this.load().then(() => {
      return gapi.client.init({
        clientId: this.clientId,
        scope: this.scopes,
        discoveryDocs: this.discoveryDocs
      }).then(() => {
        let authInstance = gapi.auth2.getAuthInstance();
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
    let params = {};
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
    return gapi.client.monitoring.projects.timeSeries.list(params).then(response => {
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
    let params = {};
    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
    params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
    if (target.pageToken) {
      params.pageToken = target.pageToken;
    }
    return gapi.client.monitoring.projects.metricDescriptors.list(params).then(response => {
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
    let params = {};
    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
    if (target.pageToken) {
      params.pageToken = target.pageToken;
    }
    return gapi.client.monitoring.projects.groups.list(params).then(response => {
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
    let params = {};
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
    return gapi.client.monitoring.projects.groups.members.list(params).then(response => {
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

  getMetricLabel(aliasPattern, series) {
    let aliasRegex = /\{\{(.+?)\}\}/g;
    let aliasData = {
      metric: series.metric,
      resource: series.resource
    };
    let label = aliasPattern.replace(aliasRegex, (match, g1) => {
      let matchedValue = _.property(g1)(aliasData);
      if (matchedValue) {
        return matchedValue;
      }
      return g1;
    });
    return label;
  }

  convertTime(date, roundUp) {
    if (_.isString(date)) {
      date = dateMath.parse(date, roundUp);
    }
    return date.toISOString();
  };
}
