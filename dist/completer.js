'use strict';

System.register(['./datasource', 'lodash'], function (_export, _context) {
  "use strict";

  var StackdriverDatasource, _, _createClass, StackdriverCompleter;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_datasource) {
      StackdriverDatasource = _datasource.StackdriverDatasource;
    }, function (_lodash) {
      _ = _lodash.default;
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

      _export('StackdriverCompleter', StackdriverCompleter = function () {
        function StackdriverCompleter(datasource, timeSrv, target) {
          _classCallCheck(this, StackdriverCompleter);

          this.datasource = datasource;
          this.timeSrv = timeSrv;
          this.target = target;
          this.filterQueryCache = {};
          this.filterKeyCache = {};
          this.filterValueCache = {};
        }

        _createClass(StackdriverCompleter, [{
          key: 'getCompletions',
          value: function getCompletions(editor, session, pos, prefix, callback) {
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
                  var filterKeys = _this.transformToCompletions(_.uniq(_.flatten(result.map(function (r) {
                    return _this.getFilterKeys(r, '', []);
                  }))), 'filter key');
                  _this.filterKeyCache[metricType] = filterKeys;
                  callback(null, filterKeys);
                });
                return;
              case 'string.quoted':
                var keywordOperatorToken = this.findToken(session, pos.row, pos.column, 'keyword.operator', null, 'paren.lparen');
                if (!keywordOperatorToken) {
                  callback(null, []);
                  return;
                }

                var filterKey;
                var tokens = session.getTokens(keywordOperatorToken.row);
                var filterKeyToken = this.findToken(session, pos.row, pos.column, 'identifier', null, 'paren.lparen');
                if (filterKeyToken && keywordOperatorToken.index - filterKeyToken.index <= 2) {
                  filterKey = filterKeyToken.value;
                } else {
                  callback(null, []);
                  return;
                }

                if (this.filterValueCache[metricType] && this.filterValueCache[metricType][filterKey]) {
                  callback(null, this.filterValueCache[metricType][filterKey]);
                  return;
                }

                this.getFilterKeyAndValueForMetric(metricType).then(function (result) {
                  // to filter query, need to use 'label'
                  var valuePicker = _.property(filterKey.replace(/label/g, 'labels'));
                  var filterValues = _this.transformToCompletions(_.uniq(result.map(function (r) {
                    return valuePicker(r);
                  })), 'filter value');
                  _this.filterValueCache[metricType] = _this.filterValueCache[metricType] || {};
                  _this.filterValueCache[metricType][filterKey] = filterValues;
                  callback(null, filterValues);
                });
                return;
            }

            callback(null, []);
          }
        }, {
          key: 'getFilterKeyAndValueForMetric',
          value: function getFilterKeyAndValueForMetric(metricType) {
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
          }
        }, {
          key: 'transformToCompletions',
          value: function transformToCompletions(words, meta) {
            return words.map(function (name) {
              return {
                caption: name,
                value: name,
                meta: meta,
                score: Number.MAX_VALUE
              };
            });
          }
        }, {
          key: 'findToken',
          value: function findToken(session, row, column, target, value, guard) {
            var tokens, idx;
            for (var r = row; r >= 0; r--) {
              tokens = session.getTokens(r);
              if (r === row) {
                // current row
                var c = 0;
                for (idx = 0; idx < tokens.length; idx++) {
                  c += tokens[idx].value.length;
                  if (c >= column) {
                    break;
                  }
                }
              } else {
                idx = tokens.length - 1;
              }

              for (; idx >= 0; idx--) {
                if (tokens[idx].type === guard) {
                  return null;
                }

                if (tokens[idx].type === target && (!value || tokens[idx].value === value)) {
                  tokens[idx].row = r;
                  tokens[idx].index = idx;
                  return tokens[idx];
                }
              }
            }

            return null;
          }
        }, {
          key: 'getFilterKeys',
          value: function getFilterKeys(obj, prefix, keys) {
            var _this2 = this;

            _.forOwn(obj, function (val, key) {
              if (key === 'labels') {
                key = 'label';
              }
              if (_.isObject(val)) {
                _this2.getFilterKeys(val, prefix + key + '.', keys);
              } else if (_.isArray(val)) {
                // ignore
              } else if (key === 'points') {
                // ignore
              } else {
                keys.push(prefix + key);
              }
            });

            return keys;
          }
        }]);

        return StackdriverCompleter;
      }());

      _export('StackdriverCompleter', StackdriverCompleter);
    }
  };
});
//# sourceMappingURL=completer.js.map
