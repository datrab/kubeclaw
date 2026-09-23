# Buster Provider Configuration

Status: generated reference
Audience: pipeline author, operator, test maintainer
Owner: buster
Evidence: scripts/generate-buster-provider-reference.mjs; skills/buster/plugins/api-flow/schemas/config.schema.json; skills/buster/plugins/api-flow/schemas/flow.schema.json; skills/buster/plugins/axe/schemas/config.schema.json; skills/buster/plugins/container-build/schemas/config.schema.json; skills/buster/plugins/coverage-budget/schemas/config.schema.json; skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json; skills/buster/plugins/direct-command/schemas/config.schema.json; skills/buster/plugins/http/schemas/config.schema.json; skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json; skills/buster/plugins/lighthouse/schemas/config.schema.json; skills/buster/plugins/openapi/schemas/config.schema.json; skills/buster/plugins/playwright/schemas/config.schema.json; skills/buster/plugins/security-providers/schemas/dependency.schema.json; skills/buster/plugins/security-providers/schemas/headers.schema.json; skills/buster/plugins/security-providers/schemas/image.schema.json; skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json; skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json; skills/buster/plugins/size-budget/schemas/config.schema.json; skills/buster/plugins/tailscale-exposure/schemas/config.schema.json; skills/buster/plugins/visual/schemas/config.schema.json
Evidence revision: `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`
Applies to: complete JSON configuration contracts for all shipped Buster test providers
Last verified: generated from current provider schemas on 2026-09-19

## How To Read The Tables

A dotted name is an object path. `[]` identifies each array item. `{}` identifies
each value in a map. “Required” means that the immediate parent always requires
the field. “Conditional” means that a `oneOf` or `anyOf` choice introduces the
field. The selected choice can require it, while another valid choice can omit
it. “Optional” means that no applicable schema rule requires it. Read the choice
rules after the table to learn which branch applies. The JSON Schema remains the validation
authority. This page makes that authority visible; it does not replace it.

The generator records types, defaults, constants, allowed values, numeric and
size limits, patterns, uniqueness, and closed-object rules. It intentionally does
not invent a default when the schema has none.

