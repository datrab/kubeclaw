# End-to-end test configuration reference

This reference describes `kubeclaw.playwright@1`. Project configuration selects tests. Operator configuration sets hard limits. A project cannot increase an operator limit.

## Project fields

| Field | Type | Required | Default | Limit | Failure | Example |
| --- | --- | --- | --- | --- | --- | --- |
| `url` | HTTP or HTTPS origin | No | Typed input | Origin only; no path, user information, query, or fragment | `PLAYWRIGHT_TARGET_INVALID` | `https://preview.example.test` |
| `endpointName` | String | No | First deployment endpoint | 1–128 stable characters | `PLAYWRIGHT_ENDPOINT_NOT_FOUND` | `web` |
| `projectDirectory` | Repository-relative path | Yes | None | 1–1024 characters; no empty segment or `..` | `PLAYWRIGHT_PROJECT_DIRECTORY_INVALID` | `apps/web` |
| `configFile` | Project-relative path | Yes | None | 1–1024 characters; must be a real file inside the project | `PLAYWRIGHT_CONFIG_FILE_INVALID` | `playwright.config.ts` |
| `workers` | Integer | No | 4 | 1–64; Buster can reduce it | `PLAYWRIGHT_CONFIG_INVALID` | `2` |
| `timeoutMs` | Integer milliseconds | No | Node timeout | 1,000–3,600,000; Buster can reduce it | `PLAYWRIGHT_CONFIG_INVALID` | `120000` |
| `minimumExecutedTests` | Integer | No | 1 | 1–100,000 | `PLAYWRIGHT_CONFIG_INVALID` | `1` |
| `requiredTests` | String array | No | Empty | At most 1,024 unique test-title paths; each value is 1–1,024 characters | `PLAYWRIGHT_CONFIG_INVALID` | `["chromium › smoke › opens the page"]` |

Use either `url` or one typed `deployment` or `endpoint` input. Do not use both. Unknown fields are invalid. Symlinks cannot move a path outside the immutable attempt repository.

The project Playwright configuration owns test selection, browser projects, retries, authentication setup, assertion timeouts, screenshots, video, and traces. KubeClaw always adds the JSON reporter, a canonical artifact directory, `--max-failures=0`, the authorized base URL, and the effective worker ceiling.

`minimumExecutedTests` rejects a run that executes too few tests. Each
`requiredTests` value must match one canonical reported title path. These
checks prevent a green result after accidental test filtering.

## Operator fields

| Field | Type | Required | Production default | Valid range | Effect |
| --- | --- | --- | --- | --- | --- |
| `allowedOrigins` | Origin array | Yes | Deployment-derived exact origins | Valid HTTP/HTTPS origins | Adds operator-approved targets. |
| `allowedTargetPorts` | Integer array | Yes | `[18080]` | 1–65535; production uses the dedicated fixture port | Limits kernel-authorized TCP connections. |
| `playwrightExecutable` | Absolute file path | Yes | `/app/node_modules/.bin/playwright` | Executable regular file | Selects the pinned CLI. |
| `sandboxExecutable` | Absolute file path | Yes | `/app/plugin-sandbox` | Executable regular file | Applies seccomp, Landlock, resource limits, and descendant supervision. |
| `runtimeNodeModules` | Absolute directory | Yes | `/app/node_modules` | Real directory | Supplies the pinned runtime packages. |
| `browsersPath` | Absolute directory | Yes | `/ms-playwright` | Real directory | Supplies approved browser builds. |
| `readOnlyRoots` | Absolute path array | Yes | Pinned runtime, browser, and minimal operating-system paths | 1–32 real paths outside the attempt workspace | Defines the read-only Landlock view. |
| `maximumWorkers` | Integer | Yes | `4` | 1–64 | Caps project concurrency. |
| `maximumExecutionMs` | Integer | Yes | `900000` | 1,000–3,600,000 | Caps total execution time. |
| `maximumOutputBytes` | Integer bytes | Yes | `16777216` | 1 KiB–64 MiB | Caps stdout and stderr together. |
| `maximumResultBytes` | Integer bytes | Yes | `67108864` | 1 KiB–128 MiB | Caps report, logs, attachment encoding, and the complete capability result. |
| `maximumArtifactBytes` | Integer bytes | Yes | `268435456` | 1 KiB–512 MiB | Caps decoded attachment bytes. |
| `maximumArtifactFiles` | Integer | Yes | `256` | 1–1024 | Caps attachment count. |
| `maximumProcesses` | Integer | Yes | `128` | 1–4096 | Caps the complete Playwright process tree. |
| `maximumMemoryBytes` | Integer bytes | Yes | `4294967296` | 16 MiB–64 GiB | Caps aggregate resident memory. |
| `maximumCpuMillis` | Integer milliseconds | Yes | `900000` | 1–3,600,000 | Caps aggregate CPU time. |
| `terminationGraceMs` | Integer milliseconds | Yes | `5000` | Positive integer | Sets the SIGTERM grace period before SIGKILL. |
| `cgroupRoot` | Absolute directory | Yes in production | `/var/run/kubeclaw-browser-cgroup` | Dedicated empty delegated cgroup v2 subtree | Creates one kernel-enforced cgroup for each attempt. |
| `allowSampledResourceLimits` | Boolean | Test only | Absent | Must stay absent in production | Permits contained tests on a read-only cgroup host. |
| `runAsUid` | Integer UID | Yes in production | `1001` | Must differ from the trusted worker UID | Prevents project code from reading trusted worker process data. |
| `runAsGid` | Integer GID | Yes in production | `1000` | Dedicated runtime group | Gives the test access to its attempt workspace. |

The invocation also carries the plan CPU, memory, process, artifact, log, and time limits. The capability uses the smaller project, plan, and operator value. Production E2E fixtures expose port `18080`. Landlock permits the test process to connect only to that TCP port. Kubernetes permits Buster to reach that port only in controller-managed test namespaces.

## Result contract

Every E2E provider returns `kubeclaw.e2e-result.v1`. The result contains the provider, target origin, effective workers, browser projects, exact cases, attempts, errors, outcome counts, report format, and resource-enforcement mode. Counts must match the case list. Case IDs must be unique. Buster rejects a malformed result before Nova can use it.

The common contract lets Cypress, Selenium, Appium, or another provider join the suite without a Buster core change. The Cypress conformance example proves this contract boundary. It does not simulate browser execution.

## Complete node example

```json
{
  "uses": "kubeclaw.playwright@1",
  "mode": "blocking",
  "retries": 0,
  "concurrencyGroup": "browser-playwright",
  "config": {
    "projectDirectory": "apps/web",
    "configFile": "playwright.config.ts",
    "endpointName": "web",
    "workers": 2,
    "timeoutMs": 120000
  }
}
```
