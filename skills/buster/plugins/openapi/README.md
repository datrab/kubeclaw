# OpenAPI Provider

`kubeclaw.openapi@1` validates selected OpenAPI operations against a real HTTP
service. It reads a bounded OpenAPI document from the repository, resolves
local references, validates declared parameters and JSON bodies, and checks
the returned status, headers, media type, and schema.

The provider uses the brokered `network.http` capability. Operator policy owns
network authority and limits. Cleanup operations are explicit and run after
the selected checks.

Run the real local HTTP verification with:

```bash
npm test --prefix skills/buster/plugins/openapi
```

