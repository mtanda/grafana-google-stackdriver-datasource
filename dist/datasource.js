'use strict';

System.register(['lodash', 'moment', './libs/script.js', 'app/core/utils/datemath'], function (_export, _context) {
  "use strict";

  var _, moment, scriptjs, dateMath, _createClass, GoogleStackdriverDatasource;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_lodash) {
      _ = _lodash.default;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_libsScriptJs) {
      scriptjs = _libsScriptJs.default;
    }, function (_appCoreUtilsDatemath) {
      dateMath = _appCoreUtilsDatemath.default;
    }],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      _export('GoogleStackdriverDatasource', GoogleStackdriverDatasource = function () {
        function GoogleStackdriverDatasource(instanceSettings, $q, templateSrv, timeSrv) {
          _classCallCheck(this, GoogleStackdriverDatasource);

          this.type = instanceSettings.type;
          this.name = instanceSettings.name;
          this.clientId = instanceSettings.jsonData.clientId;
          this.defaultProjectId = instanceSettings.jsonData.defaultProjectId;
          this.scopes = [
          //'https://www.googleapis.com/auth/cloud-platform',
          //'https://www.googleapis.com/auth/monitoring',
          'https://www.googleapis.com/auth/monitoring.read'].join(' ');
          this.discoveryDocs = ["https://monitoring.googleapis.com/$discovery/rest?version=v3"];
          this.initialized = false;
          this.q = $q;
          this.templateSrv = templateSrv;
          this.timeSrv = timeSrv;
        }

        _createClass(GoogleStackdriverDatasource, [{
          key: 'query',
          value: function query(options) {
            var _this = this;

            return this.initialize().then(function () {
              return Promise.all(options.targets.map(function (target) {
                return _this.performTimeSeriesQuery(target, options).then(function (response) {
                  response.timeSeries.forEach(function (series) {
                    series.target = target;
                  });
                  return response;
                });
              })).then(function (responses) {
                var timeSeries = _.flatten(responses.filter(function (response) {
                  return !!response.timeSeries;
                }).map(function (response) {
                  return response.timeSeries;
                }));
                return {
                  data: timeSeries.map(function (series) {
                    var aliasPattern = '{{resource.type}} - {{metric.type}}';
                    if (series.target.alias) {
                      aliasPattern = series.target.alias;
                    }
                    var metricLabel = _this.getMetricLabel(aliasPattern, series);

                    var datapoints = [];
                    var valueKey = series.valueType.toLowerCase() + 'Value';
                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                      for (var _iterator = series.points[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var point = _step.value;

                        datapoints.push([point.value[valueKey], Date.parse(point.interval.endTime).valueOf()]);
                      }
                    } catch (err) {
                      _didIteratorError = true;
                      _iteratorError = err;
                    } finally {
                      try {
                        if (!_iteratorNormalCompletion && _iterator.return) {
                          _iterator.return();
                        }
                      } finally {
                        if (_didIteratorError) {
                          throw _iteratorError;
                        }
                      }
                    }

                    return { target: metricLabel, datapoints: datapoints };
                  })
                };
              }, function (err) {
                err = JSON.parse(err.body);
                console.log(err);
                throw err.error;
              });
            });
          }
        }, {
          key: 'metricFindQuery',
          value: function metricFindQuery(query) {
            var _this2 = this;

            var metricsQuery = query.match(/^metrics\((([^,]+), *)?(.*)\)/);
            if (metricsQuery) {
              var projectId = metricsQuery[2] || this.defaultProjectId;
              var filter = metricsQuery[3];
              var params = {
                projectId: projectId,
                filter: filter
              };
              return this.performMetricDescriptorsQuery(params, {}).then(function (response) {
                return _this2.q.when(response.metricDescriptors.map(function (d) {
                  return { text: d.type };
                }));
              });
            }

            var labelQuery = query.match(/^label_values\((([^,]+), *)?([^,]+), *(.*)\)/);
            if (labelQuery) {
              var _projectId = labelQuery[2] || this.defaultProjectId;
              var targetProperty = labelQuery[3];
              var _filter = labelQuery[4];
              var _params = {
                projectId: _projectId,
                filter: _filter,
                view: 'HEADERS'
              };
              return this.performTimeSeriesQuery(_params, { range: this.timeSrv.timeRange() }).then(function (response) {
                var valuePicker = _.property(targetProperty);
                return _this2.q.when(response.timeSeries.map(function (d) {
                  return { text: valuePicker(d) };
                }));
              });
            }

            var groupsQuery = query.match(/^groups\(([^,]+)?\)/);
            if (groupsQuery) {
              var _projectId2 = groupsQuery[1] || this.defaultProjectId;
              var _params2 = {
                projectId: _projectId2
              };
              return this.performGroupsQuery(_params2, {}).then(function (response) {
                return _this2.q.when(response.group.map(function (d) {
                  return {
                    //text: d.displayName
                    text: d.name.split('/')[3]
                  };
                }));
              });
            }

            var groupMembersQuery = query.match(/^group_members\((([^,]+), *)?([^,]+), *([^,]+), *(.*)\)/);
            if (groupMembersQuery) {
              var _projectId3 = groupMembersQuery[2] || this.defaultProjectId;
              var groupId = groupMembersQuery[3];
              var _targetProperty = groupMembersQuery[4];
              var _filter2 = groupMembersQuery[5];
              var _params3 = {
                projectId: _projectId3,
                groupId: groupId,
                filter: _filter2
              };
              return this.performGroupsMembersQuery(_params3, { range: this.timeSrv.timeRange() }).then(function (response) {
                var valuePicker = _.property(_targetProperty);
                return _this2.q.when(response.members.map(function (d) {
                  return { text: valuePicker(d) };
                }));
              });
            }

            return this.q.when([]);
          }
        }, {
          key: 'testDatasource',
          value: function testDatasource() {
            return this.initialize().then(function () {
              return { status: 'success', message: 'Data source is working', title: 'Success' };
            }).catch(function (err) {
              console.log(err);
              return { status: "error", message: err.message, title: "Error" };
            });
          }
        }, {
          key: 'load',
          value: function load() {
            var deferred = this.q.defer();
            scriptjs('https://apis.google.com/js/api.js', function () {
              gapi.load('client:auth2', function () {
                return deferred.resolve();
              });
            });
            return deferred.promise;
          }
        }, {
          key: 'initialize',
          value: function initialize() {
            var _this3 = this;

            if (this.initialized) {
              return Promise.resolve(gapi.auth2.getAuthInstance().currentUser.get());
            }

            return this.load().then(function () {
              return gapi.client.init({
                clientId: _this3.clientId,
                scope: _this3.scopes,
                discoveryDocs: _this3.discoveryDocs
              }).then(function () {
                var authInstance = gapi.auth2.getAuthInstance();
                if (!authInstance) {
                  throw { message: 'failed to initialize' };
                }
                var isSignedIn = authInstance.isSignedIn.get();
                if (isSignedIn) {
                  _this3.initialized = true;
                  return authInstance.currentUser.get();
                }
                return authInstance.signIn().then(function (user) {
                  _this3.initialized = true;
                  return user;
                });
              }, function (err) {
                console.log(err);
                throw { message: 'failed to initialize' };
              });
            });
          }
        }, {
          key: 'performTimeSeriesQuery',
          value: function performTimeSeriesQuery(target, options) {
            var _this4 = this;

            target = angular.copy(target);
            if (!target.metricType) {
              return Promise.resolve({ timeSeries: [] });
            }

            var params = {};
            params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
            params.filter = 'metric.type = "' + this.templateSrv.replace(target.metricType, options.scopedVars || {}) + '"';
            if (target.filter) {
              params.filter += ' AND ' + this.templateSrv.replace(target.filter, options.scopedVars || {});
            }
            if (target.aggregation) {
              var _iteratorNormalCompletion2 = true;
              var _didIteratorError2 = false;
              var _iteratorError2 = undefined;

              try {
                for (var _iterator2 = Object.keys(target.aggregation)[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                  var key = _step2.value;

                  if (_.isArray(target.aggregation[key])) {
                    params['aggregation.' + key] = target.aggregation[key].map(function (aggregation) {
                      return _this4.templateSrv.replace(aggregation, options.scopedVars || {});
                    });
                  } else if (target.aggregation[key] !== '') {
                    params['aggregation.' + key] = this.templateSrv.replace(target.aggregation[key], options.scopedVars || {});
                  }
                }
                // auto period
              } catch (err) {
                _didIteratorError2 = true;
                _iteratorError2 = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion2 && _iterator2.return) {
                    _iterator2.return();
                  }
                } finally {
                  if (_didIteratorError2) {
                    throw _iteratorError2;
                  }
                }
              }

              if (params['aggregation.perSeriesAligner'] !== 'ALIGN_NONE' && !params['aggregation.alignmentPeriod']) {
                params['aggregation.alignmentPeriod'] = Math.max(options.intervalMs / 1000, 60) + 's';
              }
            }
            if (target.pageToken) {
              params.pageToken = target.pageToken;
            }
            params['interval.startTime'] = this.convertTime(options.range.from, false);
            params['interval.endTime'] = this.convertTime(options.range.to, true);
            return gapi.client.monitoring.projects.timeSeries.list(params).then(function (response) {
              response = JSON.parse(response.body);
              if (!response.timeSeries) {
                return { timeSeries: [] };
              }
              if (!response.nextPageToken) {
                return response;
              }
              target.pageToken = response.nextPageToken;
              return _this4.performTimeSeriesQuery(target, options).then(function (nextResponse) {
                response = response.timeSeries.concat(nextResponse.timeSeries);
                return response;
              });
            });
          }
        }, {
          key: 'performMetricDescriptorsQuery',
          value: function performMetricDescriptorsQuery(target, options) {
            var _this5 = this;

            target = angular.copy(target);
            var params = {};
            params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
            params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
            if (target.pageToken) {
              params.pageToken = target.pageToken;
            }
            return gapi.client.monitoring.projects.metricDescriptors.list(params).then(function (response) {
              response = JSON.parse(response.body);
              if (!response.metricDescriptors) {
                return { metricDescriptors: [] };
              }
              if (!response.nextPageToken) {
                return response;
              }
              target.pageToken = response.nextPageToken;
              return _this5.performMetricDescriptorsQuery(target, options).then(function (nextResponse) {
                response = response.metricDescriptors.concat(nextResponse.metricDescriptors);
                return response;
              });
            });
          }
        }, {
          key: 'performGroupsQuery',
          value: function performGroupsQuery(target, options) {
            var _this6 = this;

            target = angular.copy(target);
            var params = {};
            params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
            if (target.pageToken) {
              params.pageToken = target.pageToken;
            }
            return gapi.client.monitoring.projects.groups.list(params).then(function (response) {
              response = JSON.parse(response.body);
              if (!response.group) {
                return { group: [] };
              }
              if (!response.nextPageToken) {
                return response;
              }
              target.pageToken = response.nextPageToken;
              return _this6.performGroupsQuery(target, options).then(function (nextResponse) {
                response = response.group.concat(nextResponse.group);
                return response;
              });
            });
          }
        }, {
          key: 'performGroupsMembersQuery',
          value: function performGroupsMembersQuery(target, options) {
            var _this7 = this;

            target = angular.copy(target);
            var params = {};
            params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId) + '/groups/' + target.groupId, options.scopedVars || {});
            params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
            if (target.pageToken) {
              params.pageToken = target.pageToken;
            }
            params['interval.startTime'] = this.convertTime(options.range.from, false);
            params['interval.endTime'] = this.convertTime(options.range.to, true);
            return gapi.client.monitoring.projects.groups.members.list(params).then(function (response) {
              response = JSON.parse(response.body);
              if (!response.members) {
                return { members: [] };
              }
              if (!response.nextPageToken) {
                return response;
              }
              target.pageToken = response.nextPageToken;
              return _this7.performGroupsMembersQuery(target, options).then(function (nextResponse) {
                response = response.members.concat(nextResponse.members);
                return response;
              });
            });
          }
        }, {
          key: 'getMetricLabel',
          value: function getMetricLabel(aliasPattern, series) {
            var aliasRegex = /\{\{(.+?)\}\}/g;
            var aliasData = {
              metric: series.metric,
              resource: series.resource
            };
            var label = aliasPattern.replace(aliasRegex, function (match, g1) {
              var matchedValue = _.property(g1)(aliasData);
              if (matchedValue) {
                return matchedValue;
              }
              return g1;
            });
            return label;
          }
        }, {
          key: 'convertTime',
          value: function convertTime(date, roundUp) {
            if (_.isString(date)) {
              date = dateMath.parse(date, roundUp);
            }
            return date.toISOString();
          }
        }]);

        return GoogleStackdriverDatasource;
      }());

      _export('GoogleStackdriverDatasource', GoogleStackdriverDatasource);
    }
  };
});
//# sourceMappingURL=datasource.js.map
