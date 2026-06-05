# Batch B03 — Buster primary deterministic suites

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/buster/pipeline/suites/api.js
skills/buster/pipeline/suites/build.js
skills/buster/pipeline/suites/e2e.js
skills/buster/pipeline/suites/k8s.js
skills/buster/pipeline/suites/manifest.js
skills/buster/pipeline/suites/repo-paths.js
skills/buster/pipeline/suites/unit.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/pipeline/suites/api.js
kubeclaw-main/skills/buster/pipeline/suites/build.js
kubeclaw-main/skills/buster/pipeline/suites/e2e.js
kubeclaw-main/skills/buster/pipeline/suites/k8s.js
kubeclaw-main/skills/buster/pipeline/suites/manifest.js
kubeclaw-main/skills/buster/pipeline/suites/repo-paths.js
kubeclaw-main/skills/buster/pipeline/suites/unit.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-buster-repo-scoped-paths.mjs
kubeclaw-main/tests/verification/behavior/areas/shell-boundary.mjs
kubeclaw-main/tests/verification/behavior/areas/repo-docs.mjs
```

## Per-file map

### `skills/buster/pipeline/suites/api.js`

Role: API spec runner for HTTP and optional WebSocket requests against the app under test.

Imports/dependencies: Node `fs`; verdict schema helpers; repo-scoped path helper; global `fetch`; dynamic `import('ws')` fallback to `globalThis.WebSocket`.

Exports/public surface: default async `apiSuite(context)`.

Defines: Defaults for static/server ports, HTTP/WS timeouts, max findings, and project dir.

Important variables/state: Module-local `_logSink`; per-test auth vars from setup endpoint.

Calls out to: HTTP endpoint, WebSocket endpoint, spec JSON file read, verdict factory.

Called by / expected callers: Buster suite runner registry.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port,project_dir}`; `context.config.api.{spec_file,thresholds}`; spec fields `base_url`, `defaults`, `setup`, `tests`, per-test `method/path/headers/body/protocol/expect/ws_messages`.

Paths built/read/written: Repo-scoped `api.spec_file` resolved within `serve.project_dir`.

Authority behavior: Informational by default; only fails when thresholds configured and failed count exceeds `max_failures`. Never critical.

Error/retry/terminal behavior: Missing spec or no tests returns SKIP. Spec parse error returns ERROR. Auth setup failures return empty vars. HTTP/WS timeouts become failed test findings. WebSocket implementation missing becomes failed test result.

Verification coverage: Repo-scoped path contract asserts `api.js` uses `resolveRepoScopedPath`.

Findings: None.

### `skills/buster/pipeline/suites/build.js`

Role: Compile and serve static or server workloads for downstream deterministic suites and Buster agent sessions.

Imports/dependencies: Node `child_process.execFile`, `util.promisify`, `fs`, `path`, `buffer`; verdict schema; repo path helper; sandbox cleanup resource tracking.

Exports/public surface: default async `buildSuite(context)`.

Defines: Defaults for type/image/build/start commands, port, project dir, timeout; helpers for image normalization, build/server execution, manifest env extraction, error parsing.

Important variables/state: Module-local `_logSink`; generated server container name; optional generated Dockerfile image tag.

Calls out to: `sandbox-build`, `nginx`, `du`, `podman build/run/ps/logs`, dynamic `js-yaml`, filesystem reads for manifests/secrets, sandbox cleanup resource tracking.

