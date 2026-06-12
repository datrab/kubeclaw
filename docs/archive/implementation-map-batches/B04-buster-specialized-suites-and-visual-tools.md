# Batch B04 — Buster specialized suites and visual tools

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/buster/pipeline/suites/a11y.js
skills/buster/pipeline/suites/bundle.js
skills/buster/pipeline/suites/health.js
skills/buster/pipeline/suites/perf.js
skills/buster/pipeline/suites/security.js
skills/buster/pipeline/suites/visual-reg.js
skills/buster/pipeline/suites/visual-reg-discord.js
skills/buster/pipeline/tools/screenshot.js
skills/buster/pipeline/tools/visual-audit.js
```

Scope expansion verified live: 9 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/buster/pipeline/suites/a11y.js
kubeclaw-main/skills/buster/pipeline/suites/bundle.js
kubeclaw-main/skills/buster/pipeline/suites/health.js
kubeclaw-main/skills/buster/pipeline/suites/perf.js
kubeclaw-main/skills/buster/pipeline/suites/security.js
kubeclaw-main/skills/buster/pipeline/suites/visual-reg.js
kubeclaw-main/skills/buster/pipeline/suites/visual-reg-discord.js
kubeclaw-main/skills/buster/pipeline/tools/screenshot.js
kubeclaw-main/skills/buster/pipeline/tools/visual-audit.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/contracts/check-buster-repo-scoped-paths.mjs
kubeclaw-main/tests/verification/contracts/check-strict-cli-args-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/shell-boundary.mjs
kubeclaw-main/tests/verification/behavior/areas/operator-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/buster-runtime-normalization.mjs
```

## Per-file map

### `skills/buster/pipeline/suites/a11y.js`

Role: Accessibility suite that scans the running app with Playwright plus `@axe-core/playwright` and converts axe violations to Buster suite findings.

Imports/dependencies: Verdict schema helpers; dynamic `playwright`; dynamic `@axe-core/playwright`.

Exports/public surface: default async `a11ySuite(context)`.

Defines: Defaults for app ports, path, WCAG tags, exclusions, finding cap, and navigation timeout; axe impact-to-severity mapper; node selector extractor.

Important variables/state: Module-local `_logSink`; per-run browser/context/page; findings array capped by `max_findings`.

Calls out to: Headless Chromium, local HTTP app URL, axe-core scan, suite verdict factory.

Called by / expected callers: Buster suite runner registry after build/health when `a11y` suite is selected.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port}`; `context.config.a11y.{path,tags,exclude,max_findings,thresholds,timeout}`.

Paths built/read/written: URL `http://localhost:<port><path>` only; no filesystem paths.

Authority behavior: Informational by default; enforced only when thresholds exist. It always returns `critical:false`, so it never blocks Buster subagent spawn by itself.

Error/retry/terminal behavior: Missing Playwright or axe package, navigation failures, scan failures, and browser errors return `STATUS.ERROR`; browser close failures are non-blocking and logged.

Verification coverage: `buster-runtime-normalization.mjs` includes this file in lower-risk cleanup catch checks.

Findings: None.

### `skills/buster/pipeline/suites/bundle.js`

Role: Static build-output size and file-count suite for `/sandbox/www` or configured hardened output directory.

Imports/dependencies: Node `child_process.execFileSync`, `fs`, `path`; verdict schema; shared security `validateAllowedPath`; system `du`.

Exports/public surface: default async `bundleSuite(context)`.

Defines: Default output dir `/sandbox/www`; recursive file scanner; top-five largest file summarizer.

Important variables/state: Module-local `_logSink`; scan result array; no persistent state.

Calls out to: Filesystem `exists/readdir/stat`, `du -sk`, suite verdict factory.

Called by / expected callers: Buster suite runner registry after build when `bundle` suite is selected.

Environment variables / CLI inputs / config fields: `context.config.bundle.{www_dir,thresholds}`.

Paths built/read/written: Validates `bundle.www_dir`; reads/scans files under that directory; no writes.

Authority behavior: Informational by default; enforced only when thresholds exist; always `critical:false`.

Error/retry/terminal behavior: Missing output dir returns `SKIP`. `du` failure logs and continues with `totalSizeKb=0`. Per-directory scan/stat failures log non-blocking and continue. Path validation throws to caller before verdict construction.

Verification coverage: `shell-boundary.mjs` asserts disallowed paths are rejected and semicolon-bearing paths are treated literally; `buster-runtime-normalization.mjs` checks explicit cleanup catches.

Findings: None.

### `skills/buster/pipeline/suites/health.js`

Role: HTTP health suite with retry/backoff and optional smoke navigation over configured or visual-reg-derived routes.

Imports/dependencies: Node `fs`/`path`; verdict schema; Buster repo-scoped path helper; `sleep`; dynamic `playwright` for smoke navigation.

Exports/public surface: default async `healthSuite(context)`.

Defines: Defaults for ports, health path, retry count, exponential backoff base, per-request timeout; HTTP attempt helper; JS pageerror-to-finding mapper; visual-reg baseline `paths.json` autodetection.

Important variables/state: Module-local `_logSink`; last HTTP attempt result; smoke findings.

