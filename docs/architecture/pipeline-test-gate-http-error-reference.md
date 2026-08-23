# HTTP Test Error Reference

Status: authoritative Suite 6 error reference

Audience: project authors, operators, and maintainers
Purpose: explain each stable HTTP provider and runtime error

Evidence for every code appears in the attempt result and Buster log.

## Project Configuration

### `HTTP_CONFIG_INVALID`

- Cause: the provider configuration is not an object.
- Effect: the attempt errors before a request.
- Correction: supply a JSON object.
- Retry: do not retry unchanged configuration.

### `HTTP_CONFIG_URL_INVALID`

- Cause: `url` is not a canonical HTTP or HTTPS origin.
- Effect: the attempt errors before a request.
- Correction: remove paths, queries, fragments, and credentials.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_ENDPOINT_NAME_INVALID`

- Cause: `endpointName` is invalid or has no deployment input.
- Effect: target selection stops.
- Correction: link a deployment and use a valid DNS label.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_PATH_INVALID`

- Cause: `path` is not one bounded absolute path.
- Effect: target construction stops.
- Correction: use one path that starts with a single slash.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_METHOD_INVALID`

- Cause: `method` is not GET or HEAD.
- Effect: request construction stops.
- Correction: select GET or HEAD.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_ACCEPT_INVALID`

- Cause: `accept` is empty, too long, or contains a newline.
- Effect: request construction stops.
- Correction: supply one bounded media-range value.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_STATUSES_INVALID`

- Cause: `expectedStatuses` contains invalid or duplicate status values.
- Effect: assertion setup stops.
- Correction: use unique integers from 100 through 599.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_EXPECTED_TEXT_INVALID`

- Cause: `expectedText` is invalid or accompanies HEAD.
- Effect: assertion setup stops.
- Correction: use bounded text with GET.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_CONTENT_TYPE_INVALID`

- Cause: `expectedContentType` is not one media type.
- Effect: assertion setup stops.
- Correction: use a lowercase type and subtype.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_RESPONSE_LIMIT_INVALID`

- Cause: `maximumResponseBytes` is outside project limits.
- Effect: request setup stops.
- Correction: use an integer from 1 through 16777216.
- Retry: retry after configuration correction.

### `HTTP_CONFIG_TIMEOUT_INVALID`

- Cause: `requestTimeoutMs` is outside project limits.
- Effect: request setup stops.
- Correction: use an integer from 1 through 300000.
- Retry: retry after configuration correction.

## Input and Target Selection

### `HTTP_INPUT_UNKNOWN`

- Cause: the node links an undeclared input.
- Effect: target selection stops.
- Correction: retain only the `deployment` input.
- Retry: retry after graph correction.

### `HTTP_INPUT_INVALID`

- Cause: the deployment input has the wrong kind or schema.
- Effect: target selection stops.
- Correction: link `kubeclaw.kubernetes-deployment-fixture@1`.
- Retry: retry after graph correction.

### `HTTP_INPUT_ENDPOINTS_INVALID`

- Cause: the deployment contains no bounded endpoint list.
- Effect: target selection stops.
- Correction: repair the producing fixture contract.
- Retry: retry after fixture correction.

### `HTTP_INPUT_ENDPOINT_INVALID`

- Cause: a deployment endpoint has an invalid name or origin.
- Effect: target selection stops.
- Correction: repair the producing fixture endpoint.
- Retry: retry after fixture correction.

### `HTTP_TARGET_REQUIRED`

- Cause: the test has neither `url` nor a deployment input.
- Effect: no request starts.
- Correction: declare exactly one target source.
- Retry: retry after graph correction.

### `HTTP_TARGET_AMBIGUOUS`

- Cause: the test has both `url` and a deployment input.
- Effect: no request starts.
- Correction: remove one target source.
- Retry: retry after graph correction.

### `HTTP_TARGET_ENDPOINT_NOT_FOUND`

- Cause: endpoint selection is missing or does not match.
- Effect: no request starts.
- Correction: select an existing endpoint name.
- Retry: retry after configuration correction.

## Capability Policy

### `HTTP_CAPABILITY_REQUEST_INVALID`

- Cause: a provider sent an invalid capability request.
- Effect: the runtime denies the request.
- Correction: repair or replace the installed provider.
- Retry: do not retry unchanged provider code.

### `HTTP_REQUEST_URL_INVALID`

- Cause: the requested URL has an invalid scheme or authority.
- Effect: the runtime denies the request.
- Correction: use a canonical HTTP or HTTPS URL.
- Retry: retry after target correction.

### `HTTP_REQUEST_ORIGIN_DENIED`

- Cause: operator policy does not allow the origin or host suffix.
- Effect: the runtime denies the request.
- Correction: select an allowed target or approve the smallest origin.
- Retry: retry after an operator policy decision.

### `HTTP_REQUEST_PORT_DENIED`