Called by / expected callers: Buster suite runner registry; downstream health/API/E2E suites depend on app being served.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,image,build_cmd,start_cmd,port,project_dir,timeout,dockerfile,build_context,build_timeout,deployment_yaml,secret_yaml}`; injects container env `SANDBOX=true`, `NODE_ENV=test`, plus env extracted from deployment manifest and secret YAML.

Paths built/read/written: Repo-scoped project dir, Dockerfile/build context/deployment/secret YAML; `/sandbox/www`; `/run/nginx.pid`; `/sandbox` volume mount.

Authority behavior: Critical suite. Static mode owns build output existence and nginx start/reload. Server mode owns tracked container/image resources and startup crash detection.

Error/retry/terminal behavior: sandbox-build, nginx, podman build/run failures return FAIL with parsed critical findings. Missing or empty `/sandbox/www` fails. Crash detection is best-effort; if `podman ps` probe itself fails it logs non-blocking and returns success.

Verification coverage: Shell-boundary test asserts no shell-string exec and no shell pipelines in high-risk build/k8s suites; repo-scoped path contract checks scoped path helper usage.

Findings: None.

### `skills/buster/pipeline/suites/e2e.js`

Role: Discover and run persisted Playwright E2E tests from a configured repo-scoped directory.

Imports/dependencies: Node `child_process.execFileSync`, `fs`, `path`; verdict schema; repo path helper.

Exports/public surface: default async `e2eSuite(context)`.

Defines: Test filename patterns, default timeout, max findings.

Important variables/state: Module-local `_logSink`; no persistent state.

Calls out to: Filesystem test discovery and `npx playwright test`.

Called by / expected callers: Buster suite runner registry after build/health dependencies.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port,project_dir}`; `context.config.e2e.{tests_dir,thresholds,timeout_ms}`; subprocess env adds `BASE_URL`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, `CI=true`.

Paths built/read/written: Repo-scoped `e2e.tests_dir`; cwd is tests dir; no writes in scoped file.

Authority behavior: Informational by default; only fails when thresholds configured and failed count exceeds `max_failures`. Never critical.

Error/retry/terminal behavior: Missing tests dir config or no tests returns SKIP. Playwright nonzero with parsed tests is treated as test failures. Nonzero with zero parsed tests returns ERROR. Timeout is enforced by `execFileSync` timeout plus 10s process overhead buffer.

Verification coverage: Repo-scoped path contract checks `e2e.js`; shell-boundary tests exercise adjacent command hardening.

Findings: None.

### `skills/buster/pipeline/suites/k8s.js`

Role: Build production Dockerfile, push it to the cluster-local registry, deploy manifests to an ephemeral Kubernetes namespace, wait for pods, and health-check the service.

Imports/dependencies: Node `child_process.execFile`, `util.promisify`, `fs`, `os`, `path`; verdict schema; Buster git root helper; sandbox cleanup tracking; manifest YAML helpers; repo path helper; external `podman`, `kubectl`, `curl`.

Exports/public surface: `renderManifestForK8sSuite(content, imageName, registryTag, targetNs, log)`, default async `k8sSuite(context)`.

Defines: Registry `registry-local.kubeclaw.svc.cluster.local:5001`, source namespace `kubeclaw`, defaults for port, health path, namespace prefix, and timeouts; cluster-scoped Kubernetes kind set.

Important variables/state: Generated `runId`, `testNs`, `localTag`, `registryTag`; per-run `checks` array and `criticalFailed` flag.

Calls out to: `podman build/tag/push`, `kubectl create namespace/get secret/apply/wait/get pods`, `curl`, temporary manifest files, cleanup resource tracking.

Called by / expected callers: Buster suite runner registry.

Environment variables / CLI inputs / config fields: `payload.test_config.k8s` or `payload.config.k8s` fields `dockerfile`, `build_context`, `image_name`, `service_name`, `port`, `health_path`, `manifests`, `ready_timeout_seconds`, `secrets_to_copy`, `namespace_prefix`, `build_timeout_seconds`, `push_timeout_seconds`, `deploy_timeout_seconds`; payload `project`; optional `context.repoRoot`.

Paths built/read/written: Repo-scoped Dockerfile/build context/manifests; temp dir from `fs.mkdtempSync(os.tmpdir(), 'k8s-suite-')`; cluster namespace `${namespace_prefix}-${project}-${runId}`; registry/local image tags; Kubernetes service URL.

Authority behavior: Critical suite. It creates cluster resources and relies on sandbox cleanup tracked state for namespace/image cleanup.

Error/retry/terminal behavior: Missing required config returns SKIP. Each critical check short-circuits later checks on failure and returns FAIL with critical findings. Secret-copy failures are non-critical WARN logs. Manifest temp dir removal failure is non-blocking.

Verification coverage: Shell-boundary test asserts argv-safe process boundaries and structural manifest namespace/image rewriting. Repo-scoped path contract checks scoped path helper usage.

Findings: `B03-ISSUE-001`.

### `skills/buster/pipeline/suites/manifest.js`

Role: Static Kubernetes deployment manifest validation suite.