Calls out to: Local HTTP app URL through `fetch`; Playwright browser for smoke navigation; `.swarm/modules/<module>/baselines/paths.json` read when present.

Called by / expected callers: Buster suite runner registry as critical dependency for app-dependent suites.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port,health_path,health_retries,health_base_delay,health_timeout,smoke_paths,smoke_settle_ms}`; module identity from `context.moduleId`, `context.module`, or `context.payload` for autodetected routes.

Paths built/read/written: Repo-scoped `.swarm/modules/<moduleSegment>/baselines/paths.json`; HTTP URL `http://localhost:<port><health_path>`; smoke URLs `http://localhost:<port><path>`.

Authority behavior: HTTP reachability is critical and returns `critical:true` on pass/fail. Smoke navigation failures are non-critical (`critical:false`) but can return FAIL when serious/critical findings occur.

Error/retry/terminal behavior: HTTP attempts retry `retries` times with exponential backoff. Timeout uses `AbortController`. Failed HTTP after retries returns terminal FAIL. Missing/malformed autodetected `paths.json` disables autodetected smoke paths. Playwright missing during smoke returns a moderate finding; navigation/page JS serious errors can fail the suite.

Verification coverage: Repo-scoped path contract checks helper use; `repo-docs.mjs` and `buster-runtime-normalization.mjs` cover runtime surface and catch hygiene.

Findings: None.

### `skills/buster/pipeline/suites/perf.js`

Role: Lighthouse performance/accessibility/best-practices/SEO suite for the running app.

Imports/dependencies: Node `child_process.execFileSync`, `fs`, `path`; verdict schema; system `lighthouse` CLI.

Exports/public surface: `resolvePerfReportPaths(context, perfConf)` and default async `perfSuite(context)`.

Defines: Defaults for ports/path/timeout; scratch report path `/sandbox/results/lighthouse-report.json`; category display names; score-gap severity mapping.

Important variables/state: Module-local `_logSink`; scratch report and durable final report paths.

Calls out to: `lighthouse` binary with argv-safe `execFileSync`; filesystem mkdir/read/copy; JSON parse; suite verdict factory.

Called by / expected callers: Buster suite runner registry when `perf` suite is selected; repo-scoped path contract imports path resolver.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port}`; `context.config.perf.{path,thresholds,timeout,output_path}`; `context.testsLogDir`; `context.attempt`.

Paths built/read/written: Scratch report `/sandbox/results/lighthouse-report.json`; final report `${context.testsLogDir}/lighthouse-report-attempt-<attempt>.json` when tests log dir exists; rejects legacy `perf.output_path`.

Authority behavior: Informational by default; enforced only when thresholds exist; always `critical:false`.

Error/retry/terminal behavior: Legacy `output_path` returns `STATUS.ERROR` with path-boundary finding. Lighthouse command, missing report, read, and parse failures return `STATUS.ERROR`. No retry/backoff around Lighthouse.

Verification coverage: `check-buster-repo-scoped-paths.mjs` asserts legacy output path rejection and durable report path selection.

Findings: None.

### `skills/buster/pipeline/suites/security.js`

Role: HTTP response header, cookie, and CORS audit suite.

Imports/dependencies: Verdict schema; global `fetch`/`AbortController`.

Exports/public surface: default async `securitySuite(context)`.

Defines: Defaults for ports, request timeout, max findings, minimum HSTS max-age; static header check table; cookie and CORS helpers.

Important variables/state: Module-local `_logSink`; path results array; total/failed check counters.

Calls out to: Local HTTP app URL through `fetch`; suite verdict factory.

Called by / expected callers: Buster suite runner registry when `security` suite is selected.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port,health_path}`; `context.config.security.{paths,check_cors,thresholds,timeout_ms,min_hsts_max_age}`.

Paths built/read/written: URL strings `http://localhost:<port><path>` only; no filesystem paths.

Authority behavior: Informational by default; enforced only when thresholds exist; always `critical:false`.

Error/retry/terminal behavior: Per-path fetch timeout/error adds a critical connection finding and continues to the next path. Header/cookie/CORS issues accumulate with a cap of 50 findings. Enforced mode fails only when `failedChecks > thresholds.max_missing_headers ?? 0`.

Verification coverage: Indirect Buster suite runtime checks; no dedicated security-suite behavior test found in scoped-adjacent search.

Findings: None.

### `skills/buster/pipeline/suites/visual-reg.js`

Role: Visual regression suite that resolves module-owned baselines, screenshots the running app, compares PNGs with pixelmatch, sends optional Discord screenshots, emits Buster telemetry, and returns suite verdicts.

Imports/dependencies: Node `fs`/`path`; verdict schema; screenshot tool; Buster telemetry service; runtime Discord webhook resolver; repo-scoped path helper; visual-reg Discord helpers; dynamic `pngjs` and `pixelmatch` inside image compare.

Exports/public surface: `resolveVisualRegProjectDir`, `resolveVisualRegBaselineDir`, `runVisualReg(context)`.

Defines: Defaults for ports/path/pixelmatch threshold/repo dir/Discord diff threshold; legacy path-config rejection; module id sanitizer; artifact path resolver; multi-path runner; PNG resize/compare helpers.