## `kubeclaw.api-flow@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/api-flow/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `endpointName` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |
| `flowFile` | Required | string | minimum length 1; maximum length 1024; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `maximumResponseBytes` | Optional | integer | default 1048576; minimum 1; maximum 16777216 |
| `maximumSteps` | Optional | integer | default 64; minimum 1; maximum 256 |
| `requestTimeoutMs` | Optional | integer | default 10000; minimum 1; maximum 300000 |
| `url` | Optional | string | minimum length 1; maximum length 2048 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.axe@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/axe/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `acceptances` | Optional | array | default []; maximum items 128 |
| `acceptances[]` | Each array item | object | no unknown fields |
| `acceptances[].expiresAt` | Required | string | pattern "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" |
| `acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `acceptances[].route` | Required | string | maximum length 1024; pattern "^/&#40;?!/&#41;[^?#\\r\\n]*$" |
| `acceptances[].rule` | Required | string | minimum length 1; maximum length 256 |
| `acceptances[].selector` | Required | string | minimum length 1; maximum length 512 |
| `endpointName` | Optional | string | maximum length 64; pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$" |
| `exclude` | Optional | array | default []; maximum items 64; unique items |
| `exclude[]` | Each array item | string | minimum length 1; maximum length 512 |
| `profileFile` | Optional | string | minimum length 1; maximum length 4096; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `profiles` | Optional | array | default ["desktop","mobile"]; minimum items 1; maximum items 16; unique items |
| `profiles[]` | Each array item | string | maximum length 64; pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$" |
| `routes` | Required | array | minimum items 1; maximum items 32; unique items |
| `routes[]` | Each array item | string | maximum length 1024; pattern "^/&#40;?!/&#41;[^?#\\r\\n]*$" |
| `tags` | Optional | array | default ["wcag2a","wcag2aa"]; minimum items 1; maximum items 32; unique items |
| `tags[]` | Each array item | string | minimum length 1; maximum length 128 |
| `timeoutMs` | Optional | integer | default 30000; minimum 1000; maximum 120000 |
| `url` | Optional | string | maximum length 2048; pattern "^https?://" |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.container-build@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/container-build/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `buildContext` | Required | string | minimum length 1; maximum length 1024 |
| `definition` | Required | object | no unknown fields |
| `definition.buildArgs` | Optional | object | maximum entries 32 |
| `definition.buildArgs{}` | Each map value | string | maximum length 4096 |
| `definition.dockerfile` | Conditional | string | minimum length 1; maximum length 1024 |
| `definition.target` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9._-]{0,126}[a-z0-9]&#41;?$" |
| `definition.template` | Conditional | schema choice | constant "node-static@1" |
| `definition.type` | Required | schema choice | constant "dockerfile"; constant "template" |
| `outputName` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9._-]{0,126}[a-z0-9]&#41;?$" |
| `platform` | Optional | string | maximum length 64; pattern "^linux/[a-z0-9_+-]+&#40;?:/[a-z0-9._+-]+&#41;?$" |

### Choice And Dependency Rules

- At `definition`, satisfy exactly one of 2 schema choices.
  - Choice 1: requires `type`, `dockerfile` and constrains `type` to value `"dockerfile"` and constrains `dockerfile` and constrains `target` and constrains `buildArgs`.
  - Choice 2: requires `type`, `template` and constrains `type` to value `"template"` and constrains `template` to value `"node-static@1"`.

## `kubeclaw.coverage-budget@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/coverage-budget/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `combine` | Optional | boolean | No additional scalar limit in the schema. |
| `minimumLinePercent` | Optional | number | minimum 0; maximum 100 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.demo-auth-smoke@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `assertions` | Required | array | minimum items 1; maximum items 16 |
| `assertions[]` | Each array item | object | no unknown fields |
| `assertions[].equals` | Required | boolean or number or string | maximum length 2048 |
| `assertions[].pointer` | Required | string | minimum length 1; maximum length 2048 |
| `cookieName` | Required | string | minimum length 1; maximum length 2048 |
| `loginPath` | Required | string | minimum length 1; maximum length 2048 |
| `passwordKey` | Required | string | minimum length 1; maximum length 2048 |
| `protectedPath` | Required | string | minimum length 1; maximum length 2048 |
| `protocol` | Required | schema choice | constant "json-session.v1" |
| `usernameKey` | Required | string | minimum length 1; maximum length 2048 |
| `usernamePointer` | Required | string | minimum length 1; maximum length 2048 |

### Choice And Dependency Rules

- At `assertions[].equals`, satisfy exactly one of 3 schema choices.
  - Choice 1: applies its listed field constraints.
  - Choice 2: applies its listed field constraints.
  - Choice 3: applies its listed field constraints.

