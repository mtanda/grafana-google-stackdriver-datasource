import angular from 'angular';
import _ from 'lodash';

angular.module('grafana.directives').directive('googleStackdriverQueryParameter', () => {
  return {
    templateUrl: 'public/plugins/mtanda-google-stackdriver-datasource/partials/query.parameter.html',
    controller: 'GoogleStackdriverQueryParameterCtrl',
    restrict: 'E',
    scope: {
      target: "=",
      datasource: "=",
      onChange: "&",
    }
  };
});

angular.module('grafana.controllers').controller('GoogleStackdriverQueryParameterCtrl', ($scope, templateSrv, uiSegmentSrv, datasourceSrv, $q) => {
  $scope.init = function () {
    let target = $scope.target;
    target.projectId = target.projectId || '';
    target.mode = 'monitoring'; // will support logging
    target.filter = target.filter || '';
    target.aggregation = target.aggregation || {
      perSeriesAligner: 'ALIGN_NONE',
      alignmentPeriod: '',
      crossSeriesReducer: 'REDUCE_NONE',
      groupByFields: []
    };
    target.alias = target.alias || '';

    $scope.perSeriesAlignerSegment = uiSegmentSrv.newSegment({value: 'aligner'});
    $scope.crossSeriesReducerSegment = uiSegmentSrv.newSegment({value: 'reducer'});
    $scope.groupByFieldsSegments = _.map($scope.target.aggregation.groupByFields, (field) => {
      return uiSegmentSrv.getSegmentForValue(field);
    });
    $scope.ensurePlusButton($scope.groupByFieldsSegments);
    $scope.removeGroupByFieldsSegment = uiSegmentSrv.newSegment({ fake: true, value: '-- remove field --' });

    if (!$scope.onChange) {
      $scope.onChange = function () { };
    }
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

  $scope.getGroupByFieldsSegments = function () {
    return $q.when(_.flatten([
      angular.copy($scope.removeGroupByFieldsSegment),
      uiSegmentSrv.getSegmentForValue('resource.type'),
    ]));
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
    var count = segments.length;
    var lastSegment = segments[Math.max(count - 1, 0)];

    if (!lastSegment || lastSegment.type !== 'plus-button') {
      segments.push(uiSegmentSrv.newPlusButton());
    }
  };

  $scope.init();
});
