# API test suite configuration reference

## API flow provider

`flowFile` is a required repository-relative JSON path. `url` selects an explicit origin when no fixture input exists. `endpointName` selects one endpoint from a deployment fixture. `requestTimeoutMs` bounds each request. `maximumResponseBytes` bounds each response. `maximumSteps` bounds setup, main, and cleanup steps together.

The flow file supports `schemaVersion`, `variables`, `setup`, `steps`, and `cleanup`. Each step supports `id`, `protocol`, `method`, `path`, `headers`, `body`, `messages`, `timeoutMs`, `expect`, and `extract`. The `expect` object supports `status`, `contentType`, `bodyContains`, `json`, `minimumMessages`, and `messageContains`.

## OpenAPI provider

`specFile` is a required repository-relative OpenAPI JSON path. YAML contract syntax remains a Nova lint concern; the isolated runtime consumes JSON to avoid hidden package dependencies. `url` and `endpointName` select the target in the same way as API flow. `operations` selects operation IDs and request values. `tags` expands only matching operations and remains capped at 128 selected operations. `requestTimeoutMs` and `maximumResponseBytes` bound execution.

An operation selection supports `operationId`, `pathParameters`, `query`, `headers`, `body`, `cleanup`, and `expectedStatuses`. A cleanup operation runs after non-cleanup selections even when an earlier operation fails. Local OpenAPI `$ref` values are supported. External references are denied because they would add undeclared network and file authority.

## Operator network fields

`allowedOrigins` lists exact permitted fixed origins. Exact origins can use the configured methods, request headers, and WebSocket setting. The production entrypoint builds this list from `BUSTER_NETWORK_HTTP_EXACT_ORIGINS`, a comma-separated operator value. An approved `kubeclaw.kubernetes-deployment-fixture@1` input also exact-scopes its declared endpoints for that provider invocation. The runtime derives this scope from resolved runner input; project files and provider capability requests cannot add it.

`allowedHostSuffixes` lists narrow permitted DNS suffixes. A suffix match is read-only: it permits only `GET` and `HEAD`, permits only the `accept` request header, and never permits WebSocket. This keeps broad cluster or tailnet discovery from also becoming mutation or credential authority.

`allowedPorts` lists permitted destination ports. `allowedMethods` lists HTTP methods that an exact origin can receive. `allowedRequestHeaders` lists request header names that an exact origin can receive. `allowWebSocket` is false unless the operator explicitly enables it. The production entrypoint enables it only when `BUSTER_NETWORK_HTTP_ALLOW_WEBSOCKET` is the exact string `true`, and WebSocket still requires an exact origin. `maximumRequestBytes` limits a request body and total outbound WebSocket messages. `maximumResponseBytes` limits HTTP bodies, each WebSocket message, and total received WebSocket data. `maximumExecutionMs` caps one capability operation.