## `kubeclaw.dependency-scan-trivy@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/schemas/dependency.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `policy` | Required | object | no unknown fields |
| `policy.acceptances` | Optional | array | maximum items 128 |
| `policy.acceptances[]` | Each array item | object | no unknown fields |
| `policy.acceptances[].expiresAt` | Required | string | No additional scalar limit in the schema. |
| `policy.acceptances[].findingId` | Required | string | minimum length 1; maximum length 256; pattern "^[A-Za-z0-9._:@/-]+$" |
| `policy.acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `policy.profile` | Required | schema choice | constant "strict-v1" |
| `projectDirectory` | Required | string | minimum length 1; maximum length 4096 |
| `timeoutMs` | Optional | integer | minimum 1000; maximum 900000 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.direct-command@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/direct-command/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `args` | Optional | array | maximum items 256 |
| `args[]` | Each array item | string | maximum length 4096 |
| `artifacts` | Optional | array | maximum items 8 |
| `artifacts[]` | Each array item | object | no unknown fields |
| `artifacts[].id` | Required | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `artifacts[].mediaType` | Required | schema choice | values "application/octet-stream", "application/x-tar", "application/gzip", "application/vnd.kubeclaw.build-output.tar", "application/vnd.kubeclaw.checked-kubernetes-yaml", "application/vnd.kubeclaw.size-budget-baseline+json" |
| `artifacts[].path` | Required | string | minimum length 1; maximum length 1024 |
| `coverage` | Optional | array | maximum items 8 |
| `coverage[]` | Each array item | object | no unknown fields |
| `coverage[].format` | Required | schema choice | constant "lcov" |
| `coverage[].id` | Required | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `coverage[].mediaType` | Required | schema choice | constant "text/lcov" |
| `coverage[].path` | Required | string | minimum length 1; maximum length 1024 |
| `environment` | Optional | object | maximum entries 64 |
| `environment{}` | Each map value | string | maximum length 4096 |
| `executable` | Required | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `reports` | Optional | array | maximum items 16 |
| `reports[]` | Each array item | object | no unknown fields |
| `reports[].format` | Required | schema choice | constant "junit" |
| `reports[].id` | Required | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `reports[].mediaType` | Required | schema choice | values "application/junit+xml", "application/xml", "text/xml" |
| `reports[].path` | Required | string | minimum length 1; maximum length 1024 |
| `resultMode` | Required | schema choice | values "junit-required", "exit-code" |
| `workingDirectory` | Optional | string | minimum length 1; maximum length 1024 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.http@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/http/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `accept` | Optional | string | default "*/*"; minimum length 1; maximum length 512; pattern "^[^\\r\\n]+$" |
| `endpointName` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |
| `expectedContentType` | Optional | string | minimum length 1; maximum length 128; pattern "^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$" |
| `expectedStatuses` | Optional | array | minimum items 1; maximum items 32; unique items |
| `expectedStatuses[]` | Each array item | integer | minimum 100; maximum 599 |
| `expectedText` | Optional | string | minimum length 1; maximum length 4096 |
| `maximumResponseBytes` | Optional | integer | default 1048576; minimum 1; maximum 16777216 |
| `method` | Optional | schema choice | default "GET"; values "GET", "HEAD" |
| `path` | Optional | string | maximum length 2048; pattern "^/&#40;?!/&#41;" |
| `requestTimeoutMs` | Optional | integer | default 10000; minimum 1; maximum 300000 |
| `url` | Optional | string | minimum length 1; maximum length 2048 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.image-scan-trivy@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/schemas/image.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `policy` | Required | object | no unknown fields |
| `policy.acceptances` | Optional | array | maximum items 128 |
| `policy.acceptances[]` | Each array item | object | no unknown fields |
| `policy.acceptances[].expiresAt` | Required | string | No additional scalar limit in the schema. |
| `policy.acceptances[].findingId` | Required | string | minimum length 1; maximum length 256; pattern "^[A-Za-z0-9._:@/-]+$" |
| `policy.acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `policy.profile` | Required | schema choice | constant "strict-v1" |
| `timeoutMs` | Optional | integer | minimum 1000; maximum 900000 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.kubernetes-fixture@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `image` | Optional | object | no unknown fields |
| `image.digest` | Required | string | pattern "^sha256:[a-f0-9]{64}$" |
| `image.reference` | Required | string | maximum length 2048; pattern "^[A-Za-z0-9.-]+&#40;?::[0-9]{1,5}&#41;?/[a-z0-9]+&#40;?:[._/-][a-z0-9]+&#41;*@sha256:[a-f0-9]{64}$" |
| `namespacePrefix` | Optional | string | maximum length 42; pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,40}[a-z0-9]&#41;?$" |
| `readinessTimeoutSeconds` | Optional | integer | minimum 1; maximum 3600 |
| `retention` | Optional | object | no unknown fields |
| `retention.mode` | Optional | schema choice | values "delete", "retain" |
| `retention.seconds` | Optional | integer | minimum 60; maximum 604800 |
| `secretReferences` | Optional | array | maximum items 32; unique items |
| `secretReferences[]` | Each array item | string | maximum length 253; pattern "^[A-Za-z0-9._-]+$" |
| `serviceName` | Required | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |
| `servicePort` | Required | integer | minimum 1; maximum 65535 |
| `serviceTargetPort` | Optional | integer | minimum 1; maximum 65535 |
| `testCredentials` | Optional | object | no unknown fields |
| `testCredentials.mode` | Required | schema choice | constant "generate" |
| `testCredentials.secretName` | Required | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.kubernetes-policy-security@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `policy` | Required | object | no unknown fields |
| `policy.acceptances` | Optional | array | maximum items 128 |
| `policy.acceptances[]` | Each array item | object | no unknown fields |
| `policy.acceptances[].expiresAt` | Required | string | No additional scalar limit in the schema. |
| `policy.acceptances[].findingId` | Required | string | minimum length 1; maximum length 256; pattern "^[A-Za-z0-9._:@/-]+$" |
| `policy.acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `policy.profile` | Required | schema choice | constant "strict-v1" |
| `timeoutMs` | Optional | integer | minimum 1000; maximum 300000 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.kubernetes-runtime-security@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `policy` | Required | object | no unknown fields |
| `policy.acceptances` | Optional | array | maximum items 128 |
| `policy.acceptances[]` | Each array item | object | no unknown fields |
| `policy.acceptances[].expiresAt` | Required | string | No additional scalar limit in the schema. |
| `policy.acceptances[].findingId` | Required | string | minimum length 1; maximum length 256; pattern "^[A-Za-z0-9._:@/-]+$" |
| `policy.acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `policy.profile` | Required | schema choice | constant "strict-v1" |
| `timeoutMs` | Optional | integer | minimum 1000; maximum 300000 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.lighthouse@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/lighthouse/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `acceptances` | Optional | array | default []; maximum items 128 |
| `acceptances[]` | Each array item | object | no unknown fields |
| `acceptances[].audit` | Required | string | minimum length 1; maximum length 256 |
| `acceptances[].expiresAt` | Required | string | pattern "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" |
| `acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `acceptances[].route` | Required | string | maximum length 1024; pattern "^/&#40;?!/&#41;[^?#\\r\\n]*$" |
| `budget` | Optional | string | maximum length 64; pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$" |
| `endpointName` | Optional | string | maximum length 64; pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$" |
| `profile` | Required | string | maximum length 64; pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$" |
| `purpose` | Required | schema choice | values "performance", "seo", "best-practices" |
| `routes` | Required | array | minimum items 1; maximum items 16; unique items |
| `routes[]` | Each array item | string | maximum length 1024; pattern "^/&#40;?!/&#41;[^?#\\r\\n]*$" |
| `runs` | Optional | schema choice | values 1, 3, 5 |
| `settingsFile` | Required | string | minimum length 1; maximum length 4096; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `timeoutMs` | Optional | integer | default 120000; minimum 10000; maximum 180000 |
| `url` | Optional | string | maximum length 2048; pattern "^https?://" |

### Choice And Dependency Rules

- At `root`, if it constrains `purpose` to value `"performance"`, then it constrains `runs` to values `3`, `5` and default `3`.
- At `root`, if it constrains `purpose` to values `"seo"`, `"best-practices"`, then it constrains `runs` to value `1` and default `1` and forbids `budget`.

## `kubeclaw.openapi@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `endpointName` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |
| `maximumResponseBytes` | Optional | integer | default 1048576; minimum 1; maximum 16777216 |
| `operations` | Conditional | array or schema choice | No additional scalar limit in the schema.; minimum items 1; maximum items 128 |
| `operations[]` | Each array item | object | no unknown fields |
| `operations[].body` | Optional | schema choice | No additional scalar limit in the schema. |
| `operations[].cleanup` | Optional | boolean | default false |
| `operations[].expectedStatuses` | Optional | array | minimum items 1; maximum items 16; unique items |
| `operations[].expectedStatuses[]` | Each array item | integer | minimum 100; maximum 599 |
| `operations[].headers` | Optional | object | maximum entries 32 |
| `operations[].headers{}` | Each map value | string | maximum length 4096 |
| `operations[].operationId` | Required | string | minimum length 1; maximum length 128 |
| `operations[].pathParameters` | Optional | object | maximum entries 32 |
| `operations[].pathParameters{}` | Each map value | boolean or number or string | No additional scalar limit in the schema. |
| `operations[].query` | Optional | object | maximum entries 32 |
| `operations[].query{}` | Each map value | boolean or number or string | No additional scalar limit in the schema. |
| `requestTimeoutMs` | Optional | integer | default 10000; minimum 1; maximum 300000 |
| `specFile` | Required | string | minimum length 1; maximum length 1024; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `tags` | Conditional | array or schema choice | No additional scalar limit in the schema.; minimum items 1; maximum items 32; unique items |
| `tags[]` | Each array item | string | minimum length 1; maximum length 128 |
| `url` | Optional | string | minimum length 1; maximum length 2048 |

