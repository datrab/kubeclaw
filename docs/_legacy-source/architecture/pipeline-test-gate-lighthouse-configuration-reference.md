# Lighthouse configuration reference

## Provider fields

Owner: project source. Type and bounds come from the provider schema. A schema failure stops plan resolution before Buster starts.

| Field | Rule |
| --- | --- |
| `purpose` | Required. `performance`, `seo`, or `best-practices`. |
| `url` | Optional exact HTTP origin. Do not use it with a typed target input. |
| `endpointName` | Optional deployment endpoint name when a deployment has more than one endpoint. |
| `routes` | Required. One to 16 root-relative paths. Query text and fragments are not permitted. |
| `settingsFile` | Required. Repository-relative JSON file. Parent traversal is not permitted. |
| `profile` | Required named profile from the settings file. |
| `budget` | Optional named performance budget. Do not use it for SEO or best-practices. |
| `runs` | Performance: 3 or 5. SEO and best-practices: 1. |
| `acceptances` | Exact SEO or best-practices audit acceptances. |
| `timeoutMs` | 10,000 to 180,000 milliseconds. |

The settings document has schema version `kubeclaw.lighthouse-settings.v1`. Each profile declares form factor, screen values, and throttling values. Each budget contains one or more of `minimumScore`, `maximumLcpMs`, `maximumCls`, and `maximumTbtMs`.

Project values select reviewed policy. They cannot change the Chrome executable, allowed origins, run ceiling, process resources, or result ceiling.

## Operator fields

Owner: Buster operator. These fields have no project override. Invalid values stop Buster startup.

| Field | Rule |
| --- | --- |
| `allowedOrigins` | Exact fixed origins that a worker permits. Typed fixture origins are added only for the current node. |
| `chromeExecutable` | Absolute path to the executable Chrome binary. |
| `maximumRuns` | Maximum route samples in one capability request. |
| `maximumExecutionMs` | Maximum deadline for one Lighthouse run. |
| `maximumResultBytes` | Maximum bytes in the complete capability result. |

## Defaults and failure behavior

- Performance defaults to three runs. SEO and best-practices default to one run.
- `timeoutMs` defaults to 120,000 milliseconds.
- A blocking performance node must select a budget. An advisory performance node can omit it.
- A missing profile, missing budget, invalid settings value, or unsafe path produces an execution error.
- A budget violation produces a failed check. An accepted audit stays visible as an informational finding.

See `contracts/pipeline-test-gate/v1/examples/lighthouse-performance-config.json` for a project example and `contracts/pipeline-test-gate/v1/examples/lighthouse-settings.json` for named profiles and budgets.
