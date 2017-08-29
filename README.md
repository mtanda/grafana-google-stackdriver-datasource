## Google Stackdriver Datasource Plugin for Grafana

### Setup
To use this plugin, you need to get client ID which allow to call Google Stackdriver API.

Please create OAuth 2.0 client ID at https://console.developers.google.com/apis/credentials.

After get the client ID, set the ID to datasource config.

At first time, you need to accept to open this popup window, and accept to use API.

![](https://raw.githubusercontent.com/mtanda/grafana-google-stackdriver-datasource/master/dist/images/setup1.png)

![](https://raw.githubusercontent.com/mtanda/grafana-google-stackdriver-datasource/master/dist/images/setup2.png)

### Query editor

![](https://raw.githubusercontent.com/mtanda/grafana-google-stackdriver-datasource/master/dist/images/query_editor.png)

Please fill parameter for [projects.timeSeries.list](https://cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.timeSeries/list) method.

You don't need to add `projects/` prefix for `Project ID` field.

### Templating

#### Query variable

Name | Description
---- | --------
*metrics(project_id, filter expression)* | Returns a list of metrics matching the `filter expression`.
*label_values(project_id, path to label name, filter expression)* | Returns a list of label values matching the `filter expression` and the `path to label name`.
*groups(project_id)* | Returns a list of groups.
*group_members(project_id, group_id, path to label name, filter expression)* | Returns a list of group members matching the `filter expression` and the `path to label name`.

The `project_id` is optional.

Please specify `path to label name` from top of [TimeSeries](https://cloud.google.com/monitoring/api/ref_v3/rest/v3/TimeSeries) object.
For example, if you want to get instance name, set `metric.labels.instance_name` to `path to label name`.

#### Changelog

##### v1.0.0
- Initial release