Imports/dependencies: Node `fs`, `path`, `module.createRequire`; verdict schema; repo-scoped path helper; CommonJS `js-yaml` dependency.

Exports/public surface: `loadJsYamlModule`, `loadYamlDocuments`, `dumpYamlDocuments`, default async `manifestSuite(context)`.

Defines: YAML fallback parser for common deployment patterns; checks for parseable Deployment, required env vars, secret refs, image pull secrets, probes, resource limits.

Important variables/state: Module-local `_logSink`; no persistent state.

Calls out to: Filesystem reads of deployment/secret YAML, `js-yaml` load/dump, verdict factory.

Called by / expected callers: Buster suite runner registry; `k8s.js` imports structured YAML load/dump helpers.

Environment variables / CLI inputs / config fields: `context.config.manifest.{deployment_yaml,secret_yaml,required_env,private_registries,thresholds}` and `context.config.serve.health_path`.

Paths built/read/written: Repo-scoped deployment and optional secret YAML paths; no writes.

Authority behavior: Static pre-build evidence. Critical only when invalid deployment structure or other critical findings occur; serious/moderate/minor findings alone do not mark `critical:true`.

Error/retry/terminal behavior: Missing deployment path/config returns SKIP. Read/parse errors return FAIL. `js-yaml` structured load is required for exported load/dump helpers, while suite path falls back to regex for common validation.

Verification coverage: Shell-boundary structural rewrite test imports manifest load/dump helpers; repo-scoped path contract checks helper usage.

Findings: None.

### `skills/buster/pipeline/suites/repo-paths.js`

Role: Canonical Buster suite repo-root and scoped path resolver.

Imports/dependencies: Node `path`; common security helpers.

Exports/public surface: `isPathInside`, `REPO_DIR`, `resolveRepoDir`, `resolveRepoScopedPath`, `stripRepoDirPrefix`.

Defines: `REPO_DIR = '/home/node/.openclaw/workspace/git-repo'`.

Important variables/state: None.

Calls out to: `resolveScopedPath` with allowed repository scope.

Called by / expected callers: Buster suites and repo-scoped path verification.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: Resolves caller-provided paths inside repo/base/scope boundaries; no direct reads/writes.

Authority behavior: Canonical path boundary for task-controlled suite paths.

Error/retry/terminal behavior: `resolveScopedPath` throws on null byte or scope escape.

Verification coverage: `check-buster-repo-scoped-paths.mjs` and repo-docs behavior assert canonical repo root and delegation to common security helper.

Findings: None.

### `skills/buster/pipeline/suites/unit.js`

Role: Unit-test runner for project package tests or explicit operator-supplied test command.

Imports/dependencies: Node `child_process.execFileSync`, `fs`, `path`; verdict schema; repo path helper; security `tokenizeCommandString`, `validateAllowedPath`.

Exports/public surface: default async `unitSuite(context)`.

Defines: Defaults for project dir, test command, timeout, max findings; npm no-test stub; parsers for Jest, Vitest, Mocha, TAP, pytest.

Important variables/state: Module-local `_logSink`; no persistent state.

Calls out to: Filesystem package.json read and argv-safe test subprocess.

Called by / expected callers: Buster suite runner registry.

Environment variables / CLI inputs / config fields: `context.config.serve.project_dir`; `context.config.unit.{test_cmd,timeout_ms,thresholds}`; subprocess env adds `CI=true`, `NODE_ENV=test`.

Paths built/read/written: Repo-scoped/validated project dir; `package.json` read in project dir; no writes.

Authority behavior: Informational by default; only fails when thresholds configured and failed count exceeds `max_failures`. Never critical.

Error/retry/terminal behavior: Missing/no-op package test script returns SKIP unless custom `test_cmd` set. Timeout returns ERROR. Nonzero test process is parsed as test failures. Unrecognized output falls back to exit-code-derived one-test result.

