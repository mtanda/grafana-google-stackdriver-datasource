package main

import (
	"golang.org/x/net/context"

	"github.com/grafana/grafana_plugin_model/go/datasource"
	plugin "github.com/hashicorp/go-plugin"
)

type GoogleStackdriverDatasource struct {
	plugin.NetRPCUnsupportedPlugin
}

func (t *GoogleStackdriverDatasource) Query(ctx context.Context, tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	response := &datasource.DatasourceResponse{}

	return response, nil
}