### Choice And Dependency Rules

- At `root`, satisfy one or more of 2 schema choices.
  - Choice 1: requires `operations` and constrains `operations`.
  - Choice 2: requires `tags` and constrains `tags`.

## `kubeclaw.playwright@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/playwright/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `configFile` | Required | string | minimum length 1; maximum length 1024; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `endpointName` | Optional | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$" |
| `minimumExecutedTests` | Optional | integer | minimum 0; maximum 100000 |
| `projectDirectory` | Required | string | minimum length 1; maximum length 1024; pattern "^&#40;?:\\.\|&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+&#41;$" |
| `requiredTests` | Optional | array | maximum items 10000; unique items |
| `requiredTests[]` | Each array item | string | minimum length 1; maximum length 2048 |
| `timeoutMs` | Optional | integer | default 600000; minimum 1000; maximum 3600000 |
| `url` | Optional | string | maximum length 2048; pattern "^https?://" |
| `workers` | Optional | integer | minimum 1; maximum 64 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.security-headers@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/schemas/headers.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `paths` | Required | array | minimum items 1; maximum items 32; unique items |
| `paths[]` | Each array item | string | maximum length 2048; pattern "^/&#40;?!/&#41;" |
| `policy` | Required | object | no unknown fields |
| `policy.acceptances` | Optional | array | maximum items 128 |
| `policy.acceptances[]` | Each array item | object | no unknown fields |
| `policy.acceptances[].expiresAt` | Required | string | No additional scalar limit in the schema. |
| `policy.acceptances[].findingId` | Required | string | minimum length 1; maximum length 256; pattern "^[A-Za-z0-9._:@/-]+$" |
| `policy.acceptances[].reason` | Required | string | minimum length 8; maximum length 1024 |
| `policy.profile` | Required | schema choice | constant "strict-v1" |
| `profile` | Required | schema choice | values "web-https-v1", "api-http-v1" |
| `requestTimeoutMs` | Optional | integer | minimum 1; maximum 300000 |
| `rules` | Optional | object | no unknown fields |
| `rules.add` | Optional | array | maximum items 32 |
| `rules.add[]` | Each array item | object | no unknown fields |
| `rules.add[].header` | Required | string | maximum length 128; pattern "^[a-z0-9-]+$" |
| `rules.add[].id` | Required | string | maximum length 128; pattern "^[a-z0-9.-]+$" |
| `rules.add[].kind` | Required | schema choice | values "present", "equals", "contains", "hsts-min-age" |
| `rules.add[].severity` | Required | schema choice | values "critical", "high", "medium", "low", "info" |
| `rules.add[].value` | Optional | string | minimum length 1; maximum length 1024 |
| `rules.remove` | Optional | array | maximum items 32; unique items |
| `rules.remove[]` | Each array item | string | maximum length 128; pattern "^[a-z0-9.-]+$" |
| `rules.replace` | Optional | array | maximum items 32 |
| `rules.replace[]` | Each array item | object | no unknown fields |
| `rules.replace[].header` | Required | string | maximum length 128; pattern "^[a-z0-9-]+$" |
| `rules.replace[].id` | Required | string | maximum length 128; pattern "^[a-z0-9.-]+$" |
| `rules.replace[].kind` | Required | schema choice | values "present", "equals", "contains", "hsts-min-age" |
| `rules.replace[].severity` | Required | schema choice | values "critical", "high", "medium", "low", "info" |
| `rules.replace[].value` | Optional | string | minimum length 1; maximum length 1024 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.size-budget@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `format` | Optional | schema choice | values "auto", "file", "tar", "tar-gzip" |
| `largestFiles` | Optional | integer | minimum 1; maximum 100 |
| `matchingFiles` | Optional | array | maximum items 32 |
| `matchingFiles[]` | Each array item | object | no unknown fields |
| `matchingFiles[].id` | Required | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `matchingFiles[].maximumBytes` | Required | integer | minimum 0; maximum 9007199254740991 |
| `matchingFiles[].pattern` | Required | string | minimum length 1; maximum length 512 |
| `matchingFiles[].requireMatch` | Optional | boolean | No additional scalar limit in the schema. |
| `maximumFileCount` | Optional | integer | minimum 0; maximum 100000 |
| `maximumGrowthBytes` | Optional | integer | minimum 0; maximum 9007199254740991 |
| `maximumGrowthPercent` | Optional | number | minimum 0; maximum 1000000 |
| `maximumTotalBytes` | Optional | integer | minimum 0; maximum 9007199254740991 |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.tailscale-exposure@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/tailscale-exposure/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `endpointName` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |
| `hostname` | Optional | string | pattern "^[a-z0-9]&#40;?:[a-z0-9-]{0,61}[a-z0-9]&#41;?$" |
| `path` | Optional | string | maximum length 1024; pattern "^/&#40;?:[^/?#\\r\\n][^?#\\r\\n]*&#41;?$" |
| `readinessTimeoutSeconds` | Optional | integer | minimum 1; maximum 3600 |
| `retentionMode` | Optional | schema choice | values "release", "await-readiness" |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.visual@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/visual/schemas/config.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `comparisonProfile` | Optional | schema choice | default "strict-v1"; values "strict-v1", "balanced-v1" |
| `endpointName` | Optional | string | maximum length 64; pattern "^[A-Za-z0-9][A-Za-z0-9._-]*$" |
| `manifestFile` | Required | string | minimum length 1; maximum length 4096; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `masks` | Optional | array | maximum items 64 |
| `masks[]` | Each array item | object | no unknown fields |
| `masks[].selectors` | Required | array | minimum items 1; maximum items 32; unique items |
| `masks[].selectors[]` | Each array item | string | minimum length 1; maximum length 512 |
| `masks[].target` | Required | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `overrides` | Optional | object | no unknown fields |
| `overrides.maximumDifferencePercent` | Optional | number | minimum 0; maximum 100 |
| `overrides.pixelThreshold` | Optional | number | minimum 0; maximum 1 |
| `overrides.uncertaintyMarginPercent` | Optional | number | minimum 0; maximum 100 |
| `profileFile` | Required | string | minimum length 1; maximum length 4096; pattern "^&#40;?!/&#41;&#40;?!.*&#40;?:^\|/&#41;\\.\\.&#40;?:/\|$&#41;&#41;.+$" |
| `targets` | Required | array | minimum items 1; maximum items 64; unique items |
| `targets[]` | Each array item | string | pattern "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" |
| `timeoutMs` | Optional | integer | default 30000; minimum 1000; maximum 120000 |
| `url` | Optional | string | maximum length 2048; pattern "^https?://" |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## `kubeclaw.api-flow-document@1`

