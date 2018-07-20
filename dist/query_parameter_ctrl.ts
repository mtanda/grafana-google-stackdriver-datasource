///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />

import angular from 'angular';
import _ from 'lodash';
import GoogleStackdriverCompleter from './completer';

angular.module('grafana.directives').directive('googleStackdriverQueryParameter', () => {
  return {
    templateUrl: 'public/plugins/mtanda-google-stackdriver-datasource/partials/query.parameter.html',
    controller: 'GoogleStackdriverQueryParameterCtrl',
    restrict: 'E',
    scope: {
      target: "=",
      datasource: "=",
      isLastQuery: "=",
      onChange: "&",
    }
  };
});

angular
  .module('grafana.controllers')
  .controller('GoogleStackdriverQueryParameterCtrl', ($scope, uiSegmentSrv, timeSrv, $q) => {
    $scope.init = function () {
      let target = $scope.target;
      target.projectId = target.projectId || '';
      target.mode = 'monitoring'; // will support logging
      target.metricType = target.metricType || '';
      target.filter = target.filter || '';
      target.aggregation = target.aggregation || {
        perSeriesAligner: 'ALIGN_NONE',
        alignmentPeriod: '',
        crossSeriesReducer: 'REDUCE_NONE',
        groupByFields: []
      };
      target.alias = target.alias || '';
      target.seriesFilter = target.seriesFilter || {
        mode: 'NONE',
        type: 'NONE',
        param: ''
      };

      $scope.perSeriesAlignerSegment = uiSegmentSrv.getSegmentForValue($scope.target.aggregation.perSeriesAligner, 'aligner');
      $scope.crossSeriesReducerSegment = uiSegmentSrv.getSegmentForValue($scope.target.aggregation.crossSeriesReducer, 'reducer');
      $scope.groupByFieldsSegments = _.map($scope.target.aggregation.groupByFields, (field) => {
        return uiSegmentSrv.getSegmentForValue(field);
      });
      $scope.ensurePlusButton($scope.groupByFieldsSegments);
      $scope.removeGroupByFieldsSegment = uiSegmentSrv.newSegment({ fake: true, value: '-- remove field --' });
      $scope.seriesFilterModeSegment = uiSegmentSrv.getSegmentForValue($scope.target.seriesFilter.mode, 'seriesFilterMode');
      $scope.seriesFilterTypeSegment = uiSegmentSrv.getSegmentForValue($scope.target.seriesFilter.type, 'seriesFilterType');

      if (!$scope.onChange) {
        $scope.onChange = function () { };
      }
    };

  $scope.getCompleter = function (query) {
    return new GoogleStackdriverCompleter(this.datasource, timeSrv, $scope.target);
  };

  $scope.$on('typeahead-updated', () => {
    $scope.$apply(() => {
      $scope.onChange();
    });
  });

  $scope.suggestMetricType = function (query, callback) {
    if (query === '') {
      return callback([]);
    }
    let params = {
      filter: 'metric.type = starts_with("' + query + '")'
    };
    return $scope.datasource.performMetricDescriptorsQuery(params, {}).then(response => {
      let metricTypes = response.metricDescriptors.map(d => {
        return d.type;
      });
      return callback(metricTypes);
    });
  };

  $scope.getPerSeriesAligner = function () {
    return $q.when([
      'ALIGN_NONE',
      'ALIGN_DELTA',
      'ALIGN_RATE',
      'ALIGN_INTERPOLATE',
      'ALIGN_NEXT_OLDER',
      'ALIGN_MIN',
      'ALIGN_MAX',
      'ALIGN_MEAN',
      'ALIGN_COUNT',
      'ALIGN_SUM',
      'ALIGN_STDDEV',
      'ALIGN_COUNT_TRUE',
      'ALIGN_FRACTION_TRUE',
      'ALIGN_PERCENTILE_05',
      'ALIGN_PERCENTILE_50',
      'ALIGN_PERCENTILE_95',
      'ALIGN_PERCENTILE_99'
    ].map(v => {
      return uiSegmentSrv.newSegment({ value: v, expandable: false });
    }));
  };

  $scope.getCrossSeriesReducer = function () {
    return $q.when([
      'REDUCE_NONE',
      'REDUCE_MEAN',
      'REDUCE_MIN',
      'REDUCE_MAX',
      'REDUCE_SUM',
      'REDUCE_STDDEV',
      'REDUCE_COUNT',
      'REDUCE_COUNT_TRUE',
      'REDUCE_FRACTION_TRUE',
      'REDUCE_PERCENTILE_05',
      'REDUCE_PERCENTILE_50',
      'REDUCE_PERCENTILE_95',
      'REDUCE_PERCENTILE_99',
    ].map(v => {
      return uiSegmentSrv.newSegment({ value: v, expandable: false });
    }));
  };

  $scope.alignerChanged = function () {
    $scope.target.aggregation.perSeriesAligner = $scope.perSeriesAlignerSegment.value;
    $scope.onChange();
  };

  $scope.reducerChanged = function () {
    $scope.target.aggregation.crossSeriesReducer = $scope.crossSeriesReducerSegment.value;
    $scope.onChange();
  };

  $scope.getSeriesFilterModes = function () {
    return $q.when([
      'NONE',
      'TOP',
      'BOTTOM',
      'ABOVE',
      'BELOW',
    ].map(v => {
      return uiSegmentSrv.newSegment({ value: v, expandable: false });
    }));
  };

  $scope.getSeriesFilterTypes = function () {
    return $q.when([
      'NONE',
      'AVERAGE',
      'MAX',
      'MIN',
      'CURRENT',
    ].map(v => {
      return uiSegmentSrv.newSegment({ value: v, expandable: false });
    }));
  };

  $scope.seriesFilterModeChanged = function () {
    $scope.target.seriesFilter.mode = $scope.seriesFilterModeSegment.value;
    $scope.onChange();
  };

  $scope.seriesFilterTypeChanged = function () {
    $scope.target.seriesFilter.type = $scope.seriesFilterTypeSegment.value;
    $scope.onChange();
  };

  function getAllFieldPaths(timeSeries) {
    let paths = [];
    let walk = function (obj, path) {
      path = path || '';
      for (let key of Object.keys(obj)) {
        if (obj[key] instanceof Object) {
          walk(obj[key], path + key + '.');
        } else {
          paths.push(path + key);
        }
      }
    };
    walk(timeSeries, '');
    return paths;
  }

  $scope.getGroupByFieldsSegments = function () {
    let filter = `metric.type = "${$scope.target.metricType}"`;
    if ($scope.target.filter) {
      filter += ` AND ${$scope.target.filter}`;
    }
    let params = {
      projectId: $scope.target.projectId || $scope.datasource.defaultProjectId,
      filter: filter,
      view: 'HEADERS'
    };
    return $scope.datasource.performTimeSeriesQuery(params, { range: timeSrv.timeRange() }).then(response => {
      let fields = _.uniq(_.flatten(response.timeSeries.map(d => {
        delete (d.points);
        return getAllFieldPaths(d);
      }))).map(f => {
        return uiSegmentSrv.newSegment({ value: f, expandable: false });
      });
      fields.push(angular.copy($scope.removeGroupByFieldsSegment));
      return fields;
    });
  };

  $scope.groupByFieldsSegmentChanged = function (segment, index) {
    if (segment.value === $scope.removeGroupByFieldsSegment.value) {
      $scope.groupByFieldsSegments.splice(index, 1);
    } else {
      segment.type = 'value';
    }

    $scope.target.aggregation.groupByFields = _.reduce($scope.groupByFieldsSegments, function (memo, seg) {
      if (!seg.fake) { memo.push(seg.value); } return memo;
    }, []);

    $scope.ensurePlusButton($scope.groupByFieldsSegments);
    $scope.onChange();
  };

  $scope.ensurePlusButton = function (segments) {
    let count = segments.length;
    let lastSegment = segments[Math.max(count - 1, 0)];

    if (!lastSegment || lastSegment.type !== 'plus-button') {
      segments.push(uiSegmentSrv.newPlusButton());
    }
  };

  $scope.init();
});