Important variables/state: Module-local `_logSink`; module `WEBHOOK_URL` resolved at import time; per-run baseline/artifact dirs and page result arrays.

Calls out to: `.swarm/modules/<module>/baselines`; Playwright screenshot tool; filesystem mkdir/read/write/copy; pixelmatch/pngjs; Discord webhook helpers; Buster telemetry `emitEvent`.

Called by / expected callers: Buster suite runner registry imports `runVisualReg` as `visualRegSuite`; repo-scoped path contract imports exported path helpers.

Environment variables / CLI inputs / config fields: `context.config.serve.{type,port,project_dir}`; `context.config['visual-reg'].{thresholds,pixelmatch.threshold,discord,path,viewport,fullPage,baseline_dir,baseline_file}`; `context.moduleId`, `context.module`, `context.payload.module_id`, `context.payload.module`; `context.testsLogDir`, `context.screenshotsDir`, `context.resultsDir`, `context.attempt`, `context.telemetryContext`.

Paths built/read/written: Repo-scoped derived baseline dir `.swarm/modules/<moduleSegment>/baselines`; baseline `paths.json`; per-page `<name>-baseline.png`; artifact `visual-reg-<name>-actual.png`/`diff.png`; single-path `baseline.png`, `visual-reg-actual.png`, `visual-reg-diff.png`; optional copies to `context.screenshotsDir`.

Authority behavior: Module baseline directory is derived from module identity, not task-configurable. Informational by default; enforced only when thresholds exist; always `critical:false`. Visual-reg telemetry is emitted after successful compare paths.

Error/retry/terminal behavior: Legacy baseline path config returns `ERROR`. Unsafe route/artifact names create findings and page `ERROR`. Screenshot failures create findings. Missing per-page baseline skips that page. Comparison failures create findings. Auto-generation failure returns `ERROR`; single baseline HTML screenshot failure returns `SKIP`; live screenshot or comparison failure returns `ERROR`. Discord helper failures are non-critical. Screenshot copy failures to central screenshots dir are silently non-critical.

Verification coverage: `check-buster-repo-scoped-paths.mjs` asserts project dir scoping, derived baseline dir, and legacy baseline config rejection; `operator-surface.mjs` covers non-critical Discord helper HTTP failures; `repo-docs.mjs` covers docs/runtime surface.

Findings: `B04-ISSUE-001`.

### `skills/buster/pipeline/suites/visual-reg-discord.js`

Role: Discord multipart helpers for visual-reg summary and individual screenshot messages.

Imports/dependencies: Node `fs`; verdict `STATUS`; `postDiscordWebhook` integration.

Exports/public surface: `discordSummary(moduleId, pageResults, overallStatus, enforced, opts)`, `discordSingle(moduleId, pageName, actualPath, diffPath, diffPercent, status, opts)`.

Defines: Default diff attachment threshold of 2%; embed builders; multipart body assembly for JSON payload plus PNG attachments.

Important variables/state: No persistent state; helper returns `undefined` on success, no-op, or caught failure.

Calls out to: Filesystem existence/read for attachments; Discord webhook HTTP helper.

Called by / expected callers: `visual-reg.js`.

Environment variables / CLI inputs / config fields: No direct env or config reads; caller supplies `webhookUrl`, threshold, and log callback.

Paths built/read/written: Reads `p.diffPath`, `actualPath`, and optional `diffPath`; no writes.

Authority behavior: Presentation-only; not authoritative for suite status.

Error/retry/terminal behavior: Missing webhook returns immediately. All webhook/read/body failures are caught and logged as non-critical. It does not return delivery status.

Verification coverage: `operator-surface.mjs` verifies HTTP failures are logged as non-critical and no success log is emitted.

Findings: `B04-ISSUE-001`.

### `skills/buster/pipeline/tools/screenshot.js`

Role: Shared Playwright screenshot and baseline-generation utility plus standalone CLI.

Imports/dependencies: Node `fs`/`path`/`url`; Buster strict CLI parser; dynamic `playwright`; process env write for `PLAYWRIGHT_BROWSERS_PATH`.

Exports/public surface: `takeScreenshot(target, outputPath, opts)`, `takeScreenshotBatch(targets, opts)`, `generateBaselines(htmlPath, outputDir, opts)`; direct CLI modes.

Defines: Defaults for viewport/full-page/waitUntil/navigation timeout/settle delay; URL resolver for HTTP(S) or local files; browser launcher; child file path guard; baseline generator from Prism `data-routes` manifest.

Important variables/state: Sets `process.env.PLAYWRIGHT_BROWSERS_PATH='/ms-playwright'` at module load when unset and path exists; no durable state.

Calls out to: Playwright Chromium; filesystem mkdir/read/write/stat; local `file://` previews or HTTP app URLs; CLI process exit.

Called by / expected callers: `visual-reg.js`, `visual-audit.js` conceptually, standalone operators/automation, strict CLI contract.

Environment variables / CLI inputs / config fields: `PLAYWRIGHT_BROWSERS_PATH`; CLI `--generate-baselines`, `--width`, `--height`, `--no-fullpage`, and up to two positionals.

Paths built/read/written: Input target URL/file; single output PNG; baseline output dir `<route.name>-baseline.png`; generated `paths.json` in output dir.