> [Validation schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/api-flow/schemas/flow.schema.json)

**Root rule:** Unknown top-level fields are rejected.

| Exact field path | Presence | Type | Schema rules |
| --- | --- | --- | --- |
| `cleanup` | Optional | array | maximum items 256 |
| `cleanup[]` | Each array item | object | no unknown fields |
| `cleanup[].body` | Optional | schema choice | No additional scalar limit in the schema. |
| `cleanup[].expect` | Optional | object | no unknown fields |
| `cleanup[].expect.bodyContains` | Optional | string | No additional scalar limit in the schema. |
| `cleanup[].expect.contentType` | Optional | string | No additional scalar limit in the schema. |
| `cleanup[].expect.json` | Optional | object | maximum entries 32 |
| `cleanup[].expect.messageContains` | Optional | string | No additional scalar limit in the schema. |
| `cleanup[].expect.minimumMessages` | Optional | integer | minimum 1; maximum 64 |
| `cleanup[].expect.status` | Optional | integer | minimum 100; maximum 599 |
| `cleanup[].extract` | Optional | object | maximum entries 32 |
| `cleanup[].extract{}` | Each map value | string | No additional scalar limit in the schema. |
| `cleanup[].headers` | Optional | object | maximum entries 32 |
| `cleanup[].headers{}` | Each map value | string | minimum length 1; maximum length 4096 |
| `cleanup[].id` | Required | string | pattern "^[a-z][a-z0-9-]{0,63}$" |
| `cleanup[].messages` | Optional | array | maximum items 64 |
| `cleanup[].method` | Optional | schema choice | values "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT" |
| `cleanup[].path` | Required | string | minimum length 1; maximum length 2048; pattern "^/&#40;?!/&#41;[^#\\r\\n]*$" |
| `cleanup[].protocol` | Optional | schema choice | constant "websocket" |
| `cleanup[].timeoutMs` | Optional | integer | minimum 1; maximum 300000 |
| `schemaVersion` | Required | schema choice | constant "kubeclaw.api-flow.v1" |
| `setup` | Optional | array | maximum items 256 |
| `setup[]` | Each array item | object | no unknown fields |
| `setup[].body` | Optional | schema choice | No additional scalar limit in the schema. |
| `setup[].expect` | Optional | object | no unknown fields |
| `setup[].expect.bodyContains` | Optional | string | No additional scalar limit in the schema. |
| `setup[].expect.contentType` | Optional | string | No additional scalar limit in the schema. |
| `setup[].expect.json` | Optional | object | maximum entries 32 |
| `setup[].expect.messageContains` | Optional | string | No additional scalar limit in the schema. |
| `setup[].expect.minimumMessages` | Optional | integer | minimum 1; maximum 64 |
| `setup[].expect.status` | Optional | integer | minimum 100; maximum 599 |
| `setup[].extract` | Optional | object | maximum entries 32 |
| `setup[].extract{}` | Each map value | string | No additional scalar limit in the schema. |
| `setup[].headers` | Optional | object | maximum entries 32 |
| `setup[].headers{}` | Each map value | string | minimum length 1; maximum length 4096 |
| `setup[].id` | Required | string | pattern "^[a-z][a-z0-9-]{0,63}$" |
| `setup[].messages` | Optional | array | maximum items 64 |
| `setup[].method` | Optional | schema choice | values "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT" |
| `setup[].path` | Required | string | minimum length 1; maximum length 2048; pattern "^/&#40;?!/&#41;[^#\\r\\n]*$" |
| `setup[].protocol` | Optional | schema choice | constant "websocket" |
| `setup[].timeoutMs` | Optional | integer | minimum 1; maximum 300000 |
| `steps` | Required | array | maximum items 256 |
| `steps[]` | Each array item | object | no unknown fields |
| `steps[].body` | Optional | schema choice | No additional scalar limit in the schema. |
| `steps[].expect` | Optional | object | no unknown fields |
| `steps[].expect.bodyContains` | Optional | string | No additional scalar limit in the schema. |
| `steps[].expect.contentType` | Optional | string | No additional scalar limit in the schema. |
| `steps[].expect.json` | Optional | object | maximum entries 32 |
| `steps[].expect.messageContains` | Optional | string | No additional scalar limit in the schema. |
| `steps[].expect.minimumMessages` | Optional | integer | minimum 1; maximum 64 |
| `steps[].expect.status` | Optional | integer | minimum 100; maximum 599 |
| `steps[].extract` | Optional | object | maximum entries 32 |
| `steps[].extract{}` | Each map value | string | No additional scalar limit in the schema. |
| `steps[].headers` | Optional | object | maximum entries 32 |
| `steps[].headers{}` | Each map value | string | minimum length 1; maximum length 4096 |
| `steps[].id` | Required | string | pattern "^[a-z][a-z0-9-]{0,63}$" |
| `steps[].messages` | Optional | array | maximum items 64 |
| `steps[].method` | Optional | schema choice | values "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT" |
| `steps[].path` | Required | string | minimum length 1; maximum length 2048; pattern "^/&#40;?!/&#41;[^#\\r\\n]*$" |
| `steps[].protocol` | Optional | schema choice | constant "websocket" |
| `steps[].timeoutMs` | Optional | integer | minimum 1; maximum 300000 |
| `variables` | Optional | object | maximum entries 64 |
| `variables{}` | Each map value | boolean or number or string | No additional scalar limit in the schema. |

### Choice And Dependency Rules

- The schema declares no `oneOf`, `anyOf`, or dependent-required rule.

## Maintenance Rule

Change a schema first. Then run `node scripts/generate-buster-provider-reference.mjs --write`.
Review the changed paths and limits as a contract change. The reference freshness gate
rejects a stale file and rejects a provider that is absent from this inventory.
