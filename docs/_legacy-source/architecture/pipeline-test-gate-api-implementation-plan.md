# API suite Phase 8 implementation plan

## Goal

Phase 8 replaces the special Buster `api` runner with three declared provider nodes. `kubeclaw.http@1` checks one endpoint. `kubeclaw.api-flow@1` runs a versioned sequence. `kubeclaw.openapi@1` checks selected operations against an OpenAPI 3 contract. Each node uses the shared `network.http` capability and cannot open a socket directly.

## Work sequence

1. Capture every legacy configuration field, assertion, output, default, and known defect in the baseline.
2. Add strict provider configuration schemas and the `kubeclaw.api-flow.v1` file schema.
3. Run real HTTP and WebSocket servers in package-local tests. Do not inject successful results.
4. Add the three providers to the Buster runtime role and the API suite template.
5. Convert legacy project declarations. Reject an old test specification until an operator converts it to the versioned flow format.
6. Run the complete suite through `TestPlanRunner`, isolated provider processes, and the real network capability.

## Authority and safety

The operator owns allowed origins, host suffixes, ports, methods, headers, request bytes, response bytes, and execution time. A typed Kubernetes deployment input exact-scopes only its own endpoint for the receiving node. Project files cannot create that scope. Suffix-only targets remain read-only. Redirects are denied. Credentials can be sent only through headers that the operator allows and only to an exact-scoped origin. Evidence includes results and digests, not response bodies or extracted values.

## Exit criteria

Phase 8 closes only when all provider tests pass, the full three-node suite passes through the isolated runner, package ownership passes, and D-044 through D-047 have source targets and proof. A real local service is sufficient because this phase tests the provider boundary; the final cross-suite production cycle will test deployed remote dispatch.