Authority behavior: Utility owns generated baseline screenshot files and `paths.json` when invoked by visual-reg auto-generation or CLI.

Error/retry/terminal behavior: Missing Playwright throws from launcher. `takeScreenshot` returns `{ok:false,error}` on failures and always tries to close browser. Batch mode returns one result per target and marks unattempted targets failed on browser-level errors. `generateBaselines` returns `{ok:false,error}` for missing/bad `data-routes`, invalid route entries, browser errors, or route screenshot failures; writes `paths.json` regardless of individual route failures after browser pass. CLI exits 2 for usage/fatal errors and 1 for unsuccessful operations.

Verification coverage: `check-strict-cli-args-surface.mjs` asserts strict parser use; `buster-runtime-normalization.mjs` checks cleanup catch hygiene.

Findings: None.

### `skills/buster/pipeline/tools/visual-audit.js`

Role: Standalone operator tool to capture a screenshot or short video of a URL and upload it to a Discord channel with bot token auth.

Imports/dependencies: Node `fs`/`path`/`url`; Buster strict CLI parser; static `playwright` Chromium import; global `fetch`, `FormData`, `Blob`.

Exports/public surface: default `visualAudit(url, channelId, botToken, mode)`; direct CLI wrapper.

Defines: Temporary `/tmp/audit-<Date.now()>` output directory; image/video capture branches; Discord upload payload.

Important variables/state: Per-run temp directory and generated media path; no persistent state.

Calls out to: Playwright Chromium; filesystem temp directory; Discord REST API `https://discord.com/api/v10/channels/<channelId>/messages`.

Called by / expected callers: Standalone CLI/operator use; strict CLI contract.

Environment variables / CLI inputs / config fields: CLI positional URL; CLI `--mode`; `DISCORD_CHANNEL`; `DISCORD_TOKEN`.

Paths built/read/written: `/tmp/audit-<timestamp>/screenshot.png` or Playwright `.webm`; reads generated file; deletes output dir on successful upload response, file-too-large path, or missing-file path.

Authority behavior: Operator-facing diagnostic artifact only; no pipeline state authority.

Error/retry/terminal behavior: Page load errors are warning-only until artifact existence check. Missing artifact and over-25MB file throw after cleanup. Discord HTTP non-OK throws after cleanup. A thrown `fetch`/network error during Discord upload can skip cleanup; tracked as B04 issue. CLI prints JSON error and exits 1.

Verification coverage: `check-strict-cli-args-surface.mjs` asserts strict parser use.

