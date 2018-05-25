package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"golang.org/x/net/context"
	"golang.org/x/oauth2/google"
	monitoring "google.golang.org/api/monitoring/v3"

	"github.com/grafana/grafana/pkg/components/simplejson"
	"github.com/grafana/grafana_plugin_model/go/datasource"
	plugin "github.com/hashicorp/go-plugin"
)

type GoogleStackdriverDatasource struct {
	plugin.NetRPCUnsupportedPlugin
}

var monitoringService *monitoring.Service
var initializeError error

func init() {
	ctx := context.Background()

	googleClient, err := google.DefaultClient(ctx, monitoring.MonitoringReadScope)
	if err != nil {
		initializeError = err
		return
	}

	service, err := monitoring.New(googleClient)
	if err != nil {
		initializeError = err
		return
	}

	monitoringService = service
}

func (t *GoogleStackdriverDatasource) Query(ctx context.Context, tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	var response *datasource.DatasourceResponse
	var err error

	if initializeError != nil {
		return nil, initializeError
	}

	modelJson, err := simplejson.NewJson([]byte(tsdbReq.Queries[0].ModelJson))
	if err != nil {
		return nil, err
	}
	switch modelJson.Get("queryType").MustString() {
	case "raw":
		api := modelJson.Get("api").MustString()
		response, err = t.handleRawQuery(api, tsdbReq)
		if err != nil {
			return nil, err
		}
	}
	return response, nil
}

func (t *GoogleStackdriverDatasource) handleRawQuery(api string, tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	switch api {
	case "monitoring.projects.timeSeries.list":
		return t.handleTimeSeriesList(tsdbReq)
	case "monitoring.projects.metricDescriptors.list":
		return t.handleMetricDescriptorsList(tsdbReq)
	case "monitoring.projects.groups.list":
		return t.handleGroupsList(tsdbReq)
	case "monitoring.projects.groups.members.list":
		return t.handleGroupsMembersList(tsdbReq)
	}

	return nil, fmt.Errorf("not supported api")
}

func (t *GoogleStackdriverDatasource) parseInterval(tsdbReq *datasource.DatasourceRequest) ([]string, error) {
	fromRaw, err := strconv.ParseInt(tsdbReq.TimeRange.FromRaw, 10, 64)
	if err != nil {
		return nil, err
	}
	from := time.Unix(fromRaw/1000, fromRaw%1000*1000*1000)
	toRaw, err := strconv.ParseInt(tsdbReq.TimeRange.ToRaw, 10, 64)
	if err != nil {
		return nil, err
	}
	to := time.Unix(toRaw/1000, toRaw%1000*1000*1000)

	return []string{from.Format(time.RFC3339Nano), to.Format(time.RFC3339Nano)}, nil
}

type TimeSeriesListRequest struct {
	RefId                         string
	Name                          string
	Filter                        string
	AggregationAlignmentPeriod    string   `json:"aggregation.alignmentPeriod"`
	AggregationPerSeriesAligner   string   `json:"aggregation.perSeriesAligner"`
	AggregationCrossSeriesReducer string   `json:"aggregation.crossSeriesReducer"`
	AggregationGroupByFields      []string `json:"aggregation.groupByFields"`
	OrderBy                       string
	View                          string
	PageToken                     string
}

