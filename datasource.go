package main

import (
	"encoding/json"
	"fmt"
	"strconv"

	"golang.org/x/net/context"

	monitoring "cloud.google.com/go/monitoring/apiv3"
	"github.com/golang/protobuf/ptypes/timestamp"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	monitoringpb "google.golang.org/genproto/googleapis/monitoring/v3"

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

func (t *GoogleStackdriverDatasource) createMonitoringClient() (*monitoring.MetricClient, error) {
	ctx := context.Background()
	monitoringClient, err := monitoring.NewMetricClient(ctx, option.WithScopes("https://www.googleapis.com/auth/monitoring.read"))
	if err != nil {
		return nil, fmt.Errorf("Error creating Google Stackdriver Monitoring service: %+v", err)
	}

	return monitoringClient, nil
}

func (t *GoogleStackdriverDatasource) Query(ctx context.Context, tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	response := &datasource.DatasourceResponse{}

	monitoringClient, err := t.createMonitoringClient()
	if err != nil {
		return nil, err
	}

	fromRaw, err := strconv.ParseInt(tsdbReq.TimeRange.FromRaw, 10, 64)
	if err != nil {
		return nil, err
	}
	from := timestamp.Timestamp{Seconds: fromRaw / 1000}
	toRaw, err := strconv.ParseInt(tsdbReq.TimeRange.ToRaw, 10, 64)
	if err != nil {
		return nil, err
	}
	to := timestamp.Timestamp{Seconds: toRaw / 1000}

	//modelJson, err := simplejson.NewJson([]byte(tsdbReq.Queries[0].ModelJson))
	//if err != nil {
	//	return nil, err
	//}
	var req monitoringpb.ListTimeSeriesRequest
	if err := json.Unmarshal([]byte(tsdbReq.Queries[0].ModelJson), &req); err != nil {
		return nil, err
	}
	req.Interval = &monitoringpb.TimeInterval{
		StartTime: &from,
		EndTime:   &to,
	}

	it := monitoringClient.ListTimeSeries(ctx, &req)
	for {
		resp, err := it.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}

		respJson, err := json.Marshal(resp)
		if err != nil {
			return nil, err
		}

		response.Results = append(response.Results, &datasource.QueryResult{
			MetaJson: string(respJson),
		})
	}

	return response, nil
}
