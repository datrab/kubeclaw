# HTTP Test Configuration Reference

Status: authoritative Suite 6 field reference

Audience: project authors and operators
Purpose: define every HTTP provider field and operator limit

## Project Fields

### `url`

Owner: project. Type: canonical HTTP or HTTPS origin. Required when no
deployment input exists. Default: none. Maximum: 2048 characters.

The value cannot contain a path, query, fragment, or credentials. An invalid
or denied origin stops execution.

### `endpointName`

Owner: project. Type: DNS label. Required only when a deployment input has
multiple endpoints. Default: the sole endpoint.

The name selects one typed deployment endpoint. An unknown name stops
execution.

### `path`

Owner: project. Type: absolute URL path. Required: no. Default: `/`. Maximum:
2048 characters.

The value must start with one slash. A protocol-relative path is denied.

### `method`

Owner: project. Type: enum. Required: no. Default: `GET`. Allowed values:
`GET` and `HEAD`.

Use `HEAD` only when response content is not required.

### `accept`

Owner: project. Type: string. Required: no. Default: `*/*`. Maximum: 512
characters.

The value becomes the HTTP Accept header. Newline characters are denied.

### `expectedStatuses`

Owner: project. Type: unique integer array. Required: no. Default: all status
codes from 200 through 299. Maximum: 32 values.

Each value must be from 100 through 599. A response outside the set fails the
test.

### `expectedText`

Owner: project. Type: string. Required: no. Default: none. Maximum: 4096
characters.

The response body must contain this text. This field is invalid with `HEAD`.

### `expectedContentType`

Owner: project. Type: media type. Required: no. Default: none. Maximum: 128
characters.

The normalized response content type must equal this value.

### `maximumResponseBytes`

Owner: project. Type: integer. Required: no. Default: `1048576`. Minimum: `1`.
Maximum: `16777216` and the smaller operator limit.

The runtime stops reading when the response exceeds this limit.

### `requestTimeoutMs`

Owner: project. Type: integer. Required: no. Default: `10000`. Minimum: `1`.
Maximum: `300000` and the smaller operator limit.

The timeout covers connection and response-body reading.

## Operator Fields

### `allowedCapabilities`

Add `network.http` to permit HTTP provider requests. Omit it to deny all Suite
6 network effects.

### `networkHttp.allowedOrigins`

Type: unique canonical-origin array. Default: empty. Use exact origins for
external services.

### `networkHttp.allowedHostSuffixes`

Type: unique DNS-suffix array. Default: empty. Each value starts with a dot.
Use this field only for an operator-controlled internal DNS zone.

### `networkHttp.allowedPorts`

Type: unique integer array. Required: yes. Minimum value: `1`. Maximum value:
`65535`.

### `networkHttp.maximumResponseBytes`

Type: integer. Required: yes. Minimum: `1`. This value limits every project
request.

### `networkHttp.maximumExecutionMs`

Type: integer. Required: yes. Minimum: `1`. This value limits every request
duration.