func (t *GoogleStackdriverDatasource) handleTimeSeriesList(tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	var req TimeSeriesListRequest
	if err := json.Unmarshal([]byte(tsdbReq.Queries[0].ModelJson), &req); err != nil {
		return nil, err
	}

	interval, err := t.parseInterval(tsdbReq)
	if err != nil {
		return nil, err
	}
	timeSeriesListCall := monitoringService.Projects.TimeSeries.List(req.Name).
		IntervalStartTime(interval[0]).
		IntervalEndTime(interval[1])
	if req.Filter != "" {
		timeSeriesListCall = timeSeriesListCall.Filter(req.Filter)
	}
	if req.AggregationAlignmentPeriod != "" {
		timeSeriesListCall = timeSeriesListCall.AggregationAlignmentPeriod(req.AggregationAlignmentPeriod)
	}
	if req.AggregationPerSeriesAligner != "" {
		timeSeriesListCall = timeSeriesListCall.AggregationPerSeriesAligner(req.AggregationPerSeriesAligner)
	}
	if req.AggregationCrossSeriesReducer != "" {
		timeSeriesListCall = timeSeriesListCall.AggregationCrossSeriesReducer(req.AggregationCrossSeriesReducer)
	}
	if len(req.AggregationGroupByFields) > 0 {
		timeSeriesListCall = timeSeriesListCall.AggregationGroupByFields(req.AggregationGroupByFields...)
	}
	if req.OrderBy != "" {
		timeSeriesListCall = timeSeriesListCall.OrderBy(req.OrderBy)
	}
	if req.View != "" {
		timeSeriesListCall = timeSeriesListCall.View(req.View)
	}
	if req.PageToken != "" {
		timeSeriesListCall = timeSeriesListCall.PageToken(req.PageToken)
	}

	result, err := timeSeriesListCall.Do()
	if err != nil {
		return nil, err
	}

	resultJson, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}

	return &datasource.DatasourceResponse{
		Results: []*datasource.QueryResult{
			&datasource.QueryResult{
				MetaJson: string(resultJson),
			},
		},
	}, nil
}

type MetricDescriptorsListRequest struct {
	Name      string
	Filter    string
	PageToken string
}

func (t *GoogleStackdriverDatasource) handleMetricDescriptorsList(tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	var req MetricDescriptorsListRequest
	if err := json.Unmarshal([]byte(tsdbReq.Queries[0].ModelJson), &req); err != nil {
		return nil, err
	}

	metricDescriptorsListCall := monitoringService.Projects.MetricDescriptors.List(req.Name)
	if req.Filter != "" {
		metricDescriptorsListCall = metricDescriptorsListCall.Filter(req.Filter)
	}
	if req.PageToken != "" {
		metricDescriptorsListCall = metricDescriptorsListCall.PageToken(req.PageToken)
	}

	result, err := metricDescriptorsListCall.Do()
	if err != nil {
		return nil, err
	}

	resultJson, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}

	return &datasource.DatasourceResponse{
		Results: []*datasource.QueryResult{
			&datasource.QueryResult{
				MetaJson: string(resultJson),
			},
		},
	}, nil
}

type GroupsListRequest struct {
	Name      string
	PageToken string
}

func (t *GoogleStackdriverDatasource) handleGroupsList(tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	var req GroupsListRequest
	if err := json.Unmarshal([]byte(tsdbReq.Queries[0].ModelJson), &req); err != nil {
		return nil, err
	}

	groupsListCall := monitoringService.Projects.Groups.List(req.Name)
	if req.PageToken != "" {
		groupsListCall = groupsListCall.PageToken(req.PageToken)
	}

	result, err := groupsListCall.Do()
	if err != nil {
		return nil, err
	}

	resultJson, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}

	return &datasource.DatasourceResponse{
		Results: []*datasource.QueryResult{
			&datasource.QueryResult{
				MetaJson: string(resultJson),
			},
		},
	}, nil
}

type GroupsMembersListRequest struct {
	Name      string
	Filter    string
	PageToken string
}

func (t *GoogleStackdriverDatasource) handleGroupsMembersList(tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	var req GroupsMembersListRequest
	if err := json.Unmarshal([]byte(tsdbReq.Queries[0].ModelJson), &req); err != nil {
		return nil, err
	}

	interval, err := t.parseInterval(tsdbReq)
	if err != nil {
		return nil, err
	}
	groupsMembersListCall := monitoringService.Projects.Groups.Members.List(req.Name).
		IntervalStartTime(interval[0]).
		IntervalEndTime(interval[1])
	if req.Filter != "" {
		groupsMembersListCall = groupsMembersListCall.Filter(req.Filter)
	}
	if req.PageToken != "" {
		groupsMembersListCall = groupsMembersListCall.PageToken(req.PageToken)
	}

	result, err := groupsMembersListCall.Do()
	if err != nil {
		return nil, err
	}

	resultJson, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}

	return &datasource.DatasourceResponse{
		Results: []*datasource.QueryResult{
			&datasource.QueryResult{
				MetaJson: string(resultJson),
			},
		},
	}, nil
}
