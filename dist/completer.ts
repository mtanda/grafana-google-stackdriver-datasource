///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import GoogleStackdriverDatasource from './datasource';
import _ from 'lodash';

export default class GoogleStackdriverCompleter {
  datasource: any;
  target: any;
  filterQueryCache: any;
  filterKeyCache: any;
  filterValueCache: any;

  constructor(datasource, private timeSrv, target) {
    this.datasource = datasource;
    this.target = target;
    this.filterQueryCache = {};
    this.filterKeyCache = {};
    this.filterValueCache = {};
  }

  getCompletions(editor, session, pos, prefix, callback) {
    let token = session.getTokenAt(pos.row, pos.column);
    if (!token) {
      callback(null, []);
      return;
    }

    var metricType = this.target.metricType;
    switch (token.type) {
      case 'identifier':
        if (this.filterKeyCache[metricType]) {
          callback(null, this.filterKeyCache[metricType]);
          return;
        }

        this.getFilterKeyAndValueForMetric(metricType).then(result => {
          result = result.concat(['project', 'group.id']);
          var filterKeys = this.transformToCompletions(
            _.uniq(_.flatten(result.map(r => {
              return this.getFilterKeys(r, '', []);
            })))
            , 'filter key');
          this.filterKeyCache[metricType] = filterKeys;
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
        } else {
          callback(null, []);
          return;
        }

        if (this.filterValueCache[metricType] && this.filterValueCache[metricType][filterKey]) {
          callback(null, this.filterValueCache[metricType][filterKey]);
          return;
        }

        this.getFilterKeyAndValueForMetric(metricType).then(result => {
          let valuePicker = _.property(filterKey);
          var filterValues = this.transformToCompletions(
            _.uniq(result.map(r => {
              return valuePicker(r);
            }))
            , 'filter value');
          this.filterValueCache[metricType] = this.filterValueCache[metricType] || {};
          this.filterValueCache[metricType][filterKey] = filterValues;
          callback(null, filterValues);
        });
        return;
    }

    callback(null, []);
  }

  getFilterKeyAndValueForMetric(metricType) {
    if (metricType === '') {
      return Promise.resolve({});
    }
    if (this.filterQueryCache[metricType]) {
      return Promise.resolve(this.filterQueryCache[metricType]);
    }
    let params = {
      projectId: this.target.projectId || this.datasource.defaultProjectId,
      filter: 'metric.type = "' + metricType + '"',
      view: 'HEADERS'
    };
    var self = this;
    return this.datasource.performTimeSeriesQuery(params, { range: this.timeSrv.timeRange() }).then(response => {
      self.filterQueryCache[metricType] = response.timeSeries;
      return response.timeSeries;
    });
  }

  transformToCompletions(words, meta) {
    return words.map(name => {
      return {
        caption: name,
        value: name,
        meta: meta,
        score: Number.MAX_VALUE
      };
    });
  }

  findToken(session, row, column, target, value, guard) {
    var tokens, idx;
    for (var r = row; r >= 0; r--) {
      tokens = session.getTokens(r);
      if (r === row) { // current row
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

        if (tokens[idx].type === target
          && (!value || tokens[idx].value === value)) {
          tokens[idx].row = r;
          tokens[idx].index = idx;
          return tokens[idx];
        }
      }
    }

    return null;
  }

  getFilterKeys(obj, prefix, keys) {
    _.forOwn(obj, (val, key) => {
      if (_.isObject(val)) {
        this.getFilterKeys(val, prefix + key + '.', keys);
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
}
