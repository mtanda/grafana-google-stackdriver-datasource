package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"golang.org/x/net/context"
	"golang.org/x/oauth2/google"
	monitoring "google.golang.org/api/monitoring/v3"

	"github.com/grafana/grafana_plugin_model/go/datasource"
	plugin "github.com/hashicorp/go-plugin"
)

type GoogleStackdriverDatasource struct {
	plugin.NetRPCUnsupportedPlugin
}

type Target struct {
	RefId  string
	Name   string
	Filter string
}

func (t *GoogleStackdriverDatasource) createMonitoringService() (*monitoring.Service, error) {
	ctx := context.Background()

	googleClient, err := google.DefaultClient(ctx, monitoring.MonitoringReadScope)
	if err != nil {
		return nil, fmt.Errorf("Error creating Google client: %+v", err)
	}

	monitoringService, err := monitoring.New(googleClient)
	if err != nil {
		return nil, fmt.Errorf("Error creating Google Stackdriver Monitoring service: %+v", err)
	}

	return monitoringService, nil
}

func (t *GoogleStackdriverDatasource) Query(ctx context.Context, tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	response := &datasource.DatasourceResponse{}

	monitoringService, err := t.createMonitoringService()
	if err != nil {
		return nil, err
	}

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

	//modelJson, err := simplejson.NewJson([]byte(tsdbReq.Queries[0].ModelJson))
	//if err != nil {
	//	return nil, err
	//}
	var target Target
	if err := json.Unmarshal([]byte(tsdbReq.Queries[0].ModelJson), &target); err != nil {
		return nil, err
	}

	timeSeriesListCall := monitoringService.Projects.TimeSeries.List(target.Name).
		Filter(target.Filter).
		IntervalStartTime(from.Format(time.RFC3339Nano)).
		IntervalEndTime(to.Format(time.RFC3339Nano))
	result, err := timeSeriesListCall.Do()
	if err != nil {
		return nil, err
	}

	resultJson, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}

	response.Results = []*datasource.QueryResult{
		&datasource.QueryResult{
			MetaJson: string(resultJson),
		},
	}
	return response, nil
}
