///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
System.register(['lodash'], function(exports_1) {
    var lodash_1;
    var GoogleStackdriverCompleter;
    return {
        setters:[
            function (lodash_1_1) {
                lodash_1 = lodash_1_1;
            }],
        execute: function() {
            GoogleStackdriverCompleter = (function () {
                function GoogleStackdriverCompleter(datasource, timeSrv, target) {
                    this.timeSrv = timeSrv;
                    this.datasource = datasource;
                    this.target = target;
                    this.filterQueryCache = {};
                    this.filterKeyCache = {};
                    this.filterValueCache = {};
                }
                GoogleStackdriverCompleter.prototype.getCompletions = function (editor, session, pos, prefix, callback) {
                    var _this = this;
                    var token = session.getTokenAt(pos.row, pos.column);
                    var metricType = this.target.metricType;
                    switch (token.type) {
                        case 'identifier':
                            if (this.filterKeyCache[metricType]) {
                                callback(null, this.filterKeyCache[metricType]);
                                return;
                            }
                            this.getFilterKeyAndValueForMetric(metricType).then(function (result) {
                                result = result.concat(['project', 'group.id']);
                                var filterKeys = _this.transformToCompletions(lodash_1.default.uniq(lodash_1.default.flatten(result.map(function (r) {
                                    return _this.getFilterKeys(r, '', []);
                                }))), 'filter key');
                                _this.filterKeyCache[metricType] = filterKeys;
                                callback(null, filterKeys);
                            });
                            return;
                        case 'string.quoted':
                            var keywordOperatorToken = this.findToken(session, pos.row, pos.column, 'keyword.operator', null, 'keyword');
                            if (!keywordOperatorToken) {
                                callback(null, []);
                                return;
                            }
                            var filterKey;
                            var tokens = session.getTokens(keywordOperatorToken.row);
                            var filterKeyToken = this.findToken(session, pos.row, pos.column, 'identifier', null, 'keyword');
                            if (filterKeyToken && (keywordOperatorToken.index - filterKeyToken.index) <= 2) {
                                filterKey = filterKeyToken.value;
                            }
                            else {
                                callback(null, []);
                                return;
                            }
                            if (this.filterValueCache[metricType] && this.filterValueCache[metricType][filterKey]) {
                                callback(null, this.filterValueCache[metricType][filterKey]);
                                return;
                            }
                            this.getFilterKeyAndValueForMetric(metricType).then(function (result) {
                                var valuePicker = lodash_1.default.property(filterKey);
                                var filterValues = _this.transformToCompletions(lodash_1.default.uniq(result.map(function (r) {
                                    return valuePicker(r);
                                })), 'filter value');
                                _this.filterValueCache[metricType] = _this.filterValueCache[metricType] || {};
                                _this.filterValueCache[metricType][filterKey] = filterValues;
                                callback(null, filterValues);
                            });
                            return;
                    }
                    callback(null, []);
                };
                GoogleStackdriverCompleter.prototype.getFilterKeyAndValueForMetric = function (metricType) {
                    if (metricType === '') {
                        return Promise.resolve({});
                    }
                    if (this.filterQueryCache[metricType]) {
                        return Promise.resolve(this.filterQueryCache[metricType]);
                    }
                    var params = {
                        projectId: this.target.projectId || this.datasource.defaultProjectId,
                        filter: 'metric.type = "' + metricType + '"',
                        view: 'HEADERS'
                    };
                    var self = this;
                    return this.datasource.performTimeSeriesQuery(params, { range: this.timeSrv.timeRange() }).then(function (response) {
                        self.filterQueryCache[metricType] = response.timeSeries;
                        return response.timeSeries;
                    });
                };
                GoogleStackdriverCompleter.prototype.transformToCompletions = function (words, meta) {
                    return words.map(function (name) {
                        return {
                            caption: name,
                            value: name,
                            meta: meta,
                            score: Number.MAX_VALUE
                        };
                    });
                };
                GoogleStackdriverCompleter.prototype.findToken = function (session, row, column, target, value, guard) {
                    var tokens, idx;
                    for (var r = row; r >= 0; r--) {
                        tokens = session.getTokens(r);
                        if (r === row) {
                            var c = 0;
                            for (idx = 0; idx < tokens.length; idx++) {
                                c += tokens[idx].value.length;
                                if (c >= column) {
                                    break;
                                }
                            }
                        }
                        else {
                            idx = tokens.length - 1;
                        }
                        for (; idx >= 0; idx--) {
                            if (tokens[idx].type === guard) {
                                return null;
                            }
                            if (tokens[idx].type === target
                                && (!value || tokens[idx].value === value)) {
                                tokens[idx].row = r;
                                tokens[idx].index = idx;
                                return tokens[idx];
                            }
                        }
                    }
                    return null;
                };
                GoogleStackdriverCompleter.prototype.getFilterKeys = function (obj, prefix, keys) {
                    var _this = this;
                    lodash_1.default.forOwn(obj, function (val, key) {
                        if (lodash_1.default.isObject(val)) {
                            _this.getFilterKeys(val, prefix + key + '.', keys);
                        }
                        else if (lodash_1.default.isArray(val)) {
                        }
                        else if (key === 'points') {
                        }
                        else {
                            keys.push(prefix + key);
                        }
                    });
                    return keys;
                };
                return GoogleStackdriverCompleter;
            })();
            exports_1("default", GoogleStackdriverCompleter);
        }
    }
});
//# sourceMappingURL=completer.js.map