- Cause: operator policy does not allow the resolved port.
- Effect: the runtime denies the request.
- Correction: select an allowed port or approve that exact port.
- Retry: retry after an operator policy decision.

### `HTTP_REQUEST_METHOD_DENIED`

- Cause: the capability request uses an unsupported method.
- Effect: the runtime denies the request.
- Correction: use GET or HEAD.
- Retry: retry after provider correction.

### `HTTP_REQUEST_HEADERS_INVALID`

- Cause: the capability request headers are not an object.
- Effect: the runtime denies the request.
- Correction: repair the installed provider.
- Retry: do not retry unchanged provider code.

### `HTTP_REQUEST_HEADER_DENIED`

- Cause: the capability request contains an unsupported header.
- Effect: the runtime denies the request.
- Correction: retain only one bounded Accept header.
- Retry: retry after provider correction.

### `HTTP_REQUEST_PAYLOAD_INVALID`

- Cause: the capability payload is not an object.
- Effect: the runtime denies the request.
- Correction: repair the installed provider.
- Retry: do not retry unchanged provider code.

### `HTTP_REQUEST_PAYLOAD_UNKNOWN_FIELD`

- Cause: the capability payload contains an undeclared field.
- Effect: the runtime denies the request.
- Correction: remove the undeclared field.
- Retry: retry after provider correction.

### `HTTP_REQUEST_TIMEOUT_INVALID`

- Cause: the requested timeout exceeds operator limits.
- Effect: the runtime denies the request.
- Correction: lower the project timeout.
- Retry: retry after configuration correction.

### `HTTP_REQUEST_RESPONSE_LIMIT_INVALID`

- Cause: the requested response limit exceeds operator limits.
- Effect: the runtime denies the request.
- Correction: lower the project response limit.
- Retry: retry after configuration correction.

## Request Execution

### `HTTP_REQUEST_TIMEOUT`

- Cause: the request or body read exceeded its time limit.
- Effect: the test reports a failed timeout assertion.
- Correction: inspect target health or use a justified larger timeout.
- Retry: shared node retry policy applies.

### `HTTP_REQUEST_FAILED`

- Cause: no HTTP response arrived because transport failed.
- Effect: the test reports a failed connection assertion.
- Correction: inspect DNS, routing, target health, and operator policy.
- Retry: shared node retry policy applies.

### `HTTP_REQUEST_CANCELLED`

- Cause: the attempt signal ended the active request.
- Effect: the attempt remains cancelled.
- Correction: inspect the upstream cancellation reason.
- Retry: a new attempt requires Nova authority.

### `HTTP_RESPONSE_REDIRECT_DENIED`

- Cause: the target returned a redirect.
- Effect: the attempt errors without following the location.
- Correction: use the final approved origin and path.
- Retry: retry after target correction.

### `HTTP_RESPONSE_SIZE_EXCEEDED`

- Cause: response bytes exceed the smaller active limit.
- Effect: body reading stops and the attempt errors.
- Correction: reduce the response or approve a justified limit.
- Retry: retry after target or policy correction.

### `HTTP_RESPONSE_INVALID`

- Cause: the capability returned an invalid response record.
- Effect: assertion processing stops.
- Correction: repair the Buster capability implementation.
- Retry: do not retry unchanged runtime code.

## Runtime Configuration

### `HTTP_RUNTIME_ORIGIN_INVALID`

- Cause: an operator origin is not canonical.
- Effect: Buster startup stops.
- Correction: use only a scheme, host, and optional port.
- Retry: restart after configuration correction.

### `HTTP_RUNTIME_HOST_SUFFIX_INVALID`

- Cause: an operator host suffix is invalid.
- Effect: Buster startup stops.
- Correction: use a lowercase DNS suffix that starts with a dot.
- Retry: restart after configuration correction.

### `HTTP_RUNTIME_PORT_INVALID`

- Cause: an operator port is outside 1 through 65535.
- Effect: Buster startup stops.
- Correction: use a valid port.
- Retry: restart after configuration correction.

### `HTTP_RUNTIME_PORT_POLICY_REQUIRED`

- Cause: operator policy contains no allowed port.
- Effect: Buster startup stops.
- Correction: declare the required exact ports.
- Retry: restart after configuration correction.

### `HTTP_RUNTIME_TARGET_POLICY_REQUIRED`

- Cause: operator policy contains no origin or host suffix.
- Effect: Buster startup stops.
- Correction: declare the smallest required target policy.
- Retry: restart after configuration correction.

### `HTTP_RUNTIME_RESPONSE_LIMIT_INVALID`

- Cause: the operator response limit is invalid.
- Effect: Buster startup stops.
- Correction: declare a positive integer byte limit.
- Retry: restart after configuration correction.

### `HTTP_RUNTIME_EXECUTION_LIMIT_INVALID`

- Cause: the operator execution limit is invalid.
- Effect: Buster startup stops.
- Correction: declare a bounded positive millisecond limit.
- Retry: restart after configuration correction.
