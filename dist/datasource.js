///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
System.register(['lodash', 'angular', 'app/core/utils/datemath', 'app/core/app_events', 'app/core/table_model'], function(exports_1) {
    var lodash_1, angular_1, dateMath, app_events_1, table_model_1;
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
            },
            function (app_events_1_1) {
                app_events_1 = app_events_1_1;
            },
            function (table_model_1_1) {
                table_model_1 = table_model_1_1;
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
                function GoogleStackdriverDatasource(instanceSettings, $q, templateSrv, timeSrv, backendSrv) {
                    this.$q = $q;
                    this.templateSrv = templateSrv;
                    this.timeSrv = timeSrv;
                    this.backendSrv = backendSrv;
                    this.type = instanceSettings.type;
                    this.name = instanceSettings.name;
                    this.id = instanceSettings.id;
                    this.access = instanceSettings.jsonData.access;
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
                                app_events_1.default.emit('ds-request-response', response);
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
                            if (options.targets[0].format === 'time_series') {
                                return _this.transformMetricData(timeSeries);
                            }
                            else {
                                return _this.transformMetricDataToTable(timeSeries);
                            }
                        }, function (err) {
                            console.log(err);
                            err = JSON.parse(err.body);
                            app_events_1.default.emit('ds-request-error', err);
                            throw err.error;
                        });
                    });
                };
                GoogleStackdriverDatasource.prototype.transformMetricData = function (timeSeries) {
                    var _this = this;
                    return {
                        data: timeSeries.map(function (series) {
                            var aliasPattern = series.target.alias;
                            var valueKey = series.valueType.toLowerCase() + 'Value';
                            if (valueKey != 'distributionValue') {
                                var datapoints = [];
                                var metricLabel = _this.getMetricLabel(aliasPattern, series);
                                for (var _i = 0, _a = series.points; _i < _a.length; _i++) {
                                    var point = _a[_i];
                                    var value = point.value[valueKey];
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
                            }
                            else {
                                var buckets = [];
                                var bucketBounds = [];
                                var bucketOptions = series.points[0].value.distributionValue.bucketOptions;
                                // set lower bounds
                                // https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries#Distribution
                                bucketBounds[0] = 0;
                                if (bucketOptions.linearBuckets) {
                                    for (var i = 1; i < bucketOptions.linearBuckets.numFiniteBuckets + 2; i++) {
                                        bucketBounds[i] = bucketOptions.linearBuckets.offset + (bucketOptions.linearBuckets.width * (i - 1));
                                    }
                                }
                                else if (bucketOptions.exponentialBuckets) {
                                    for (var i = 1; i < bucketOptions.exponentialBuckets.numFiniteBuckets + 2; i++) {
                                        bucketBounds[i] = bucketOptions.exponentialBuckets.scale * (Math.pow(bucketOptions.exponentialBuckets.growthFactor, (i - 1)));
                                    }
                                }
                                else if (bucketOptions.explicitBuckets) {
                                    for (var i = 1; i < bucketOptions.explicitBuckets.bounds.length + 1; i++) {
                                        bucketBounds[i] = bucketOptions.explicitBuckets.bounds[(i - 1)];
                                    }
                                }
                                for (var i = 0; i < bucketBounds.length; i++) {
                                    buckets[i] = {
                                        target: _this.getMetricLabel(aliasPattern, lodash_1.default.extend(series, { bucket: bucketBounds[i] })),
                                        datapoints: []
                                    };
                                }
                                for (var _b = 0, _c = series.points; _b < _c.length; _b++) {
                                    var point = _c[_b];
                                    for (var i = 0; i < point.value.distributionValue.bucketCounts.length; i++) {
                                        var value = parseInt(point.value.distributionValue.bucketCounts[i], 10);
                                        if (value !== 0) {
                                            buckets[i].datapoints.push([value, Date.parse(point.interval.endTime).valueOf()]);
                                        }
                                    }
                                }
                                return buckets;
                            }
                        }).flatten().filter(function (series) {
                            return series.datapoints.length > 0;
                        })
                    };
                };
                GoogleStackdriverDatasource.prototype.transformMetricDataToTable = function (md) {
                    var table = new table_model_1.default();
                    var i, j;
                    var metricLabels = {};
                    if (md.length === 0) {
                        return table;
                    }
                    // Collect all labels across all metrics
                    metricLabels['metric.type'] = 1;
                    metricLabels['resource.type'] = 1;
                    lodash_1.default.each(md, function (series) {
                        [
                            'metric.labels',
                            'resource.labels',
                            'metadata.systemLabels',
                            'metadata.userLabels',
                        ].forEach(function (path) {
                            lodash_1.default.map(md, lodash_1.default.property(path)).forEach(function (labels) {
                                if (labels) {
                                    lodash_1.default.keys(labels).forEach(function (k) {
                                        var label = path + '.' + k;
                                        if (!metricLabels.hasOwnProperty(label)) {
                                            metricLabels[label] = 1;
                                        }
                                    });
                                }
                            });
                        });
                    });
                    // Sort metric labels, create columns for them and record their index
                    var sortedLabels = lodash_1.default.keys(metricLabels).sort();
                    table.columns.push({ text: 'Time', type: 'time' });
                    lodash_1.default.each(sortedLabels, function (label, labelIndex) {
                        metricLabels[label] = labelIndex + 1;
                        table.columns.push({ text: label });
                    });
                    table.columns.push({ text: 'Value' });
                    // Populate rows, set value to empty string when label not present.
                    lodash_1.default.each(md, function (series) {
                        if (series.points) {
                            for (i = 0; i < series.points.length; i++) {
                                var point = series.points[i];
                                var reordered = [Date.parse(point.interval.endTime).valueOf()];
                                for (j = 0; j < sortedLabels.length; j++) {
                                    var label = sortedLabels[j];
                                    reordered.push(lodash_1.default.get(series, label) || '');
                                }
                                reordered.push(point.value[lodash_1.default.keys(point.value)[0]]);
                                table.rows.push(reordered);
                            }
                        }
                    });
                    return { data: [table] };
                };
                GoogleStackdriverDatasource.prototype.metricFindQuery = function (query) {
                    var _this = this;
                    return this.initialize().then(function () {
                        var metricsQuery = query.match(/^metrics\((([^,]+), *)?(.*)\)/);
                        if (metricsQuery) {
                            var projectId = metricsQuery[2] || _this.defaultProjectId;
                            var filter = metricsQuery[3];
                            var params = {
                                projectId: projectId,
                                filter: filter
                            };
                            return _this.performMetricDescriptorsQuery(params, {}).then(function (response) {
                                return _this.$q.when(response.metricDescriptors.map(function (d) {
                                    return { text: d.type };
                                }));
                            });
                        }
                        var labelQuery = query.match(/^label_values\((([^,]+), *)?([^,]+), *(.*)\)/);
                        if (labelQuery) {
                            var projectId = labelQuery[2] || _this.defaultProjectId;
                            var targetProperty = labelQuery[3];
                            var filter = labelQuery[4];
                            var params = {
                                projectId: projectId,
                                filter: filter,
                                view: 'HEADERS'
                            };
                            return _this.performTimeSeriesQuery(params, { range: _this.timeSrv.timeRange() }).then(function (response) {
                                var valuePicker = lodash_1.default.property(targetProperty);
                                return _this.$q.when(response.timeSeries.map(function (d) {
                                    return { text: valuePicker(d) };
                                }));
                            }, function (err) {
                                console.log(err);
                                err = JSON.parse(err.body);
                                throw err.error;
                            });
                        }
                        var groupsQuery = query.match(/^groups\(([^,]+)?\)/);
                        if (groupsQuery) {
                            var projectId = groupsQuery[1] || _this.defaultProjectId;
                            var params = {
                                projectId: projectId
                            };
                            return _this.performGroupsQuery(params, {}).then(function (response) {
                                return _this.$q.when(response.group.map(function (d) {
                                    return {
                                        //text: d.displayName
                                        text: d.name.split('/')[3]
                                    };
                                }));
                            }, function (err) {
                                console.log(err);
                                err = JSON.parse(err.body);
                                throw err.error;
                            });
                        }
                        var groupMembersQuery = query.match(/^group_members\((([^,]+), *)?([^,]+), *([^,]+), *(.*)\)/);
                        if (groupMembersQuery) {
                            var projectId = groupMembersQuery[2] || _this.defaultProjectId;
                            var groupId = groupMembersQuery[3];
                            var targetProperty = groupMembersQuery[4];
                            var filter = groupMembersQuery[5];
                            var params = {
                                projectId: projectId,
                                groupId: groupId,
                                filter: filter
                            };
                            return _this.performGroupsMembersQuery(params, { range: _this.timeSrv.timeRange() }).then(function (response) {
                                var valuePicker = lodash_1.default.property(targetProperty);
                                return _this.$q.when(response.members.map(function (d) {
                                    return { text: valuePicker(d) };
                                }));
                            }, function (err) {
                                console.log(err);
                                err = JSON.parse(err.body);
                                throw err.error;
                            });
                        }
                        return Promise.reject(new Error('Invalid query, use one of: metrics(), label_values(), groups(), group_members()'));
                    });
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
                    if (this.access == 'proxy') {
                        return Promise.resolve([]);
                    }
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
                    return (function (params) {
                        if (_this.access != 'proxy') {
                            return _this.gapi.client.monitoring.projects.timeSeries.list(params);
                        }
                        else {
                            return _this.backendSrv.datasourceRequest({
                                url: '/api/tsdb/query',
                                method: 'POST',
                                data: {
                                    from: options.range.from.valueOf().toString(),
                                    to: options.range.to.valueOf().toString(),
                                    queries: [
                                        lodash_1.default.extend({
                                            queryType: 'raw',
                                            api: 'monitoring.projects.timeSeries.list',
                                            refId: target.refId,
                                            datasourceId: _this.id
                                        }, params)
                                    ],
                                }
                            });
                        }
                    })(params).then(function (response) {
                        if (_this.access != 'proxy') {
                            response = JSON.parse(response.body);
                        }
                        else {
                            response = response.data.results[""].meta; // backend plugin
                        }
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
                    return (function (params) {
                        if (_this.access != 'proxy') {
                            return _this.gapi.client.monitoring.projects.metricDescriptors.list(params);
                        }
                        else {
                            return _this.backendSrv.datasourceRequest({
                                url: '/api/tsdb/query',
                                method: 'POST',
                                data: {
                                    queries: [
                                        lodash_1.default.extend({
                                            queryType: 'raw',
                                            api: 'monitoring.projects.metricDescriptors.list',
                                            refId: '',
                                            datasourceId: _this.id
                                        }, params)
                                    ],
                                }
                            });
                        }
                    })(params).then(function (response) {
                        if (_this.access != 'proxy') {
                            response = JSON.parse(response.body);
                        }
                        else {
                            response = response.data.results[""].meta; // backend plugin
                        }
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
                    return (function (params) {
                        if (_this.access != 'proxy') {
                            return _this.gapi.client.monitoring.projects.groups.list(params);
                        }
                        else {
                            return _this.backendSrv.datasourceRequest({
                                url: '/api/tsdb/query',
                                method: 'POST',
                                data: {
                                    queries: [
                                        lodash_1.default.extend({
                                            queryType: 'raw',
                                            api: 'monitoring.projects.groups.list',
                                            refId: '',
                                            datasourceId: _this.id
                                        }, params)
                                    ],
                                }
                            });
                        }
                    })(params).then(function (response) {
                        if (_this.access != 'proxy') {
                            response = JSON.parse(response.body);
                        }
                        else {
                            response = response.data.results[""].meta; // backend plugin
                        }
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
                    return (function (params) {
                        if (_this.access != 'proxy') {
                            return _this.gapi.client.monitoring.projects.groups.members.list(params);
                        }
                        else {
                            return _this.backendSrv.datasourceRequest({
                                url: '/api/tsdb/query',
                                method: 'POST',
                                data: {
                                    from: options.range.from.valueOf().toString(),
                                    to: options.range.to.valueOf().toString(),
                                    queries: [
                                        lodash_1.default.extend({
                                            queryType: 'raw',
                                            api: 'monitoring.projects.groups.members.list',
                                            refId: '',
                                            datasourceId: _this.id
                                        }, params)
                                    ],
                                }
                            });
                        }
                    })(params).then(function (response) {
                        if (_this.access != 'proxy') {
                            response = JSON.parse(response.body);
                        }
                        else {
                            response = response.data.results[""].meta; // backend plugin
                        }
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
                    if (series.bucket) {
                        aliasData['bucket'] = series.bucket;
                    }
                    if (alias === '') {
                        return JSON.stringify(aliasData);
                    }
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