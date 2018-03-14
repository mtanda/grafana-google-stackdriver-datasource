///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
System.register(['lodash', 'angular', 'app/core/utils/datemath'], function(exports_1) {
    var lodash_1, angular_1, dateMath;
    var GoogleStackdriverDatasource;
    return {
        setters:[
            function (lodash_1_1) {
                lodash_1 = lodash_1_1;
            },
            function (angular_1_1) {
                angular_1 = angular_1_1;
            },
            function (dateMath_1) {
                dateMath = dateMath_1;
            }],
        execute: function() {
            System.config({
                meta: {
                    'https://apis.google.com/js/api.js': {
                        exports: 'gapi',
                        format: 'global'
                    }
                }
            });
            GoogleStackdriverDatasource = (function () {
                /** @ngInject */
                function GoogleStackdriverDatasource(instanceSettings, $q, templateSrv, timeSrv) {
                    this.$q = $q;
                    this.templateSrv = templateSrv;
                    this.timeSrv = timeSrv;
                    this.type = instanceSettings.type;
                    this.name = instanceSettings.name;
                    this.clientId = instanceSettings.jsonData.clientId;
                    this.defaultProjectId = instanceSettings.jsonData.defaultProjectId;
                    this.scopes = [
                        //'https://www.googleapis.com/auth/cloud-platform',
                        //'https://www.googleapis.com/auth/monitoring',
                        'https://www.googleapis.com/auth/monitoring.read'
                    ].join(' ');
                    this.discoveryDocs = ["https://monitoring.googleapis.com/$discovery/rest?version=v3"];
                    this.initialized = false;
                }
                GoogleStackdriverDatasource.prototype.query = function (options) {
                    var _this = this;
                    return this.initialize().then(function () {
                        return Promise.all(options.targets.map(function (target) {
                            target = angular_1.default.copy(target);
                            var filter = 'metric.type = "' + _this.templateSrv.replace(target.metricType, options.scopedVars || {}) + '"';
                            if (target.filter) {
                                filter += ' AND ' + _this.templateSrv.replace(target.filter, options.scopedVars || {});
                            }
                            target.filter = filter;
                            return _this.performTimeSeriesQuery(target, options).then(function (response) {
                                response.timeSeries.forEach(function (series) {
                                    series.target = target;
                                });
                                return _this.filterSeries(target, response);
                            });
                        })).then(function (responses) {
                            var timeSeries = lodash_1.default.flatten(responses.filter(function (response) {
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
                                    for (var _i = 0, _a = series.points; _i < _a.length; _i++) {
                                        var point = _a[_i];
                                        datapoints.push([point.value[valueKey], Date.parse(point.interval.endTime).valueOf()]);
                                    }
                                    // Stackdriver API returns series in reverse chronological order.
                                    datapoints.reverse();
                                    return { target: metricLabel, datapoints: datapoints };
                                })
                            };
                        }, function (err) {
                            console.log(err);
                            err = JSON.parse(err.body);
                            throw err.error;
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.metricFindQuery = function (query) {
                    var _this = this;
                    var metricsQuery = query.match(/^metrics\((([^,]+), *)?(.*)\)/);
                    if (metricsQuery) {
                        var projectId = metricsQuery[2] || this.defaultProjectId;
                        var filter = metricsQuery[3];
                        var params = {
                            projectId: projectId,
                            filter: filter
                        };
                        return this.performMetricDescriptorsQuery(params, {}).then(function (response) {
                            return _this.$q.when(response.metricDescriptors.map(function (d) {
                                return { text: d.type };
                            }));
                        });
                    }
                    var labelQuery = query.match(/^label_values\((([^,]+), *)?([^,]+), *(.*)\)/);
                    if (labelQuery) {
                        var projectId = labelQuery[2] || this.defaultProjectId;
                        var targetProperty = labelQuery[3];
                        var filter = labelQuery[4];
                        var params = {
                            projectId: projectId,
                            filter: filter,
                            view: 'HEADERS'
                        };
                        return this.performTimeSeriesQuery(params, { range: this.timeSrv.timeRange() }).then(function (response) {
                            var valuePicker = lodash_1.default.property(targetProperty);
                            return _this.$q.when(response.timeSeries.map(function (d) {
                                return { text: valuePicker(d) };
                            }));
                        });
                    }
                    var groupsQuery = query.match(/^groups\(([^,]+)?\)/);
                    if (groupsQuery) {
                        var projectId = groupsQuery[1] || this.defaultProjectId;
                        var params = {
                            projectId: projectId
                        };
                        return this.performGroupsQuery(params, {}).then(function (response) {
                            return _this.$q.when(response.group.map(function (d) {
                                return {
                                    //text: d.displayName
                                    text: d.name.split('/')[3]
                                };
                            }));
                        });
                    }
                    var groupMembersQuery = query.match(/^group_members\((([^,]+), *)?([^,]+), *([^,]+), *(.*)\)/);
                    if (groupMembersQuery) {
                        var projectId = groupMembersQuery[2] || this.defaultProjectId;
                        var groupId = groupMembersQuery[3];
                        var targetProperty = groupMembersQuery[4];
                        var filter = groupMembersQuery[5];
                        var params = {
                            projectId: projectId,
                            groupId: groupId,
                            filter: filter
                        };
                        return this.performGroupsMembersQuery(params, { range: this.timeSrv.timeRange() }).then(function (response) {
                            var valuePicker = lodash_1.default.property(targetProperty);
                            return _this.$q.when(response.members.map(function (d) {
                                return { text: valuePicker(d) };
                            }));
                        });
                    }
                    return this.$q.when([]);
                };
                GoogleStackdriverDatasource.prototype.testDatasource = function () {
                    return this.initialize().then(function () {
                        return { status: 'success', message: 'Data source is working', title: 'Success' };
                    }).catch(function (err) {
                        console.log(err);
                        return { status: "error", message: err.message, title: "Error" };
                    });
                };
                GoogleStackdriverDatasource.prototype.load = function () {
                    var _this = this;
                    var deferred = this.$q.defer();
                    System.import('https://apis.google.com/js/api.js').then(function (gapi) {
                        _this.gapi = gapi;
                        _this.gapi.load('client:auth2', function () {
                            return deferred.resolve();
                        });
                    });
                    return deferred.promise;
                };
                GoogleStackdriverDatasource.prototype.initialize = function () {
                    var _this = this;
                    if (this.initialized) {
                        return Promise.resolve(this.gapi.auth2.getAuthInstance().currentUser.get());
                    }
                    return this.load().then(function () {
                        return _this.gapi.client.init({
                            clientId: _this.clientId,
                            scope: _this.scopes,
                            discoveryDocs: _this.discoveryDocs
                        }).then(function () {
                            var authInstance = _this.gapi.auth2.getAuthInstance();
                            if (!authInstance) {
                                throw { message: 'failed to initialize' };
                            }
                            var isSignedIn = authInstance.isSignedIn.get();
                            if (isSignedIn) {
                                _this.initialized = true;
                                return authInstance.currentUser.get();
                            }
                            return authInstance.signIn().then(function (user) {
                                _this.initialized = true;
                                return user;
                            });
                        }, function (err) {
                            console.log(err);
                            throw { message: 'failed to initialize' };
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.performTimeSeriesQuery = function (target, options) {
                    var _this = this;
                    target = angular_1.default.copy(target);
                    var params = {};
                    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
                    params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
                    if (target.aggregation) {
                        for (var _i = 0, _a = Object.keys(target.aggregation); _i < _a.length; _i++) {
                            var key = _a[_i];
                            if (lodash_1.default.isArray(target.aggregation[key])) {
                                params['aggregation.' + key] = target.aggregation[key].map(function (aggregation) {
                                    return _this.templateSrv.replace(aggregation, options.scopedVars || {});
                                });
                            }
                            else if (target.aggregation[key] !== '') {
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
                    return this.gapi.client.monitoring.projects.timeSeries.list(params).then(function (response) {
                        response = JSON.parse(response.body);
                        if (!response.timeSeries) {
                            return { timeSeries: [] };
                        }
                        if (!response.nextPageToken) {
                            return response;
                        }
                        target.pageToken = response.nextPageToken;
                        return _this.performTimeSeriesQuery(target, options).then(function (nextResponse) {
                            response.timeSeries = response.timeSeries.concat(nextResponse.timeSeries);
                            return response;
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.performMetricDescriptorsQuery = function (target, options) {
                    var _this = this;
                    target = angular_1.default.copy(target);
                    var params = {};
                    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
                    params.filter = this.templateSrv.replace(target.filter, options.scopedVars || {});
                    if (target.pageToken) {
                        params.pageToken = target.pageToken;
                    }
                    return this.gapi.client.monitoring.projects.metricDescriptors.list(params).then(function (response) {
                        response = JSON.parse(response.body);
                        if (!response.metricDescriptors) {
                            return { metricDescriptors: [] };
                        }
                        if (!response.nextPageToken) {
                            return response;
                        }
                        target.pageToken = response.nextPageToken;
                        return _this.performMetricDescriptorsQuery(target, options).then(function (nextResponse) {
                            response = response.metricDescriptors.concat(nextResponse.metricDescriptors);
                            return response;
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.performGroupsQuery = function (target, options) {
                    var _this = this;
                    target = angular_1.default.copy(target);
                    var params = {};
                    params.name = this.templateSrv.replace('projects/' + (target.projectId || this.defaultProjectId), options.scopedVars || {});
                    if (target.pageToken) {
                        params.pageToken = target.pageToken;
                    }
                    return this.gapi.client.monitoring.projects.groups.list(params).then(function (response) {
                        response = JSON.parse(response.body);
                        if (!response.group) {
                            return { group: [] };
                        }
                        if (!response.nextPageToken) {
                            return response;
                        }
                        target.pageToken = response.nextPageToken;
                        return _this.performGroupsQuery(target, options).then(function (nextResponse) {
                            response = response.group.concat(nextResponse.group);
                            return response;
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.performGroupsMembersQuery = function (target, options) {
                    var _this = this;
                    target = angular_1.default.copy(target);
                    var params = {};
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
                    return this.gapi.client.monitoring.projects.groups.members.list(params).then(function (response) {
                        response = JSON.parse(response.body);
                        if (!response.members) {
                            return { members: [] };
                        }
                        if (!response.nextPageToken) {
                            return response;
                        }
                        target.pageToken = response.nextPageToken;
                        return _this.performGroupsMembersQuery(target, options).then(function (nextResponse) {
                            response = response.members.concat(nextResponse.members);
                            return response;
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.filterSeries = function (target, response) {
                    var _this = this;
                    if (!lodash_1.default.has(target, 'seriesFilter') ||
                        target.seriesFilter.mode === 'NONE' ||
                        target.seriesFilter.type === 'NONE' ||
                        target.seriesFilter.param === '') {
                        return response;
                    }
                    var param = lodash_1.default.toNumber(target.seriesFilter.param);
                    if (lodash_1.default.isNaN(param))
                        return response;
                    response.timeSeries.forEach(function (series) {
                        series['filterValue'] = _this.getSeriesFilterValue(target, series);
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
                            console.log("Unknown series filter mode: " + target.seriesFilter.mode);
                            return response;
                    }
                };
                GoogleStackdriverDatasource.prototype.getSeriesFilterValue = function (target, series) {
                    // For empty timeseries return filter value that will push them out first.
                    if (series.points.length == 0) {
                        if (target.seriesFilter.mode === 'BOTTOM' ||
                            target.seriesFilter.mode === 'BELOW') {
                            return Number.MAX_VALUE;
                        }
                        else {
                            return Number.MIN_VALUE;
                        }
                    }
                    var valueKey = series.valueType.toLowerCase() + 'Value';
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
                            console.log("Unknown series filter type: " + target.seriesFilter.type);
                            return 0;
                    }
                };
                GoogleStackdriverDatasource.prototype.getMetricLabel = function (alias, series) {
                    var aliasData = {
                        metric: series.metric,
                        resource: series.resource
                    };
                    var aliasRegex = /\{\{(.+?)\}\}/g;
                    alias = alias.replace(aliasRegex, function (match, g1) {
                        var matchedValue = lodash_1.default.property(g1)(aliasData);
                        if (matchedValue) {
                            return matchedValue;
                        }
                        return g1;
                    });
                    var aliasSubRegex = /sub\(([^,]+), "([^"]+)", "([^"]+)"\)/g;
                    alias = alias.replace(aliasSubRegex, function (match, g1, g2, g3) {
                        try {
                            var matchedValue = lodash_1.default.property(g1)(aliasData);
                            var labelRegex = new RegExp(g2);
                            if (matchedValue) {
                                return matchedValue.replace(labelRegex, g3);
                            }
                        }
                        catch (e) {
                        }
                        return "sub(" + g1 + ", \"" + g2 + "\", \"" + g3 + "\")";
                    });
                    return alias;
                };
                GoogleStackdriverDatasource.prototype.convertTime = function (date, roundUp) {
                    if (lodash_1.default.isString(date)) {
                        date = dateMath.parse(date, roundUp);
                    }
                    return date.toISOString();
                };
                ;
                return GoogleStackdriverDatasource;
            })();
            exports_1("default", GoogleStackdriverDatasource);
        }
    }
});
//# sourceMappingURL=datasource.js.map