Verification coverage: Shell-boundary behavior asserts shell metacharacter custom command is rejected before execution; repo-scoped path contract checks scoped helper usage.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `api.js`, `e2e.js`, `manifest.js`, `unit.js`, `build.js`, `k8s.js` | `repo-paths.js` | `resolveRepoScopedPath` | Repo boundary for task-controlled suite paths. |
| `build.js`, `k8s.js` | `sandbox-cleanup.js` | `trackSandboxResources` | Tracks containers/images/namespaces for cleanup. |
| `k8s.js` | `manifest.js` | `loadYamlDocuments`, `dumpYamlDocuments` | Structural manifest rewrite before kubectl apply. |
| `suite-runner.js` | B03 suites | default suite exports | Executes suites in registry order. |
| all suites | `verdict-schema.js` | `createSuiteVerdict`, `createFinding`, enums | Deterministic result shape. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `api.js apiSuite` | Missing spec, missing file, no tests, parse error, thresholds | API config/spec/tests | SKIP, ERROR, PASS, or FAIL | Determines whether API failures are informational or enforced. |
| `api.js runHttpTest` | Expected status/body/time checks | per-test `expect` | Passed boolean and failures | HTTP assertion semantics. |
| `api.js runWsTest` | WS implementation/connect/messages expectations | `protocol:'ws'`, WS expect fields | Passed boolean and failures | Optional WebSocket coverage. |
| `build.js buildSuite` | `serve.type === 'server'` | serve config | server podman path or static sandbox-build/nginx path | Build mode authority. |
| `build.js buildServer` | Dockerfile configured | `serve.dockerfile` | pre-build image and disable volume mount, or use configured image with volume | Container dependency strategy. |
| `e2e.js e2eSuite` | No tests dir/no discovered tests/structural Playwright error/thresholds | E2E config and parsed output | SKIP, ERROR, PASS, or FAIL | E2E informational/enforced split. |
| `k8s.js k8sSuite` | Required k8s config missing | dockerfile/image/service/manifests | SKIP | Avoids deploying incomplete config. |
| `k8s.js k8sSuite` | `criticalFailed` after each check | build/push/ns/apply/wait/health checks | Short-circuit later checks and aggregate FAIL | Prevents cascading cluster operations after a blocker. |
| `manifest.js manifestSuite` | Critical findings or threshold exceeded | findings/severity/thresholds | PASS/FAIL and critical flag | Static manifest gate behavior. |
| `unit.js unitSuite` | Custom command vs package script | unit config/package.json | skip package test-script check or enforce it | Supports pytest/custom runners safely. |
| `unit.js unitSuite` | Timeout, parsed failures, thresholds | subprocess output/exit | ERROR, PASS, or FAIL | Unit suite result semantics. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `api.js interpolateObj` | cloned object/array | template vars | Recursively replace string `{{key}}` values only | Spec data remains functional with auth token interpolation. |
| `build.js extractEnvFromManifest` | env injection list | deployment YAML and optional secret YAML | Plain values first; secretKeyRef resolved from secret data or placeholder | Container env injection list. |
| `k8s.js renderManifestForK8sSuite` | YAML document objects | image name/tag, target namespace | Set namespace on namespaced docs, remove namespace from cluster-scoped docs, rewrite matching container images | Safe structural manifest projection. |
| `k8s.js k8sSuite` | `checks` array and `criticalFailed` | sequential check outcomes | Append check records; first critical failure stops later critical checks | Verdict metadata mirrors executed checks. |
| `manifest.js normalise` | parsed manifest shape | js-yaml or fallback parse result | Structured doc wins; fallback shape returned as-is | Consistent validation input. |
| `unit.js parseOutput` | parsed test result | output and exit code | First recognized framework parser wins; fallback derives one-test result from exit code | Deterministic result even for unknown runners. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `api.js apiSuite` | Sequential spec tests | None | HTTP/WS default 5000 ms unless spec defaults override | All tests executed. |
| `api.js runWsTest` | WS event handlers until close/timeout | 2000 ms expected-failure grace | WS timeout default 5000 ms | Timeout, close, or expected-failure grace. |
| `e2e.js discoverTests` | Recursive directory walk | None | N/A | Directory exhausted; skips hidden dirs/node_modules. |
| `build.js buildServer` | No loop; 3s crash detection wait | Fixed 3000 ms | Podman command timeout from config/default | Crash detected or probe passes. |
| `k8s.js k8sSuite` | Sequential critical checks | None | build/push/deploy/ready command timeouts from config/defaults | First critical failure short-circuits. |
| `k8s.js waitForPods` | kubectl server-side wait | kubectl handles polling | ready timeout plus 10s process buffer | Ready or kubectl timeout. |
| `unit.js unitSuite` | Single subprocess execution | None | unit timeout default 60000 ms | Process exit or timeout. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `context.config.serve.type/port/project_dir` | Suite config | `api.js`, `e2e.js`, `build.js`, `unit.js` | static, 9999/3000, repo root | App URL and project path. |
| `context.config.api.spec_file/thresholds` | Suite config | `api.js` | no spec => SKIP; no thresholds => informational | API JSON spec path and enforcement. |
| API spec `setup/defaults/tests` | JSON artifact | `api.js` | defaults in code | Auth, timeout, HTTP/WS assertions. |
| `context.config.serve.*` build fields | Suite config | `build.js` | static, node image, npm build/start defaults | Static/server build and podman config. |
| `context.config.e2e.tests_dir/thresholds/timeout_ms` | Suite config | `e2e.js` | no tests dir => SKIP; timeout 60000 ms | Playwright deterministic tests. |
| `payload.test_config.k8s` / `payload.config.k8s` | Task config | `k8s.js` | port 3000, health `/health`, namespace prefix `buster`, timeouts 300/120/30s | K8s production-equivalent deployment. |
| `context.config.manifest.*` | Suite config | `manifest.js` | missing deployment => SKIP | Manifest static validation. |
| `context.config.unit.test_cmd/timeout_ms/thresholds` | Suite config | `unit.js` | `npm test`, 60000 ms, informational | Unit runner command and enforcement. |
| Subprocess env `BASE_URL`, `PLAYWRIGHT_BROWSERS_PATH`, `CI`, `NODE_ENV`, `SANDBOX` | Runtime env | `e2e.js`, `unit.js`, `build.js` | local suite defaults | Injected into suite subprocess/container. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| API spec file | `api.js resolveSpecPath` | `api.js` | external task artifacts | Scoped inside `serve.project_dir`. |
| Static build output `/sandbox/www` | `sandbox-build` via `build.js` | `build.js`, nginx | sandbox-build outside scoped file | Build suite requires non-empty output. |
| Server container/image tags | `build.js`, `k8s.js` | cleanup service/operators | podman | Tracked in cleanup state where generated. |
| E2E tests dir | `e2e.js resolveTestsDir` | `e2e.js` | subagent/Forge outside scoped file | Scoped inside project dir. |
| K8s temporary manifest dir | `k8s.js applyManifests` | kubectl | `k8s.js` | Removed in finally best-effort. |
| K8s namespace `${namespace_prefix}-${project}-${runId}` | `k8s.js` | kubectl/cleanup | kubectl create | Cleanup requires safe prefix; see B03 issue. |
| Deployment/secret YAML | `manifest.js`, `build.js`, `k8s.js` | suites | project/task artifacts | Repo-scoped paths. |
| Unit project dir and `package.json` | `unit.js` | `unit.js` | project source | Repo-scoped and validated. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Buster primary suite verdicts | B03 suite default exports | suite runner, Discord/completion/prompt consumers | None. |
| Repo-scoped suite path boundary | `repo-paths.js` via common security helper | all B03 suites | None. |
| Static/server app runtime for downstream suites | `build.js` | health/API/E2E/Buster agent | None. |
| K8s test namespace/resource deployment | `k8s.js` | cleanup service/operators/Buster agent | Namespace prefix validation gap tracked as B03 issue. |
| Manifest YAML structural rewrite | `k8s.js renderManifestForK8sSuite` | kubectl apply, tests | None. |
| Unit/E2E/API enforcement mode | suite thresholds in task config | suite verdict consumers | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| API spec JSON | external task artifact | `base_url?`, `defaults?`, `setup?`, `tests[]`; tests include `name`, `protocol`, `method`, `path`, `headers`, `body`, `expect`, `ws_messages` | JSON.parse plus local field defaults | `api.js`. |
| API suite metadata | `api.js` | `spec_file`, `base_url`, `mode`, `has_auth`, `ws_tests`, `http_tests`, optional `thresholds` | verdict schema | suite consumers. |
| Build suite metadata | `build.js` | `tool`, `serve_type`, optional `output_size`/`port`, or `raw_output` on fail | verdict schema | suite consumers. |
| E2E parsed result | `parsePlaywrightOutput` | `total`, `passed`, `failed`, `skipped`, `errors[]` | regex parser | `e2e.js` verdict builder. |
| K8s check record | `k8s.js makeCheck` | `name`, `passed`, `detail` | local helper | K8s verdict metadata/findings. |
| K8s suite metadata | `k8s.js` | `test_namespace`, `registry_image`, `service_url`, `health_http_code`, `checks[]` | verdict schema | Buster agent/operators. |
| Manifest normalized data | `manifest.js normalise` | `kind`, `images[]`, `env[]`, `envFrom[]`, `imagePullSecrets`, `hasLimits`, `hasReadinessProbe`, `hasLivenessProbe` | js-yaml parse or regex fallback | manifest checks. |
| Unit parsed result | `unit.js parseOutput` | `framework`, `total`, `passed`, `failed`, `skipped` | framework regex parsers | unit verdict builder. |