Findings: `B04-ISSUE-002`.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `suite-runner.js` | B04 suite defaults/exports | `a11ySuite`, `bundleSuite`, `healthSuite`, `perfSuite`, `securitySuite`, `runVisualReg` | Suite registry executes selected specialized suites in dependency order. |
| `visual-reg.js` | `tools/screenshot.js` | `takeScreenshotBatch`, `takeScreenshot`, `generateBaselines` | Visual-reg screenshot capture and auto-baseline generation. |
| `visual-reg.js` | `visual-reg-discord.js` | `discordSingle`, `discordSummary` | Optional Discord presentation for live app, baseline, diff, and summaries. |
| `visual-reg.js` | `services/telemetry.js` | `emitEvent` | Emits `buster.visual_reg` after successful compare paths. |
| `health.js`, `visual-reg.js` | `suites/repo-paths.js` | `resolveRepoScopedPath`, `REPO_DIR` | Derived route/baseline paths stay inside canonical repo. |
| `perf.js`, `bundle.js` | system tools | `lighthouse`, `du` | External CLI boundaries for performance report and bundle size. |
| `a11y.js`, `health.js`, `screenshot.js`, `visual-audit.js` | Playwright | dynamic/static Chromium launch | Browser boundary for scans, smoke navigation, screenshots, and audit captures. |
| `visual-reg-discord.js`, `visual-audit.js` | Discord HTTP | webhook helper or direct Discord REST `fetch` | Operator-facing media delivery. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `a11y.js a11ySuite` | Thresholds present | `a11y.thresholds` | Enforced mode may FAIL; otherwise violations become informational PASS findings | Defines accessibility blocking semantics. |
| `bundle.js bundleSuite` | Output dir missing | `bundle.www_dir` / default `/sandbox/www` | Return SKIP | Avoids failing when build output is unavailable. |
| `bundle.js bundleSuite` | Thresholds present | `bundle.thresholds.max_size_kb/max_file_count` | Enforced FAIL when exceeded | Controls bundle budget enforcement. |
| `health.js healthSuite` | HTTP success before retry exhaustion | `serve.health_*` and `fetch` result | PASS HTTP check and optional smoke; otherwise critical FAIL | Health is the app-dependent suite gate. |
| `health.js healthSuite` | Smoke paths configured or autodetected | `serve.smoke_paths`, `paths.json` | Run Playwright smoke navigation and fail on serious/critical findings | Catches frontend runtime errors after basic HTTP passes. |
| `perf.js resolvePerfReportPaths` | Legacy `perf.output_path` present | `perfConf.output_path` | Throw path-boundary error | Prevents task-controlled Lighthouse report paths. |
| `perf.js perfSuite` | Thresholds present | `perf.thresholds` | Enforced FAIL for scores below thresholds | Controls Lighthouse budget enforcement. |
| `security.js securitySuite` | Thresholds present | `security.thresholds.max_missing_headers` | FAIL only when issue count exceeds max | Controls whether header/cookie findings block the suite. |
| `visual-reg.js runVisualReg` | `paths.json` exists and parses to non-empty array | Baseline dir `paths.json` | Multi-path mode | Preferred route-aware visual regression path. |
| `visual-reg.js runVisualReg` | HTML preview exists and paths are stale/missing | Baseline dir `.html`, paths mtime | Auto-generate baselines, then multi-path | Converts Prism previews into route baselines. |
| `visual-reg.js runVisualReg` | No multi-path route data | `baseline.png` / HTML fallback | Single-path compatibility mode, SKIP if no baseline | Maintains legacy visual-reg behavior. |
| `visual-reg-discord.js` | Missing webhook URL | `webhookUrl` | Return without sending | Keeps Discord optional. |
| `screenshot.js` | `--generate-baselines` flag | CLI flags/positionals | Generate baseline PNGs and paths JSON | CLI mode split. |
| `visual-audit.js` | `mode === 'video'` | CLI/API `mode` | Record `.webm`; else full-page PNG | Operator media selection. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `a11y.js a11ySuite` | Findings list | Axe violations/nodes | Iterate violations then nodes until `max_findings` cap | Verdict findings remain bounded. |
| `bundle.js scanDir` | File list | Directory entries/stat data | Depth-first recursive walk; unreadable dirs/files log and skip | Largest-files metadata derives from successfully statted files. |
| `security.js securitySuite` | `allFindings`, `pathResults`, counters | Header/cookie/CORS checks per path | Header checks, then cookie checks, then CORS per path; cap findings to 50 | Verdict summarizes all requested paths. |
| `visual-reg.js runMultiPath` | `targets`, `pageResults`, findings, counters | `paths.json` route entries | Reject unsafe names before screenshot; screenshot all safe targets; compare each with baseline; copy artifacts best-effort | One page result per safe route, with skipped missing baselines. |
| `visual-reg.js compareImages` | Diff PNG | Baseline/actual PNGs | Canvas size is max width/height; smaller image data padded transparent; pixelmatch writes diff | Size mismatch can be compared and reported. |
| `screenshot.js generateBaselines` | Baseline PNGs and `paths.json` | HTML `data-routes` manifest | Validate routes; capture setup route without auth bypass; capture other routes after nav click; write paths JSON from all routes | `paths.json` maps setup to `/`, other routes to `/<name>`. |
| `visual-audit.js visualAudit` | Temp media directory | URL/mode | Capture media, validate existence and size, upload, then remove on success/HTTP non-OK | Temp dir should be ephemeral; network throw cleanup gap tracked. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `a11y.js a11ySuite` | Violations and nodes until cap | None | Playwright navigation timeout default 15000 ms | All violations processed or finding cap reached. |
| `health.js healthSuite` | `for i < retries` | `baseDelay * 2^(i-1)` between retries | Fetch timeout default 10000 ms per attempt | First HTTP ok breaks; exhaustion returns FAIL. |
| `health.js smokeNavigate` | Each smoke path | Optional `settleMs` after navigation | Navigation timeout 15000 ms | All paths visited; page close best-effort. |
| `security.js securitySuite` | Each configured path | None | Fetch timeout default 10000 ms per path | All paths checked; per-path fetch failures continue. |
| `visual-reg.js runMultiPath` | Route target construction and per-route comparison | None | Screenshot tool navigation timeout default 15000 ms | All safe routes attempted; no retry. |
| `screenshot.js takeScreenshotBatch` | Each target | None | Per-navigation timeout default 15000 ms | All targets attempted; browser-level failure marks remaining failed. |
| `screenshot.js generateBaselines` | Each `data-routes` nav route | `settleMs` default 400 ms after click | Initial page goto timeout 15000 ms; selector timeout 5000 ms | All routes attempted; failures recorded. |
| `visual-audit.js visualAudit` | Single capture/upload | Video mode waits 3000 ms after scroll | Page goto timeout 15000 ms | Missing/large/upload-failed media throws; no retry. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `context.config.a11y.*` | Suite config | `a11y.js` | path `/`, WCAG tags, max findings 50, timeout 15000 ms | Accessibility scan inputs and enforcement thresholds. |
| `context.config.bundle.www_dir/thresholds` | Suite config | `bundle.js` | `/sandbox/www`, informational mode | Output dir validated by shared allowed-prefix helper. |
| `context.config.serve.health_*`, `smoke_paths`, `smoke_settle_ms` | Suite config | `health.js` | retries 3, base delay 1000 ms, timeout 10000 ms, settle 1000 ms | Health retry and smoke navigation behavior. |
| `context.config.perf.*` | Suite config | `perf.js` | path `/`, timeout 60s, no thresholds | Legacy `output_path` rejected. |
| `context.config.security.*` | Suite config | `security.js` | `paths=[serve.health_path\|\|'/']`, CORS on, timeout 10000 ms | Header/cookie/CORS audit inputs. |
| `context.config['visual-reg'].*` | Suite config | `visual-reg.js` | path `/`, pixelmatch threshold 0.1, summary mode for >3 paths | Baseline path fields are rejected. |
| `context.testsLogDir`, `screenshotsDir`, `resultsDir`, `attempt` | Suite runtime context | `perf.js`, `visual-reg.js` | scratch/report defaults when absent | Durable report and screenshot artifact placement. |
| `PLAYWRIGHT_BROWSERS_PATH` | Env var | `screenshot.js` | set to `/ms-playwright` when unset and directory exists | Browser binary location for screenshot utility. |
| Screenshot CLI flags/positionals | CLI input | `screenshot.js` | `--width 1280`, `--height 720`, full-page true | Strict parser with max two positionals. |
| Visual-audit CLI/env | CLI/env input | `visual-audit.js` | `--mode image`; env required | URL positional plus `DISCORD_CHANNEL` and `DISCORD_TOKEN`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| Bundle output dir | `bundle.js` from `bundle.www_dir` or `/sandbox/www` | `bundle.js` scanner and `du` | Build suite outside B04 | Allowed-prefix validation only, not repo-scoped. |
| Visual-reg baseline dir | `visual-reg.js resolveVisualRegBaselineDir` | `visual-reg.js`, `health.js` autodetection | Baseline generator/CLI/project artifacts | Derived from sanitized module identity under `.swarm/modules/<module>/baselines`. |
| Visual-reg `paths.json` | `screenshot.js generateBaselines` / project baseline artifacts | `visual-reg.js`, `health.js` | `generateBaselines` | Route manifest for multi-path visual comparison and smoke navigation. |
| Visual-reg actual/diff PNGs | `visual-reg.js outputPathForName` | Discord helpers/operators | Screenshot and pixelmatch compare | Child filename guard scopes generated names inside artifact dir. |
| Lighthouse scratch/final reports | `perf.js resolvePerfReportPaths` | `perf.js`, operators | Lighthouse CLI and `fs.copyFileSync` | Task-provided `output_path` is rejected; durable final path uses tests log dir. |
| Screenshot CLI output and baseline dir | `screenshot.js` CLI/generator | Operators/visual-reg | `takeScreenshot` / `generateBaselines` | Output dir/file are operator-provided for standalone CLI. |
| Visual-audit temp dir | `visual-audit.js` | Discord upload | Playwright screenshot/video | `/tmp/audit-<timestamp>`; cleanup gap on fetch/network throw tracked. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Specialized suite verdicts | B04 suite functions | Buster suite runner, completion, Discord surfaces | None. |
| Visual-reg baseline path authority | `visual-reg.js resolveVisualRegBaselineDir` and `screenshot.js generateBaselines` | Visual-reg comparison, health smoke autodetection | None. |
| Visual-reg Discord delivery status | `visual-reg-discord.js` should own send result but currently returns no status | `visual-reg.js` telemetry says `discord_sent:true` unconditionally | Tracked as `B04-ISSUE-001`. |
| Visual-audit temp artifact lifecycle | `visual-audit.js` | Operators/Discord upload | Cleanup on network/fetch throw tracked as `B04-ISSUE-002`. |
| Lighthouse report artifact | `perf.js` | Operators/suite metadata | None. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Axe-derived a11y verdict metadata | `a11y.js` | `tool`, `url_tested`, `mode`, `violations`, `passes`, `incomplete`, `inapplicable`, optional `thresholds` | Verdict schema factory | Suite runner/completion consumers. |
| Bundle verdict metadata | `bundle.js` | `total_size_kb`, `file_count`, `largest_files[]`, `mode`, optional `thresholds` | Verdict schema factory | Suite runner/completion consumers. |
| Health verdict metadata | `health.js` | `url`, `status_code`, `response_time_ms`, `attempts`, optional `last_error`, `smoke_paths`, `smoke_errors` | Verdict schema factory | Suite runner/completion consumers. |
| Perf verdict metadata | `perf.js` | `tool`, `url_tested`, `scores{category:number}`, `mode`, `report_path`, `scratch_report_path`, optional `thresholds` | Lighthouse JSON parse plus verdict schema | Suite runner/operators. |
| Security path result metadata | `security.js` | `paths_checked[]`, `path_results[]` with `path`, `status`, `issues`, `headers_present[]` or `error`, `mode`, `check_cors`, optional `thresholds` | Local header/cookie/CORS checks plus verdict schema | Suite runner/completion consumers. |
| Visual-reg `paths.json` | `screenshot.js generateBaselines` | Array of `{name:string, nav:string, path:string}`; setup path `/`, others `/<name>` | `generateBaselines` validates source route `name` and `nav`; visual-reg only JSON parses/non-empty array | `visual-reg.js`, `health.js`. |
| Visual-reg page results | `visual-reg.js` | `{name,status,diffPercent,diffCount?,diffPath?,actualPath?,baselinePath?,canvasSize?,error?}` | Local construction; artifact name guard for generated paths | Discord helpers, telemetry, verdict metadata. |
| `buster.visual_reg` telemetry payload | `visual-reg.js` | `module_id`, `mode`, `pages_total`, `pages_compared`, `pages_skipped`, `page_results[]`, `overall`, `discord_sent` | Buster telemetry service; no local delivery-status validation | Redis/stdout telemetry consumers. |
| Screenshot result | `screenshot.js` | `{ok:boolean,path?,width?,height?,error?}` or batch array with `name` | Local return shape, no external validator | `visual-reg.js`, CLI output. |
| Baseline generation result | `screenshot.js` | `{ok:boolean,routes:Array,error?,pathsJsonPath?,generated?,failed?}` | Local route validation | `visual-reg.js`, CLI output. |
| Visual-audit result | `visual-audit.js` | Success `{status:'success',target_url,mode,size_mb}`; error CLI `{status:'error',error}` | CLI checks URL/env/mode; no external schema | Operators/automation. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| B04 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `a11y.js a11ySuite` | Missing Playwright/axe, navigation, scan, browser launch failure | No | Navigation timeout default 15000 ms | Returns `STATUS.ERROR`, `critical:false`; browser close failure logged non-blocking | Error message included; no redaction. |
| `bundle.js bundleSuite` | Missing output dir | No | No retry/backoff | Returns SKIP | None. |
| `bundle.js bundleSuite/scanDir` | `du`, `readdir`, or `stat` failure | No | No retry/backoff | Logs non-blocking and continues | Path/error message logged; no redaction. |
| `health.js healthSuite` | HTTP timeout/error/non-OK | Yes at suite loop level | Retries default 3; exponential delay 1000ms, 2000ms; per-attempt timeout 10000 ms | Exhaustion returns critical FAIL | URL/error included; no redaction. |
| `health.js smokeNavigate` | Playwright unavailable, navigation failure, page JS errors | No | Navigation timeout 15000 ms; optional settle wait | Playwright unavailable is moderate finding; serious/critical nav/JS findings make non-critical FAIL | Error messages included; no redaction. |
| `perf.js perfSuite` | Legacy output path config | No | No retry/backoff | Returns ERROR with path-boundary finding | Error message included; no redaction. |
| `perf.js perfSuite` | Lighthouse command/report/read/parse failure | No | Command timeout `perf.timeout` seconds, default 60 | Returns ERROR | Stderr preview capped to 500 chars; no redaction. |
| `security.js securitySuite` | Per-path fetch timeout/error | No | Abort timeout default 10000 ms per path | Adds critical finding and continues remaining paths; enforced status decided after all paths | URL/error included; no redaction. |
| `visual-reg.js runVisualReg` | Legacy baseline config or unsafe artifact names | No | No retry/backoff | Legacy config returns ERROR; unsafe route names become page errors/findings | Error message included; no redaction. |
| `visual-reg.js runVisualReg` | Missing baseline / baseline generation / screenshot / compare failure | No | Screenshot navigation timeout default 15000 ms through tool | Missing baseline SKIP; generation/live screenshot/compare can return ERROR or page findings | Error message included; no redaction. |
| `visual-reg-discord.js` | Missing webhook, HTTP/read/body failure | No | Webhook helper has its own timeout; no helper retry | Missing webhook no-op; failures caught and logged non-critical | Embed body may include module/page names; no explicit redaction. |
| `screenshot.js` | Missing Playwright, bad target, navigation/screenshot failure | No | Navigation timeout default 15000 ms | Single returns `{ok:false}`; batch records failed target; CLI exits nonzero | Error message included; no redaction. |
| `screenshot.js generateBaselines` | Missing/bad `data-routes`, invalid routes, browser/route failures | No | Page goto timeout 15000 ms; selector timeout 5000 ms; settle 400 ms | Returns `{ok:false}` for parse/browser/any route failure; still writes paths JSON after browser pass | Error message included; no redaction. |
| `visual-audit.js visualAudit` | Page load, missing media, oversized media, Discord HTTP/fetch failure | No | Page goto timeout 15000 ms; no Discord retry | Page load warning only; missing/large/upload failures throw; network throw cleanup gap tracked | URL and Discord error text included; bot token not logged. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `a11y.js a11ySuite` | Scan/import/navigation ERROR | Yes | stdout and optional suite log sink | `[SUITE] [A11Y] ERROR...`; suite verdict error | `log`, `createSuiteVerdict` | No Redis telemetry in scoped file. |
| `bundle.js bundleSuite` | Missing output dir | Yes | stdout/log sink and suite verdict | SKIP reason | `log`, `createSuiteVerdict` | No Redis telemetry. |
| `bundle.js scanDir` | Directory/stat/du failures | Partial | stdout/log sink | non-blocking scan/stat/du messages | `log` | Non-terminal failures only; verdict may still PASS/SKIP. |
| `health.js healthSuite` | HTTP timeout/error/non-OK | Yes | stdout/log sink and suite verdict | Attempt logs and FAIL metadata | `log`, `createSuiteVerdict` | No Redis telemetry. |
| `health.js smokeNavigate` | Playwright/nav/JS errors | Yes | stdout/log sink and suite verdict findings | Smoke logs/findings | `log`, `createFinding` | No Redis telemetry. |
| `perf.js perfSuite` | Path config or Lighthouse failure | Yes | stdout/log sink and suite verdict | ERROR log/verdict | `log`, `createSuiteVerdict` | Lighthouse stderr capped in verdict. |
| `security.js securitySuite` | Per-path fetch failure | Yes | stdout/log sink and suite verdict findings | Path scan logs/findings | `log`, `createFinding` | Continues across paths. |
| `visual-reg.js runVisualReg` | Path config/generation/screenshot/compare failures | Yes | stdout/log sink and suite verdict; only successful compare path emits `buster.visual_reg` | Visual-reg logs/verdict | `log`, `createSuiteVerdict` | Error paths before emit do not emit `buster.visual_reg`. |
| `visual-reg-discord.js` | Missing webhook or Discord failure | Partial | none for missing webhook; log callback for caught failures | `Discord summary failed...`, `Discord screenshot failed...` | `discordSummary`, `discordSingle` | Delivery status not returned; telemetry misreports sent in caller (`B04-ISSUE-001`). |
| `screenshot.js` | Screenshot/baseline failures | Yes | stdout and CLI JSON | `[SCREENSHOT] FAIL...`, JSON result | `log`, CLI wrapper | No Redis telemetry. |
| `visual-audit.js visualAudit` | Capture/upload failures | Yes | stderr and CLI JSON | `[Audit] Warning...`, CLI `{status:'error'}` | `visualAudit`, CLI wrapper | Temp cleanup gap on fetch throw tracked as `B04-ISSUE-002`. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| `playwright` / Chromium | npm package/browser runtime | runtime installed | `a11y.js`, `health.js`, `screenshot.js`, `visual-audit.js` | Browser automation, smoke nav, screenshot/video | Missing package returns ERROR/finding depending caller. |
| `@axe-core/playwright` | npm package | runtime installed | `a11y.js` | Accessibility scan | Missing package returns a11y ERROR. |
| `lighthouse` | system/npm CLI binary | runtime installed | `perf.js` | Performance report JSON | Command failure/missing report returns perf ERROR. |
| `pixelmatch` | npm package dynamic import | runtime installed | `visual-reg.js` | PNG diff count | Import/compare failure returns visual-reg error/finding. |
| `pngjs` | npm package dynamic import | runtime installed | `visual-reg.js` | PNG decode/encode | Import/read/write failure returns visual-reg error/finding. |
| `du` | system binary | runtime installed | `bundle.js` | Total output size | Failure logs and bundle continues with `0` total size. |
| Discord webhook helper | Common/Buster integration | runtime helper | `visual-reg-discord.js` | Multipart webhook delivery | Failures caught non-critical. |
| Discord REST API v10 | External HTTPS API | v10 endpoint | `visual-audit.js` | Channel media upload | HTTP errors throw after cleanup; network throws can skip cleanup. |
| Node `FormData`/`Blob`/`fetch` | Runtime globals | Node runtime | `visual-audit.js`, suite fetches | HTTP requests and multipart upload | Missing/throwing fetch propagates in visual-audit. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| A11Y findings | Max findings cap | `a11y.max_findings` default 50 | Extra axe nodes omitted | Verdict `findings.length` | None. |
| Health retry loop | Sequential attempts | retries 3, exponential base 1000 ms | Exhaustion returns critical FAIL | Attempt logs and metadata attempts | None. |
| Health smoke navigation | Sequential browser pages | `smoke_settle_ms` default 1000 ms | Serious/critical findings fail non-critical suite | Smoke logs/findings | None. |
| Security path audit | Sequential fetch per path | Timeout 10000 ms, max findings 50 | Fetch failure counted and next path continues | Path results metadata | None. |
| Visual-reg screenshot batch | One browser/page, sequential targets | Screenshot timeout default 15000 ms | Per-target errors recorded; no parallelism | Screenshot logs/page results | None. |
| Visual-reg Discord attachments | Summary attachment cap | Diff threshold 2%, max 10 attachments, embed image only when 1-4 | Extra attachments omitted above cap | Discord log callback | Delivery status not returned. |
| Screenshot baseline generation | Sequential route clicks | settle 400 ms, selector timeout 5000 ms | Route failures recorded; final ok false | Baseline logs/result | None. |
| Visual-audit upload size | Discord 25 MB cap | hard-coded 25 MB | Throws before upload and removes temp dir | stderr/CLI JSON | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| B04 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Visual-reg uses repo-scoped project/baseline paths and rejects legacy task-configured path fields | `check-buster-repo-scoped-paths.mjs` | Good | None. |
| Perf rejects legacy task-configured report output path | `check-buster-repo-scoped-paths.mjs` | Good | None. |
| Bundle path validation treats disallowed paths and shell metacharacters safely | `shell-boundary.mjs` | Good | None. |
| Visual-reg Discord helper failures remain non-critical | `operator-surface.mjs` | Partial | Does not assert caller telemetry `discord_sent`; tracked in B04 issue. |
| Screenshot and visual-audit CLIs use strict parser | `check-strict-cli-args-surface.mjs` | Surface coverage | Does not execute invalid CLI cases for these tools. |
| B04 cleanup catch blocks are explicit | `buster-runtime-normalization.mjs` | Good for selected files | Visual-audit temp cleanup on upload throw not covered. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `B04-ISSUE-001` — visual-reg telemetry reports `discord_sent:true` even when Discord delivery is disabled or fails.
- `B04-ISSUE-002` — visual-audit temp directory can leak when Discord upload throws before cleanup.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
