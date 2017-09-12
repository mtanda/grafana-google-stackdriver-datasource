'use strict';

System.register(['angular', 'lodash'], function (_export, _context) {
  "use strict";

  var angular, _;

  return {
    setters: [function (_angular) {
      angular = _angular.default;
    }, function (_lodash) {
      _ = _lodash.default;
    }],
    execute: function () {

      angular.module('grafana.directives').directive('googleStackdriverQueryParameter', function () {
        return {
          templateUrl: 'public/plugins/mtanda-google-stackdriver-datasource/partials/query.parameter.html',
          controller: 'GoogleStackdriverQueryParameterCtrl',
          restrict: 'E',
          scope: {
            target: "=",
            datasource: "=",
            onChange: "&"
          }
        };
      });

      angular.module('grafana.controllers').controller('GoogleStackdriverQueryParameterCtrl', function ($scope, templateSrv, uiSegmentSrv, datasourceSrv, timeSrv, $q) {
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

          $scope.perSeriesAlignerSegment = uiSegmentSrv.getSegmentForValue($scope.target.aggregation.perSeriesAligner, 'aligner');
          $scope.crossSeriesReducerSegment = uiSegmentSrv.getSegmentForValue($scope.target.aggregation.crossSeriesReducer, 'reducer');
          $scope.groupByFieldsSegments = _.map($scope.target.aggregation.groupByFields, function (field) {
            return uiSegmentSrv.getSegmentForValue(field);
          });
          $scope.ensurePlusButton($scope.groupByFieldsSegments);
          $scope.removeGroupByFieldsSegment = uiSegmentSrv.newSegment({ fake: true, value: '-- remove field --' });

          if (!$scope.onChange) {
            $scope.onChange = function () {};
          }
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
          return $q.when(['ALIGN_NONE', 'ALIGN_DELTA', 'ALIGN_RATE', 'ALIGN_INTERPOLATE', 'ALIGN_NEXT_OLDER', 'ALIGN_MIN', 'ALIGN_MAX', 'ALIGN_MEAN', 'ALIGN_COUNT', 'ALIGN_SUM', 'ALIGN_STDDEV', 'ALIGN_COUNT_TRUE', 'ALIGN_FRACTION_TRUE', 'ALIGN_PERCENTILE_05', 'ALIGN_PERCENTILE_50', 'ALIGN_PERCENTILE_95', 'ALIGN_PERCENTILE_99'].map(function (v) {
            return uiSegmentSrv.newSegment({ value: v, expandable: false });
          }));
        };

        $scope.getCrossSeriesReducer = function () {
          return $q.when(['REDUCE_NONE', 'REDUCE_MEAN', 'REDUCE_MIN', 'REDUCE_MAX', 'REDUCE_SUM', 'REDUCE_STDDEV', 'REDUCE_COUNT', 'REDUCE_COUNT_TRUE', 'REDUCE_FRACTION_TRUE', 'REDUCE_PERCENTILE_05', 'REDUCE_PERCENTILE_50', 'REDUCE_PERCENTILE_95', 'REDUCE_PERCENTILE_99'].map(function (v) {
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

        function getAllFieldPaths(timeSeries) {
          var paths = [];
          var walk = function walk(obj, path) {
            path = path || '';
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
              for (var _iterator = Object.keys(obj)[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var key = _step.value;

                if (obj[key] instanceof Object) {
                  walk(obj[key], path + key + '.');
                } else {
                  paths.push(path + key);
                }
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
          };
          walk(timeSeries, '');
          return paths;
        }

        $scope.getGroupByFieldsSegments = function () {
          var params = {
            projectId: $scope.target.projectId || $scope.datasource.defaultProjectId,
            filter: $scope.target.filter,
            view: 'HEADERS'
          };
          return $scope.datasource.performTimeSeriesQuery(params, { range: timeSrv.timeRange() }).then(function (response) {
            var fields = _.uniq(_.flatten(response.timeSeries.map(function (d) {
              delete d.points;
              return getAllFieldPaths(d);
            }))).map(function (f) {
              f = f.replace(/\.labels\./, '.label.');
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
            if (!seg.fake) {
              memo.push(seg.value);
            }return memo;
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
  };
});
//# sourceMappingURL=query_parameter_ctrl.js.map
