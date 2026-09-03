# Lighthouse error reference

All errors stop the current provider attempt. The runner stores the error summary in attempt evidence and logs. Retry only browser startup, worker, or transient network failures. Configuration, authorization, schema, route, and limit errors need a source or operator correction before retry.

| Error | Meaning | Action |
| --- | --- | --- |
| `LIGHTHOUSE_SETTINGS_FILE_DENIED` | The settings path is absent, unsafe, or outside the repository. | Use a repository-relative regular JSON file. |
| `LIGHTHOUSE_SETTINGS_FILE_INVALID` | The settings document or schema version is invalid. | Validate it against the settings schema. |
| `LIGHTHOUSE_PROFILE_NOT_FOUND` | The selected profile is absent. | Add the profile or correct its name. |
| `LIGHTHOUSE_BUDGET_NOT_FOUND` | The selected budget is absent. | Add the budget or correct its name. |
| `LIGHTHOUSE_AUDIT_EXECUTION_ERROR` | Lighthouse could not execute one required SEO or best-practices audit. | Inspect the stored report and correct the page or worker before retry. |
| `LIGHTHOUSE_TARGET_REQUIRED` | No URL or typed endpoint input exists. | Add one authorized target source. |
| `LIGHTHOUSE_TARGET_AMBIGUOUS` | Both a URL and an input are present. | Keep one target source. |
| `BROWSER_LIGHTHOUSE_ORIGIN_DENIED` | Operator policy did not authorize the target origin. | Use a typed fixture or update operator policy. |
| `BROWSER_LIGHTHOUSE_SUBRESOURCE_ORIGIN_DENIED` | The page requested another origin. | Remove the external request or host the resource on the approved origin. |
| `BROWSER_LIGHTHOUSE_TIMEOUT_EXCEEDED` | Lighthouse exceeded its bounded deadline. | Fix the route or use an approved larger timeout. |
| `BROWSER_LIGHTHOUSE_RESULT_BYTES_EXCEEDED` | The returned reports exceeded the operator byte limit. | Reduce routes/runs or adjust the operator limit. |
| `BROWSER_LIGHTHOUSE_CANCELLED` | The runner cancelled the browser operation. | Inspect the parent cancellation or deadline. |
| `BROWSER_LIGHTHOUSE_EXECUTABLE_INVALID` | The configured Chrome file is absent or not executable. | Install Chrome and configure its absolute path. |
| `BROWSER_LIGHTHOUSE_OPERATION_DENIED` | The provider requested an unsupported capability operation. | Use the `audit` operation. |
| `BROWSER_LIGHTHOUSE_ORIGIN_INVALID` | An operator origin is not a valid bare HTTP origin. | Configure scheme, host, and optional port only. |
| `BROWSER_LIGHTHOUSE_PROFILE_INVALID` | A profile value is absent or outside its bounds. | Correct the named profile settings. |
| `BROWSER_LIGHTHOUSE_PROXY_FAILED` | The exact-origin proxy could not start. | Check worker sockets and process resources. |
| `BROWSER_LIGHTHOUSE_PURPOSE_INVALID` | The requested purpose is not supported. | Use performance, SEO, or best-practices. |
| `BROWSER_LIGHTHOUSE_REQUEST_INVALID` | The capability payload is not an object. | Use the versioned provider implementation. |
| `BROWSER_LIGHTHOUSE_RESOURCE_INVALID` | The capability resource is not a network URL. | Use the provider-generated request. |
| `BROWSER_LIGHTHOUSE_RESULT_INVALID` | Lighthouse returned no valid result. | Inspect Chrome and Lighthouse logs. |
| `BROWSER_LIGHTHOUSE_RESULT_LIMIT_INVALID` | The operator result-byte limit is invalid. | Configure a supported positive byte limit. |
| `BROWSER_LIGHTHOUSE_ROUTE_INVALID` | A route is not a safe root-relative path. | Remove query text, fragments, or duplicate leading slashes. |
| `BROWSER_LIGHTHOUSE_RUN_INVALID` | One run declaration is invalid. | Correct its route, purpose, and profile. |
| `BROWSER_LIGHTHOUSE_RUN_LIMIT_EXCEEDED` | The request has too many runs. | Reduce routes or samples. |
| `BROWSER_LIGHTHOUSE_RUN_LIMIT_INVALID` | The operator run limit is invalid. | Configure a value from 1 to 256. |
| `BROWSER_LIGHTHOUSE_TIMEOUT_INVALID` | A requested or operator timeout is invalid. | Use a bounded supported timeout. |
| `LEGACY_PERF_CONFIGURATION_RETIRED` | Old flat performance configuration has no safe automatic conversion. | Add explicit Lighthouse nodes, profiles, and budgets. |
| `LIGHTHOUSE_BUDGET_INVALID` | The selected budget has unsupported fields. | Validate the settings document. |
| `LIGHTHOUSE_CAPABILITY_RESULT_INVALID` | The trusted capability result does not match the request. | Inspect the deployed Buster version. |
| `LIGHTHOUSE_CATEGORY_MISSING` | A required Lighthouse category is absent. | Inspect the report and purpose. |
| `LIGHTHOUSE_CONFIG_INVALID` | Provider configuration is not an object. | Validate the pipeline node. |
| `LIGHTHOUSE_ENDPOINT_NOT_FOUND` | The named deployment endpoint is absent. | Correct `endpointName` or omit it. |
| `LIGHTHOUSE_INPUT_INVALID` | A typed target input has an invalid schema or value. | Repair the producing fixture. |
| `LIGHTHOUSE_INPUT_UNKNOWN` | The node received an unsupported input name. | Use `deployment` or `endpoint`. |
| `LIGHTHOUSE_METRIC_MISSING` | A required performance metric is absent. | Inspect the Lighthouse report and version. |
| `LIGHTHOUSE_PROFILE_INVALID` | The selected profile contains unsupported fields. | Validate the settings document. |
| `LIGHTHOUSE_SETTINGS_FILE_TOO_LARGE` | The settings file exceeds 256 KiB. | Reduce the file size. |
| `LIGHTHOUSE_WORKSPACE_INVALID` | The repository is outside the runner workspace. | Repair runner workspace configuration. |
| `TEST_PLAN_LIGHTHOUSE_BUDGET_REQUIRED` | A blocking performance node has no named budget. | Select an operator-reviewed combined budget, or make the evidence-only node advisory. |
