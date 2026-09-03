# API test suite user guide

Use the API suite when a service exposes an HTTP endpoint. The suite contains a simple HTTP check, an ordered API flow, and selected OpenAPI operations. Keep the flow and OpenAPI contract in the project repository so source review covers test behavior.

Create a JSON flow with `schemaVersion` set to `kubeclaw.api-flow.v1`. Put authentication or fixture creation in `setup`. Put business requests in `steps`. Put resource removal or logout in `cleanup`. Use `{{variable}}` in a path, header, body, or WebSocket message after an earlier response extracts that variable.

Assertions are strict. A status, content type, text, JSON value, or WebSocket message mismatch fails the node. A missing extracted variable skips only the main step that uses it. Cleanup still runs. Unknown fields and misspelled assertions stop execution before a request.

OpenAPI runtime checks require explicit `operations` or `tags`. The provider never executes every operation by default. Each operation can provide path values, query values, headers, a JSON body, and expected statuses. The provider validates declared parameters and request bodies before sending. It then validates the documented status, content type, response schema, and required response headers.

Do not place secret values in the flow file. Use an approved runtime input or an authentication setup response. Provider evidence does not contain response bodies or extracted values, but project authors must still avoid asserting secret text.
