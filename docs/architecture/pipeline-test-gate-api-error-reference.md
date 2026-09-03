# API test suite error reference

Configuration and file errors:

- `API_FLOW_CONFIG_INVALID`: provider configuration is not an object.
- `API_FLOW_FILE_DENIED`: the flow path is outside the repository or is not a file.
- `API_FLOW_FILE_INVALID`: the flow is not strict JSON or has unknown top-level fields.
- `API_FLOW_FILE_TOO_LARGE`: the flow exceeds one mebibyte.
- `API_FLOW_VERSION_UNSUPPORTED`: the flow version is not `kubeclaw.api-flow.v1`.
- `API_FLOW_WORKSPACE_INVALID`: the assigned repository is outside the workspace.
- `API_FLOW_STEPS_INVALID`: setup, steps, or cleanup is not an array.
- `API_FLOW_STEP_INVALID`: a step is not an object or has an unknown field.
- `API_FLOW_STEP_ID_INVALID`: a step identifier is missing or malformed.
- `API_FLOW_STEP_ID_DUPLICATE`: two steps use the same identifier.
- `API_FLOW_STEP_LIMIT_INVALID`: the configured step limit is invalid.
- `API_FLOW_STEP_LIMIT_EXCEEDED`: the flow has too many steps.
- `API_FLOW_PROTOCOL_INVALID`: the protocol is not HTTP or WebSocket.
- `API_FLOW_METHOD_INVALID`: the HTTP method is not supported.
- `API_FLOW_PATH_INVALID`: the path is not a safe origin-local path.
- `API_FLOW_HEADERS_INVALID`: a header name or value is unsafe or too large.
- `API_FLOW_MESSAGES_INVALID`: the WebSocket message list is invalid.
- `API_FLOW_EXPECT_INVALID`: an assertion is unknown or malformed.
- `API_FLOW_SELECTOR_INVALID`: a JSON selector is unsafe or malformed.
- `API_FLOW_EXTRACT_INVALID`: an extraction name or selector is invalid.
- `API_FLOW_VARIABLES_INVALID`: the initial variable map is invalid.
- `API_FLOW_VARIABLE_MISSING`: a main step references an output that does not exist.
- `API_FLOW_TIMEOUT_INVALID`: a step timeout is outside the allowed range.
- `API_FLOW_RESPONSE_LIMIT_INVALID`: the response byte limit is invalid.
- `API_FLOW_INPUT_UNKNOWN`: the provider received an unknown input name.
- `API_FLOW_INPUT_INVALID`: an endpoint input has the wrong kind, schema, or value.
- `API_FLOW_TARGET_REQUIRED`: neither a URL nor endpoint fixture was supplied.
- `API_FLOW_TARGET_AMBIGUOUS`: both a URL and endpoint fixture were supplied.
- `API_FLOW_ENDPOINT_NOT_FOUND`: the named fixture endpoint does not exist.

OpenAPI errors:

- `OPENAPI_CONFIG_INVALID`: provider configuration is not an object.
- `OPENAPI_FILE_DENIED`: the contract path escapes the repository or is not a file.
- `OPENAPI_FILE_INVALID`: the runtime contract is not valid JSON.
- `OPENAPI_FILE_TOO_LARGE`: the contract exceeds four mebibytes.
- `OPENAPI_VERSION_UNSUPPORTED`: the contract is not OpenAPI 3.
- `OPENAPI_WORKSPACE_INVALID`: the assigned repository escapes the workspace.
- `OPENAPI_PATHS_INVALID`: the contract has no valid paths object.
- `OPENAPI_PATH_INVALID`: an operation path is not a safe origin-local path.
- `OPENAPI_OPERATION_ID_INVALID`: an operation ID is missing or duplicated.
- `OPENAPI_OPERATION_NOT_FOUND`: a selected operation ID does not exist.
- `OPENAPI_PATH_PARAMETER_MISSING`: a selected path value is absent.
- `OPENAPI_SELECTION_EMPTY`: no operation is selected by ID or tag.
- `OPENAPI_SELECTION_LIMIT_EXCEEDED`: tag expansion selects more than 128 operations.
- `OPENAPI_EXTERNAL_REF_DENIED`: the contract uses a non-local schema reference.
- `OPENAPI_SCHEMA_REF_MISSING`: a local reference does not resolve.
- `OPENAPI_SCHEMA_REF_CYCLE`: local references form a cycle.
- `OPENAPI_SCHEMA_DEPTH_EXCEEDED`: schema recursion exceeds the safe depth.
- `OPENAPI_SCHEMA_PATTERN_INVALID`: a schema pattern is not a valid expression.
- `OPENAPI_SCHEMA_PATTERN_UNSAFE`: a schema pattern is too complex for bounded runtime evaluation.
- `OPENAPI_INPUT_UNKNOWN`: the provider received an unknown input name.
- `OPENAPI_INPUT_INVALID`: an endpoint input has the wrong kind, schema, or value.
- `OPENAPI_TARGET_REQUIRED`: neither a URL nor endpoint fixture was supplied.
- `OPENAPI_TARGET_AMBIGUOUS`: both a URL and endpoint fixture were supplied.
- `OPENAPI_ENDPOINT_NOT_FOUND`: the named fixture endpoint does not exist.

Network errors use the HTTP capability error reference. A denied origin, port, method, header, body, response header, timeout, redirect, or byte limit is an operator-policy failure. Do not weaken policy until the requested target and data are reviewed.
