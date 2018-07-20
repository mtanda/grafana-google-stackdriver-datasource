///<reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
System.register(['angular', 'lodash', './completer'], function(exports_1) {
    var angular_1, lodash_1, completer_1;
    return {
        setters:[
            function (angular_1_1) {
                angular_1 = angular_1_1;
            },
            function (lodash_1_1) {
                lodash_1 = lodash_1_1;
            },
            function (completer_1_1) {
                completer_1 = completer_1_1;
            }],
        execute: function() {
            angular_1.default.module('grafana.directives').directive('googleStackdriverQueryParameter', function () {
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
            angular_1.default
                .module('grafana.controllers')
                .controller('GoogleStackdriverQueryParameterCtrl', function ($scope, uiSegmentSrv, timeSrv, $q) {
                $scope.init = function () {
                    var target = $scope.target;
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
                    $scope.groupByFieldsSegments = lodash_1.default.map($scope.target.aggregation.groupByFields, function (field) {
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
                    return new completer_1.default(this.datasource, timeSrv, $scope.target);
                };
                $scope.$on('typeahead-updated', function () {
                    $scope.$apply(function () {
                        $scope.onChange();
                    });
                });
                $scope.suggestMetricType = function (query, callback) {
                    if (query === '') {
                        return callback([]);
                    }
                    var params = {
                        filter: 'metric.type = starts_with("' + query + '")'
                    };
                    return $scope.datasource.performMetricDescriptorsQuery(params, {}).then(function (response) {
                        var metricTypes = response.metricDescriptors.map(function (d) {
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
                    ].map(function (v) {
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
                    ].map(function (v) {
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
                    ].map(function (v) {
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
                    ].map(function (v) {
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
                    var paths = [];
                    var walk = function (obj, path) {
                        path = path || '';
                        for (var _i = 0, _a = Object.keys(obj); _i < _a.length; _i++) {
                            var key = _a[_i];
                            if (obj[key] instanceof Object) {
                                walk(obj[key], path + key + '.');
                            }
                            else {
                                paths.push(path + key);
                            }
                        }
                    };
                    walk(timeSeries, '');
                    return paths;
                }
                $scope.getGroupByFieldsSegments = function () {
                    var filter = "metric.type = \"" + $scope.target.metricType + "\"";
                    if ($scope.target.filter) {
                        filter += " AND " + $scope.target.filter;
                    }
                    var params = {
                        projectId: $scope.target.projectId || $scope.datasource.defaultProjectId,
                        filter: filter,
                        view: 'HEADERS'
                    };
                    return $scope.datasource.performTimeSeriesQuery(params, { range: timeSrv.timeRange() }).then(function (response) {
                        var fields = lodash_1.default.uniq(lodash_1.default.flatten(response.timeSeries.map(function (d) {
                            delete (d.points);
                            return getAllFieldPaths(d);
                        }))).map(function (f) {
                            return uiSegmentSrv.newSegment({ value: f, expandable: false });
                        });
                        fields.push(angular_1.default.copy($scope.removeGroupByFieldsSegment));
                        return fields;
                    });
                };
                $scope.groupByFieldsSegmentChanged = function (segment, index) {
                    if (segment.value === $scope.removeGroupByFieldsSegment.value) {
                        $scope.groupByFieldsSegments.splice(index, 1);
                    }
                    else {
                        segment.type = 'value';
                    }
                    $scope.target.aggregation.groupByFields = lodash_1.default.reduce($scope.groupByFieldsSegments, function (memo, seg) {
                        if (!seg.fake) {
                            memo.push(seg.value);
                        }
                        return memo;
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
        }
    }
});
//# sourceMappingURL=query_parameter_ctrl.js.map