## Prompt and agent behavior updates

None found in scoped files. B03 suites do not build prompts; they produce suite verdicts and metadata that upstream prompt/truncation code may pass to a Buster child agent.

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `api.js runAuthSetup` | Auth endpoint non-ok/error/timeout | No | timeout from spec/default 5000 ms | Logs and returns empty vars; tests continue | No token logged. |
| `api.js runHttpTest/runWsTest` | HTTP/WS assertion failure or timeout | No | per-test timeout 5000 ms default | Failed test finding; suite may still PASS informationally | Response bodies not logged except assertion details. |
| `api.js apiSuite` | Missing spec/no tests/parse error | No | None | SKIP or ERROR verdict | Parse error message only. |
| `build.js buildStatic/buildServer` | build/run/nginx/container crash failure | No local retry | command timeouts from config/default; crash wait 3s | FAIL critical suite | Parsed output truncated in metadata. |
| `build.js extractEnvFromManifest` | manifest/secret parse/read failure | No | None | Continue with empty/partial env; unresolved secret placeholder | Secret values are not logged, but injected as env args. |
| `e2e.js e2eSuite` | no tests/Playwright structural error/test failures | No | subprocess timeout `timeout_ms + 10000` | SKIP, ERROR, or findings; threshold controls FAIL | Output/error truncated. |
| `k8s.js k8sSuite` | build/push/ns/apply/wait/health failure | No local retry | command timeouts from config/defaults | FAIL critical suite and short-circuit | Output trimmed with `trimOut`. |
| `k8s.js copySecrets` | secret copy failure | No | one kubectl get/apply per secret | Non-critical warning; suite continues | Secret server fields stripped. |
| `k8s.js applyManifests` | temp cleanup failure | No | finally cleanup once | Non-blocking log | None. |
| `manifest.js manifestSuite` | missing/invalid YAML/validation findings | No | None | SKIP or FAIL/PASS according severity/thresholds | Secret YAML keys only, not values. |
| `unit.js unitSuite` | missing tests/custom command invalid/timeout/test failures | No | subprocess timeout default 60000 ms | SKIP, throw from tokenizer, ERROR, or findings; threshold controls FAIL | Output findings truncated. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `api.js runAuthSetup` | Auth failure | Partial | suite log sink/console | `[SUITE] [API]` log | `log` | Verdict only records downstream test failures. |
| `api.js runHttpTest/runWsTest` | Test failure/timeout | Yes | suite verdict artifacts and suite-runner telemetry | suite findings, `buster.suite_completed` downstream | `apiSuite`, suite runner | Informational unless thresholds set. |
| `api.js apiSuite` | Missing/parse/no tests | Yes | suite verdict artifacts and suite-runner telemetry | SKIP/ERROR verdict | `apiSuite`, suite runner | None. |
| `build.js buildStatic/buildServer` | Build/run/nginx/crash failure | Yes | suite verdict artifacts/log sink/suite-runner telemetry | FAIL verdict, findings | `buildSuite`, suite runner | Critical suite. |
| `build.js extractEnvFromManifest` | Env extraction fallback/partial failure | Partial | suite log sink only for unresolved secret placeholder | `[SUITE] [BUILD]` warning | `log` | Non-terminal. |
| `e2e.js e2eSuite` | Structural/test failures | Yes | suite verdict artifacts/log sink/suite-runner telemetry | SKIP/ERROR/findings | `e2eSuite`, suite runner | Informational unless thresholds set. |
| `k8s.js k8sSuite` | Critical step failure | Yes | suite log sink, suite verdict, suite-runner telemetry | per-step log sink records and FAIL verdict | `stepTel`, `k8sSuite` | Critical suite. |
| `k8s.js copySecrets` | Secret copy failure | Partial | suite log sink/console | warning line | `copySecrets` | Non-critical; no separate finding. |
| `k8s.js applyManifests` | temp cleanup failure | Partial | suite log sink/console | non-blocking temp cleanup log | finally catch | No structured finding. |
| `manifest.js manifestSuite` | YAML/read/validation failure | Yes | suite verdict artifacts/log sink/suite-runner telemetry | FAIL verdict/findings | `manifestSuite`, suite runner | None. |
| `unit.js unitSuite` | Missing tests/timeout/test failures | Yes | suite verdict artifacts/log sink/suite-runner telemetry | SKIP/ERROR/findings | `unitSuite`, suite runner | Invalid custom command throws to suite runner. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| `sandbox-build` | system binary | runtime installed | `build.js` | Static project build into `/sandbox/www` | Failure becomes critical build FAIL. |
| `nginx` | system binary | runtime installed | `build.js` | Serve static build on `:9999` | Start/reload failure fails build. |
| `podman` | system binary | runtime installed | `build.js`, `k8s.js` | Server container and production image build/push | Command timeouts and cleanup tracking. |
| `kubectl` | system binary | runtime installed | `k8s.js` | Namespace/secret/apply/wait/status | Failures become critical K8s findings except secret copy. |
| `curl` | system binary | runtime installed | `k8s.js` | Cluster service health check | Non-2xx/3xx fails k8s suite. |
| `npx playwright` | npm CLI/package | runtime installed | `e2e.js` | E2E tests | Structural run failure returns ERROR. |
| `js-yaml` | npm package/CommonJS | runtime dependency | `manifest.js`, `build.js`, `k8s.js` | YAML parse/dump | Manifest exported load/dump require it; suite fallback handles common parse path. |
| `ws` | npm package or global WebSocket | runtime optional | `api.js` | WebSocket API tests | Missing implementation fails WS test. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| API tests | Sequential loop | HTTP/WS timeout default 5000 ms | Failures capped to 50 findings | suite verdict/logs | None. |
| E2E discovery/run | Recursive file walk then one Playwright process | timeout default 60000 ms plus 10s overhead | Structural error or failure findings capped to 30 | suite verdict/logs | None. |
| Static build | One sandbox-build then nginx start/reload | timeout default 300s | FAIL verdict on command failure | suite verdict/logs | None. |
| Server build | One optional Dockerfile build then one container run | memory 2g, CPUs 2, pids 256, tmpfs 512m | FAIL verdict on run/build failure; cleanup tracks container/image | suite verdict/cleanup state | None. |
| K8s suite | Sequential build/push/deploy/wait/health | timeouts 300s/120s/30s/120s | First critical failure short-circuits | per-step log sink and verdict | Namespace prefix cleanup issue tracked. |
| Unit tests | One subprocess | timeout default 60000 ms | timeout ERROR; failure findings capped to 30 | suite verdict/logs | None. |

## ACP protocol updates

None found in scoped files. B03 suites do not talk to ACP directly; their verdicts are consumed by Buster task lifecycle before or after ACP child-session handoff.

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Buster suite task-controlled paths use repo-scoped resolver | `check-buster-repo-scoped-paths.mjs` | Good | None. |
| Build/k8s high-risk commands avoid shell-string exec and shell pipelines | `shell-boundary.mjs` | Good | `build.js` server start command still intentionally runs inside container via `sh -c`. |
| K8s manifest rewrite is structural, preserves labels, removes namespace from cluster-scoped docs | `shell-boundary.mjs` | Good | Namespace prefix validation not covered; tracked as B03 issue. |
| Unit custom test command rejects shell metacharacters | `shell-boundary.mjs` | Good | None. |
| Buster suite root uses canonical repo path and not source-relative discovery | `repo-docs.mjs`, `check-buster-repo-scoped-paths.mjs` | Good | None. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `B03-ISSUE-001` — `k8s.js` accepts arbitrary `namespace_prefix` even though cleanup only safely deletes `buster-`/`test-` namespaces.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
