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


Runtime schema checks support a bounded subset of OpenAPI 3.0 and 3.1, not every
JSON Schema dialect. Boolean schemas are evaluated in every supported child
position, including `items: false` for nonempty arrays. Unsupported assertion
keywords, formats other than UUID/date-time, invalid schema shapes, and assertion
siblings of `$ref` fail closed. Supported assertions are type, nullable, const,
enum, allOf/anyOf/oneOf/not, string length/pattern/UUID/date-time, numeric bounds,
array size/uniqueness/items, object size/required/properties/additionalProperties,
and local references. Child schemas are checked even for absent properties and
empty arrays. Existing bounded regex and reference-depth protections remain.

Capability errors (including origin denial, response limits, and cancellation)
are execution errors, not failed API assertions. Cleanup selections are attempted
after a capability error, then the original error is rethrown. Cancellation takes
precedence and prohibits new cleanup requests. This does not prove that a cleanup
request will succeed against an unavailable service.
