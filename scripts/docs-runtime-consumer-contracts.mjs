// Exact receiving-source contracts. A familiar variable name does not authorize
// an additional reader. This registry is deliberately independent of discovery.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const contracts = new Map();
function add(source, name, purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, impact, failure, owningSurface, required = 'optional', boundary = 'checked-in runtime') {
  contracts.set(`${name}:${source}`, { purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, impact, failure, owningSurface, required, boundary, owner: source });
}
// Exact Prism receiving-source meanings shared by current and retained references.
add("skills/prism/config/native-worker.ts", "PRISM_WORKER_SECRET", "Authenticates native-worker artifact reads and uploads to Prism Control when SPIFFE workload identity is disabled. This client does not send worker dispatch requests.", "A non-empty shared secret unless WORKER_TRUST_SPIFFE_ENABLED is exactly true.", "Uses an empty internal value only when SPIFFE workload identity is exactly enabled.", "Accepted only with WORKER_TRUST_SPIFFE_ENABLED=true; otherwise configuration rejects it.", "No character format is imposed here. A mismatching value causes Control artifact authentication to fail.", "The receiving process reads its captured environment; no other process replaces it.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Native-worker configuration stops with PRISM_NATIVE_ARTIFACT_AUTH_REQUIRED when the required value is absent; a mismatching value fails later artifact requests.", "skills/prism/config/native-worker.ts:native-worker configuration", "required when SPIFFE workload identity is not exactly true");
contracts.get("PRISM_WORKER_SECRET:skills/prism/config/native-worker.ts").evidence = [{"path": "skills/prism/config/native-worker.ts", "line": 38, "endLine": 48}, {"path": "skills/prism/server/native-worker-host.ts", "line": 13, "endLine": 30}, {"path": "skills/prism/server/worker-artifacts.ts", "line": 28, "endLine": 55}];
add("skills/prism/config/native-worker.ts", "PRISM_NATIVE_POOL_POLICY_FILE", "Selects the root-owned native-worker pool policy read by the Prism supervisor. This policy is not cryptographically signed.", "A non-empty canonical absolute path other than filesystem root.", "No default.", "Absent or empty is rejected.", "A relative, non-canonical, empty or root path returns PRISM_NATIVE_PATH_REQUIRED:PRISM_NATIVE_POOL_POLICY_FILE. The policy reader separately checks file identity, root ownership, write permissions and policy content.", "The receiving process reads its captured environment; no other process replaces it.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "The native supervisor stops before it accepts work if the policy cannot be read or validated.", "skills/prism/config/native-worker.ts:native-worker configuration", "required");
contracts.get("PRISM_NATIVE_POOL_POLICY_FILE:skills/prism/config/native-worker.ts").evidence = [{"path": "skills/prism/config/native-worker.ts", "line": 50, "endLine": 65}, {"path": "skills/worker/core/worker/native-pool-policy.ts", "line": 19, "endLine": 54}];
add("skills/prism/control/product-decisions.ts", "PRISM_PRODUCT_ORIGIN", "Selects the browser Origin required for mutating product decisions together with the CSRF cookie/header checks. It is not the controller request destination.", "An HTTPS origin with no credentials, query, fragment or path other than /. The URL constructor first parses the trimmed text.", "No value is read while product decisions are disabled; no default exists when enabled.", "When product decisions are enabled, absent, empty or whitespace-only text is rejected.", "Malformed URL text throws during URL construction; a parsed non-HTTPS or non-origin URL fails product authority requires HTTPS origins.", "Exact PRISM_PRODUCT_DECISIONS_ENABLED=true enables the captured startup values; no later configuration source overrides this reader.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Invalid configuration stops composition; a later browser Origin or CSRF mismatch rejects the decision.", "skills/prism/control/product-decisions.ts:loadProductConfig", "required only when product decisions are exactly enabled");
contracts.get("PRISM_PRODUCT_ORIGIN:skills/prism/control/product-decisions.ts").evidence = [{"path": "skills/prism/control/product-decisions.ts", "line": 23, "endLine": 34}, {"path": "skills/prism/control/product-decisions.ts", "line": 35, "endLine": 42}];
add("skills/prism/control/product-decisions.ts", "PRISM_PRODUCT_CONTROLLER_URL", "Selects the HTTPS controller origin to which productController sends signed product decision envelopes.", "An HTTPS origin with no credentials, query, fragment or path other than /. The URL constructor first parses the trimmed text.", "No value is read while product decisions are disabled; no default exists when enabled.", "When product decisions are enabled, absent, empty or whitespace-only text is rejected.", "Malformed URL text throws during URL construction; a parsed non-HTTPS or non-origin URL fails product authority requires HTTPS origins.", "Exact PRISM_PRODUCT_DECISIONS_ENABLED=true enables the captured startup values; no later configuration source overrides this reader.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Invalid configuration stops composition. Later file reads, TLS, token validation, transport or controller response errors fail the request.", "skills/prism/control/product-decisions.ts:loadProductConfig", "required only when product decisions are exactly enabled");
contracts.get("PRISM_PRODUCT_CONTROLLER_URL:skills/prism/control/product-decisions.ts").evidence = [{"path": "skills/prism/control/product-decisions.ts", "line": 23, "endLine": 34}, {"path": "skills/prism/server/product-controller.ts", "line": 12, "endLine": 29}];
add("skills/prism/control/product-decisions.ts", "PRISM_PRODUCT_OPERATORS", "Selects the explicit set of session users permitted to make product decisions.", "A JSON array with at least one unique, non-empty string. Each string must already be trimmed.", "No value is read while product decisions are disabled; no default exists when enabled.", "When product decisions are enabled, absent, empty or whitespace-only text is rejected.", "Malformed JSON throws from JSON.parse. A parsed non-array, empty array, invalid entry or duplicate fails explicit product operator allowlist is required.", "Exact PRISM_PRODUCT_DECISIONS_ENABLED=true enables the captured startup values; no later configuration source overrides this reader.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Invalid configuration stops composition; a session user outside the set is rejected.", "skills/prism/control/product-decisions.ts:loadProductConfig", "required only when product decisions are exactly enabled");
contracts.get("PRISM_PRODUCT_OPERATORS:skills/prism/control/product-decisions.ts").evidence = [{"path": "skills/prism/control/product-decisions.ts", "line": 23, "endLine": 34}, {"path": "skills/prism/control/product-decisions.ts", "line": 35, "endLine": 42}];
add("skills/prism/control/product-decisions.ts", "PRISM_PRODUCT_ISSUER", "Sets the issuer string in each signed product-decision payload.", "Non-empty text after trimming; this reader imposes no additional issuer syntax.", "No value is read while product decisions are disabled; no default exists when enabled.", "When product decisions are enabled, absent, empty or whitespace-only text is rejected.", "Absent or whitespace-only text fails PRISM_PRODUCT_ISSUER is required. The receiving controller owns acceptance of the signed issuer.", "Exact PRISM_PRODUCT_DECISIONS_ENABLED=true enables the captured startup values; no later configuration source overrides this reader.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Missing issuer stops composition; a controller can reject an unacceptable issuer later.", "skills/prism/control/product-decisions.ts:loadProductConfig", "required only when product decisions are exactly enabled");
contracts.get("PRISM_PRODUCT_ISSUER:skills/prism/control/product-decisions.ts").evidence = [{"path": "skills/prism/control/product-decisions.ts", "line": 23, "endLine": 34}, {"path": "skills/prism/control/product-decisions.ts", "line": 60, "endLine": 72}];
add("skills/prism/control/product-decisions.ts", "PRISM_PRODUCT_CONTROLLER_CA_FILE", "Selects the CA file used to verify the HTTPS controller connection. The file is read by productController at request time, not by loadProductConfig.", "A non-empty file path after trimming. loadProductConfig does not open or validate this file.", "No value is read while product decisions are disabled; no default exists when enabled.", "When product decisions are enabled, absent, empty or whitespace-only text is rejected.", "An unreadable file or unacceptable CA can fail a later controller request; this loader checks only non-empty trimmed path text.", "Exact PRISM_PRODUCT_DECISIONS_ENABLED=true enables the captured startup values; no later configuration source overrides this reader.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Missing path text stops composition. File or transport validation can fail a later request after composition succeeds.", "skills/prism/control/product-decisions.ts:loadProductConfig", "required only when product decisions are exactly enabled");
contracts.get("PRISM_PRODUCT_CONTROLLER_CA_FILE:skills/prism/control/product-decisions.ts").evidence = [{"path": "skills/prism/control/product-decisions.ts", "line": 23, "endLine": 34}, {"path": "skills/prism/server/product-controller.ts", "line": 12, "endLine": 29}];
add("skills/prism/control/product-decisions.ts", "PRISM_PRODUCT_CONTROLLER_TOKEN_FILE", "Selects the file containing the Bearer token sent to the controller. The file is read by productController at request time, not by loadProductConfig.", "A non-empty file path after trimming. loadProductConfig does not open or validate this file.", "No value is read while product decisions are disabled; no default exists when enabled.", "When product decisions are enabled, absent, empty or whitespace-only text is rejected.", "At request time, an unreadable file, empty trimmed token, token text longer than 64,000 UTF-16 code units, or a CR/LF in the trimmed token fails the request.", "Exact PRISM_PRODUCT_DECISIONS_ENABLED=true enables the captured startup values; no later configuration source overrides this reader.", "Changes the selected authority for this receiving process; restart it after a deliberate configuration change.", "Missing path text stops composition. File or transport validation can fail a later request after composition succeeds.", "skills/prism/control/product-decisions.ts:loadProductConfig", "required only when product decisions are exactly enabled");
contracts.get("PRISM_PRODUCT_CONTROLLER_TOKEN_FILE:skills/prism/control/product-decisions.ts").evidence = [{"path": "skills/prism/control/product-decisions.ts", "line": 23, "endLine": 34}, {"path": "skills/prism/server/product-controller.ts", "line": 12, "endLine": 29}];
export function prismPostgresqlSecretConsumerAuthority() {
  return "The PostgreSQL container reads the administrator and role passwords during database initialization. The role-bootstrap and migration jobs read their selected administrator, migrator, runtime and read-only credentials or URLs. Prism Control reads the runtime URL. A worker reads DATABASE_URL for the database-backed nonce store only when SPIFFE workload identity is disabled. Backup and restore-proof commands read their selected database credentials. Studio and ingestion do not read this database Secret.";
}

const processOnly = 'This reader uses the captured process value. Another process cannot override this reader.';
for (const name of ['GOMODCACHE', 'GOPATH']) {
  const source = 'scripts/docs-api-output-discovery.mjs';
  add(source, name, 'Includes the inherited Go module-cache selection in the resource-discovery cache identity; spawned Go adapters inherit this value.', 'An inherited string. This JavaScript cache-key reader does not validate path syntax or module contents.', 'Absent contributes the literal <default> sentinel to the cache key. The Go adapter and toolchain own effective path selection.', 'Empty is retained as an empty cache-key string, not the absent sentinel. The Go authority adapter treats empty as its fallback case.', 'This cache-key reader does not reject malformed text; native Go launch or source-authority validation can reject the resulting selection.', 'The exact inherited value participates in cache identity; a changed value prevents reuse of the previous key. Native selected source hashes and dependency paths remain separate authority inputs.', 'Changes discovery cache reuse and the module source path inherited by native adapters, not the accepted external module authority.', 'Unqualified or unavailable native authority fails the owning API_PRODUCT Go producer check; a new cache key alone grants no qualification.', `${source}:discoverGoApiOutputs`, 'optional inherited Go cache selection', 'development documentation discovery cache');
  contracts.get(`${name}:${source}`).evidence = [{ path: source, line: 1300, endLine: 1324 }];
}
add('scripts/docs-api-output-discovery.mjs', 'GOFLAGS', 'Rejects a different native Go compilation/environment authority before documentation-role qualification, cold parsing or cached discovery admission.', 'Only absent or empty passes. No non-empty flag spelling or whitespace is accepted.', 'Absent passes this guard. If no Go source is selected, discovery returns an empty result before reading the variable.', 'Empty passes the same guard as absence.', 'Every non-empty value fails API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED with the first selected Go source path, before any documentation qualifier can invoke a native helper.', 'The current inherited value is checked before any role selection or cache lookup. A prior empty-value cache entry does not override this check.', 'Prevents native compilation flags from changing the reviewed helper/source authority or bypassing current policy through warmed discovery.', 'Discovery stops at the explicit source-specific authority diagnostic; no flags normalization or permissive fallback is supplied.', 'scripts/docs-api-output-discovery.mjs:discoverGoApiOutputs', 'must be absent or empty for selected Go discovery', 'development finite Go compilation authority');
contracts.get('GOFLAGS:scripts/docs-api-output-discovery.mjs').evidence = [{ path: 'scripts/docs-api-output-discovery.mjs', line: 1300, endLine: 1307 }];
const goModuleCacheSource = 'scripts/docs-api-go-output-role-adapter.go';
add(goModuleCacheSource, 'GOMODCACHE', 'Selects the already-present primary source directory used to qualify the finite json-canonicalization module and its reviewed caller/error controls.', 'A non-empty filesystem path resolved with filepath.Abs, then the fixed module/version/package suffix is appended. Exact two-file names and source digests must match the reviewed authority.', 'Absent or empty selects the first GOPATH entry plus pkg/mod; an absent or empty GOPATH falls back to os.UserHomeDir()/go.', 'Empty selects the same fallback as absence because os.Getenv is compared with an empty string.', 'Path resolution errors, unavailable directories, changed source sets or source bytes add authority issues and prevent qualified output-role approval. This selector does not download dependencies.', 'Non-empty GOMODCACHE wins over GOPATH and the home-directory fallback. Caller controls, module version and go.sum authority still apply.', 'Changes where exact external semantic source authority is read; no arbitrary module or product-output exemption is granted.', 'The adapter returns unqualified authority issues; the caller rejects the affected native output role.', `${goModuleCacheSource}:finite canonicalizer authority`, 'required source must be available through selected or fallback path', 'development offline native semantic authority');
contracts.get(`GOMODCACHE:${goModuleCacheSource}`).evidence = [{ path: goModuleCacheSource, line: 1438, endLine: 1475 }];
add(goModuleCacheSource, 'GOPATH', 'Provides the fallback cache root for finite canonicalizer primary-source authority only when GOMODCACHE is absent or empty.', 'A host path-list string; only its first entry is joined with pkg/mod and resolved to an absolute path. No executable or remote repository is selected here.', 'Absent or empty uses os.UserHomeDir()/go. The home lookup error is ignored; an empty returned home leaves a relative go path resolved against the process directory.', 'Empty selects the home-directory fallback, not an explicitly empty cache directory.', 'Unavailable or nonmatching exact module sources prevent qualified authority. A first empty path-list entry resolves pkg/mod relative to the process directory.', 'Non-empty GOMODCACHE bypasses this reader. Otherwise the first GOPATH entry wins over the home fallback; later entries are not searched.', 'Changes the fallback location of the fixed external package source authority; it does not broaden accepted module versions or source digests.', 'Missing or changed external primary sources yield authority issues and the owning native role check rejects.', `${goModuleCacheSource}:finite canonicalizer authority`, 'conditional fallback when GOMODCACHE is empty or absent', 'development offline native semantic authority');
contracts.get(`GOPATH:${goModuleCacheSource}`).evidence = [{ path: goModuleCacheSource, line: 1438, endLine: 1475 }];
const deployment = 'Change the owning configuration and restart this receiving process to apply the value.';
const lintExecution = 'skills/nova/plugins/lint/src/engine/execution.ts';
const lintCacheKeys = new Set(['GOCACHE', 'GOMODCACHE', 'STATICCHECK_CACHE', 'TRIVY_CACHE_DIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']);
for (const name of ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TEMP', 'TMP', 'CI', 'GIT_EDITOR', 'NODE_ENV', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'TF_DATA_DIR', 'TF_CLI_CONFIG_FILE', 'SEMGREP_LOG_FILE', 'GOCACHE', 'GOMODCACHE', 'STATICCHECK_CACHE', 'TRIVY_CACHE_DIR', 'CONTAINER_HOST', 'DOCKER_HOST', 'SSH_AUTH_SOCK']) {
  const cache = lintCacheKeys.has(name);
  add(lintExecution, name, `Copies the defined inherited ${name} into the lint engine's allowlisted subprocess environment. ${cache ? 'safeExec replaces this inherited cache input with its owned temporary cache path before applying per-invocation overrides.' : 'The selected external lint or Git command owns interpretation.'}`,
    'A string copied without local syntax validation. Per-invocation defined overrides are converted with String; null or undefined overrides remove the key.',
    cache ? 'safeExec supplies an owned directory below os.tmpdir()/kubeclaw-lint-cache; the separate which availability probe merely copies inherited keys. No external tool fallback is claimed.' : 'Absent is omitted from the child environment unless an explicit invocation override supplies it. External defaults are not established here.',
    cache ? 'safeExec replaces an inherited empty string with the owned cache path; its explicit invocation empty override is forwarded unchanged. The which probe copies inherited empty strings unchanged.' : 'An inherited empty string is copied unchanged; an invocation override can replace or remove it.',
    'This transport does not validate external tool syntax. A non-allowlisted override key throws; filesystem preparation or child command errors fail the owning lint operation.',
    cache ? 'Inherited process input is captured first, then the owned LINT_TOOL_CACHE_ENV path wins, then opts.env wins; null or undefined opts.env values delete the key.' : 'A defined inherited value is copied first; opts.env then replaces it or removes it with null/undefined.',
    'Changes only the bounded child command environment. External tool caches, credentials and configuration interpretation belong to that command.',
    'Directory preparation can throw before spawn. Child start, nonzero exit, timeout and output-limit failures are returned by runProcess; cancellation rejects the invocation.',
    `${lintExecution}:SUBPROCESS_ENV_KEYS/buildSubprocessEnv/safeExec`, 'optional inherited child input', 'checked-in allowlisted subprocess transport');
  contracts.get(`${name}:${lintExecution}`).evidence = [{ path: lintExecution, line: 8, endLine: 49 }, { path: lintExecution, line: 51, endLine: 78 }, { path: lintExecution, line: 90, endLine: 94 }, { path: 'skills/nova/plugins/lint/src/engine/process.ts', line: 26, endLine: 61 }];
}
for (const name of ['ARCHVIEWER_TEST_NGINX', 'REDIS_SERVER', 'REDIS_SOURCE_SERVER']) {
  const source = 'scripts/reliability-tests.mjs';
  add(source, name, 'Checks the explicitly selected native executable prerequisite before launching the services reliability shard.', 'A non-empty executable filesystem path checked with fs.accessSync X_OK; this guard does not verify executable version or behavior.', 'No default in services mode. Other reliability groups do not read this prerequisite.', 'Empty fails Missing native test prerequisite: <name>.', 'Missing input or an inaccessible/non-executable path stops the shard before child tests are spawned.', 'The inherited process value is checked only when group is services; the test child then inherits the parent environment.', 'Changes the executable available to the native service tests; the prerequisite check alone does not prove those tests succeeded.', 'The runner throws before test launch for a failed prerequisite; afterward child error or exit status determines the runner outcome.', `${source}:services prerequisite loop`, 'required for services group', 'maintainer reliability prerequisite');
  contracts.get(`${name}:${source}`).evidence = [{ path: source, line: 27, endLine: 45 }];
}
add('scripts/deploy-ops-pod.sh', 'OPS_DEFAULT_NAMESPACE', 'Selects the namespace in the in-pod Ops MCP negative Secret-read control.', 'The environment value of the remote ops-mcp container, URL-encoded into the Kubernetes namespace path. This host wrapper does not validate it.', 'No wrapper fallback; undefined is passed to encodeURIComponent and does not select a valid documented namespace.', 'An empty remote value creates an empty namespace path; only an actual Kubernetes API 403 counts as success.', 'Missing, malformed, unavailable or unauthorized request results other than the required API 403 fail the negative control.', 'The remote ops-mcp Pod environment owns this value; the operator-host environment does not replace the quoted node -e program input.', 'Changes the namespace against which the observer credential is tested without displaying or creating Secrets.', 'The negative control fails if the request succeeds or if its error is not Kubernetes API 403.', 'charts/ops-pod/templates/workload.yaml:ops-mcp OPS_DEFAULT_NAMESPACE', 'required in the remote verification environment', 'remote in-pod negative authorization control');
contracts.get('OPS_DEFAULT_NAMESPACE:scripts/deploy-ops-pod.sh').evidence = [{ path: 'scripts/deploy-ops-pod.sh', line: 48, endLine: 53 }];
add('scripts/docs-api-documentation-role-custody.mjs', 'KUBECLAW_DOCS_GO_BINARY', 'Selects the Go executable used to verify native documentation adapter custody.', 'An executable command or path accepted by spawnSync. No executable identity validation is present at this selector.', 'Absent uses go; Python sources instead use python3 and bypass this selector.', 'Empty is retained by ?? and spawn fails.', 'A missing executable, failed Go adapter, malformed receipt or receipt mismatch rejects documentation-tool qualification.', 'Defined process value wins for Go sources; Python source qualification fixes python3.', 'Changes the local compiler/runner used for the finite documentation adapter check; it does not grant an output-role exemption.', 'Qualification stops with DOCUMENTATION_TOOL_OUTPUT_ROLE_UNQUALIFIED on child or custody failure.', 'scripts/docs-api-documentation-role-custody.mjs:native Go custody runner', 'optional', 'development documentation-tool executable selection');
contracts.get('KUBECLAW_DOCS_GO_BINARY:scripts/docs-api-documentation-role-custody.mjs').evidence = [{ path: 'scripts/docs-api-documentation-role-custody.mjs', line: 5162, endLine: 5172 }];
const nativeHarnessAuthority = 'scripts/docs-api-documentation-role-custody.mjs';
add(nativeHarnessAuthority, 'NODE_OPTIONS', 'Rejects an active Node option-loader override before qualifying the reviewed native npm/POSIX test acquisition.', 'Only absent or empty passes the process guard; npm node-options configuration is separately required to be null.', 'An absent value passes this guard, not the separate npm configuration check.', 'Empty passes this guard.', 'Any non-empty text rejects acquisition, including whitespace.', 'The process guard runs before executable and npm configuration checks; no alternative option source overrides its rejection.', 'Prevents the reviewed native caller acquisition from silently using additional Node loader/options authority.', 'Qualification stops with DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED.', `${nativeHarnessAuthority}:assertNativeNpmPosixAuthority`, 'must be absent or empty for native harness qualification', 'development native caller authority');
contracts.get(`NODE_OPTIONS:${nativeHarnessAuthority}`).evidence = [{ path: nativeHarnessAuthority, line: 24837, endLine: 24849 }];
add(nativeHarnessAuthority, 'PATH', 'Selects the first existing regular npm and Node executable candidates used to verify native test acquisition authority.', 'Directories separated by the host path delimiter. The first regular npm candidate must resolve to /usr/local/lib/node_modules/npm/bin/npm-cli.js; the Node candidate must resolve to process.execPath.', 'Absent becomes an empty path segment resolved relative to the current process directory; no trusted executable fallback is supplied here.', 'Empty behaves as one relative empty directory segment; unavailable or different executable identities reject.', 'Unavailable executables or first regular candidates with different real paths reject. This guard does not prove executable behavior or version.', 'First existing regular candidates in PATH order are checked, independently of the optional npm_execpath identity; local ancestor node_modules/.bin/node overrides are separately rejected.', 'Changes which local command identities are checked and which npm executable reads the required configuration.', 'Qualification stops with DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED when identity or required configuration fails.', `${nativeHarnessAuthority}:assertNativeNpmPosixAuthority`, 'must resolve reviewed npm and current Node identities', 'development native caller authority');
contracts.get(`PATH:${nativeHarnessAuthority}`).evidence = [{ path: nativeHarnessAuthority, line: 24839, endLine: 24849 }];
add(nativeHarnessAuthority, 'npm_execpath', 'Checks an optional active npm caller executable identity independently of PATH acquisition.', 'A non-empty existing filesystem path whose real path equals /usr/local/lib/node_modules/npm/bin/npm-cli.js. No file-type or executable-mode check is applied to this optional selector.', 'Absent bypasses this optional check; PATH and npm configuration checks remain mandatory.', 'Empty bypasses this optional check because the reader uses a truthiness guard.', 'A non-empty missing path or different real path rejects; filesystem errors can also stop qualification.', 'This optional identity check supplements, and cannot replace, PATH npm/Node and POSIX/configuration authority checks.', 'Rejects an active npm caller identity outside the narrowly reviewed command location.', 'Qualification stops with DOCUMENTATION_TOOL_NODE_ENTRY_CUSTODY_UNQUALIFIED or a filesystem error.', `${nativeHarnessAuthority}:assertNativeNpmPosixAuthority`, 'optional active npm caller identity', 'development native caller authority');
contracts.get(`npm_execpath:${nativeHarnessAuthority}`).evidence = [{ path: nativeHarnessAuthority, line: 24842, endLine: 24842 }];
add('scripts/docs-api-output-discovery.mjs', 'GOWORK', 'Checks the finite Go workspace-selection boundary and includes the effective selection in the discovery cache key.', 'Absent, empty, auto or off passes this JavaScript guard. The child Go role adapter separately rejects non-empty values other than off.', 'Absent uses auto in the cache key and leaves external Go workspace lookup unchanged.', 'Empty passes this guard and is retained as an empty cache-key selection.', 'Other non-empty text fails API_PRODUCT_GO_MODULE_AUTHORITY_UNQUALIFIED before adapter execution; auto can fail the stricter child import-authority guard.', 'The inherited process value is the guard/cache input and is inherited by spawned Go commands. Cache reuse requires the same selected key and dependency hashes.', 'Changes workspace selection available to Go and the local cache identity; it does not authorize arbitrary module authority.', 'The JavaScript guard or child role qualification rejects unsupported workspace authority.', 'scripts/docs-api-output-discovery.mjs:discoverGoApiOutputs', 'optional', 'development Go discovery workspace guard');
contracts.get('GOWORK:scripts/docs-api-output-discovery.mjs').evidence = [{ path: 'scripts/docs-api-output-discovery.mjs', line: 1315, endLine: 1320 }];
for (const name of ['GOWORK', 'GOFLAGS']) {
  const source = 'scripts/docs-api-go-output-role-adapter.go';
  add(source, name, `Guards Go import authority against an explicit ${name} selection outside the finite reviewed recipe.`, name === 'GOWORK' ? 'Absent, empty or exact off. Any other non-empty value adds an authority issue; an absolute selected workspace path is also recorded by moduleAuthorityPaths.' : 'Absent or empty only; any non-empty flag text adds an authority issue.', 'Absent adds no explicit-selection authority issue.', 'Empty adds no explicit-selection authority issue.', 'Unsupported non-empty input adds an authority issue and prevents import authority qualification rather than silently changing approved module interpretation.', 'The adapter process environment owns this guard; it does not override selected module/source receipts.', 'Changes whether the adapter can qualify imported module authority; external compiler flag interpretation is not documented here.', 'The adapter reports explicit selection outside the reviewed finite authority; the consuming JavaScript gate rejects an unqualified role.', `${source}:importAuthority`, 'optional; supported finite selection required', 'development Go import-authority guard');
  contracts.get(`${name}:${source}`).evidence = [{ path: source, line: 1206, endLine: 1223 }];
}
const studio = 'skills/prism/server/studio-config.ts';
add(studio, 'PRISM_CONTROL_URL', 'Selects the Control base URL used by Studio requests.', 'A URL accepted by the JavaScript URL constructor. This loader does not restrict its protocol.', 'An absent value uses http://prism-control:8080.', 'An explicit empty string is retained by ?? and the URL constructor rejects it.', 'Malformed URLs fail config loading; unsupported fetch protocols or unreachable services fail later requests.', 'The process value wins when defined; otherwise the standalone cluster URL applies.', 'Changes the Control service that receives Studio requests.', 'Studio fails config loading for an invalid URL or returns a Control request failure later.', 'charts/prism/values.yaml:studio; charts/prism/templates/workloads.yaml:PRISM_CONTROL_URL');
add(studio, 'PRISM_CONTROL_TIMEOUT_MS', 'Limits each Studio request to Control.', 'A safe integer from 1 through 2147483647 milliseconds, parsed with Number.', 'An absent value uses 30000 milliseconds.', 'Empty is retained by ??, becomes zero and is rejected.', 'Invalid numbers return PRISM_STUDIO_CONTROL_TIMEOUT_INVALID.', processOnly, 'Changes how long Studio waits for Control before aborting.', 'Studio stops at config loading or a request aborts when its deadline expires.', 'charts/prism/values.yaml:studio.controlTimeoutMs');
add(studio, 'STUDIO_ROOT', 'Selects the directory from which Studio serves built assets.', 'A filesystem path. This loader does not check existence or canonical form.', 'An absent value selects ../dist-studio relative to this module.', 'An explicit empty string is retained; later filesystem access determines its effect.', 'Missing files or inaccessible paths fail asset requests rather than config loading.', processOnly, 'Changes the asset directory and therefore the served Studio build.', 'Static asset requests fail when the selected files cannot be read.', 'charts/prism/templates/workloads.yaml:studio process environment');
add(studio, 'PRISM_INGRESS_SECRET', 'Supplies the shared secret sent by Studio in the x-prism-ingress-secret header to Control.', 'A string. This loader does not enforce a minimum length.', 'An absent value uses an empty string.', 'An explicit empty value is retained by this loader; proxied requests then fail with HTTP 503 PRISM_STUDIO_PROXY_NOT_CONFIGURED before reaching Control.', 'Control compares the received header directly with its configured secret; different bytes fail ingress authentication.', processOnly, 'Changing the secret requires matching Control and Studio bindings.', 'Studio refuses proxying with an empty secret; Control denies ingress requests with a different header value.', 'charts/prism/values.yaml:secrets.runtime; charts/prism/templates/workloads.yaml:PRISM_INGRESS_SECRET');
for (const [source, extra] of [['skills/prism/server/agent-bridge.mjs', 'The bridge uses a 30000-millisecond timeout for dispatch and 10000 milliseconds for job reads.'], ['skills/prism/openclaw-plugin/index.mjs', 'The OpenClaw plugin does not add an explicit fetch timeout in post().']]) {
  add(source, 'PRISM_CONTROL_URL', 'Selects the Control base URL for Prism agent requests.', 'A base URL usable by new URL(path, base) and fetch. No startup protocol validation is present.', 'Absent or empty uses http://127.0.0.1:28080.', 'The || operator selects the loopback fallback for an empty string.', 'Malformed or unusable URLs fail when a request is made.', source.includes('openclaw-plugin') ? 'A truthy context.config.controlUrl wins, then a truthy process value, then the loopback URL.' : 'A truthy process value wins; otherwise the loopback URL applies.', `Redirects agent requests to the selected Control service. ${extra}`, 'Bridge requests report errors and runner failures are logged; OpenClaw tool requests reject on URL, transport or non-success response errors.', source.includes('openclaw-plugin') ? 'skills/prism/openclaw-plugin/openclaw.plugin.json:configSchema.controlUrl' : 'charts/prism/values.yaml:agentBridge');
}
const control = 'skills/prism/server/control-config.ts';
for (const name of ['PRISM_SESSION_SECRET', 'PRISM_INGRESS_SECRET', 'PRISM_INGESTION_SECRET', 'PRISM_DISPATCH_SECRET']) {
  const conditional = name === 'PRISM_DISPATCH_SECRET';
  add(control, name, `Supplies the ${name === 'PRISM_SESSION_SECRET' ? 'session authentication' : name === 'PRISM_INGRESS_SECRET' ? 'Studio ingress header authentication' : name === 'PRISM_INGESTION_SECRET' ? 'ingestion authentication' : 'incoming dispatch HMAC verification'} secret captured by Control at startup.`, 'A non-empty string; this loader does not validate entropy or trim whitespace.', conditional ? 'No secret default. With WORKER_TRUST_SPIFFE_ENABLED exactly true, Control uses an empty dispatch secret and SPIFFE trust instead.' : 'No default.', conditional ? 'Empty is rejected unless SPIFFE trust is enabled.' : 'Empty is rejected by required().', 'An absent or empty required value throws its name followed by is required; wrong non-empty bytes fail authentication later.', conditional ? 'SPIFFE trust mode wins over this environment secret; otherwise the process value is required.' : processOnly, 'Changes the authentication authority; rotate the matching producers and consumers together.', 'Control configuration stops or later requests fail authentication.', 'charts/prism/values.yaml:secrets.runtime; charts/prism/templates/workloads.yaml', conditional ? 'required without SPIFFE trust' : 'required');
}
add(control, 'PRISM_PIPELINE_PREFERENCE_SUBJECT', 'Names the platform-authorized user for pipeline preferences.', 'Exactly user- followed by 24 lowercase hexadecimal digits.', 'Absent leaves the configured subject undefined.', 'An explicit empty string fails validation.', 'Invalid syntax throws invalid platform pipeline preference subject; a different requested subject is denied.', processOnly, 'Changes which subject can request pipeline preference changes.', 'Control config loading fails or a preference request is denied.', 'charts/prism/values.yaml:control.pipelinePreferenceSubject');
const bootstrap = 'skills/prism/config/database-bootstrap.ts';
for (const name of ['ADMIN_DATABASE_URL', 'PRISM_MIGRATOR_PASSWORD', 'PRISM_RUNTIME_PASSWORD', 'PRISM_READONLY_PASSWORD']) add(bootstrap, name,
  name === 'ADMIN_DATABASE_URL' ? 'Supplies the administrator connection string used to bootstrap database roles.' : `Supplies the initial ${name.split('_')[1].toLowerCase()} database role password.`,
  'A non-empty string; this config function does not validate URL syntax, password strength or whitespace.', 'No default.', 'Empty is rejected by required().', 'Missing input throws its name followed by is required; database connection or SQL rejects other unusable values later.', processOnly,
  'Changes database bootstrap authority; ordinary upgrades do not rotate existing credentials.', 'Bootstrap stops before connection setup for a missing value; connection or role creation can fail later.', 'charts/prism/values.yaml:secrets.database; charts/prism/templates/jobs.yaml', 'required for database bootstrap');
const ingestion = 'skills/prism/server/ingestion.ts';
add(ingestion, 'PRISM_INGESTION_SECRET', 'Authenticates ingestion acquisition and cleanup requests.', 'A non-empty string compared with the Bearer token using timingSafeEqual.', 'No default; ?? supplies an empty string that is then rejected.', 'Empty stops startup with PRISM_INGESTION_SECRET is required.', 'A wrong non-empty secret returns HTTP 401 on requests.', processOnly, 'Changes the shared Control-to-ingestion authentication authority.', 'The service stops for a missing secret or denies callers with mismatched credentials.', 'charts/prism/values.yaml:secrets.runtime', 'required');
add(ingestion, 'PRISM_QUARANTINE_ROOT', 'Selects the directory for acquired content awaiting corpus admission.', 'A filesystem path accepted by mkdir and later file operations; no canonical-path guard is present.', 'Absent uses /quarantine.', 'An empty string is retained by ??; mkdir fails.', 'Unwritable or unusable paths reject startup or later acquisition and cleanup.', processOnly, 'Changes where quarantined objects persist and where cleanup operates.', 'Startup directory creation or initial cleanup can fail. Acquisition write failures return HTTP 422 with an error string. DELETE cleanup or other uncaught request failures return HTTP 503 PRISM_INGESTION_IO_FAILED when a response can still be sent; interval cleanup failures are logged.', 'charts/prism/values.yaml:ingestion.quarantine');
add(ingestion, 'PRISM_QUARANTINE_TTL_MS', 'Sets the age after which quarantine cleanup can remove acquired objects.', 'A safe integer parsed with Number, then clamped to 60000 through 86400000 milliseconds.', 'Absent uses 3600000 milliseconds.', 'Empty is retained, becomes zero and is clamped to 60000 milliseconds.', 'A non-safe integer throws PRISM_QUARANTINE_TTL_MS must be a finite integer. Negative safe integers are clamped, not rejected.', processOnly, 'Changes object retention; cleanup runs at intervals no larger than 60000 milliseconds.', 'Invalid numbers stop startup; cleanup I/O failures are logged.', 'charts/prism/values.yaml:ingestion.quarantine.ttlMs');
const observer = 'skills/common/plugins/openclaw-agent-observer/src/config.ts';
const observerSettings = {
  OPENCLAW_AGENT_OBSERVER_ENABLED: ['enabled', 'boolean-required'], REDIS_HOST: ['redisHost', 'string'], REDIS_PORT: ['redisPort', 'port'], REDIS_USERNAME: ['redisUsername', 'string'], REDIS_PASSWORD: ['redisPassword', 'string'], REDIS_TLS: ['redisTls', 'boolean'], REDIS_NETWORK_ISOLATION: ['redisNetworkIsolation', 'raw'],
  OPENCLAW_AGENT_OBSERVER_MAX_EVENT_BYTES: ['maxEventBytes', 'event'], OPENCLAW_AGENT_OBSERVER_MAX_QUEUE_PER_STREAM: ['maxQueuePerStream', 'positive'], OPENCLAW_AGENT_OBSERVER_REDIS_COMMAND_TIMEOUT_MS: ['redisCommandTimeoutMs', 'positive'], OPENCLAW_AGENT_OBSERVER_STREAM_MAXLEN: ['streamMaxLen', 'positive'], OPENCLAW_AGENT_OBSERVER_DEADLETTER_MAXLEN: ['deadLetterMaxLen', 'positive'], OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_MAX_ATTEMPTS: ['controlWriteMaxAttempts', 'positive'], OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_BASE_MS: ['controlWriteRetryBaseMs', 'positive'], OPENCLAW_AGENT_OBSERVER_CONTROL_WRITE_RETRY_MAX_MS: ['controlWriteRetryMaxMs', 'positive'], OPENCLAW_AGENT_OBSERVER_HOOK_PRIORITY: ['hookPriority', 'integer'], OPENCLAW_AGENT_OBSERVER_HOOK_TIMEOUT_MS: ['hookTimeoutMs', 'positive'],
};
for (const [name, [setting, kind]] of Object.entries(observerSettings)) {
  const required = ['positive', 'integer', 'boolean-required', 'event'].includes(kind);
  const form = kind === 'string' ? 'A string converted with String and trimmed; blank becomes undefined.' : kind === 'port' ? 'A Number-convertible integer from 1 through 65535, or an absent value.' : kind === 'raw' ? 'The supplied value is retained without normalization here; Redis activation validates the security policy.' : kind.startsWith('boolean') ? 'A boolean, or text normalized with trim and lowercase. Only 1, true, yes, on and enabled become true; other non-empty text becomes false.' : kind === 'event' ? 'A positive integer within the ingress contract maximum; see normalizeAgentObservabilityMaxEventBytes.' : `A Number-convertible ${kind === 'integer' ? 'integer, including zero and negative values' : 'positive integer'}.`;
  add(observer, name, `Supplies ${setting} to the OpenClaw agent observer when its plugin configuration omits that key.`, form,
    kind === 'boolean' ? 'Uses false when neither source supplies a value.' : required ? 'No fallback; a required effective value must be supplied.' : 'No value default; an omitted value remains undefined.',
    kind === 'string' ? 'Empty or whitespace-only becomes undefined.' : kind === 'boolean' ? 'Empty uses false; whitespace-only non-empty text also becomes false.' : kind === 'port' ? 'Empty becomes undefined; whitespace-only text becomes zero and is rejected.' : kind === 'raw' ? 'Empty is passed unchanged to the Redis security-policy reader.' : 'Empty is rejected. Whitespace-only numeric text becomes zero: hookPriority accepts it; positive values reject it.',
    kind.startsWith('boolean') ? 'Unknown non-empty text becomes false; it is not rejected as an invalid boolean token.' : kind === 'string' ? 'This helper does not validate host, username or password syntax; connection checks own later rejection.' : kind === 'raw' ? 'This helper does not validate it; Redis activation can reject a missing plaintext isolation declaration.' : 'Invalid numeric bounds throw a field-specific configuration error.',
    `An explicitly defined plugin config.${setting} wins, including null or empty values. Otherwise env.${name} applies; normalization then runs.`,
    `Changes observer ${setting}; reload the observer to apply it. Redis connection and event queue behavior depend on the full configuration.`, 'Required-value or numeric errors stop observer config resolution; Redis policy and connection failures can occur during activation.',
    `skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json:configSchema.${setting}`, required ? 'required effective plugin or environment value' : 'optional');
}

export function runtimeConsumerContract(name, source) { return contracts.get(`${name}:${source}`) ?? null; }
export function assertRuntimeConsumerContract(contract, identity) {
  for (const field of ['purpose', 'acceptedForm', 'defaultBehavior', 'emptyBehavior', 'invalidBehavior', 'precedence', 'impact', 'failure', 'owningSurface', 'required', 'owner', 'boundary']) assert.equal(typeof contract?.[field], 'string', `${identity}: missing consumer contract ${field}`);
}

const chart = 'charts/kubeclaw/templates/deployment.yaml';
const healthFailure = 'The health command records the failed check and exits 1. A startup failure also writes a failed startup marker; readiness failure removes the pod from ready endpoints.';
function health(name, setting, purpose, form, fallback, empty, invalid, precedence = processOnly) {
  add(chart, name, purpose, form, fallback, empty, invalid, precedence, 'Changes the selected health check or its evidence when the generated health command runs.', healthFailure, `charts/kubeclaw/values.yaml:${setting}`);
}
for (const [name, setting, fallback, scope] of [
  ['KUBECLAW_HEALTH_CHECK_GATEWAY', 'probes.dependencies.gateway.enabled', true, 'startup, readiness and liveness'], ['KUBECLAW_HEALTH_CHECK_REDIS', 'probes.dependencies.redis.enabled', true, 'startup and readiness'], ['KUBECLAW_HEALTH_CHECK_REDIS_STREAM', 'probes.dependencies.redisStream.enabled', true, 'startup'], ['KUBECLAW_HEALTH_CHECK_LITELLM', 'probes.dependencies.litellm.enabled', false, 'startup'], ['KUBECLAW_HEALTH_CHECK_REGISTRIES', 'probes.dependencies.registries.enabled', false, 'startup'], ['KUBECLAW_HEALTH_REQUIRE_STARTUP_MARKER', 'fixed health startup-marker binding', true, 'readiness and startup-status'], ['KUBECLAW_CODE_BUNDLE_ENABLED', 'codeBundle.enabled', false, 'startup and readiness'],
]) health(name, setting, `Enables its dependency or marker check during ${scope}.`, 'Case-insensitive 1, true, yes or on enables the check. Other non-empty text disables it; no trimming is performed.', `Absent or empty selects ${fallback}.`, `Empty selects ${fallback}.`, 'Unknown non-empty text disables the check rather than raising a boolean error.');
health('KUBECLAW_HEALTH_TIMEOUT_MS', 'probes.readiness.timeoutSeconds (multiplied by 1000)', 'Sets the internal deadline for each dependency check.', 'Text parsed with parseInt base 10. This reader has no explicit positive or finite integer guard.', 'Absent or empty uses 5000 milliseconds.', 'Empty selects 5000.', 'Invalid or negative values reach Node timer handling; checks can time out immediately. A numeric prefix is accepted.');
health('KUBECLAW_HEALTH_STARTUP_STATUS_PATH', 'fixed startup status path', 'Selects the startup JSON marker that startup writes and readiness reads.', 'A readable or writable file path; parent directories are created when writing.', 'Absent or empty uses /home/node/.openclaw/logs/startup-verification.json.', 'Empty selects the default path.', 'File, permission or JSON errors fail startup evidence or readiness.');
health('KUBECLAW_HEALTH_STARTUP_EVENT_LOG_PATH', 'fixed startup event log path', 'Selects the append-only startup verification event file.', 'A writable file path; parent directories are created.', 'Absent or empty uses /home/node/.openclaw/logs/startup-verification.jsonl.', 'Empty selects the default path.', 'Filesystem errors fail the startup evidence write.');
health('KUBECLAW_HEALTH_REDIS_STREAM', 'probes.dependencies.redisStream.stream', 'Names the Redis Stream to which the startup stream check writes a health event.', 'A Redis key accepted by XADD; no local syntax validation.', 'Absent or empty uses kubeclaw:health:<effective agent>.', 'Empty selects the agent-scoped key.', 'Redis errors or a missing returned entry ID fail the stream check.');
health('KUBECLAW_HEALTH_REDIS_STREAM_MAX_LEN', 'probes.dependencies.redisStream.maxLen', 'Sets the approximate maximum length passed to the health XADD command.', 'Text parsed with parseInt base 10 and sent to Redis as MAXLEN ~; no local bounds validation.', 'Absent or empty uses 1000.', 'Empty selects 1000.', 'Malformed or negative effective lengths can be rejected by Redis and fail startup.');
health('KUBECLAW_HEALTH_REGISTRIES', 'probes.dependencies.registries.endpoints', 'Lists OCI registry endpoints checked during startup.', 'Comma-separated endpoints, trimmed with blank entries dropped; entries not starting with http receive an http:// prefix. The command requests /v2/ and accepts success or 401.', 'No endpoint default; an empty list fails when the registry check is enabled.', 'Empty yields no endpoints and fails an enabled registry check.', 'Malformed URL, unavailable service or other HTTP error fails the check.');
health('OPENCLAW_GATEWAY_URL', 'gateway.url', 'Selects the Gateway /health endpoint.', 'A fetch-compatible base URL. The health helper trims it and removes trailing /tools/invoke, /v1 or slash.', 'Absent or empty uses http://127.0.0.1:<GATEWAY_PORT or 18789>.', 'Empty selects the loopback URL.', 'URL, timeout or non-success response errors fail the Gateway check.', 'A truthy URL wins, then a truthy GATEWAY_PORT in the loopback URL, then port 18789.');
health('GATEWAY_PORT', 'gateway.port', 'Supplies the fallback loopback Gateway port when OPENCLAW_GATEWAY_URL is empty.', 'A URL port; the health reader does not validate it before fetch.', 'Absent or empty uses 18789.', 'Empty selects 18789.', 'A malformed effective URL or unavailable listener fails the Gateway check.');
for (const [name, setting, purpose] of [['OPENCLAW_GATEWAY_TOKEN', 'auth.existingSecret/auth.token', 'Gateway'], ['LITELLM_API_KEY', 'litellm.existingSecret/litellm.apiKey', 'LiteLLM']]) health(name, setting, `Adds a Bearer authorization header to the ${purpose} health request.`, 'A secret string; this reader does not trim or assess its strength.', 'Absent or empty sends no authorization header.', 'Empty omits the header.', 'An invalid header or rejected credential fails the HTTP check.');
health('LITELLM_URL', 'litellm.endpoint (trailing /v1 removed)', 'Selects the LiteLLM /health endpoint.', 'A fetch-compatible base URL, trimmed with trailing /tools/invoke, /v1 or slash removed.', 'No effective URL default in this reader.', 'Empty creates /health, which Node fetch rejects as a relative URL.', 'Invalid URL, timeout or non-success status fails an enabled LiteLLM check.');
for (const [name, setting, form, fallback, empty, invalid] of [
  ['REDIS_HOST', 'redis.host', 'A Redis host accepted by ioredis.', 'No default; required when a Redis check runs.', 'Empty throws REDIS_HOST is required.', 'DNS, connection or Redis policy errors fail the check.'],
  ['REDIS_PORT', 'redis.port', 'Text parsed with parseInt base 10; this reader has no local integer/range guard.', 'No reader default; the chart defaults its injected value to 6379.', 'Empty throws REDIS_PORT is required.', 'Bad ports or unavailable connections fail ioredis connection setup.'],
  ['REDIS_USERNAME', 'extraEnv Redis username binding', 'A username string passed without trimming.', 'Absent or empty is passed as undefined.', 'Empty omits the username.', 'Wrong credentials fail authentication.'],
  ['REDIS_PASSWORD', 'redis.secretName/redis.secretKey', 'A secret string passed without trimming.', 'Absent or empty is passed as undefined.', 'Empty omits the password.', 'Wrong or missing credentials fail an authenticated Redis connection.'],
]) health(name, setting, `Supplies ${name.toLowerCase().replaceAll('_', ' ')} to the health command Redis connection.`, form, fallback, empty, invalid);
add(chart, 'AGENT_NAME', 'Labels health evidence and selects bundle-role validation and Git author labels.', 'A string; no syntax guard in these embedded readers.', 'Health uses unknown when absent or empty. Init shell uses unknown for the Git label; bundle role validation uses the exact injected value.', 'Empty selects the health/Git fallback but cannot match a non-empty bundle role.', 'A bundle role mismatch stops init or fails health.', processOnly, 'Changes role-bound bundle checks, health Stream names and evidence labels.', 'Wrong bundle role fails init or startup; label differences alone do not fail health.', 'charts/kubeclaw/values.yaml:agentRole');
add(chart, 'AGENT_ROLE', 'Selects the managed Buster observer or Prism OpenClaw plugin during state migration.', 'Exactly buster or prism enables the corresponding plugin; other values retain only the common allowlist.', 'No reader default; the chart uses default for an empty agentRole.', 'Empty selects neither role-specific plugin in the embedded reader.', 'There is no local token validation; a wrong role can remove the required plugin configuration.', processOnly, 'Changes the managed OpenClaw plugin allowlist and removes other role-specific entries.', 'The runtime can start without the required role plugin; later role operations fail.', 'charts/kubeclaw/values.yaml:agentRole');
health('KUBECLAW_CONTAINER_ROLE', 'fixed agent container-role binding', 'Labels startup health evidence with the receiving container role.', 'An arbitrary string; no validation.', 'Absent or empty uses agent.', 'Empty uses agent.', 'This label alone does not cause rejection.');
health('HOSTNAME', 'Kubernetes-provided pod hostname', 'Adds the pod hostname to a health Redis Stream event.', 'The container hostname string supplied by Kubernetes.', 'Absent or empty writes an empty pod field.', 'Empty is written as an empty field.', 'No local validation; incorrect labels limit correlation.');
health('SWARM_CONFIG', 'fixed runtime swarm-config mount', 'Selects the swarm configuration file required by startup and readiness.', 'A path to an existing regular file.', 'No path fallback in this check; the chart injects /home/node/.openclaw/swarm.config.json.', 'Empty fails statSync.', 'A missing path or non-file fails the runtime swarm-config check.');
for (const [name, setting, fallback, purpose] of [
  ['KUBECLAW_CODE_BUNDLE_MANIFEST', 'fixed runtime code-bundle manifest', '/runtime-config/code-bundle-manifest.json', 'Selects the JSON manifest read when code-bundle health checking is enabled.'],
  ['KUBECLAW_CODE_BUNDLE_AGENT', 'agentRole', '<effective agent>', 'Selects the expected role in the installed bundle manifest.'],
  ['KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT', 'codeBundle.expectedCommit', '<empty>', 'Pins the expected commit in the installed manifest when non-empty after trimming.'],
  ['KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION', 'codeBundle.contractVersion', '<empty>', 'Pins the expected contract version when non-empty after trimming.'],
]) health(name, setting, purpose, 'A string. Commit and contract values are trimmed; the manifest path must identify a readable JSON file.', `Absent or empty selects ${fallback}.`, `Empty selects ${fallback}; empty commit or contract skips that comparison.`, 'A missing or invalid manifest, role mismatch or configured commit/contract mismatch fails the check.');
add(chart, 'KUBECLAW_DRAIN_FILE', 'Selects the marker created before shutdown and tested by readiness.', 'A filesystem path; parent directories are created by lifecycle hooks.', 'Absent or empty uses /tmp/kubeclaw-draining.', 'Empty selects the default path in both shell and health readers.', 'Unwritable paths fail marker creation; an existing marker fails readiness.', processOnly, 'Changes the shared shutdown/readiness marker location.', 'Readiness reports container is draining while the marker exists.', 'charts/kubeclaw/values.yaml:shutdown.drainFile');
add(chart, 'KUBECLAW_PRESTOP_DRAIN_SECONDS', 'Delays termination after creating the drain marker.', 'A duration accepted by the shell sleep command; no local bounds check.', 'Absent or empty uses 5 seconds.', 'The shell :- operator selects 5.', 'sleep rejects malformed durations and the hook fails.', processOnly, 'Changes the interval allowed for endpoint removal before termination.', 'The preStop hook can fail or run longer than the pod grace period.', 'charts/kubeclaw/values.yaml:shutdown.preStopDrainSeconds');
for (const [name, setting, purpose, fallback, empty, invalid] of [
  ['CODE_BUNDLE_ENABLED', 'codeBundle.enabled', 'Enables the init container archive download and extraction.', 'The chart injects false by default.', 'Empty disables the shell branch.', 'Only exact true enables it; other values disable it.'],
  ['CODE_BUNDLE_ARCHIVE_URL', 'codeBundle.archiveUrl', 'Selects the archive downloaded by the init container.', 'No URL default.', 'Empty is rejected when bundles are enabled.', 'Failed fetch, release lookup or asset lookup stops init.'],
  ['CODE_BUNDLE_ARCHIVE_PATH', 'fixed /tmp/code-bundle/bundle.tgz', 'Selects the output file for the archive downloader.', 'The chart fixes /tmp/code-bundle/bundle.tgz.', 'Empty fails file stream creation.', 'Filesystem errors fail download.'],
  ['CODE_BUNDLE_AUTH_TOKEN', 'codeBundle.auth.existingSecret/existingSecretKey', 'Authenticates the archive download or GitHub release asset lookup.', 'Absent or empty uses no authentication header.', 'Empty selects anonymous download.', 'A wrong token causes HTTP authorization or asset lookup failure.'],
  ['CODE_BUNDLE_SHA256', 'codeBundle.sha256', 'Checks the downloaded archive digest when non-empty.', 'Empty skips the optional digest check.', 'Empty skips sha256sum validation.', 'Malformed or mismatched digests stop init.'],
  ['CODE_BUNDLE_EXPECTED_COMMIT', 'codeBundle.expectedCommit', 'Pins the exact commit required by the extracted bundle manifest.', 'Absent or empty skips the optional commit comparison.', 'Empty or whitespace-only skips the commit comparison.', 'A non-empty mismatched commit stops init.'],
  ['CODE_BUNDLE_CONTRACT_VERSION', 'codeBundle.contractVersion', 'Pins the exact package contract required by the bundle manifest.', 'The chart injects v2 by default.', 'Empty or whitespace-only skips the contract-version comparison.', 'A non-empty mismatched contract stops init.'],
  ['BUNDLE_TMP_ROOT', 'fixed internal shell assignment /tmp/code-bundle', 'Supplies the extraction directory to the child bundle validator.', 'The init shell fixes /tmp/code-bundle and exports it for this command.', 'An empty injected value is not produced; if forced, path construction/lookup fails.', 'Missing extracted directories or manifest errors stop init.'],
  ['OVERRIDE_WORKSPACE', 'workspace.overrideOnRestart', 'Permits init setup to replace existing workspace files.', 'The chart injects false.', 'Empty does not equal true and preserves existing workspace.', 'Only exact true enables replacement.'],
  ['OVERRIDE_SWARM_CONFIG', 'swarmConfig.overrideOnRestart', 'Permits init setup to replace existing .semgrep.yml and eslint.config.mjs files. The chart swarm.config.json is copied whenever its source file exists, regardless of this flag.', 'The chart injects false.', 'Empty preserves the existing .semgrep.yml and eslint.config.mjs files; it does not prevent replacement of swarm.config.json.', 'Only exact true enables replacement.'],
  ['DISCORD_WEBHOOK', 'discordWebhook.secretName/secretKey', 'Adds the configured webhook URL to the runtime swarm configuration.', 'Absent adds no runtime webhook. Init removes any legacy discord_webhook_url from the persisted swarm source before runtime projection.', 'Empty adds no runtime webhook; a legacy persisted webhook value is not retained.', 'No URL validation here; JSON/file errors stop init and bad webhook URLs fail delivery later.'],
]) add(chart, name, purpose, 'A string interpreted by the linked init script or child validator.', fallback, empty, invalid, name === 'BUNDLE_TMP_ROOT' ? 'The fixed command-local shell assignment wins; inherited operator values do not select this directory.' : processOnly, 'Changes initialization output when the init container next runs.', name === 'OVERRIDE_SWARM_CONFIG' ? 'Initialization failure blocks pod startup. A disabled override preserves existing Semgrep and ESLint files, but not the chart-supplied swarm JSON.' : name === 'DISCORD_WEBHOOK' ? 'Initialization errors block pod startup; absent or empty input leaves the runtime projection without a webhook.' : 'Initialization failure blocks pod startup; workspace replacement depends on its own override.', `charts/kubeclaw/values.yaml:${setting}`);

const opsConfig = 'tools/ops-mcp/src/config.mjs';
add(opsConfig, 'OPS_DEFAULT_NAMESPACE', 'Selects the default Ops MCP namespace and the namespace that must be included in its allowed list.', 'A DNS-label namespace matching `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`.', 'Absent uses kubeclaw.', 'Empty is retained by ?? and rejected by allowedNamespaces.', 'Invalid names or an allowed list omitting this namespace throw OPS_ALLOWED_NAMESPACES must contain valid, explicit namespaces including OPS_DEFAULT_NAMESPACE.', processOnly, 'Changes the default namespace and the minimum required namespace access list.', 'Ops MCP config loading fails when its namespace list is invalid.', 'charts/ops-pod/values.yaml:defaultNamespace');
add('ops/pod/verify.py', 'OPS_DEFAULT_NAMESPACE', 'Selects the namespace used for the actual namespace_overview verification request.', 'A namespace accepted by the running MCP allowlist; this script does not locally validate it.', 'No default; direct os.environ indexing requires the key.', 'Empty is passed to MCP and fails its namespace check.', 'A missing key raises KeyError; denied or unavailable namespace requests stop verification.', processOnly, 'Changes which namespace the in-pod read check verifies.', 'The verification command exits without its PASS line.', 'charts/ops-pod/values.yaml:defaultNamespace', 'required for verification');
add('ops/pod/verify.py', 'OPS_EXEC_NAMESPACES', 'Selects namespaces in which in-pod verification checks Codex pods/exec authorization.', 'Comma-separated names; blank entries are discarded, whitespace is not trimmed.', 'Absent uses an empty list.', 'Empty requires that the ServiceAccount token file is absent and skips exec permission checks.', 'A token mount/list mismatch fails an assertion; kubectl auth can-i failure stops verification.', processOnly, 'Changes the permission-check scope without executing commands in target pods.', 'The verification command stops at the mount assertion or failed authorization check.', 'charts/ops-pod/values.yaml:rbac.execNamespaces');
const opsBootstrap = 'ops/pod/bootstrap.py';
add(opsBootstrap, 'OPS_NAMESPACE', 'Selects the namespace in which Ops discovery and credential setup operate.', 'A namespace accepted by kubectl; this helper does not locally validate it.', 'Absent uses kubeclaw-ops.', 'An explicit empty string is retained by os.environ.get; it does not select the fallback.', 'kubectl rejects invalid names or unavailable resources; a wrong valid name targets a different namespace.', 'An inherited value wins when present, including empty; deploy-ops-pod.sh exports its resolved namespace before this helper.', 'Moves Ops Secret creation, discovery and credential copy destination.', 'kubectl errors stop bootstrap.', 'scripts/deploy-ops-pod.sh:OPS_NAMESPACE');
add(opsBootstrap, 'OPS_READ_NAMESPACES', 'Lists candidate namespaces added to discovered Ops read RBAC.', 'Comma-separated names, trimmed with blank entries skipped; only existing namespaces are retained.', 'Absent uses kubeclaw,argocd,kube-system,cilium,tailscale,spire-server,spire-system.', 'Empty adds no candidates; the Ops namespace itself remains included.', 'kubectl errors stop discovery; non-existent candidates are skipped.', processOnly, 'Changes discovered RBAC read scope.', 'Discovery stops on API failures or omits absent candidates.', 'scripts/deploy-ops-pod.sh:discovery inputs');
add(opsBootstrap, 'OPS_COPY_PULL_SECRET', 'Allows bootstrap to copy ghcr-secret when the target has no copy.', 'Only exact 1 enables copying.', 'Absent uses 1.', 'Empty does not equal 1 and disables copying.', 'Every other value disables copying; enabled copying requires the source Secret.', processOnly, 'Changes whether target image-pull credentials are populated.', 'An enabled copy stops if its source Secret is absent; skipped copying can leave private image pulls unready.', 'scripts/deploy-ops-pod.sh:bootstrap credential inputs');
add(opsBootstrap, 'OPS_PULL_SECRET_SOURCE_NAMESPACE', 'Selects the source namespace for an enabled ghcr-secret copy.', 'A namespace accepted by kubectl; no local name validation.', 'Absent uses kubeclaw.', 'Empty is retained and does not select kubeclaw.', 'A missing Secret or kubectl error stops an enabled copy.', processOnly, 'Changes the source credential authority; existing target credentials are retained.', 'Bootstrap stops without a new pull credential.', 'scripts/deploy-ops-pod.sh:bootstrap credential inputs');
for (const [name, secret, key, receiver] of [
  ['OPS_GITHUB_TOKEN_FILE', 'codex-ops-github', 'token', 'the Codex container GH_TOKEN binding when githubSecret selects this Secret'],
  ['OPS_TAILSCALE_AUTHKEY_FILE', 'codex-ops-tailscale', 'authkey', 'the enabled Tailscale container TS_AUTHKEY binding when tailscale.authSecret selects this Secret'],
]) {
  add(opsBootstrap, name,
    `Selects the operator-host credential file that setup_secrets reads and applies as Opaque Secret ${secret}, stringData.${key}, in the effective OPS_NAMESPACE. The eventual consumer is ${receiver}. The discover command does not read this file.`,
    'A non-empty filesystem path, passed unchanged to pathlib.Path on the operator host; relative paths use the current working directory. read_text uses Python default text decoding, then strip removes surrounding whitespace from the content. The resulting credential must be non-empty; internal whitespace, token syntax, validity and permissions at the external service are not checked here.',
    `Absent skips the ${secret} apply. There is no default path or credential, and this omission does not delete or rotate an existing Secret.`,
    `An empty environment value skips the ${secret} apply. A non-empty path is not trimmed, even if it contains only whitespace. Empty or whitespace-only file content stops setup with ${name} contains an empty credential.`,
    'A missing, unreadable or non-file path, or a text-decoding error, stops setup through the Python exception. A non-empty but invalid credential can be applied successfully and fail only at its eventual service consumer.',
    `The inherited non-empty process value is the sole file selector. No chart value or existing Secret overrides the file content: setup_secrets applies ${secret} on every invocation with this input, without checking whether that Secret already exists. deploy-ops-pod.sh uses the same non-empty input to select its Helm feature override; that chart selection does not change the fixed bootstrap Secret name.`,
    `The path is a publishable selector; file content is confidential Secret payload, not the environment value itself. Change the path or content before rerunning secrets to apply new content. This can create or update ${secret}.${key}; bootstrap does not validate downstream authentication or refresh running consumers. The GitHub file is processed before the Tailscale file, after bearer and pull-credential setup.`,
    'Setup stops on file or kubectl failure; earlier Secret operations can already have completed and are not rolled back. kubectl failure reports a generic setup error and suppresses stderr that can contain submitted Secret data. Before retrying, check the intended context, namespace, file readability and named Secret state without displaying credential content; resolve the failed input or permissions and account for earlier updates. A successful apply does not prove service authentication.',
    `ops/pod/bootstrap.py:setup_secrets credential-file loop; scripts/deploy-ops-pod.sh:${name}`,
    'optional; a readable file with non-empty stripped content is required when the environment path is non-empty');
  contracts.get(`${name}:${opsBootstrap}`).evidence = [
    { path: opsBootstrap, line: 11, endLine: 20 },
    { path: opsBootstrap, line: 29, endLine: 31 },
    { path: opsBootstrap, line: 56, endLine: 78 },
    { path: 'scripts/deploy-ops-pod.sh', line: 4, endLine: 17 },
    { path: 'scripts/deploy-ops-pod.sh', line: 25, endLine: 34 },
    { path: 'charts/ops-pod/templates/workload.yaml', line: key === 'token' ? 59 : 124, endLine: key === 'token' ? 62 : 127 },
  ];
}
const kubeRequest = 'tools/ops-mcp/src/kubernetes.mjs';
add(kubeRequest, 'KUBERNETES_API_URL', 'Selects the Kubernetes API origin used by Ops MCP read requests.', 'An HTTPS origin with no username, password, non-root path, query or fragment.', 'Absent uses https://kubernetes.default.svc.', 'Empty is retained by ?? and new URL rejects it.', 'Invalid origins throw KUBERNETES_API_URL must be an HTTPS origin without credentials or a path; unreachable endpoints fail requests.', 'An explicitly defined createKubeRequest api option wins over this environment fallback, then the Service origin.', 'Changes the API server to which the selected token and CA are sent.', 'Transport construction or requests fail; redirects and non-success responses are rejected.', 'tools/ops-mcp/src/kubernetes.mjs:createKubeRequest options');
for (const [name, option, filename] of [['KUBERNETES_CA_FILE', 'caFile', 'ca.crt'], ['KUBERNETES_TOKEN_FILE', 'tokenFile', 'token']]) add(kubeRequest, name, `Selects the ${option === 'caFile' ? 'TLS CA' : 'Bearer token'} file read for each Kubernetes request.`, 'A readable filesystem path; token content must be one non-empty whitespace-free token and the CA must be usable by TLS.', `Absent uses /var/run/secrets/kubernetes.io/serviceaccount/${filename}.`, 'Empty is retained and reading the empty path fails.', 'Read errors, invalid token content or TLS trust failures reject the request.', `An explicitly defined createKubeRequest ${option} option wins, then this environment value, then the ServiceAccount file.`, 'Changes the request credential or TLS trust authority. Files are read for every request, so atomic rotation does not require MCP restart.', 'The request rejects without a successful Kubernetes response.', `tools/ops-mcp/src/kubernetes.mjs:createKubeRequest.${option}`);
const hubble = 'tools/ops-mcp/src/hubble.mjs';
add(hubble, 'HUBBLE_BIN', 'Selects the Hubble CLI executable used for bounded flow queries.', 'An executable path or command accepted by spawn; no path validation is present.', 'Absent uses /usr/local/bin/hubble.', 'Empty is retained by ?? and spawn fails.', 'Missing executables reject the query; CLI errors produce a partial result.', 'A defined getHubbleFlows binary option wins, then this environment value, then /usr/local/bin/hubble.', 'Changes which CLI implements the bounded read query.', 'Spawn errors reject; nonzero CLI completion marks cli_failed and partial status.', 'tools/ops-mcp/src/hubble.mjs:getHubbleFlows.binary');
add(hubble, 'HUBBLE_SERVER', 'Selects the Hubble Relay supplied to CLI --server.', 'A server address accepted by the Hubble CLI; no local validation.', 'Absent uses hubble-relay.cilium.svc.cluster.local:4245.', 'Empty is retained and passed to the CLI.', 'Invalid or unavailable relays make the CLI fail or time out.', 'A defined getHubbleFlows server option wins, then this environment value, then the cluster Relay address.', 'Changes the flow observation authority; the query retains its 12000-millisecond bound.', 'CLI failure or timeout returns partial observation rather than proof of complete history.', 'tools/ops-mcp/src/hubble.mjs:getHubbleFlows.server');
for (const source of ['skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', 'skills/buster/engine/test-gates/kubernetes-runtime-security.ts', 'skills/buster/engine/test-gates/tailscale-exposure-runtime.ts']) {
  add(source, 'KUBECONFIG', 'Passes the selected kubeconfig location to the bounded child Kubernetes command.', 'A kubeconfig path understood by kubectl; this boundary passes it unchanged.', 'No local value default; omitted values leave kubectl to its standard credentials and configuration lookup.', 'Empty is passed unchanged; kubectl defines its credential lookup behavior.', 'Missing or unusable configuration makes the child command fail.', 'The captured process value is passed into the restricted child environment; explicit command context options still apply.', 'Changes the credentials and cluster lookup available to the child command.', 'The runtime reports the child Kubernetes command failure.', `${source}:restricted child command environment`, 'optional', 'external kubectl configuration');
}
for (const source of ['skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts', 'skills/buster/engine/test-gates/kubernetes-runtime-security.ts']) add(source, 'HOME', 'Passes the home directory into the bounded Kubernetes child process.', 'A directory understood by kubectl and its credential helpers; no local validation.', 'No local default; the process value is copied.', 'Empty is copied unchanged; external command lookup owns the result.', 'Credential or configuration lookup failures fail the child command.', processOnly, 'Changes external default kubeconfig and helper lookup.', 'The child command fails and the runtime reports its error.', `${source}:restricted child command environment`, 'optional', 'external command home-directory lookup');
for (const source of ['skills/buster/engine/test-gates/tailscale-exposure-runtime.ts', 'skills/common/plugin-runtime/foundation/registry/import-audit.ts', hubble]) add(source, 'PATH', 'Passes the executable search path into a restricted child process.', 'A host executable search path; no syntax validation at this boundary.', 'No local default; the inherited process value is copied.', 'Empty is passed unchanged and prevents ordinary command-name lookup.', 'Unavailable executables or helpers fail the child operation.', processOnly, 'Changes the executables or credential helpers visible to this child.', 'The child command fails; import auditing reports REGISTRY_IMPORT_SIDE_EFFECT or REGISTRY_EXECUTOR_INVALID.', `${source}:restricted child environment`, 'optional', 'external executable lookup');
add('skills/common/plugin-runtime/foundation/registry/import-audit.ts', 'NODE_PATH', 'Passes module lookup locations to the permission-restricted Node import audit.', 'Node module search-path text; no local validation.', 'No local default.', 'Empty is passed unchanged; Node defines module resolution.', 'Unresolvable modules fail the import audit.', processOnly, 'Changes module resolution in the audit child, which retains its permission restrictions and 30000-millisecond timeout.', 'Registry import auditing throws REGISTRY_IMPORT_SIDE_EFFECT or REGISTRY_EXECUTOR_INVALID.', 'skills/common/plugin-runtime/foundation/registry/import-audit.ts:child environment', 'optional', 'external Node module lookup');
add('docker/buster-runtime-entrypoint.sh', 'HOME', 'Supplies the home directory used by Buster child configuration paths.', 'A process home directory; no syntax guard.', 'The inherited container home is required by strict shell expansion; this read has no independent fallback.', 'An empty value is retained in derived paths and can make them unusable.', 'Unset HOME stops the strict shell. Filesystem or downstream tool configuration errors stop startup or commands.', processOnly, 'Changes home-derived configuration lookup.', 'Startup or a child command fails if its files cannot be located.', 'charts/kubeclaw/templates/deployment.yaml:HOME', 'required to be set', 'external container home directory');
add('docker/buster-runtime-entrypoint.sh', 'XDG_RUNTIME_DIR', 'Selects the Buster runtime temporary directory.', 'A directory path; no local syntax guard.', 'No default when BUILDKIT_OTEL_SOCKET_PATH is absent or empty.', 'Empty is rejected by the nested XDG_RUNTIME_DIR:? guard when the OpenTelemetry socket has no explicit path.', 'Directory creation or permissions can fail later startup.', processOnly, 'Changes the runtime temporary-file location.', 'Startup fails when the effective directory cannot be prepared.', 'docker/buster-runtime-entrypoint.sh:runtime directory', 'required when BUILDKIT_OTEL_SOCKET_PATH is empty', 'container runtime directory');
add('scripts/prepare-postgresql-production-upgrade.sh', 'HOME', 'Places the private before-upgrade backup directory below the operator home.', 'A writable parent directory accepted by mktemp.', 'No script default; the inherited HOME is required by strict shell expansion.', 'Empty produces an absolute /postgresql-before-upgrade.* template and can fail or write outside the intended home.', 'Unset HOME or mktemp errors stop the script.', processOnly, 'Changes the private backup destination.', 'The command stops without a completed backup.', 'scripts/prepare-postgresql-production-upgrade.sh:operator backup directory', 'required', 'operator host home directory');
for (const name of ['POSTGRES_POSTGRES_PASSWORD_FILE', 'POSTGRESQL_POSTGRES_PASSWORD_FILE']) add('scripts/prepare-postgresql-production-upgrade.sh', name, 'Selects the mounted administrator password file inside the existing PostgreSQL container.', 'A readable file path in the remote PostgreSQL pod, not in the operator host.', 'POSTGRES_POSTGRES_PASSWORD_FILE wins when non-empty; otherwise POSTGRESQL_POSTGRES_PASSWORD_FILE, then /opt/bitnami/postgresql/secrets/postgres-password.', 'Empty selects the next source through shell :- expansion.', 'cat or database authentication errors fail the dump or inventory.', 'The remote pod environment supplies both variables; the nested fallback orders POSTGRES_POSTGRES_PASSWORD_FILE before POSTGRESQL_POSTGRES_PASSWORD_FILE.', 'Changes the remote database credential-file authority used for read-only backup and inventory.', 'The script stops with an incomplete backup or failed inventory.', 'existing PostgreSQL StatefulSet password-file mounts', 'optional', 'remote external PostgreSQL container');

const scan = 'scripts/scan-runtime-images.sh';
for (const [name, fallback, purpose] of [['TMPDIR', '/tmp', 'Selects the temporary archive directory and fallback cache parent.'], ['XDG_CACHE_HOME', '<TMPDIR or /tmp>/kubeclaw-cache', 'Selects the default parent of the pinned Trivy tool and database caches.'], ['KUBECLAW_TOOL_CACHE', '<XDG_CACHE_HOME or TMPDIR-based cache>', 'Overrides the pinned Trivy tool and database cache parent.'], ['KUBECLAW_TRIVY_REPORT_DIR', 'dist/trivy', 'Selects the directory for digest-named Trivy reports.']]) add(scan, name, purpose, 'A directory path usable by mkdir, mktemp and the scanner.', `Absent or empty selects ${fallback}.`, 'The shell :- expansion selects the next source or fallback.', 'Filesystem errors stop installation or scanning; no path syntax guard is present.', name === 'KUBECLAW_TOOL_CACHE' ? 'A non-empty tool cache wins, then non-empty XDG_CACHE_HOME, then non-empty TMPDIR or /tmp with /kubeclaw-cache appended.' : processOnly, 'Changes local tool, cache or report storage; image digests and scanner version remain pinned.', 'The command exits without a complete scan if storage cannot be prepared or reports read.', 'scripts/scan-runtime-images.sh:documented host scan inputs');
add('skills/prism/config/native-worker.ts', 'NODE_ENV', 'Enables mandatory engine content-digest validation for production native workers.', 'Only exact production enables this guard; other strings do not.', 'Absent does not enable the production-only guard.', 'Empty does not enable the guard.', 'In production, absent or malformed PRISM_ENGINE_CONTENT_DIGEST throws PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED.', processOnly, 'Changes whether startup requires a sha256 engine content identity.', 'Production startup rejects an unbound engine digest.', 'charts/prism/templates/workloads.yaml:native worker process environment');
add('skills/buster/engine/test-gates/production.ts', 'KUBECLAW_BUILD_REVISION', 'Binds the production remote worker plan to its immutable build revision.', '40 through 64 lowercase hexadecimal characters.', 'No default.', 'Empty is rejected.', 'Invalid or absent input throws BUSTER_REMOTE_WORKER_REVISION_INVALID.', processOnly, 'Changes the immutable worker revision recorded by the plan runtime.', 'Remote plan configuration stops before package loading.', 'docker/Dockerfile.buster-runtime:KUBECLAW_BUILD_REVISION', 'required');
add('scripts/bootstrap-prism-tests.sh', 'NPM_CONFIG_CACHE', 'Selects the npm cache for the isolated Prism test bootstrap.', 'A directory path accepted by npm --cache.', 'Absent or empty uses /tmp/kubeclaw-prism-npm-cache.', 'The shell :- expansion selects the fallback.', 'npm rejects inaccessible or unusable storage.', 'This process value initializes --cache for every bootstrap npm ci command.', 'Changes dependency-cache storage for the root and four Prism spike packages.', 'Bootstrap exits when dependency installation fails.', 'scripts/bootstrap-prism-tests.sh:test bootstrap input', 'optional', 'maintainer test bootstrap');
for (const [name, purpose, fallback, form, invalid] of [
  ['PRISM_CORPUS_MODULE', 'Selects an alternate corpus module for the real PostgreSQL pool integration exercise.', 'Absent or empty imports ../corpus/index.ts.', 'A module filesystem path converted with pathToFileURL.', 'Import or missing export errors stop the exercise.'],
  ['PRISM_TEST_PG_URL', 'Selects a dedicated local PostgreSQL server for the corpus pool integration exercise.', 'No default.', 'A parseable URL with hostname 127.0.0.1, localhost or [::1]; the account must be able to create and remove the exercise database.', 'Missing, empty, malformed or non-loopback URLs fail assertions; connection and SQL errors fail the exercise.'],
]) add('skills/prism/integration/corpus-pool.mts', name, purpose, form, fallback, name === 'PRISM_TEST_PG_URL' ? 'Empty fails the required assertion.' : 'Empty selects the checked-in module.', invalid, processOnly, 'Changes the exercised module or local test database authority; the exercise creates and removes one uniquely named database.', 'The integration exercise exits without its complete proof.', 'skills/prism/integration/corpus-pool.mts:integration inputs', name === 'PRISM_TEST_PG_URL' ? 'required for integration' : 'optional', 'maintainer local database integration');
add('scripts/updates/check-renovate.mjs', 'RENOVATE_PACKAGE_ROOT', 'Selects the installed Renovate package whose real replacement engine is tested.', 'A package-root path containing the expected Renovate modules.', 'Absent uses /usr/local/renovate.', 'Empty is retained by ?? and imports under /dist, usually failing.', 'Missing modules or incompatible exports stop the check.', processOnly, 'Changes the implementation tested against maintained version pins.', 'The maintainer check exits on import or assertion failure.', 'scripts/updates/check-renovate.mjs:package test input', 'optional', 'maintainer updater verification');
add('scripts/updates/refresh-versions.mjs', 'RENOVATE_TOKEN', 'Authenticates trusted updater requests to api.github.com.', 'An optional secret token used as a Bearer header; no local validation.', 'Absent sends unauthenticated GitHub API requests.', 'Empty sends no authentication header.', 'Wrong credentials or rate limits cause upstream request failures.', 'A truthy process token is added only for api.github.com; other URLs do not receive it.', 'Changes the trusted updater API identity and request allowance.', 'The updater fails when upstream evidence cannot be fetched or verified.', 'scripts/updates/renovate.cjs:trusted updater process', 'optional', 'trusted CI updater credential');
for (const source of ['scripts/check-monitoring.mjs', 'scripts/check-platform-services.mjs']) {
  const renderName = source.includes('monitoring') ? 'MONITORING_RENDER_DIR' : 'PLATFORM_RENDER_DIR';
  add(source, renderName, 'Selects pre-rendered manifests used by the maintainer platform check.', 'A directory containing <application>-render.yaml files.', 'Absent or empty invokes Helm rendering instead.', 'Empty selects Helm rendering.', 'Missing or invalid files fail the check; stale fixtures can produce misleading evidence and must match the selected sources.', 'A truthy render-directory value replaces live local Helm rendering.', 'Changes the manifest evidence checked; this does not deploy resources.', 'The maintainer check stops on file, YAML or assertion errors.', `${source}:render fixture input`, 'optional', 'maintainer manifest verification');
  add(source, 'HELM_BIN', 'Selects the local Helm executable for maintainer chart rendering.', 'An executable path or command accepted by execFileSync.', 'Absent uses helm.', 'Empty is retained by ?? and executable creation fails.', 'A missing executable or failed Helm template call stops the check.', `A truthy ${renderName} bypasses this reader; otherwise a defined HELM_BIN wins over helm.`, 'Changes the renderer used for source-bound manifest checks.', 'The maintainer check stops without complete render evidence.', `${source}:local renderer selection`, 'optional', 'maintainer manifest verification');
}
const verificationRoots = [
  ['scripts/docs-platform-surface-inventory.mjs', 'KUBECLAW_DOCS_SOURCE_ROOT',
    'Selects the directory from which the platform catalogue builder reads source files and, in write mode, writes its JSON and reference-page outputs.',
    'A directory path resolved relative to the current working directory.',
    'Absent uses the repository directory containing the script.',
    'Empty is retained by ??; path.resolve selects the current working directory.',
    'A missing or invalid source-revision lock stops startup. Unreadable files, invalid source data, or stale output in --check mode fail the builder.',
    'Changes the source tree and output directory of this development tool.', [[17, 32], [1142, 1147]]],
  ['scripts/docs-generate.mjs', 'KUBECLAW_DOCS_ISOLATED_MUTATION',
    'Permits a detached source directory in the reference-page generator when --allow-detached-source-root is also supplied.',
    'Only exact 1 satisfies the environment part of the detached-directory guard.',
    'Absent leaves detached-directory permission disabled.',
    'Empty leaves detached-directory permission disabled.',
    'Any other token leaves permission disabled. A --root different from the current Git worktree root is rejected unless both opt-ins are present; the value does not bypass revision validation.',
    'Changes whether this development tool accepts --root different from the current Git worktree root.', [[19, 22], [28, 43]]],
  ['scripts/docs-platform-surface-inventory.mjs', 'KUBECLAW_DOCS_ISOLATED_MUTATION',
    'Requires the platform catalogue builder to use a separate source directory for an isolated run.',
    'Only exact 1 enables the separate-directory assertion.',
    'Absent leaves the separate-directory assertion disabled.',
    'Empty leaves the separate-directory assertion disabled.',
    'Any other token leaves the assertion disabled. With exact 1, KUBECLAW_DOCS_SOURCE_ROOT must be non-empty and resolve to a directory different from the repository directory containing the script.',
    'Adds a source-directory guard to this development tool; it does not select a directory itself.', [[17, 22]]],
  ['scripts/check-operator-task-registry.mjs', 'OPERATOR_TASK_EXECUTION_ROOT',
    'Selects the package.json and shell-script tree used to trace commands for dependency-installation checks in the operator task checker.',
    'A directory path resolved relative to the current working directory, containing package.json and the referenced shell scripts.',
    'Absent uses the current working directory.',
    'Empty selects the current working directory through the truthy-value condition.',
    'An unreadable package.json or invalid JSON stops the checker. Existing referenced shell scripts are read recursively; scripts absent from this tree are skipped by that traversal.',
    'Changes which package scripts and shell files this development tool uses to inspect command dependencies.', [[163, 186]]],
  ['scripts/check-operator-task-registry.mjs', 'OPERATOR_TASK_SITE_ROOT',
    'Selects the Markdown tree scanned for cluster-command bindings and dependency-installation procedure links by the operator task checker.',
    'A readable directory tree resolved relative to the current working directory.',
    'Absent uses docs/site under the current working directory.',
    'Empty selects docs/site under the current working directory through the truthy-value condition.',
    'Directory or file read errors stop the checker. A command block without its required cluster binding or dependency-installation link fails an assertion.',
    'Changes the full Markdown tree inspected by this development tool; the operator-guide tree has its own OPERATOR_TASK_USE_ROOT setting.', [[78, 85], [162, 164], [187, 208]]],
  ['scripts/check-operator-task-registry.mjs', 'OPERATOR_TASK_USE_ROOT',
    'Selects the operator-guide Markdown tree scanned for task markers, variants, and command blocks by the operator task checker.',
    'A readable guide directory resolved relative to the current working directory, containing the required named guide files.',
    'Absent uses docs/site/use under the current working directory.',
    'Empty selects docs/site/use under the current working directory through the truthy-value condition.',
    'Directory or file read errors stop the checker. Missing or duplicate task markers, invalid command bindings, or missing required guide links fail assertions.',
    'Changes the operator guides inspected by this development tool; the task registry and canonical procedure-section references still come from the current working directory.', [[6, 17], [76, 85], [119, 159], [304, 318]]],
  ['scripts/generate-operator-task-registry.mjs', 'OPERATOR_TASK_IMPLEMENTATION_ROOT',
    'Selects the implementation tree from which the operator task inventory generator discovers project recovery error codes.',
    'A directory path resolved relative to the current working directory, containing skills/nova/project/recovery.ts and delivery-manifest.ts.',
    'Absent uses the repository directory containing the script.',
    'Empty selects the repository directory containing the script through the truthy-value condition.',
    'Unreadable recovery source files stop the generator. A difference between discovered recovery outcomes and the authored task inventory fails an assertion.',
    'Changes the recovery source files inspected by this development tool; authored input and output paths remain under the repository directory containing the script.', [[8, 13], [20, 46]]],
];
for (const [source, name, purpose, form, fallback, empty, invalid, impact, ranges] of verificationRoots) {
  add(source, name, purpose, form, fallback, empty, invalid, processOnly, impact,
    'The tool exits with an error when the stated input or consistency check fails.',
    `${source}:development tool process environment`, 'optional', 'development tool process input');
  contracts.get(`${name}:${source}`).evidence = ranges.map(([line, endLine]) => ({ path: source, line, endLine }));
}

for (const [name, expected] of [['GITHUB_ACTIONS', 'true'], ['RUNNER_ENVIRONMENT', 'github-hosted']]) add('scripts/prepare-image-build-runner.sh', name, 'Confirms that destructive image-builder host preparation runs on a disposable GitHub-hosted runner.', `Exactly ${expected}; all other text is rejected.`, 'No default; absent fails the host guard.', 'Empty fails the host guard.', 'The script rejects the host before removing host SDK directories.', processOnly, 'Controls whether disposable runner disk preparation is permitted.', 'The preparation command exits before its destructive work.', '.github/workflows/build-images.yaml:runner preparation', 'required CI host marker', 'GitHub Actions runner metadata');
for (const [name, purpose] of [['RUNNER_TEMP', 'Selects the host directory for extracted pinned Redis binaries and libraries.'], ['GITHUB_ENV', 'Selects the GitHub Actions output file to which Redis executable paths are appended.']]) add('scripts/prepare-reliability-services.sh', name, purpose, 'A writable directory for RUNNER_TEMP or writable runner environment file for GITHUB_ENV.', 'No default.', 'The shell :? guard rejects absent or empty.', 'Filesystem, Docker extraction or executable checks stop preparation.', processOnly, 'Changes the test-service host storage or exported executable paths.', 'CI preparation exits without complete test-service setup.', '.github/workflows:reliability service preparation', 'required in CI', 'GitHub Actions runner interface');
const runtimeInputs = 'scripts/updates/runtime-inputs.mjs';
for (const [name, purpose, form, fallback, empty, failure] of [
 ['GITHUB_SHA', 'Binds changed image and deployment input checks to the current source revision.', 'A 40-character lowercase hexadecimal revision used by inputDigest when comparison is needed.', 'No default.', 'Empty fails revision validation when a digest comparison runs.', 'The CI input classifier fails on revision or Git lookup errors.'],
 ['GITHUB_EVENT_PATH', 'Selects the GitHub event JSON read by input classification.', 'A readable event JSON file path.', 'No default.', 'Empty fails file reading.', 'The CI classifier stops on file or JSON errors.'],
 ['GITHUB_EVENT_NAME', 'Selects manual and pull-request branches of input classification.', 'Exact workflow_dispatch forces changed inputs; exact pull_request selects its comparison branch; other event strings use ordinary comparisons.', 'No default; absent follows ordinary comparison branches.', 'Empty follows ordinary comparison branches.', 'Invalid metadata can select the wrong branch; later missing revision evidence can stop classification.'],
 ['GITHUB_OUTPUT', 'Selects the runner file receiving image_inputs and deployment_inputs.', 'A writable file path.', 'No default.', 'Empty fails appendFileSync.', 'CI receives no complete output if file writing fails.'],
]) add(runtimeInputs, name, purpose, form, fallback, empty, failure, processOnly, 'Changes the source comparison or CI output transport; it is not a runtime operator setting.', failure, '.github/workflows/build-images.yaml:input classifier', name === 'GITHUB_EVENT_NAME' ? 'CI metadata' : 'required when classifier runs', 'GitHub Actions event and output interface');
const selectRelease = 'scripts/updates/select-runtime-deployment.mjs';
const verifyRelease = 'scripts/updates/verify-release-source.mjs';
for (const source of [selectRelease, verifyRelease]) {
 for (const name of ['GITHUB_REPOSITORY', 'GITHUB_TOKEN']) add(source, name, name === 'GITHUB_REPOSITORY' ? 'Selects the GitHub repository whose immutable release provenance is verified.' : 'Authenticates read-only GitHub release-evidence requests.', 'A non-empty repository identifier or secret GitHub token; these initial readers do not validate repository syntax or token permissions.', 'No default.', 'Empty fails the required identity guard.', 'Missing values stop before API calls; wrong identities or permissions fail HTTP or provenance checks.', processOnly, 'Changes the source evidence authority. API requests retain their 60000-millisecond timeout.', 'Release verification or selection stops without accepted provenance.', '.github/workflows:auto-promotion release evidence', 'required', 'GitHub Actions source-evidence identity');
}
for (const [source, name] of [[selectRelease, 'SOURCE_RUN_ID'], [selectRelease, 'SOURCE_RUN_ATTEMPT'], ['scripts/updates/release-images.mjs', 'SOURCE_RUN_ID'], ['scripts/updates/release-images.mjs', 'SOURCE_RUN_ATTEMPT'], ['scripts/updates/code-release.mjs', 'GITHUB_RUN_ID'], ['scripts/updates/code-release.mjs', 'GITHUB_RUN_ATTEMPT']]) add(source, name, 'Binds the release receipt to its verified source workflow run or retry attempt.', source === selectRelease ? 'A string matching ^[1-9][0-9]*$; receipt and API identity checks then bind its numeric value.' : 'A Number-convertible positive safe integer checked by receipt validation.', 'No default.', 'Empty or absent fails validation.', 'Invalid input rejects the receipt or returns SOURCE_RUN_REQUIRED before selection.', processOnly, 'Changes the immutable run identity that must agree with the release provenance.', 'Receipt production or selection stops without accepted source-run evidence.', '.github/workflows:verified source workflow inputs', 'required', 'CI release receipt identity');
add(selectRelease, 'GITHUB_OUTPUT', 'Writes selected deployment status and directory to the GitHub Actions output file.', 'A writable file path.', 'No default.', 'Empty fails appendFileSync when selection completes.', 'Filesystem failure stops output publication; release selection files may already have been written.', processOnly, 'Changes where downstream CI learns the selected release.', 'The CI step fails; inspect selection files before retrying.', '.github/workflows:auto-promotion output interface', 'required when selection completes', 'GitHub Actions output transport');
add('scripts/updates/renovate.cjs', 'GITHUB_REPOSITORY', 'Selects the sole repository maintained by the trusted Renovate updater.', 'A GitHub repository identifier understood by Renovate; this module does not validate it.', 'No default.', 'Empty is inserted into the repository list and Renovate rejects or cannot use it.', 'Missing or unusable repository metadata fails external Renovate execution.', processOnly, 'Changes the repository targeted by trusted updater execution.', 'Renovate cannot complete the intended repository update.', '.github/workflows:trusted updater repository', 'required for updater', 'trusted CI repository identity');
add('scripts/package-agent-skill-bundle.sh', 'GITHUB_SHA', 'Supplies the source commit when the bundle command has no argument 3.', 'A non-empty source commit accepted by build-runtime-role-bundle.mjs.', 'No usable default without argument 3.', 'Empty is rejected if argument 3 also supplies no commit.', 'Missing commit stops the script; downstream bundle validation rejects unbound source.', 'A non-empty argument 3 wins, then non-empty GITHUB_SHA; otherwise packaging stops.', 'Changes the source identity bound into the role bundle.', 'No complete archive is produced on packaging failure.', 'scripts/package-agent-skill-bundle.sh:commit argument fallback', 'required unless argument 3 supplies commit', 'CI source revision fallback');
const backup = 'charts/prism/files/prism-backup.sh';
add(backup, 'PRISM_BACKUP_IMAGE', 'Records the immutable backup application image in backup metadata.', 'An image name followed by @sha256: and exactly 64 lowercase hexadecimal digits; the allowed name characters are letters, digits, dot, underscore, colon, slash and hyphen.', 'No default.', 'Empty is rejected by the backup_group :? guard.', 'Invalid syntax returns PRISM_BACKUP_IMAGE_INVALID.', processOnly, 'Changes the application-image identity recorded with the backup group.', 'Backup stops without a completed group.', 'charts/prism/values.yaml:backup.image', 'required for backup');
add(backup, 'RANDOM', 'Adds Bash-generated random suffixes to the isolated database restore-smoke name.', 'Bash RANDOM special parameter, generated by the shell rather than inherited as a runtime setting.', 'Bash supplies pseudorandom integers.', 'There is no operator-supported empty state for the special parameter.', 'Database create/restore errors fail the smoke exercise; the owned database is cleaned up by the trap.', 'The executing Bash special parameter owns this value; an environment variable does not define this interface.', 'Changes temporary database-name uniqueness only.', 'Smoke proof fails and cleanup attempts to remove the database it created.', 'charts/prism/files/prism-backup.sh:database_proof', 'internal shell parameter', 'Bash-owned temporary identifier');

// These exact pairs reuse the maintained operator contract in the inventory.
// Discovery never extends this declaration when a new reader appears.
export const maintainedEnvironmentBindings = new Set();
for (const name of ["BUNDLE_TMP_ROOT"]) maintainedEnvironmentBindings.add(`${name}:charts/kubeclaw/templates/deployment.yaml`);
for (const name of ["BACKUP_MAXIMUM_BYTES", "BACKUP_MAXIMUM_DURATION_SECONDS", "BACKUP_MAXIMUM_RETAINED_BYTES", "BACKUP_ROOT", "PGDATABASE"]) maintainedEnvironmentBindings.add(`${name}:charts/prism/files/prism-backup.sh`);
for (const name of ["KUBECLAW_DEPLOY_LITELLM", "KUBECLAW_DEPLOY_POSTGRESQL", "KUBECLAW_SECRETS_OVERWRITE", "KUBECLAW_SECRET_SETUP_MODE", "NAMESPACE", "SOPS_FILE", "SRC_NS", "TAILSCALE_OAUTH_CLIENT_ID", "TAILSCALE_OAUTH_CLIENT_SECRET", "TAILSCALE_OAUTH_SECRET_NAME", "TAILSCALE_OPERATOR_ENABLED", "TAILSCALE_OPERATOR_NAMESPACE"]) maintainedEnvironmentBindings.add(`${name}:my-values/setup-secrets.sh`);
for (const name of ["KUBE_CONTEXT", "OPS_NAMESPACE"]) maintainedEnvironmentBindings.add(`${name}:ops/pod/bootstrap.py`);
for (const name of ["KUBE_CONTEXT"]) maintainedEnvironmentBindings.add(`${name}:scripts/align-spire-webhook-order.py`);
for (const name of ["KUBE_CONTEXT"]) maintainedEnvironmentBindings.add(`${name}:scripts/check-platform-adoption-live.py`);
for (const name of ["ARGOCD_HELM_REPO", "ARGOCD_TAILSCALE_INGRESS", "ARGOCD_VALUES_FILE"]) maintainedEnvironmentBindings.add(`${name}:scripts/deploy-argocd.sh`);
for (const name of ["CILIUM_K3S_READY"]) maintainedEnvironmentBindings.add(`${name}:scripts/deploy-cilium.sh`);
for (const name of ["KUBE_CONTEXT", "OPS_CODEX_IMAGE", "OPS_DISCOVERY_VALUES", "OPS_GITHUB_TOKEN_FILE", "OPS_MCP_IMAGE", "OPS_NAMESPACE", "OPS_POD_VALUES", "OPS_RELEASE", "OPS_TAILSCALE_AUTHKEY_FILE"]) maintainedEnvironmentBindings.add(`${name}:scripts/deploy-ops-pod.sh`);
for (const name of ["AGENT_HELM_TIMEOUT", "AGENT_ROLLOUT_TIMEOUT", "ALLOW_PARTIAL_INFRA", "BUILDKIT_ROOTLESS_PREFLIGHT_IMAGE", "BUILDKIT_ROOTLESS_PREFLIGHT_TIMEOUT", "BUSTER_CODE_BUNDLE_ARCHIVE_URL", "BUSTER_CODE_BUNDLE_AUTH_SECRET", "BUSTER_CODE_BUNDLE_AUTH_SECRET_KEY", "BUSTER_CODE_BUNDLE_CONTRACT_VERSION", "BUSTER_CODE_BUNDLE_EXPECTED_COMMIT", "BUSTER_CONTROLLER_IMAGE_REPOSITORY", "BUSTER_CONTROLLER_IMAGE_TAG", "BUSTER_GATEWAY_IMAGE_REPOSITORY", "BUSTER_GATEWAY_IMAGE_TAG", "BUSTER_VALUES_FILE", "CODE_BUNDLE_GITHUB_REPOSITORY", "CODE_BUNDLE_PREFLIGHT_SKIP", "CODE_BUNDLE_RELEASE_TAG", "DISABLE_IMAGE_PULL_SECRETS", "GENERAL_IMAGE_REPOSITORY", "GENERAL_IMAGE_TAG", "KUBECLAW_A11Y_PREFLIGHT_IMAGE", "KUBECLAW_API_PREFLIGHT_IMAGE", "KUBECLAW_DEPLOY_LAB_DOCKERHUB_MIRROR", "KUBECLAW_DEPLOY_LAB_REGISTRY", "KUBECLAW_DEPLOY_LITELLM", "KUBECLAW_DEPLOY_POSTGRESQL", "KUBECLAW_DEPLOY_PRISM", "KUBECLAW_DEPLOY_RENDER_ONLY", "KUBECLAW_DEPLOY_SPIRE", "KUBECLAW_E2E_PREFLIGHT_IMAGE", "KUBECLAW_HTTP_PREFLIGHT_EXPECTED_TEXT", "KUBECLAW_HTTP_PREFLIGHT_IMAGE", "KUBECLAW_KUBERNETES_PREFLIGHT_IMAGE", "KUBECLAW_KUBERNETES_PREFLIGHT_SECRET", "KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG", "KUBECLAW_LIGHTHOUSE_PREFLIGHT_IMAGE", "KUBECLAW_PRODUCTION_PREFLIGHT_IMAGE", "KUBECLAW_PRODUCTION_RECEIPT_PRIVATE_KEY_FILE", "KUBECLAW_RUN_SECRET_SETUP", "KUBECLAW_SECURITY_PREFLIGHT_IMAGE", "KUBECLAW_TAILSCALE_PREFLIGHT_EXPECTED_TEXT", "KUBECLAW_TAILSCALE_PREFLIGHT_IMAGE", "KUBECLAW_VISUAL_PREFLIGHT_IMAGE", "KUBECLAW_WORKSPACE_NAMESPACE_FILE", "KUBECLAW_WORKSPACE_PROMPT", "LITELLM_NODE_PORT", "NAMESPACE", "NAMESPACE_CONTROLLER_IMAGE_REPOSITORY", "NAMESPACE_CONTROLLER_IMAGE_TAG", "NATIVE_WORKER_NODE_POLICY_FILE", "NOVA_CODE_BUNDLE_ARCHIVE_URL", "NOVA_CODE_BUNDLE_AUTH_SECRET", "NOVA_CODE_BUNDLE_AUTH_SECRET_KEY", "NOVA_CODE_BUNDLE_CONTRACT_VERSION", "NOVA_CODE_BUNDLE_EXPECTED_COMMIT", "NOVA_IMAGE_REPOSITORY", "NOVA_IMAGE_TAG", "NOVA_VALUES_FILE", "POSTGRESQL_RELEASE", "POSTGRESQL_VALUES_FILE", "PRISM_AGENT_VALUES_FILE", "PRISM_CODE_BUNDLE_ARCHIVE_URL", "PRISM_CODE_BUNDLE_AUTH_SECRET", "PRISM_CODE_BUNDLE_AUTH_SECRET_KEY", "PRISM_CODE_BUNDLE_CONTRACT_VERSION", "PRISM_CODE_BUNDLE_EXPECTED_COMMIT", "PRISM_CONTROL_IMAGE_DIGEST", "PRISM_CONTROL_IMAGE_REPOSITORY", "PRISM_DATABASE_SECRET_NAME", "PRISM_E2E_RUN_FAILURES", "PRISM_E2E_USER", "PRISM_E2E_USE_LEASE", "PRISM_HELM_TIMEOUT", "PRISM_IMAGE_PULL_SECRET_NAME", "PRISM_INGESTION_IMAGE_DIGEST", "PRISM_INGESTION_IMAGE_REPOSITORY", "PRISM_NAMESPACE", "PRISM_RELEASE", "PRISM_ROLLOUT_TIMEOUT", "PRISM_RUNTIME_SECRET_NAME", "PRISM_STUDIO_IMAGE_DIGEST", "PRISM_STUDIO_IMAGE_REPOSITORY", "PRISM_VALUES_FILE", "PRISM_WORKER_IMAGE_DIGEST", "PRISM_WORKER_IMAGE_REPOSITORY", "REDIS_RELEASE", "REDIS_VALUES_FILE", "SPIFFE_HELM_REPO", "SPIRE_CHART_VERSION", "SPIRE_CRDS_CHART_VERSION", "SPIRE_VALUES_FILE", "TAILSCALE_HELM_REPO", "TAILSCALE_OAUTH_CLIENT_ID", "TAILSCALE_OAUTH_CLIENT_SECRET", "TAILSCALE_OAUTH_SECRET_NAME", "TAILSCALE_OPERATOR_ENABLED", "TAILSCALE_OPERATOR_NAMESPACE", "TAILSCALE_OPERATOR_RELEASE", "TAILSCALE_VALUES_FILE"]) maintainedEnvironmentBindings.add(`${name}:scripts/deploy.sh`);
for (const name of ["KUBE_CONTEXT"]) maintainedEnvironmentBindings.add(`${name}:scripts/inspect-data-plane-mtls.py`);
for (const name of ["KUBE_CONTEXT"]) maintainedEnvironmentBindings.add(`${name}:scripts/inspect-platform-adoption.py`);
for (const name of ["CILIUM_DATAPLANE_VERIFIED", "CILIUM_TRAFFIC_VERIFIED", "NAMESPACE", "POLICY_FILE"]) maintainedEnvironmentBindings.add(`${name}:scripts/migrate-kubeclaw-network-policies-to-cilium.sh`);
for (const name of ["OPENCLAW_NOTIFY_ACCOUNT", "OPENCLAW_NOTIFY_AGENT_DELIVER", "OPENCLAW_NOTIFY_AGENT_ID", "OPENCLAW_NOTIFY_AGENT_ON_STATUSES", "OPENCLAW_NOTIFY_AGENT_REPLY_ACCOUNT", "OPENCLAW_NOTIFY_AGENT_REPLY_CHANNEL", "OPENCLAW_NOTIFY_AGENT_REPLY_TARGET", "OPENCLAW_NOTIFY_AGENT_SESSION_KEY", "OPENCLAW_NOTIFY_AGENT_TIMEOUT_SECONDS", "OPENCLAW_NOTIFY_CHANNEL", "OPENCLAW_NOTIFY_SESSION_KEY", "OPENCLAW_NOTIFY_SESSION_MODE", "OPENCLAW_NOTIFY_SILENT", "OPENCLAW_NOTIFY_TARGET", "PIPELINE_LIGHT_LEVEL", "PIPELINE_LIGHT_MESSAGE", "PIPELINE_LIGHT_RUN_PID", "PIPELINE_LIGHT_STATUS_FILE", "PIPELINE_LIGHT_WATCHDOG_LOG_FILE"]) maintainedEnvironmentBindings.add(`${name}:scripts/pipeline-light-openclaw-notify.sh`);
for (const name of ["PIPELINE_LIGHT_WATCHDOG_HEARTBEAT_SECONDS", "PIPELINE_LIGHT_WATCHDOG_POLL_SECONDS"]) maintainedEnvironmentBindings.add(`${name}:scripts/pipeline-light-watchdog.sh`);
for (const name of ["BACKUP_APPLICATION_IMAGE", "BACKUP_CREDENTIAL_AUTHORITY_REF", "BACKUP_EXPECTED_SERVER_VERSION", "BACKUP_INTERVAL_SECONDS", "BACKUP_MAXIMUM_AGE_SECONDS", "BACKUP_MAXIMUM_BYTES", "BACKUP_MAXIMUM_DURATION_SECONDS", "BACKUP_MAXIMUM_RETAINED_BYTES", "BACKUP_ROOT", "LITELLM_MASTER_KEY", "LITELLM_SALT_KEY", "PGDATABASE", "PGHOST", "PGUSER"]) maintainedEnvironmentBindings.add(`${name}:scripts/postgresql-recovery.sh`);
for (const name of ["KUBE_CONTEXT"]) maintainedEnvironmentBindings.add(`${name}:scripts/prepare-postgresql-production-upgrade.sh`);
for (const name of ["REDIS_CHECK_RDB", "REDIS_CLI", "REDIS_MIGRATION_MAXIMUM_BYTES", "REDIS_MIGRATION_MAXIMUM_SECONDS", "REDIS_SERVER"]) maintainedEnvironmentBindings.add(`${name}:scripts/redis-prepare-migration.sh`);
for (const name of ["KUBE_CONTEXT"]) maintainedEnvironmentBindings.add(`${name}:scripts/remove-qdrant.sh`);
for (const name of ["KUBECLAW_ALLOW_LEGACY_REPO_SETUP"]) maintainedEnvironmentBindings.add(`${name}:scripts/setup.sh`);

// Exact Kubernetes producer pairs: injection is a transport classification,
// never permission to omit the receiving or external boundary contract.
export const qualifiedProducerBindings = new Set();
for (const name of ["BUSTER_ALLOWED_ACCESS_JSON", "BUSTER_ALLOWED_NAMESPACE_PREFIXES", "BUSTER_ALLOWED_SOURCE_SECRETS", "BUSTER_CONTROLLER_POLL_MS", "BUSTER_CONTROLLER_SERVICE_ACCOUNT", "BUSTER_DEFAULT_TTL_SECONDS", "BUSTER_DEPLOYER_ROLE_NAME", "BUSTER_LEASE_API_GROUP", "BUSTER_LEASE_API_VERSION", "BUSTER_MAX_TTL_SECONDS", "BUSTER_PRODUCT_ACTORS_JSON", "BUSTER_PRODUCT_AUDIENCE", "BUSTER_PRODUCT_ENABLED", "BUSTER_PRODUCT_ISSUER", "BUSTER_PRODUCT_PRODUCER", "BUSTER_PRODUCT_VERIFY_KEY", "BUSTER_READY_AUDIENCE", "BUSTER_READY_LISTEN", "BUSTER_READY_PRODUCER", "BUSTER_READY_TLS_CERT", "BUSTER_READY_TLS_KEY", "BUSTER_SECRET_ROLE_NAME", "BUSTER_TESTER_ROLE_NAME", "KUBECLAW_NAMESPACE"]) qualifiedProducerBindings.add(`${name}:charts/kubeclaw/templates/buster-namespace-controller.yaml`);
for (const name of ["AGENT_NAME", "AGENT_ROLE", "BUNDLE_TMP_ROOT", "CODE_BUNDLE_ARCHIVE_PATH", "CODE_BUNDLE_ARCHIVE_URL", "CODE_BUNDLE_AUTH_TOKEN", "CODE_BUNDLE_CONTRACT_VERSION", "CODE_BUNDLE_ENABLED", "CODE_BUNDLE_EXPECTED_COMMIT", "CODE_BUNDLE_SHA256", "CURRENT_PROJECT", "DISCORD_CHANNEL", "DISCORD_TOKEN", "DISCORD_WEBHOOK", "GATEWAY_PORT", "GIT_REPO_URL", "HOME", "INIT_RUN_AS_ROOT", "INIT_SSH_HOME", "KUBECLAW_CAPABILITY_PROVIDERS", "KUBECLAW_CODE_BUNDLE_AGENT", "KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION", "KUBECLAW_CODE_BUNDLE_ENABLED", "KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT", "KUBECLAW_CODE_BUNDLE_MANIFEST", "KUBECLAW_CONTAINER_ROLE", "KUBECLAW_DRAIN_FILE", "KUBECLAW_HEALTH_CHECK_GATEWAY", "KUBECLAW_HEALTH_CHECK_LITELLM", "KUBECLAW_HEALTH_CHECK_REDIS", "KUBECLAW_HEALTH_CHECK_REDIS_STREAM", "KUBECLAW_HEALTH_CHECK_REGISTRIES", "KUBECLAW_HEALTH_REDIS_STREAM", "KUBECLAW_HEALTH_REDIS_STREAM_MAX_LEN", "KUBECLAW_HEALTH_REGISTRIES", "KUBECLAW_HEALTH_REQUIRE_STARTUP_MARKER", "KUBECLAW_HEALTH_STARTUP_EVENT_LOG_PATH", "KUBECLAW_HEALTH_STARTUP_STATUS_PATH", "KUBECLAW_HEALTH_TIMEOUT_MS", "KUBECLAW_PRESTOP_DRAIN_SECONDS", "LITELLM_API_KEY", "LITELLM_URL", "NODE_OPTIONS", "NODE_PATH", "OPENCLAW_GATEWAY_TOKEN", "OPENCLAW_GATEWAY_URL", "OVERRIDE_SWARM_CONFIG", "OVERRIDE_WORKSPACE", "REDIS_HOST", "REDIS_PASSWORD", "REDIS_PORT", "REPO_ROOT", "SPIFFE_ENDPOINT_SOCKET", "STITCH_API_KEY", "SWARM_CONFIG", "TAILSCALE_OAUTH_SECRET_NAME", "TAILSCALE_OPERATOR_NAMESPACE", "TMPDIR", "XDG_CACHE_HOME"]) qualifiedProducerBindings.add(`${name}:charts/kubeclaw/templates/deployment.yaml`);
for (const name of ["ARGOCD_NAMESPACE", "GH_TOKEN", "HOME", "HOST", "KUBECONFIG", "OPS_ALLOWED_NAMESPACES", "OPS_DEFAULT_NAMESPACE", "OPS_EXEC_NAMESPACES", "OPS_LOCAL_ONLY", "OPS_MCP_BEARER_TOKEN_FILE", "TS_AUTHKEY", "TS_AUTH_ONCE", "TS_EXTRA_ARGS", "TS_HOSTNAME", "TS_KUBE_SECRET", "TS_SOCKET", "TS_SOCKS5_SERVER", "TS_STATE_DIR", "TS_USERSPACE"]) qualifiedProducerBindings.add(`${name}:charts/ops-pod/templates/workload.yaml`);
for (const name of ["ARTIFACT_ROOT", "BACKUP_MAXIMUM_BYTES", "BACKUP_MAXIMUM_DURATION_SECONDS", "BACKUP_MAXIMUM_RETAINED_BYTES", "BACKUP_ROOT", "PGCONNECT_TIMEOUT", "PGDATABASE", "PGHOST", "PGPASSWORD", "PGUSER", "PRISM_BACKUP_IMAGE"]) qualifiedProducerBindings.add(`${name}:charts/prism/templates/backup.yaml`);
for (const name of ["PORT", "PRISM_INGESTION_SECRET", "PRISM_QUARANTINE_ROOT", "PRISM_QUARANTINE_TTL_MS"]) qualifiedProducerBindings.add(`${name}:charts/prism/templates/ingestion.yaml`);
for (const name of ["ADMIN_DATABASE_URL", "DATABASE_URL", "PRISM_MIGRATOR_PASSWORD", "PRISM_READONLY_PASSWORD", "PRISM_RUNTIME_PASSWORD"]) qualifiedProducerBindings.add(`${name}:charts/prism/templates/jobs.yaml`);
for (const name of ["PGDATA", "POSTGRES_DB", "POSTGRES_PASSWORD", "POSTGRES_USER", "PRISM_MIGRATOR_PASSWORD", "PRISM_READONLY_PASSWORD", "PRISM_RUNTIME_PASSWORD"]) qualifiedProducerBindings.add(`${name}:charts/prism/templates/postgresql.yaml`);
for (const name of ["DATABASE_URL", "PORT", "PRISM_AGENT_URL", "PRISM_CONTROL_INTERNAL_URL", "PRISM_CONTROL_SPIFFE_ID", "PRISM_CONTROL_URL", "PRISM_DISPATCH_SECRET", "PRISM_ENGINE_CONTENT_DIGEST", "PRISM_INGESTION_SECRET", "PRISM_INGESTION_URL", "PRISM_INGRESS_SECRET", "PRISM_NATIVE_CLOSE_TIMEOUT_MS", "PRISM_PIPELINE_PREFERENCE_SUBJECT", "PRISM_SESSION_SECRET", "PRISM_TRUSTED_AGENT_SPIFFE_ID", "PRISM_TRUSTED_CONTROL_SPIFFE_ID", "PRISM_TRUSTED_NOVA_SPIFFE_ID", "PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID", "PRISM_TRUSTED_WORKER_SPIFFE_ID", "PRISM_WORKER_SECRET", "PRISM_WORKER_SHUTDOWN_TIMEOUT_MS", "PRISM_WORKER_URL", "SPIFFE_ENDPOINT_SOCKET", "WORKER_TRUST_SPIFFE_ENABLED"]) qualifiedProducerBindings.add(`${name}:charts/prism/templates/workloads.yaml`);
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "STORE_MODEL_IN_DB"]) qualifiedProducerBindings.add(`${name}:gitops/platform/litellm/resources.yaml`);
for (const name of ["REGISTRY_STORAGE_DELETE_ENABLED"]) qualifiedProducerBindings.add(`${name}:gitops/platform/registry-local/resources.yaml`);
for (const name of ["BUSTER_ALLOWED_SOURCE_SECRETS", "BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT", "BUSTER_PLAN_PORT", "BUSTER_PLAN_RUN_DIR", "BUSTER_PLAN_STATE_DIR", "BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY", "BUSTER_TRUSTED_PEER_SPIFFE_ID", "BUSTER_V2_KUBERNETES_CREDENTIALS", "BUSTER_V2_MAX_ARCHIVE_BYTES", "BUSTER_V2_MAX_EXTRACTED_BYTES", "BUSTER_V2_RESULT_ROOT", "BUSTER_V2_TOKEN", "CONTAINER_BUILD_BUILDKIT_HOST"]) qualifiedProducerBindings.add(`${name}:my-values/buster-values.yaml`);
for (const name of ["FLOWS_API_ADDR"]) qualifiedProducerBindings.add(`${name}:my-values/infra/cilium-values.yaml`);
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "STORE_MODEL_IN_DB"]) qualifiedProducerBindings.add(`${name}:my-values/infra/litellm-deployment.yaml`);
for (const name of ["GOOGLE_APPLICATION_CREDENTIALS"]) qualifiedProducerBindings.add(`${name}:my-values/infra/litellm-values.yaml`);
for (const name of ["OTEL_TRACES_EXPORTER"]) qualifiedProducerBindings.add(`${name}:my-values/infra/registry-local.yaml`);
for (const name of ["REGISTRY_PROXY_REMOTEURL", "REGISTRY_STORAGE_DELETE_ENABLED"]) qualifiedProducerBindings.add(`${name}:my-values/infra/registry-mirror.yaml`);
for (const name of ["BUSTER_GATEWAY_REPOSITORY_ROOT", "BUSTER_GATEWAY_TOKEN", "BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY", "BUSTER_V2_TOKEN"]) qualifiedProducerBindings.add(`${name}:my-values/nova-values.yaml`);
for (const name of ["OPENCLAW_GATEWAY_TOKEN", "PORT", "PRISM_CONTROL_URL", "PRISM_STUDIO_PUBLIC_URL"]) qualifiedProducerBindings.add(`${name}:my-values/prism-agent-values.yaml`);

for (const [name, setting, purpose, form, empty, failure] of [
 ['INIT_RUN_AS_ROOT', 'runAsRoot', 'Selects root ownership repair in the init shell.', 'Only exact true enables root ownership repair.', 'Empty skips root ownership repair.', 'Failed chown or chmod stops init.'],
 ['INIT_SSH_HOME', 'runAsRoot (root or node SSH directory)', 'Selects the init SSH key and host-configuration directory.', 'A writable directory path; the chart selects /root/.ssh or /home/node/.ssh.', 'Empty fails mkdir when Git setup runs.', 'Filesystem or SSH errors stop init or Git access.'],
 ['GIT_REPO_URL', 'agent.git.repoUrl', 'Selects the Git origin cloned or reconciled by init setup.', 'A Git remote URL accepted by git; the shell does not validate syntax.', 'Empty fails Git clone or remote access.', 'Clone errors stop init; failed fetch keeps the existing checkout with a warning.'],
]) add(chart, name, purpose, form, 'The chart supplies the named setting when its branch is enabled; this reader has no separate fallback.', empty, failure, 'The rendered Pod environment supplies the value; change the owning Helm field and rerun initialization.', 'Changes init ownership or repository authority.', failure, `charts/kubeclaw/values.yaml:${setting}`);

// External boundaries are explicit and limited to the receiving process or
// configuration loader named here. They do not assert uninspected image rules.
const externalNames = {
 CURRENT_PROJECT: ['OpenClaw agent project configuration', 'charts/kubeclaw/values.yaml:agent.project'],
 DISCORD_CHANNEL: ['external OpenClaw Discord channel loader', 'charts/kubeclaw/values.yaml:discord.channelId'],
 DISCORD_TOKEN: ['external OpenClaw Discord authentication loader', 'charts/kubeclaw/values.yaml:discord.existingSecret/discord.token'],
 KUBECLAW_CAPABILITY_PROVIDERS: ['OpenClaw capability-provider configuration loader', 'charts/kubeclaw/values.yaml:capabilityProviders'],
 NODE_OPTIONS: ['external Node command-line option loader', 'charts/kubeclaw/values.yaml:gateway.startupDoctor.nodeOptions'],
 REPO_ROOT: ['external OpenClaw image repository-directory configuration', 'charts/kubeclaw/templates/deployment.yaml:fixed repository directory'],
 SPIFFE_ENDPOINT_SOCKET: ['external SPIFFE Workload API client', 'workerTrust.spiffe.socketPath in the producing chart'],
 STITCH_API_KEY: ['external Stitch API client', 'charts/kubeclaw/values.yaml:stitch.existingSecret'],
 FLOWS_API_ADDR: ['external Cilium Hubble UI backend', 'my-values/infra/cilium-values.yaml:hubble.ui backend env'],
 GH_TOKEN: ['external GitHub CLI authentication loader', 'charts/ops-pod/values.yaml:githubSecret'],
 TS_AUTHKEY: ['external Tailscale container authentication loader', 'charts/ops-pod/values.yaml:tailscale.authSecret'],
 TS_AUTH_ONCE: ['external Tailscale container startup loader', 'charts/ops-pod/templates/workload.yaml:fixed true'],
 TS_EXTRA_ARGS: ['external Tailscale container startup loader', 'charts/ops-pod/values.yaml:tailscale.extraArgs'],
 TS_HOSTNAME: ['external Tailscale container startup loader', 'charts/ops-pod/values.yaml:tailscale.hostname'],
 TS_KUBE_SECRET: ['external Tailscale container state loader', 'charts/ops-pod/templates/workload.yaml:fixed empty Kubernetes state Secret selector'],
 TS_SOCKET: ['external Tailscale daemon socket loader', 'charts/ops-pod/templates/workload.yaml:fixed /tmp/tailscaled.sock'],
 TS_SOCKS5_SERVER: ['external Tailscale SOCKS listener loader', 'charts/ops-pod/templates/workload.yaml:fixed 127.0.0.1:1055'],
 TS_STATE_DIR: ['external Tailscale container state loader', 'charts/ops-pod/templates/workload.yaml:fixed /var/lib/tailscale'],
 TS_USERSPACE: ['external Tailscale container network loader', 'charts/ops-pod/templates/workload.yaml:fixed true'],
 GOOGLE_APPLICATION_CREDENTIALS: ['external Google provider credential loader in LiteLLM', 'the producing LiteLLM Google service-account volume and file-path binding'],
 STORE_MODEL_IN_DB: ['external LiteLLM model-store loader', 'the producing LiteLLM deployment environment binding'],
 OTEL_TRACES_EXPORTER: ['external OCI registry OpenTelemetry loader', 'my-values/infra/registry-local.yaml:fixed exporter disabled'],
 PGCONNECT_TIMEOUT: ['external libpq PostgreSQL connection loader', 'charts/prism/templates/backup.yaml:fixed connection deadline'],
 PGPASSWORD: ['external libpq PostgreSQL credential loader', 'charts/prism/values.yaml:secrets.database'],
 PGDATA: ['external PostgreSQL server initialization loader', 'charts/prism/templates/postgresql.yaml:fixed data directory'],
 POSTGRES_DB: ['external PostgreSQL image initialization loader', 'charts/prism/values.yaml:database.name'],
 POSTGRES_PASSWORD: ['external PostgreSQL image authentication loader', 'charts/prism/values.yaml:secrets.database'],
 POSTGRES_USER: ['external PostgreSQL image initialization loader', 'charts/prism/templates/postgresql.yaml:administrator role binding'],
 REGISTRY_PROXY_REMOTEURL: ['external OCI registry pull-through proxy loader', 'my-values/infra/registry-mirror.yaml:proxy remote URL'],
 REGISTRY_STORAGE_DELETE_ENABLED: ['external OCI registry storage loader', 'the producing local registry storage-delete environment binding'],
};
// External authorities are also source-qualified. Adding a known external
// name to another producer cannot inherit an unrelated container's boundary.
const externalReceivingBindings = new Set();
for (const [source, names] of [
  [chart, 'CURRENT_PROJECT DISCORD_CHANNEL DISCORD_TOKEN KUBECLAW_CAPABILITY_PROVIDERS NODE_OPTIONS REPO_ROOT SPIFFE_ENDPOINT_SOCKET STITCH_API_KEY'],
  ['charts/ops-pod/templates/workload.yaml', 'GH_TOKEN TS_AUTHKEY TS_AUTH_ONCE TS_EXTRA_ARGS TS_HOSTNAME TS_KUBE_SECRET TS_SOCKET TS_SOCKS5_SERVER TS_STATE_DIR TS_USERSPACE'],
  ['charts/prism/templates/backup.yaml', 'PGCONNECT_TIMEOUT PGPASSWORD'],
  ['charts/prism/templates/postgresql.yaml', 'PGDATA POSTGRES_PASSWORD'],
  ['gitops/platform/litellm/resources.yaml', 'GOOGLE_APPLICATION_CREDENTIALS STORE_MODEL_IN_DB'],
  ['my-values/infra/litellm-deployment.yaml', 'GOOGLE_APPLICATION_CREDENTIALS STORE_MODEL_IN_DB'],
  ['my-values/infra/litellm-values.yaml', 'GOOGLE_APPLICATION_CREDENTIALS'],
  ['my-values/infra/cilium-values.yaml', 'FLOWS_API_ADDR'],
  ['my-values/infra/registry-local.yaml', 'OTEL_TRACES_EXPORTER'],
  ['my-values/infra/registry-mirror.yaml', 'REGISTRY_PROXY_REMOTEURL REGISTRY_STORAGE_DELETE_ENABLED'],
  ['gitops/platform/registry-local/resources.yaml', 'REGISTRY_STORAGE_DELETE_ENABLED'],
]) for (const name of names.split(' ')) externalReceivingBindings.add(`${name}:${source}`);
// Exact producer-only transports. Readers in another workload or host command
// do not establish consumption in these receiving containers.
const producerOnlyTransports = new Map([
  ['TMPDIR:charts/kubeclaw/templates/deployment.yaml', 'The chart passes /tmp to the init and Gateway container environments. The separate host image scanner is not a reader in these containers.'],
  ['XDG_CACHE_HOME:charts/kubeclaw/templates/deployment.yaml', 'The chart passes /tmp/.cache to the init and Gateway container environments. The separate host image scanner does not establish container cache behavior.'],
  ['NODE_PATH:charts/kubeclaw/templates/deployment.yaml', 'The chart passes the explicit module search-path string to the startup-doctor and Gateway container environments. The registry import-audit child is a different process and does not prove this binding is consumed.'],
  ['PRISM_STUDIO_PUBLIC_URL:my-values/prism-agent-values.yaml', 'The profile supplies this URL to the agent and bridge container environments. AgentProcess launches the external OpenClaw command with inherited environment; no checked-in bridge reader of this URL is established. The Control reader runs in a different workload.'],
  ['TAILSCALE_OPERATOR_NAMESPACE:charts/kubeclaw/templates/deployment.yaml', 'The Gateway container receives this operator namespace. No checked-in Gateway environment reader establishes its use; the host deployment script is a different process.'],
  ['TAILSCALE_OAUTH_SECRET_NAME:charts/kubeclaw/templates/deployment.yaml', 'The Gateway container receives this Secret selector. No checked-in Gateway environment reader establishes its use; host Secret setup is a different process.'],
  ['BUSTER_V2_RESULT_ROOT:my-values/buster-values.yaml', 'The buster-v2-runtime container receives this path, but its checked-in entrypoint does not read this name. Its plan paths instead use BUSTER_PLAN_STATE_DIR and BUSTER_PLAN_RUN_DIR.'],
  ['BUSTER_V2_KUBERNETES_CREDENTIALS:my-values/buster-values.yaml', 'The buster-v2-runtime container receives this path, but its checked-in entrypoint selects the credential root through BUSTER_KUBERNETES_SERVICE_ACCOUNT_ROOT, not this name.'],
  ['CONTAINER_BUILD_BUILDKIT_HOST:my-values/buster-values.yaml', 'The buster-v2-runtime container receives this endpoint, but its checked-in entrypoint requires BUILDKIT_HOST and does not read this name.'],
  ['PRISM_AGENT_URL:charts/prism/templates/workloads.yaml', 'The Control SPIFFE branch injects this loopback URL. No checked-in Control environment reader of this name is established; this declaration does not prove an agent connection.'],
  ['SPIFFE_ENDPOINT_SOCKET:charts/prism/templates/workloads.yaml', 'The Control and worker SPIFFE branches inject the socket URL. Their checked-in authentication loaders use trusted identity headers; no environment reader of this socket name is established in those application processes. The Envoy sidecar uses its separately mounted configuration.'],
  ['BUSTER_V2_TOKEN:my-values/nova-values.yaml', 'The Nova Gateway receives this Secret-backed token. The checked-in Nova remote-gate loader reads only the environment name selected by tokenEnvironmentVariable in an independently supplied nova-remote-test-gate-runtime.v1 config, and only in bearer mode. This profile does not establish that config selection; a same-name Buster container reader proves no Nova consumption.'],
  ['BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY:my-values/nova-values.yaml', 'The Nova Gateway receives this Secret-backed key. The checked-in Nova remote-gate loader requires the environment name selected by sourceAttestationPrivateKeyEnvironmentVariable in an independently supplied nova-remote-test-gate-runtime.v1 config. This profile does not establish that config selection or execution.'],
  ['BUSTER_GATEWAY_TOKEN:my-values/nova-values.yaml', 'The Nova Gateway receives this Secret-backed token. No checked-in environment reader of this name establishes its use by the Gateway or a Buster client.'],
  ['BUSTER_GATEWAY_REPOSITORY_ROOT:my-values/nova-values.yaml', 'The Nova Gateway receives this repository path. No checked-in environment reader of this name establishes a repository lookup.'],
  ['OPENCLAW_GATEWAY_TOKEN:my-values/prism-agent-values.yaml', 'The prism-agent-bridge receives this Secret-backed token. AgentProcess spawns the external OpenClaw executable with inherited environment; no checked-in bridge reader of this token or successful external authentication is established.'],
  ['HOME:charts/ops-pod/templates/workload.yaml', 'The Codex container receives /home/node and mounts its persistent home there. External Codex, GitHub CLI and credential helpers own home lookup; the host Buster and backup HOME readers do not establish this container behavior.'],
  ['KUBECONFIG:charts/ops-pod/templates/workload.yaml', 'The Codex container receives the generated kubeconfig path only with non-empty execNamespaces and mounts its ConfigMap. External kubectl and credential helpers own parsing and lookup; unrelated host or Buster readers are not this receiver.'],
]);

// A finite workload-to-source map, not a join on a globally familiar name.
// These receipts prove custody and identify the actual reader. Parsing and
// fallback semantics remain with that reader's separately authored contract.
const producerReceivers = new Map();
function receives(source, names, receiver, condition, evidence) {
  for (const name of names.split(' ')) producerReceivers.set(`${name}:${source}`, { receiver, condition, evidence });
}
const producerTransportEvidence = new Map();
for (const name of ['BUSTER_V2_RESULT_ROOT', 'BUSTER_V2_KUBERNETES_CREDENTIALS', 'CONTAINER_BUILD_BUILDKIT_HOST']) producerTransportEvidence.set(`${name}:my-values/buster-values.yaml`, [
  { path: 'my-values/buster-values.yaml', line: 86, endLine: 123 },
  { path: 'docker/Dockerfile.buster-runtime', line: 155, endLine: 155 },
  { path: 'docker/buster-runtime-entrypoint.sh', line: 7, endLine: 9 },
  { path: 'docker/buster-runtime-entrypoint.sh', line: 37, endLine: 41 },
]);
for (const name of ['BUSTER_V2_TOKEN', 'BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY']) producerTransportEvidence.set(`${name}:my-values/nova-values.yaml`, [
  { path: 'my-values/nova-values.yaml', line: 119, endLine: 129 },
  { path: 'skills/nova/core/test-gates/runtime-config.ts', line: 30, endLine: 60 },
]);
for (const name of ['PRISM_STUDIO_PUBLIC_URL', 'OPENCLAW_GATEWAY_TOKEN']) producerTransportEvidence.set(`${name}:my-values/prism-agent-values.yaml`, [
  { path: 'my-values/prism-agent-values.yaml', line: 69, endLine: 78 },
  { path: 'skills/prism/server/agent-process.ts', line: 12, endLine: 17 },
]);
const brokerProducer = 'charts/kubeclaw/templates/buster-namespace-controller.yaml';
receives(brokerProducer, 'KUBECLAW_NAMESPACE BUSTER_ALLOWED_ACCESS_JSON BUSTER_ALLOWED_NAMESPACE_PREFIXES BUSTER_ALLOWED_SOURCE_SECRETS BUSTER_CONTROLLER_POLL_MS BUSTER_CONTROLLER_SERVICE_ACCOUNT BUSTER_DEFAULT_TTL_SECONDS BUSTER_DEPLOYER_ROLE_NAME BUSTER_LEASE_API_GROUP BUSTER_LEASE_API_VERSION BUSTER_MAX_TTL_SECONDS BUSTER_SECRET_ROLE_NAME BUSTER_TESTER_ROLE_NAME', 'cmd/buster-namespace-controller/main.go', 'the controller container when busterNamespaceBroker.enabled and agentRole is buster', [{ path: brokerProducer, line: 183, endLine: 190 }, { path: 'docker/Dockerfile.namespace-controller', line: 25, endLine: 25 }, { path: 'cmd/buster-namespace-controller/main.go', line: 132, endLine: 150 }, { path: 'cmd/buster-namespace-controller/main.go', line: 155, endLine: 189 }]);
receives(brokerProducer, 'BUSTER_READY_AUDIENCE BUSTER_READY_LISTEN BUSTER_READY_PRODUCER BUSTER_READY_TLS_CERT BUSTER_READY_TLS_KEY', 'cmd/buster-namespace-controller/demo-readiness-lifecycle.go', 'the controller container with controller readiness enabled', [{ path: brokerProducer, line: 183, endLine: 190 }, { path: 'cmd/buster-namespace-controller/demo-readiness-lifecycle.go', line: 17, endLine: 35 }]);
receives(brokerProducer, 'BUSTER_PRODUCT_ACTORS_JSON BUSTER_PRODUCT_AUDIENCE BUSTER_PRODUCT_ENABLED BUSTER_PRODUCT_ISSUER BUSTER_PRODUCT_PRODUCER BUSTER_PRODUCT_VERIFY_KEY', 'cmd/buster-namespace-controller/demo-product.go', 'the controller container with product decisions enabled', [{ path: brokerProducer, line: 183, endLine: 190 }, { path: 'cmd/buster-namespace-controller/demo-product.go', line: 58, endLine: 75 }]);
const opsProducer = 'charts/ops-pod/templates/workload.yaml';
receives(opsProducer, 'ARGOCD_NAMESPACE HOST OPS_ALLOWED_NAMESPACES OPS_DEFAULT_NAMESPACE OPS_LOCAL_ONLY OPS_MCP_BEARER_TOKEN_FILE', 'tools/ops-mcp/src/config.mjs; OPS_DEFAULT_NAMESPACE also reaches the Codex container for ops/pod/verify.py', 'the ops-mcp container; the default namespace is additionally injected into codex', [{ path: opsProducer, line: 85, endLine: 96 }, { path: 'tools/ops-mcp/Dockerfile', line: 47, endLine: 47 }, { path: 'tools/ops-mcp/src/server.mjs', line: 4, endLine: 23 }, { path: 'tools/ops-mcp/src/config.mjs', line: 10, endLine: 21 }, { path: 'ops/pod/verify.py', line: 34, endLine: 34 }]);
receives(opsProducer, 'OPS_EXEC_NAMESPACES', 'ops/pod/verify.py', 'the codex container; verification is an explicit in-pod command, not its supervisor startup', [{ path: opsProducer, line: 51, endLine: 58 }, { path: 'ops/pod/verify.py', line: 25, endLine: 34 }]);
receives('charts/prism/templates/backup.yaml', 'ARTIFACT_ROOT BACKUP_MAXIMUM_BYTES BACKUP_MAXIMUM_DURATION_SECONDS BACKUP_MAXIMUM_RETAINED_BYTES BACKUP_ROOT PGDATABASE PGHOST PGUSER PRISM_BACKUP_IMAGE', 'charts/prism/files/prism-backup.sh and its bounded PostgreSQL child commands', 'the backup, verify or database-proof container; artifact/image inputs exist only in backup and database connection inputs are omitted in verify', [{ path: 'charts/prism/templates/backup.yaml', line: 1, endLine: 9 }, { path: 'charts/prism/templates/backup.yaml', line: 40, endLine: 63 }, { path: 'charts/prism/files/prism-backup.sh', line: 11, endLine: 23 }]);
receives('charts/prism/templates/ingestion.yaml', 'PORT PRISM_INGESTION_SECRET PRISM_QUARANTINE_ROOT PRISM_QUARANTINE_TTL_MS', ingestion, 'the ingestion container when ingestion.enabled', [{ path: 'docker/Dockerfile.prism-ingestion', line: 23, endLine: 23 }, { path: ingestion, line: 12, endLine: 20 }, { path: ingestion, line: 95, endLine: 97 }]);
receives('charts/prism/templates/jobs.yaml', 'ADMIN_DATABASE_URL PRISM_MIGRATOR_PASSWORD PRISM_READONLY_PASSWORD PRISM_RUNTIME_PASSWORD', bootstrap, 'the bootstrap-database-roles init container when postgresql.enabled', [{ path: 'charts/prism/templates/jobs.yaml', line: 26, endLine: 38 }, { path: 'skills/prism/server/bootstrap-database.ts', line: 1, endLine: 12 }, { path: bootstrap, line: 2, endLine: 11 }]);
receives('charts/prism/templates/jobs.yaml', 'DATABASE_URL', 'skills/prism/server/migrate.ts', 'the migrate container when postgresql.enabled; this is not the administrator bootstrap credential', [{ path: 'charts/prism/templates/jobs.yaml', line: 43, endLine: 50 }, { path: 'skills/prism/server/migrate.ts', line: 1, endLine: 5 }]);
const prismProducer = 'charts/prism/templates/workloads.yaml';
receives(prismProducer, 'PRISM_CONTROL_SPIFFE_ID PRISM_DISPATCH_SECRET PRISM_INGESTION_SECRET PRISM_INGESTION_URL PRISM_PIPELINE_PREFERENCE_SUBJECT PRISM_SESSION_SECRET PRISM_TRUSTED_AGENT_SPIFFE_ID PRISM_TRUSTED_NOVA_SPIFFE_ID PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID PRISM_TRUSTED_WORKER_SPIFFE_ID PRISM_WORKER_URL', control, 'the control container; trust identities and loopback URLs use the SPIFFE branch, dispatch secret uses the non-SPIFFE branch', [{ path: 'docker/Dockerfile.prism-control', line: 24, endLine: 24 }, { path: 'skills/prism/server/control.ts', line: 1, endLine: 8 }, { path: control, line: 10, endLine: 58 }]);
receives(prismProducer, 'PRISM_CONTROL_URL', studio, 'the studio container, not Control or the agent bridge', [{ path: 'docker/Dockerfile.prism-studio', line: 20, endLine: 20 }, { path: 'skills/prism/server/studio.ts', line: 1, endLine: 8 }, { path: studio, line: 8, endLine: 17 }]);
receives(prismProducer, 'PRISM_INGRESS_SECRET', `${control}; ${studio}`, 'the control and studio containers under their separate name branches', [{ path: control, line: 46, endLine: 47 }, { path: studio, line: 15, endLine: 17 }]);
receives(prismProducer, 'DATABASE_URL PORT PRISM_CONTROL_INTERNAL_URL PRISM_WORKER_SECRET WORKER_TRUST_SPIFFE_ENABLED', `${control}; skills/prism/server/worker-config.ts; PORT also reaches ${studio}`, 'the control and worker containers; PORT additionally reaches Studio; worker secret is omitted in SPIFFE mode', [{ path: 'skills/prism/server/control.ts', line: 1, endLine: 8 }, { path: 'skills/prism/server/worker.ts', line: 1, endLine: 15 }, { path: control, line: 22, endLine: 58 }, { path: 'skills/prism/server/worker-config.ts', line: 3, endLine: 14 }, { path: studio, line: 8, endLine: 17 }]);
receives(prismProducer, 'PRISM_TRUSTED_CONTROL_SPIFFE_ID PRISM_WORKER_SHUTDOWN_TIMEOUT_MS', 'skills/prism/server/worker-config.ts', 'the worker container; the trusted identity is injected only in SPIFFE mode', [{ path: 'skills/prism/server/worker.ts', line: 9, endLine: 15 }, { path: 'skills/prism/server/worker-config.ts', line: 3, endLine: 14 }, { path: 'skills/prism/server/worker-config.ts', line: 32, endLine: 38 }]);
receives(prismProducer, 'PRISM_NATIVE_CLOSE_TIMEOUT_MS PRISM_ENGINE_CONTENT_DIGEST', 'skills/prism/config/native-worker.ts', 'the worker container; PRISM_ENGINE_CONTENT_DIGEST is also injected into Control as transport only, with no checked-in Control reader established', [{ path: 'skills/prism/server/worker.ts', line: 4, endLine: 15 }, { path: 'skills/prism/config/native-worker.ts', line: 17, endLine: 23 }, { path: 'skills/prism/config/native-worker.ts', line: 50, endLine: 82 }]);
receives('my-values/buster-values.yaml', 'BUSTER_ALLOWED_SOURCE_SECRETS BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT BUSTER_PLAN_PORT BUSTER_PLAN_RUN_DIR BUSTER_PLAN_STATE_DIR BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY BUSTER_TRUSTED_PEER_SPIFFE_ID BUSTER_V2_MAX_ARCHIVE_BYTES BUSTER_V2_MAX_EXTRACTED_BYTES BUSTER_V2_TOKEN', 'docker/buster-runtime-entrypoint.sh; config-selected token/key consumption continues in skills/buster/engine/test-gates/production.ts', 'the extra buster-v2-runtime container, not the Gateway or namespace controller', [{ path: 'my-values/buster-values.yaml', line: 86, endLine: 123 }, { path: 'docker/Dockerfile.buster-runtime', line: 155, endLine: 155 }, { path: 'docker/buster-runtime-entrypoint.sh', line: 4, endLine: 6 }, { path: 'docker/buster-runtime-entrypoint.sh', line: 37, endLine: 41 }, { path: 'docker/buster-runtime-entrypoint.sh', line: 173, endLine: 187 }]);
receives('my-values/prism-agent-values.yaml', 'PORT PRISM_CONTROL_URL', 'skills/prism/server/agent-bridge.mjs; PRISM_CONTROL_URL also reaches the Gateway plugin environment', 'the explicit prism-agent-bridge extra container; PORT is not a Control listener binding', [{ path: 'my-values/prism-agent-values.yaml', line: 71, endLine: 81 }, { path: 'skills/prism/server/agent-bridge.mjs', line: 1, endLine: 6 }, { path: 'skills/prism/openclaw-plugin/index.mjs', line: 10, endLine: 12 }]);

receives(prismProducer, 'PRISM_PRODUCT_DECISIONS_ENABLED PRISM_PRODUCT_ISSUER PRISM_PRODUCT_OPERATORS PRISM_PRODUCT_ORIGIN PRISM_PRODUCT_PRIVATE_KEY_FILE PRISM_PRODUCT_CONTROLLER_URL PRISM_PRODUCT_CONTROLLER_CA_FILE PRISM_PRODUCT_CONTROLLER_TOKEN_FILE', 'skills/prism/control/product-decisions.ts through Control startup composition', 'the Control container only, with productDecisions.enabled; the selected image recipe includes the Control composition source, not proof of deployed execution', [{ path: 'charts/prism/templates/workloads.yaml', line: 4, endLine: 4 }, { path: 'charts/prism/templates/workloads.yaml', line: 90, endLine: 91 }, { path: 'charts/prism/templates/_product-decisions.tpl', line: 1, endLine: 29 }, { path: 'skills/prism/server/control.ts', line: 1, endLine: 7 }, { path: 'skills/prism/server/control-server.ts', line: 938, endLine: 938 }, { path: 'skills/prism/server/control-config.ts', line: 63, endLine: 73 }, { path: 'skills/prism/control/product-decisions.ts', line: 23, endLine: 34 }]);

function producerBoundaryContract(name, source, declaration) {
  if (!qualifiedProducerBindings.has(`${name}:${source}`)) return null;
  const receiving = producerReceivers.get(`${name}:${source}`);
  if (receiving) return {
    purpose: `Transports ${name} to ${receiving.condition}. Its checked-in receiving authority is ${receiving.receiver}. This receipt proves that workload custody, not parsing or successful operation. Use the separate exact receiving-source contract for interpretation.`,
    acceptedForm: `The exact environment declaration at ${declaration.path}:${declaration.line}; receiving-source validation is separate from this transport.`,
    defaultBehavior: 'The producer supplies the rendered value only in the stated workload branch. Receiving-source defaults are not a producer default.',
    emptyBehavior: 'A declared empty string is injected unchanged. Use the named receiving-source contract to determine rejection, retention or fallback.',
    invalidBehavior: 'Declaration and required Secret errors can prevent startup. Value interpretation belongs to the named receiving source, not an unrelated reader of the same name.',
    precedence: 'The selected Helm/profile declaration supplies only this container environment. The named receiver then applies its own documented configuration precedence.',
    impact: 'Changes this container input on replacement; a receiving action occurs only when the named command and its stated branch execute.',
    failure: 'Producer or required Secret failures stop injection or startup. Later failures follow the exact named receiving-source contract; injection alone proves no runtime success.',
    owner: receiving.receiver, owningSurface: `${source}:${name} in ${receiving.condition}`,
    required: 'conditional on the stated producing workload and receiving action', boundary: 'checked-in workload-to-receiver transport; receiving semantics documented separately',
    evidence: [{ path: source, line: declaration.line, endLine: declaration.line }, ...receiving.evidence],
  };
  const transport = producerOnlyTransports.get(`${name}:${source}`);
  if (transport) return {
    purpose: transport,
    acceptedForm: `The exact literal, Helm expression or valueFrom binding at ${declaration.path}:${declaration.line}; this record proves transport only, not an external parser's accepted form.`,
    defaultBehavior: 'The selected producer supplies the value when its workload and render branch are enabled; no receiving-process default is established here.',
    emptyBehavior: 'A supplied empty string reaches the container environment unchanged; its use or fallback in external commands is not established by checked-in source.',
    invalidBehavior: 'Kubernetes validates the environment declaration and required Secret references. No external value validation or successful runtime consumption is claimed.',
    precedence: 'The selected producer supplies the container environment. An unrelated host command or different workload is not this binding’s receiver.',
    impact: 'Changes the transported environment value on container replacement. Runtime use of that value must be verified in the actual receiving process.',
    failure: 'A declaration or required Secret error can prevent startup. After injection, no value-specific runtime failure or success is established by this transport receipt.',
    owner: source, owningSurface: `${source}:${name} producing-container environment`,
    required: 'conditional on the producing workload and render branch', boundary: 'checked-in producer transport; receiving-runtime behavior not established',
    evidence: [{ path: source, line: declaration.line, endLine: declaration.line }, ...(producerTransportEvidence.get(`${name}:${source}`) ?? [])],
  };
  const runtime = runtimeConsumerContract(name, source);
  if (runtime) return runtime;
  const external = externalReceivingBindings.has(`${name}:${source}`) ? externalNames[name] : null;
  if (!external) return null;
  const [owner, owningSurface] = external;
  return {
    purpose: `Transports ${name} from ${owningSurface} to ${owner}. The checked-in source proves the injection; it does not establish an in-repository process reader.`,
    acceptedForm: `Use the exact literal, Helm expression or valueFrom binding at ${declaration.path}:${declaration.line}. The external loader owns any additional value constraints.`,
    defaultBehavior: 'The rendered producer is the value authority. This transport has no independent process fallback; omission follows the producer render condition.',
    emptyBehavior: 'A declared literal empty string is transported unchanged. Secret-backed values come from the referenced key; Kubernetes rejects a missing required key. The external loader owns interpretation of supplied empty bytes.',
    invalidBehavior: 'Kubernetes rejects invalid env declarations and missing non-optional Secret references. A syntactically valid but unusable value can fail the named external loader; no uninspected runtime validation is claimed.',
    precedence: 'The selected Helm values or maintained deployment profile determines the rendered literal or valueFrom reference. Kubernetes resolves that reference into the receiving container environment; this is not a second direct operator setting.',
    impact: `Changing the owning setting changes the ${owner} input on pod replacement; credential changes require coordination with that external authority.`,
    failure: 'Rendering or pod startup can fail at the declaration or required Secret boundary. After injection, the named external process owns initialization or request failures; verify that process rather than assuming successful delivery.',
    required: 'conditional on the producing workload and render branch', owner, owningSurface, boundary: 'explicit external receiving-runtime boundary',
  };
}

// REVIEWED_PRODUCER_CUSTODY_BEGIN
const reviewedProducerScopes = {
  "s0": {
    "process": "controller container running /app/buster-namespace-controller",
    "assembly": [
      "docker/Dockerfile.namespace-controller"
    ]
  },
  "s1": {
    "process": "openclaw-state-migration container explicit inline init command",
    "assembly": []
  },
  "s2": {
    "process": "openclaw-state-migration container explicit inline init command",
    "assembly": [],
    "transport": "The startup-doctor container receives SWARM_CONFIG for its external OpenClaw doctor command. It does not execute the Gateway health reader of the same name; checked-in startup consumption is not established."
  },
  "s3": {
    "process": "openclaw-state-migration container explicit inline init command",
    "assembly": [],
    "transport": "The startup-doctor container receives LITELLM_API_KEY for its external OpenClaw doctor command. It does not execute the Gateway health reader of the same name; checked-in startup consumption is not established."
  },
  "s4": {
    "process": "openclaw-state-migration container explicit inline init command",
    "assembly": [],
    "transport": "The startup-doctor container receives OPENCLAW_GATEWAY_TOKEN for its external OpenClaw doctor command. It does not execute the Gateway health reader of the same name; checked-in startup consumption is not established."
  },
  "s5": {
    "process": "init-setup container explicit inline init command",
    "assembly": []
  },
  "s6": {
    "process": "init-setup container explicit inline init command",
    "assembly": [],
    "transport": "The init-setup container receives AGENT_ROLE. It does not execute the same-name startup-doctor or Gateway health reader; writing a later health script or an environment Secret reference is not reading this input."
  },
  "s7": {
    "process": "init-setup container explicit inline init command",
    "assembly": [],
    "transport": "The init-setup container receives LITELLM_API_KEY. It does not execute the same-name startup-doctor or Gateway health reader; writing a later health script or an environment Secret reference is not reading this input."
  },
  "s8": {
    "process": "kubeclaw container environment available to explicit health/lifecycle probe children; main Gateway command selected independently",
    "assembly": []
  },
  "s9": {
    "process": "kubeclaw container environment available to explicit health/lifecycle probe children; main Gateway command selected independently",
    "assembly": [],
    "transport": "The Gateway container receives AGENT_ROLE. The checked-in same-name startup-doctor/init consumer runs in a different container; this declaration does not establish a Gateway environment reader."
  },
  "s10": {
    "process": "kubeclaw container environment available to explicit health/lifecycle probe children; main Gateway command selected independently",
    "assembly": [],
    "transport": "The Gateway container receives GIT_REPO_URL. The checked-in same-name startup-doctor/init consumer runs in a different container; this declaration does not establish a Gateway environment reader."
  },
  "s11": {
    "process": "kubeclaw container environment available to explicit health/lifecycle probe children; main Gateway command selected independently",
    "assembly": [],
    "transport": "The Gateway container receives DISCORD_WEBHOOK. The checked-in same-name startup-doctor/init consumer runs in a different container; this declaration does not establish a Gateway environment reader."
  },
  "s12": {
    "process": "codex container",
    "assembly": [
      "ops/pod/Dockerfile"
    ]
  },
  "s13": {
    "process": "codex container; explicit host-injected verification command, not supervisor startup",
    "assembly": [
      "ops/pod/Dockerfile"
    ],
    "receiver": "ops/pod/verify.py"
  },
  "s14": {
    "process": "ops-mcp container",
    "assembly": [
      "tools/ops-mcp/Dockerfile"
    ],
    "receiver": "tools/ops-mcp/src/config.mjs"
  },
  "s15": {
    "process": "tailscale container",
    "assembly": []
  },
  "s16": {
    "process": "Prism backup mode container backup/verify/database-proof",
    "assembly": []
  },
  "s17": {
    "process": "Prism backup mode container backup only",
    "assembly": []
  },
  "s18": {
    "process": "Prism backup mode container backup/database-proof",
    "assembly": []
  },
  "s19": {
    "process": "ingestion container",
    "assembly": [
      "docker/Dockerfile.prism-ingestion"
    ]
  },
  "s20": {
    "process": "bootstrap-database-roles container",
    "assembly": [
      "docker/Dockerfile.prism-control"
    ]
  },
  "s21": {
    "process": "migrate container",
    "assembly": [
      "docker/Dockerfile.prism-control"
    ]
  },
  "s22": {
    "process": "postgresql container external image initialization and mounted initial-role SQL script",
    "assembly": []
  },
  "s23": {
    "process": "Prism control-studio-worker container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-control",
      "docker/Dockerfile.prism-worker",
      "docker/Dockerfile.prism-studio"
    ],
    "receiver": "skills/prism/server/control-config.ts (Control); skills/prism/server/worker-config.ts (worker); Studio loader delivery unproved",
    "receivingProcesses": [
      {
        "process": "Prism control",
        "receiver": "skills/prism/server/control-config.ts",
        "boundary": "checked-in loader and source recipe"
      },
      {
        "process": "Prism worker",
        "receiver": "skills/prism/server/worker-config.ts",
        "boundary": "checked-in loader and source recipe"
      },
      {
        "process": "Prism studio",
        "receiver": null,
        "boundary": "transport only; default recipe omits imported configuration/request modules"
      }
    ]
  },
  "s24": {
    "process": "Prism control-worker container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-control",
      "docker/Dockerfile.prism-worker"
    ],
    "receiver": "skills/prism/config/native-worker.ts (worker only); Control injection is transport only",
    "receivingProcesses": [
      {
        "process": "Prism control",
        "receiver": null,
        "boundary": "transport only; no checked-in Control digest reader established"
      },
      {
        "process": "Prism worker",
        "receiver": "skills/prism/config/native-worker.ts",
        "boundary": "checked-in worker loader; source assembly not runtime success"
      }
    ]
  },
  "s25": {
    "process": "Prism control-worker container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-control",
      "docker/Dockerfile.prism-worker"
    ],
    "receiver": "skills/prism/server/control-config.ts; skills/prism/server/worker-config.ts"
  },
  "s26": {
    "process": "Prism control container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-control"
    ],
    "receiver": "skills/prism/server/control-config.ts"
  },
  "s27": {
    "process": "Prism control container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-control"
    ]
  },
  "s28": {
    "process": "Prism studio container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-studio"
    ],
    "transport": "The Studio container receives this input in the selected Studio branch. Its image recipe copies studio.ts but not its imported studio-config.ts/studio-request.ts modules. The standalone checked-in loader semantics are documented separately; this recipe does not establish delivered loader execution."
  },
  "s29": {
    "process": "Prism worker container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-worker"
    ],
    "receiver": "skills/prism/config/native-worker.ts"
  },
  "s30": {
    "process": "Prism worker container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-worker"
    ],
    "receiver": "skills/prism/server/worker-config.ts"
  },
  "s31": {
    "process": "Prism control-worker container branch(es)",
    "assembly": [
      "docker/Dockerfile.prism-control",
      "docker/Dockerfile.prism-worker"
    ]
  },
  "s32": {
    "process": "litellm external container",
    "assembly": []
  },
  "s33": {
    "process": "registry external container",
    "assembly": []
  },
  "s34": {
    "process": "buster-v2-runtime extra container",
    "assembly": [
      "docker/Dockerfile.buster-runtime"
    ]
  },
  "s35": {
    "process": "external Cilium Hubble UI backend profile extraEnv",
    "assembly": []
  },
  "s36": {
    "process": "external LiteLLM profile extraEnv",
    "assembly": []
  },
  "s37": {
    "process": "Nova Gateway profile extraEnv",
    "assembly": []
  },
  "s38": {
    "process": "Prism Gateway profile extraEnv",
    "assembly": [
      "docker/Dockerfile.prism-agent"
    ],
    "receiver": "skills/prism/openclaw-plugin/index.mjs"
  },
  "s39": {
    "process": "Prism Gateway profile extraEnv",
    "assembly": [
      "docker/Dockerfile.prism-agent"
    ]
  },
  "s40": {
    "process": "prism-agent-bridge extra container with explicit node /opt/kubeclaw-prism/agent-bridge.mjs command",
    "assembly": [
      "docker/Dockerfile.prism-agent"
    ],
    "receiver": "skills/prism/server/agent-bridge.mjs"
  },
  "s41": {
    "process": "prism-agent-bridge extra container with explicit node /opt/kubeclaw-prism/agent-bridge.mjs command",
    "assembly": [
      "docker/Dockerfile.prism-agent"
    ]
  }
};
const reviewedProducerCustody = new Map([
  ["KUBECLAW_NAMESPACE:charts/kubeclaw/templates/buster-namespace-controller.yaml:a559b34ef40e7dafe57a7d1b72c364f9bab15a8e1a2bafe7cde9a4030a0b5b10", "s0"],
  ["BUSTER_CONTROLLER_SERVICE_ACCOUNT:charts/kubeclaw/templates/buster-namespace-controller.yaml:c8409412139631fb19a35451e79a3c4cbdae7da9b496819263b70d1c89a119e6", "s0"],
  ["BUSTER_SECRET_ROLE_NAME:charts/kubeclaw/templates/buster-namespace-controller.yaml:53705cb6008646f20fdb2fd288cdd0b5b27bd11447d1ab1ee74895dc4e110f54", "s0"],
  ["BUSTER_DEPLOYER_ROLE_NAME:charts/kubeclaw/templates/buster-namespace-controller.yaml:7eccc83de4668026ba9e0476d9ea11aafdd31e6529546a6e5450c5e06fbbeddf", "s0"],
  ["BUSTER_TESTER_ROLE_NAME:charts/kubeclaw/templates/buster-namespace-controller.yaml:0968d72760d0134886ec4ccc1d40e036d739b1bded42ba0fcfac9ec8d7f717c0", "s0"],
  ["BUSTER_ALLOWED_ACCESS_JSON:charts/kubeclaw/templates/buster-namespace-controller.yaml:9080d094b0fead571a3d612fa5953f2e957bf34e40a03d5141d4007c5743779d", "s0"],
  ["BUSTER_ALLOWED_SOURCE_SECRETS:charts/kubeclaw/templates/buster-namespace-controller.yaml:f404252ec2eec8ab7bdcc65bd17c25f4144b9707eaf99d0fb0537a751307ccc0", "s0"],
  ["BUSTER_LEASE_API_GROUP:charts/kubeclaw/templates/buster-namespace-controller.yaml:96b76260ce352fa6ffbc41e0901f4f91eea064ae2b4de4c75920b4ed01828c80", "s0"],
  ["BUSTER_LEASE_API_VERSION:charts/kubeclaw/templates/buster-namespace-controller.yaml:020c937ab78e75fad09ec13956e1676fbc6cb7c0cbb4f31d70ba925d7aaa5967", "s0"],
  ["BUSTER_ALLOWED_NAMESPACE_PREFIXES:charts/kubeclaw/templates/buster-namespace-controller.yaml:452dfc6aa038bc0c0a01d2250c8c343160e8b6ca7ac4368a5cd07760dd50a97c", "s0"],
  ["BUSTER_DEFAULT_TTL_SECONDS:charts/kubeclaw/templates/buster-namespace-controller.yaml:eac5eb0a7f86b981b49f296cf359d9b5b8bb9279e8c9a3c38d6ab451c4f0b59c", "s0"],
  ["BUSTER_MAX_TTL_SECONDS:charts/kubeclaw/templates/buster-namespace-controller.yaml:200e38cebdc08324e1ffd3bbb054b5f03fa28a7a52b997b25ff551ffa7e3e042", "s0"],
  ["BUSTER_CONTROLLER_POLL_MS:charts/kubeclaw/templates/buster-namespace-controller.yaml:c5a8119e7c3d5e17ab1a5636ce9a7d2bf4b0ce63f1e3eb356784db928f724f3d", "s0"],
  ["BUSTER_READY_LISTEN:charts/kubeclaw/templates/buster-namespace-controller.yaml:38f599949aff7f32356c8cc06e2f826a02a91ff6831ebdd110102b132301512b", "s0"],
  ["BUSTER_READY_AUDIENCE:charts/kubeclaw/templates/buster-namespace-controller.yaml:c6f7dc72d94916989795ea2bd84eef5f81fad2993af7e5eef6b1f3d5abb212df", "s0"],
  ["BUSTER_READY_PRODUCER:charts/kubeclaw/templates/buster-namespace-controller.yaml:8369327ffa65612040efe28b6c56a669db3849c12fc298aee1df8bf3e0bd9a58", "s0"],
  ["BUSTER_READY_TLS_CERT:charts/kubeclaw/templates/buster-namespace-controller.yaml:97ab3eebe298d60684998e19639aa63466c2bcbb07e9e5bf9de0dca62a296db8", "s0"],
  ["BUSTER_READY_TLS_KEY:charts/kubeclaw/templates/buster-namespace-controller.yaml:6587b0e9bcec64f3effa02940d066923a19601d6ad815f33bea2e74c89fc578d", "s0"],
  ["BUSTER_PRODUCT_ENABLED:charts/kubeclaw/templates/buster-namespace-controller.yaml:5ea31313a9128334113f32f98f4b3d869eca18877e161baa3984fe2c42afde4d", "s0"],
  ["BUSTER_PRODUCT_AUDIENCE:charts/kubeclaw/templates/buster-namespace-controller.yaml:1b60d5b332a2c4e2cec287df4c5831b7cdad4f8a253100e70ed20072f8d1164c", "s0"],
  ["BUSTER_PRODUCT_PRODUCER:charts/kubeclaw/templates/buster-namespace-controller.yaml:9305b8c36128e931f2cfd4961e7a59acdab66403aab6c5079704e2e0b5848cec", "s0"],
  ["BUSTER_PRODUCT_ISSUER:charts/kubeclaw/templates/buster-namespace-controller.yaml:5a982b1b0d0e5db732f134e5bc3f383bdbb1d750af056e39f5d0f1accccbe429", "s0"],
  ["BUSTER_PRODUCT_VERIFY_KEY:charts/kubeclaw/templates/buster-namespace-controller.yaml:f3513317df15e36468b1612bacc57e24555093e5312cc42c3701e57dc9103d4b", "s0"],
  ["BUSTER_PRODUCT_ACTORS_JSON:charts/kubeclaw/templates/buster-namespace-controller.yaml:13cdca5203739fed02530dbba18de3fae8e79e805c2a37a9d616037ab63c38f1", "s0"],
  ["HOME:charts/kubeclaw/templates/deployment.yaml:9379e671961e58c6ed8171a5d6e0e3b509161a09c0695681b07a8dec0ec7028b", "s1"],
  ["TMPDIR:charts/kubeclaw/templates/deployment.yaml:9f5b0c52d12e589af2df1e159aa3ced22d42ab8c68ef74ec2dd41e8c9b3b6482", "s1"],
  ["XDG_CACHE_HOME:charts/kubeclaw/templates/deployment.yaml:d7038faba529896256b27000168ab024370d980bb0cb930f165164a0061f912a", "s1"],
  ["NODE_OPTIONS:charts/kubeclaw/templates/deployment.yaml:e477731a2beb01eb0d4ffb163058114ee196f2d52e41bed3662b25906e12fb5b", "s1"],
  ["AGENT_ROLE:charts/kubeclaw/templates/deployment.yaml:1b9576d295d1f0379d7cd2bdfde7422589ceeb5d893966e69ae465f3e3e78c46", "s1"],
  ["NODE_PATH:charts/kubeclaw/templates/deployment.yaml:ab0c6ba5a67548b76e4c52df3312614ec23e9abf5e4852813fafba859b878c89", "s1"],
  ["SWARM_CONFIG:charts/kubeclaw/templates/deployment.yaml:a560e67dd2170065cac177a57de554c7bb7f2d0b0ee5ccb897c8c89af2956739", "s2"],
  ["LITELLM_API_KEY:charts/kubeclaw/templates/deployment.yaml:58ca6983b4ba55a349d065dc6c2db8761d91ea453cf75ca3a615bb7bd94b4440", "s3"],
  ["OPENCLAW_GATEWAY_TOKEN:charts/kubeclaw/templates/deployment.yaml:209613cf8a17b6488342472039bb55d63986248df6e13b5a595f8b62385687a0", "s4"],
  ["DISCORD_TOKEN:charts/kubeclaw/templates/deployment.yaml:c0222f9503674ccf48e6bbf92dc113ca229d8681398c095e99ba0d972aec07b1", "s1"],
  ["HOME:charts/kubeclaw/templates/deployment.yaml:6578c95c34d7363332bb8a760dcc996be4a0b9c47f5490809034d95578cebed3", "s5"],
  ["TMPDIR:charts/kubeclaw/templates/deployment.yaml:17a5f125d43360a4d89c6a43210ac00b14ee8ab28ae1d24e4a34184cc531aeef", "s5"],
  ["XDG_CACHE_HOME:charts/kubeclaw/templates/deployment.yaml:7cee4bb7fc7ac13018d29ba51dc2cba148ab3966933606d6a37b48e051c53d50", "s5"],
  ["INIT_RUN_AS_ROOT:charts/kubeclaw/templates/deployment.yaml:ac312ff485cf663cb6dd1af3a560b57dd36515140af9b9a912a31c0932bde73d", "s5"],
  ["INIT_SSH_HOME:charts/kubeclaw/templates/deployment.yaml:55177a56d52d353fadd7e1167a55e6d35f7f9e151620fd43b55258d255da8556", "s5"],
  ["AGENT_NAME:charts/kubeclaw/templates/deployment.yaml:ce47c116d56ed514199d3c2856cd6d8251c219aa7baa0464ed8a7c6e38e794c4", "s5"],
  ["AGENT_ROLE:charts/kubeclaw/templates/deployment.yaml:db8d8bf57ae8bf6c310c1781b01a742846c1da2cb127214333e3df5275a477a4", "s6"],
  ["GIT_REPO_URL:charts/kubeclaw/templates/deployment.yaml:8637e8492245db05adc10628b69483b7ec13d061f500cdf909d2a6456c43c8ef", "s5"],
  ["OVERRIDE_WORKSPACE:charts/kubeclaw/templates/deployment.yaml:efef91540c5dbebdc53998dbd6ef56d4cf8c1a1fee559b7af23d05cd271cd14d", "s5"],
  ["OVERRIDE_SWARM_CONFIG:charts/kubeclaw/templates/deployment.yaml:c4a8dda2d196c5b995656cd93458d00a12c9de16266efe1be14899f8558ca282", "s5"],
  ["CODE_BUNDLE_ENABLED:charts/kubeclaw/templates/deployment.yaml:1862c10d1dadb334e8d4f8d8d706d86f3f5431a72d0c06ecd9a52346edaa0d5c", "s5"],
  ["CODE_BUNDLE_ARCHIVE_URL:charts/kubeclaw/templates/deployment.yaml:49b8f6e373db5a56adabb72100a473626f8ceaaac75a4832f823ba57dfe373ff", "s5"],
  ["CODE_BUNDLE_SHA256:charts/kubeclaw/templates/deployment.yaml:e1149b783a799ac69f1231ad32f8c506edacb730016d311527f29f1b06c3e51d", "s5"],
  ["CODE_BUNDLE_EXPECTED_COMMIT:charts/kubeclaw/templates/deployment.yaml:9dd68bcd622e4d884ee1246fe1ebb9535c5c7ae5a91c3b8989f8245d5141dbd8", "s5"],
  ["CODE_BUNDLE_CONTRACT_VERSION:charts/kubeclaw/templates/deployment.yaml:71e31d32357d186a921b7a41f6d9b15dbf22c96bf0e14a1883ca409f08434203", "s5"],
  ["CODE_BUNDLE_ARCHIVE_PATH:charts/kubeclaw/templates/deployment.yaml:ed495c25e388ac7f9978c6e146723c1fada8bd6b8bfafaacb329b3528a52a0e0", "s5"],
  ["CODE_BUNDLE_AUTH_TOKEN:charts/kubeclaw/templates/deployment.yaml:5dccc887127690a7232445fe0b45ec38f160bfff65f46fe2b6361fa87f173371", "s5"],
  ["CODE_BUNDLE_AUTH_TOKEN:charts/kubeclaw/templates/deployment.yaml:8592bf0726c1d45e404fcf78b14dcb8272aea5efcebaf753a27dd2370556fd27", "s5"],
  ["LITELLM_API_KEY:charts/kubeclaw/templates/deployment.yaml:21d8469c04118812c22ce733e3068ea740baf2b69a515f5122c411eb50901665", "s7"],
  ["DISCORD_TOKEN:charts/kubeclaw/templates/deployment.yaml:78f341a27deacda26689e3430cf2e428675434e447bc64aa9768fcaff9eb241d", "s5"],
  ["STITCH_API_KEY:charts/kubeclaw/templates/deployment.yaml:1aac6f2565e491b0cbb88120aa8012205a06d8fcc9b938c53d6ae5e36b27654e", "s5"],
  ["DISCORD_WEBHOOK:charts/kubeclaw/templates/deployment.yaml:3353c08d4816d77bb7a10090c390662a3f9f49e36962fbe0c0518cd1d836ef16", "s5"],
  ["HOME:charts/kubeclaw/templates/deployment.yaml:218ba07fed06b1d1e1b00ea111c5005fb57745278b7ecc960c6c898e10e1eda2", "s8"],
  ["TMPDIR:charts/kubeclaw/templates/deployment.yaml:65f6dcce3480c0f4f69f651d2f9b207348ec0c68423975eb4340b0d5e445ed93", "s8"],
  ["XDG_CACHE_HOME:charts/kubeclaw/templates/deployment.yaml:9fc2345959eeec4e369ea1beaf4fc0b9a8591899af9a7ed3ee7ca4d8a1707740", "s8"],
  ["NODE_PATH:charts/kubeclaw/templates/deployment.yaml:7c02b61992a965b0c074375010f65b66c7b8d15b208ab1c7c7b2dadf5aefe1ba", "s8"],
  ["AGENT_NAME:charts/kubeclaw/templates/deployment.yaml:aac9e2de0bc69140856df04cc2243ee75ef6e0cadf6184224947077c228dff4a", "s8"],
  ["AGENT_ROLE:charts/kubeclaw/templates/deployment.yaml:2b27f66a1a3acd0c7ad3059f868effc5ea953f1bc6fd710f4fe6f43dedbb5ee6", "s9"],
  ["KUBECLAW_CONTAINER_ROLE:charts/kubeclaw/templates/deployment.yaml:57c9091c5935822fa8e55ad54cc9ea20ce541b1f8cfc8f6ad2d0ececedcef151", "s8"],
  ["TAILSCALE_OPERATOR_NAMESPACE:charts/kubeclaw/templates/deployment.yaml:896a706fb04233cab3d59fd79d17a98899bb5554c24126bb0a0d1da88dc8f1ed", "s8"],
  ["TAILSCALE_OAUTH_SECRET_NAME:charts/kubeclaw/templates/deployment.yaml:2a8d35c0972d836bd313267fa36a8c18a584eb59155461c3b3fcd675d50a92f4", "s8"],
  ["KUBECLAW_CODE_BUNDLE_ENABLED:charts/kubeclaw/templates/deployment.yaml:b43226a66c87aae11f0797842ac46befab0837d8e7a6bf5790a9f501a77b7d62", "s8"],
  ["KUBECLAW_CODE_BUNDLE_AGENT:charts/kubeclaw/templates/deployment.yaml:f17ad0e0220f9b60fdebb37290e2c1830c09f23c613c7edf45285283c2c9ec27", "s8"],
  ["KUBECLAW_CODE_BUNDLE_EXPECTED_COMMIT:charts/kubeclaw/templates/deployment.yaml:1df0fb77fbe6426f50c5a5d837f592792176339e053bccb936bcb625707b4aa2", "s8"],
  ["KUBECLAW_CODE_BUNDLE_CONTRACT_VERSION:charts/kubeclaw/templates/deployment.yaml:7872147368cc77e544f2bafcc1f5de29c46d3d25a2ce3e40af5cee2570efb6b0", "s8"],
  ["KUBECLAW_CODE_BUNDLE_MANIFEST:charts/kubeclaw/templates/deployment.yaml:9668905b08e1b78eaa6bd141e58b646327de65978d29dbd4eb8bc4660fc6fde7", "s8"],
  ["GIT_REPO_URL:charts/kubeclaw/templates/deployment.yaml:ff4a515549328f360b83775538cb847d4cfd2b7fd1ca550ce02d12524ff0a6e1", "s10"],
  ["REPO_ROOT:charts/kubeclaw/templates/deployment.yaml:8e2a30c6e11dce875f331b1f4328123c62dca4f57681e710b743cb237cb1d095", "s8"],
  ["REDIS_HOST:charts/kubeclaw/templates/deployment.yaml:f1056108281bcf13aa19ad736136d1971199ede9f879ad395d0abb8ea46e3669", "s8"],
  ["REDIS_PORT:charts/kubeclaw/templates/deployment.yaml:48f2a164053d84e96f223671216bfc932b5871964c92d06c7945563ba00fad1d", "s8"],
  ["REDIS_PASSWORD:charts/kubeclaw/templates/deployment.yaml:ae5649d3c81dc8c809d39d97d844ac9c3b94b72da55cd731751e277e4a2970a3", "s8"],
  ["LITELLM_URL:charts/kubeclaw/templates/deployment.yaml:d3fc08bdc9c7635baf96172fbccf30c2aaf5b9e1b352a31fc27fb441f021fbd0", "s8"],
  ["OPENCLAW_GATEWAY_URL:charts/kubeclaw/templates/deployment.yaml:c156a010845cc34fbe0844890050347769cba0a13666e19ef2d6cb039de56a0b", "s8"],
  ["OPENCLAW_GATEWAY_TOKEN:charts/kubeclaw/templates/deployment.yaml:206493c9b7eed2dc5f295e405aae4af73bd16b53ac3c02112a3e3f661a4ef90f", "s8"],
  ["KUBECLAW_CAPABILITY_PROVIDERS:charts/kubeclaw/templates/deployment.yaml:446ca8ed292856ab618b47491fe8880ce1e3c17af4e5089647ad23194c811c3e", "s8"],
  ["LITELLM_API_KEY:charts/kubeclaw/templates/deployment.yaml:9050483214d90a335bf7bfdefc85ab25069e081e52d524e1ec6549f8d4ab0a35", "s8"],
  ["DISCORD_TOKEN:charts/kubeclaw/templates/deployment.yaml:9eb5a5bcb199a12f18489c40229dbb010f8e036f0580fe23b44de3db8db23a25", "s8"],
  ["DISCORD_CHANNEL:charts/kubeclaw/templates/deployment.yaml:64f8a895aab7aae9d8ae19d7e23687d0ae492c35d005c4f5d3a0406fd8d7604f", "s8"],
  ["DISCORD_WEBHOOK:charts/kubeclaw/templates/deployment.yaml:173ee9b6e88dab2a8f94c1d570e0f365c17f0a2f38a3e0d23d9596bba4554529", "s11"],
  ["SWARM_CONFIG:charts/kubeclaw/templates/deployment.yaml:a33f7233e830f4d0da7baf05b89e84b49bbe713c3576ff1958a406256dca3df0", "s8"],
  ["GATEWAY_PORT:charts/kubeclaw/templates/deployment.yaml:f3a74acc36a077d7df29e850d154fd0580afe23ba6f59df8bf0ee89cb0411cb4", "s8"],
  ["KUBECLAW_DRAIN_FILE:charts/kubeclaw/templates/deployment.yaml:e4608bce9679500eecaef1a1f4e929731d772b4621f96f44f639144a99365652", "s8"],
  ["KUBECLAW_PRESTOP_DRAIN_SECONDS:charts/kubeclaw/templates/deployment.yaml:b15289f60d85dcdd41eb44921d4c42b301742642555d0ee1f65ab0eac7ca70d2", "s8"],
  ["KUBECLAW_HEALTH_TIMEOUT_MS:charts/kubeclaw/templates/deployment.yaml:0552653239766a47890d3cbc3cf3ec3f6813ca7159a56f8e041ea8553ee33259", "s8"],
  ["KUBECLAW_HEALTH_STARTUP_STATUS_PATH:charts/kubeclaw/templates/deployment.yaml:32515a96154a006d591357edfc396344e0019b10f2de3baf2158537891d836e6", "s8"],
  ["KUBECLAW_HEALTH_STARTUP_EVENT_LOG_PATH:charts/kubeclaw/templates/deployment.yaml:ec9c06d3d6ac9bf4bad8d9ac7d78a3ea0269104a1dce271ddcf7e4b29dd61c82", "s8"],
  ["KUBECLAW_HEALTH_REQUIRE_STARTUP_MARKER:charts/kubeclaw/templates/deployment.yaml:cb90313408fdd28730ea0d5b8cf8370bb2edaf60463c2475d118a9fb87dc2e30", "s8"],
  ["KUBECLAW_HEALTH_CHECK_GATEWAY:charts/kubeclaw/templates/deployment.yaml:11fe0b55b47eb1ac4c74219e577734e64a6829f5e1bc1e454d13adec5f884b21", "s8"],
  ["KUBECLAW_HEALTH_CHECK_REDIS:charts/kubeclaw/templates/deployment.yaml:a73734e2103a41c7276b2e2329b87008d360f1a4f1355b72547c84dd3708011c", "s8"],
  ["KUBECLAW_HEALTH_CHECK_REDIS_STREAM:charts/kubeclaw/templates/deployment.yaml:e19df61bf14ac0b48066d9b2f146ea82d3b634bc5043769b54eb822de2db0f25", "s8"],
  ["KUBECLAW_HEALTH_REDIS_STREAM:charts/kubeclaw/templates/deployment.yaml:2accc8527a5aac12cc29d87f2026ab4f038706f5b76c7ab950e0536b6e4295f6", "s8"],
  ["KUBECLAW_HEALTH_REDIS_STREAM_MAX_LEN:charts/kubeclaw/templates/deployment.yaml:c741516044988d991d77a942f03339b19baeaf3f2dc5f7419618523d486dd9ee", "s8"],
  ["KUBECLAW_HEALTH_CHECK_LITELLM:charts/kubeclaw/templates/deployment.yaml:1f1d6f53fa7bec09f2cb481aead8582b989da53442c8bf7b5b6e82dab2d208b8", "s8"],
  ["KUBECLAW_HEALTH_CHECK_REGISTRIES:charts/kubeclaw/templates/deployment.yaml:5afb61007aec67b36ed35e92514408d1c88a915fb11e414cce755dfeee264b50", "s8"],
  ["KUBECLAW_HEALTH_REGISTRIES:charts/kubeclaw/templates/deployment.yaml:47fe902895b23ff551b6a809badf15680f981378d4d2d3de80fa3380744b58fc", "s8"],
  ["CURRENT_PROJECT:charts/kubeclaw/templates/deployment.yaml:a7d4b3b5f0f2aad8c3ca043eb37af0af54e121db06b375462804820a3c154d81", "s8"],
  ["SPIFFE_ENDPOINT_SOCKET:charts/kubeclaw/templates/deployment.yaml:b24b5e88cebcef3e24d52faaac29f14cc49d708694261cc5be8df722b874a835", "s8"],
  ["HOME:charts/ops-pod/templates/workload.yaml:d88ac1b192b93c93968a874e53664c7d24309becef444a09f30d6b9c6fd36b11", "s12"],
  ["OPS_DEFAULT_NAMESPACE:charts/ops-pod/templates/workload.yaml:1e870f9c53d1313331a4e5be4e834537d9a45d893bfb269a6de7642c4268789f", "s13"],
  ["OPS_EXEC_NAMESPACES:charts/ops-pod/templates/workload.yaml:eeca415dce4c81f3037a936c5cf3add8abd3bb0564dffa443b50ef57cd54c522", "s13"],
  ["KUBECONFIG:charts/ops-pod/templates/workload.yaml:7b9372b420ffc464527dccdbbb30513577cdfcb7158815137c763922344926d9", "s12"],
  ["GH_TOKEN:charts/ops-pod/templates/workload.yaml:6f602add4696f01b5367fc33c453249303027113ce238ed88a26d19f7b9a978d", "s12"],
  ["HOST:charts/ops-pod/templates/workload.yaml:cf0331935731ea2f95154de21d8d99c103350ce6f92d4d3b11aac298681fb3d3", "s14"],
  ["OPS_LOCAL_ONLY:charts/ops-pod/templates/workload.yaml:0525d42b3c856ff80648401a4a919b3f4bf5a0e05c64a35a74ab87235ed8f7fa", "s14"],
  ["OPS_DEFAULT_NAMESPACE:charts/ops-pod/templates/workload.yaml:a459535f08187d1e28176fbc9f462d7fa06b1a39738715db09194efdedaa565d", "s14"],
  ["OPS_ALLOWED_NAMESPACES:charts/ops-pod/templates/workload.yaml:68ebe31ca36d792fef67a019bca61cb5daaf35f53207f2a56441d8b5b58f14cb", "s14"],
  ["ARGOCD_NAMESPACE:charts/ops-pod/templates/workload.yaml:029e8af6addbdc6137d1a148d319244dfae3d38bb3d61eb268c90dd2b8511764", "s14"],
  ["OPS_MCP_BEARER_TOKEN_FILE:charts/ops-pod/templates/workload.yaml:e70d5b760fc62419b80c3227d8a449c9af666db631e4d0f5b0d9bfa98e21b283", "s14"],
  ["TS_USERSPACE:charts/ops-pod/templates/workload.yaml:11c134b6a73c9a7da86591b5b66bb3b1715bdc6e6c083c80d1744c1dc1ed1707", "s15"],
  ["TS_AUTH_ONCE:charts/ops-pod/templates/workload.yaml:dc5266e7da45c525cb26d2521cd594d429bb44cdff4937a6cbc18f6b2b25dd18", "s15"],
  ["TS_KUBE_SECRET:charts/ops-pod/templates/workload.yaml:98797d7930bb89c9e2ece5f051bbb074587b5f8e143e0aaf705d2cdf04935ab4", "s15"],
  ["TS_STATE_DIR:charts/ops-pod/templates/workload.yaml:7f93d980bddecfd02c8fffa312cf4fadf46091e294a5c6b23fa2c35edf7e230a", "s15"],
  ["TS_SOCKET:charts/ops-pod/templates/workload.yaml:815c7326f011a990ce945d6442bd1b0da6781634cc21fd4121b7cd21a4ca4d0a", "s15"],
  ["TS_SOCKS5_SERVER:charts/ops-pod/templates/workload.yaml:ac7d9987f6277702e7446ddadc47ed8545f530821778fa99ce36895c5c7d164a", "s15"],
  ["TS_HOSTNAME:charts/ops-pod/templates/workload.yaml:d7f4dc3415978ffe9882064a0e9f2e0241590d2839f0e5138c3628cd42e73a33", "s15"],
  ["TS_EXTRA_ARGS:charts/ops-pod/templates/workload.yaml:7dcfcb5e16ca6a1f17006cf49e1fa51667976bb9b6e6defe575a36041c1beacc", "s15"],
  ["TS_AUTHKEY:charts/ops-pod/templates/workload.yaml:be9ad6fa1cab49bd95525081127ebc3524d888c48c0e57b7939c779b58e11592", "s15"],
  ["BACKUP_ROOT:charts/prism/templates/backup.yaml:9114adb1b12073fb7d8e01fbda4b1eb19447993d0e258618b0ca103d9062b8e4", "s16"],
  ["BACKUP_MAXIMUM_BYTES:charts/prism/templates/backup.yaml:9e097e1c9bf89c2b285f0137dd26edc55d7ac01f55faa818a23eaeed804a4689", "s16"],
  ["BACKUP_MAXIMUM_RETAINED_BYTES:charts/prism/templates/backup.yaml:995c9f48e297b34ec5660f465d5ea785f1d99cedd39fb0138cb67b7c4ab99af3", "s16"],
  ["BACKUP_MAXIMUM_DURATION_SECONDS:charts/prism/templates/backup.yaml:04fa3c6b51359418cc583ae4f18717af39aa15b1cf0cbba29013a9bef31ab4fd", "s16"],
  ["ARTIFACT_ROOT:charts/prism/templates/backup.yaml:07b5b8b186f3f493cf0e9b1f355f118f38422b9da7936b080dc4118626b907ee", "s17"],
  ["PRISM_BACKUP_IMAGE:charts/prism/templates/backup.yaml:358cd22aae3917fa046c049f9957d1dbd2c7939a1fab61b2444d8af6962a25ba", "s17"],
  ["PGCONNECT_TIMEOUT:charts/prism/templates/backup.yaml:b5606abc42dcfd213493eee0afb462c0e8b5dcde599d1be6df5a8babbd253d15", "s18"],
  ["PGHOST:charts/prism/templates/backup.yaml:aeccda1d4973f1103bfe494eb1951a9efd2fb7f15058906309d3077398c1f12c", "s18"],
  ["PGDATABASE:charts/prism/templates/backup.yaml:1865550c8219707bb2445dc863d60a0c9a40e08e5d510f9a9105e46fcfc4b523", "s18"],
  ["PGUSER:charts/prism/templates/backup.yaml:cab7ea2e7b6c71fb6cdc3de4c2769b32898e1720218dc20966e35d0457867007", "s18"],
  ["PGPASSWORD:charts/prism/templates/backup.yaml:f92ab6bccfb232f54bc16ef7cd3bba0bd268b1ebbc09e7642dc6955f79fd426e", "s18"],
  ["PORT:charts/prism/templates/ingestion.yaml:68ba8a2937fe0a98893b89452d9591746e7c44021c6983d2e77e2a122954f192", "s19"],
  ["PRISM_INGESTION_SECRET:charts/prism/templates/ingestion.yaml:6d9a9f3b2601b713444754ecc5a8864441d55198a034ea0699490604751f9fd8", "s19"],
  ["PRISM_QUARANTINE_ROOT:charts/prism/templates/ingestion.yaml:910268b169643f49f075a46daa36493e16b4675e1b6288cd97fba30c0e6a2b7f", "s19"],
  ["PRISM_QUARANTINE_TTL_MS:charts/prism/templates/ingestion.yaml:0ba2497078a1d91f3b2972714232db28b2ec0a7f3581103bcfdc9350c1227cc8", "s19"],
  ["ADMIN_DATABASE_URL:charts/prism/templates/jobs.yaml:fbb61f1ee943c7e6e1ba9962cba7b23aa9d5f06ff4c72f2b59b06101eb34852b", "s20"],
  ["PRISM_RUNTIME_PASSWORD:charts/prism/templates/jobs.yaml:8476652b16e3ed9ebecdef0ec34b0416228ffc5e4f7df0bbfaf1b59bba380ae9", "s20"],
  ["PRISM_MIGRATOR_PASSWORD:charts/prism/templates/jobs.yaml:4a22782c0a015145ddf4fd6d8faf4c5fd7f39fb622911e36319f1175eccfcc73", "s20"],
  ["PRISM_READONLY_PASSWORD:charts/prism/templates/jobs.yaml:1d83a3c4ccf524edfc7bf5ad6fa2a9d6c992789ada4400e546a4102ba55bd060", "s20"],
  ["DATABASE_URL:charts/prism/templates/jobs.yaml:18373deaff34a3a00fa3758fb5d717146efd8c55d41abd2f1a2ba55a6f914f5d", "s21"],
  ["POSTGRES_DB:charts/prism/templates/postgresql.yaml:bdc94a6f211a1f018863d7ec5cbd0613282fccefa8572c08080c145e99bebc24", "s22"],
  ["POSTGRES_USER:charts/prism/templates/postgresql.yaml:2ccabd95ab4d8625de54768ebbffc82e2201f6e055a411ad8f4182bcce5359b4", "s22"],
  ["PGDATA:charts/prism/templates/postgresql.yaml:476200d25e88d2e98b59ebe547e43bc9ac053a57449b9e524bf00384dde9f482", "s22"],
  ["POSTGRES_PASSWORD:charts/prism/templates/postgresql.yaml:cdd4653e95ef46f5eba2e60880785389cba8f4ba0a6b468a37d2a60e9e2cf6c1", "s22"],
  ["PRISM_RUNTIME_PASSWORD:charts/prism/templates/postgresql.yaml:e174a8dfa7058c76906d1b2d9fbbde8e7de09da32c8f40518d1e7a439c758a61", "s22"],
  ["PRISM_MIGRATOR_PASSWORD:charts/prism/templates/postgresql.yaml:4111e18a4f8912ad4be8752a4ed0d3ab69e7fde315039702688a244b22ccf46e", "s22"],
  ["PRISM_READONLY_PASSWORD:charts/prism/templates/postgresql.yaml:e053adc04fc82e56f9176f46aa75be21032787ba86e8a28f0288882b52168229", "s22"],
  ["PORT:charts/prism/templates/workloads.yaml:46d7968d12d8dbeece08144c0f4ded3adf9fe980c3210a79ee5d7fd877d225e5", "s23"],
  ["PRISM_ENGINE_CONTENT_DIGEST:charts/prism/templates/workloads.yaml:0c9488d5e50c85a7e7fbcfa397f87edc104c360c1e904f369f3807f8bb714dc2", "s24"],
  ["PRISM_WORKER_SECRET:charts/prism/templates/workloads.yaml:d3bca448abfd7c9710c7fab74bb53edc6d075bc7d832382bc4b1a37716239023", "s25"],
  ["PRISM_WORKER_URL:charts/prism/templates/workloads.yaml:baba1f3cf51ed201ce4ee119022a94cf4228b1be06af7ac2dc7622369e549fd7", "s26"],
  ["PRISM_CONTROL_INTERNAL_URL:charts/prism/templates/workloads.yaml:1e4bc3420328438775272e7e639e189f88010833285244937025a8e963248566", "s26"],
  ["PRISM_AGENT_URL:charts/prism/templates/workloads.yaml:ef35cff1edcef96194be1850d56e0383f68d8ec7da0d3fe52022d86ec56626f1", "s27"],
  ["PRISM_PIPELINE_PREFERENCE_SUBJECT:charts/prism/templates/workloads.yaml:778e7d77585c5d1b89deb71a0b255eaa472f5e2b87e8d5d2c7da8ee70af5ae27", "s26"],
  ["DATABASE_URL:charts/prism/templates/workloads.yaml:a4afc590b4e998b688950a120f3e25d7d20a471ebfeb6fbed742553f93b51040", "s26"],
  ["PRISM_SESSION_SECRET:charts/prism/templates/workloads.yaml:3223d2ae3a9abad634698ad05e2c83c43bb4abb2c0f64d162387579bcc598cc3", "s26"],
  ["PRISM_INGRESS_SECRET:charts/prism/templates/workloads.yaml:fc8daed97ef4d78f06e06e844a35f0a099caaed57a7fdcddc13059a9a0fa694b", "s26"],
  ["PRISM_DISPATCH_SECRET:charts/prism/templates/workloads.yaml:ca3b03fb69d4d26895eaabfe92ca26f06d12f5de215ae3f874a3a256ad6a49fd", "s26"],
  ["PRISM_INGESTION_URL:charts/prism/templates/workloads.yaml:80daffa4216377ccabd93c13d32c46eedc322372354a180d841a954315a3e736", "s26"],
  ["PRISM_INGESTION_SECRET:charts/prism/templates/workloads.yaml:9da4ec50c109ec40eaf13f9c4cddf0fc1f8f68865ab46db22cf3141c650416fe", "s26"],
  ["PRISM_CONTROL_URL:charts/prism/templates/workloads.yaml:eb55343180326e9635996b3575d2e0bca8eb7b0ed54f1c46ca764aa04340dfb4", "s28"],
  ["PRISM_INGRESS_SECRET:charts/prism/templates/workloads.yaml:748e71d98e32c222d4971964a6e0136fcd22bfe3c8e53f1a85ac225728720ebc", "s28"],
  ["PRISM_NATIVE_CLOSE_TIMEOUT_MS:charts/prism/templates/workloads.yaml:dbd0ca6d345fe46910dfaab60705ac213d0905a5f2574eefba743cdff3a9e4dc", "s29"],
  ["PRISM_WORKER_SHUTDOWN_TIMEOUT_MS:charts/prism/templates/workloads.yaml:af872f2e850f4a4963efd4366239325b7c57821d7a36f545638c5599b273f308", "s30"],
  ["PRISM_CONTROL_INTERNAL_URL:charts/prism/templates/workloads.yaml:3e704c36ab5d8a253244afbc0d804d50d8c61398579ebb92f9097a31186a73a9", "s30"],
  ["DATABASE_URL:charts/prism/templates/workloads.yaml:e4e0f3780b1d70fd2324fe75cf9454a8b1ac088928dff6dc4019e941605d3d60", "s30"],
  ["SPIFFE_ENDPOINT_SOCKET:charts/prism/templates/workloads.yaml:b27049a9dc12d1b0cbc2303dfda87b4e3b7109c312c78cdeee2e6b847d76afd3", "s31"],
  ["WORKER_TRUST_SPIFFE_ENABLED:charts/prism/templates/workloads.yaml:1e659add694611f3257211fd9269b74cc9cf9e004b439e18fc5a051ac258aeff", "s25"],
  ["PRISM_TRUSTED_NOVA_SPIFFE_ID:charts/prism/templates/workloads.yaml:2554b22c99c33879c0268c2fa76bef443be8d51b55e393b961c15db5d812b841", "s26"],
  ["PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID:charts/prism/templates/workloads.yaml:2b080fba5497d5247feac384e1a3e0bbbbe817ab62dcc5308ec78a302818e988", "s26"],
  ["PRISM_TRUSTED_WORKER_SPIFFE_ID:charts/prism/templates/workloads.yaml:3efead07591048661b1081fc6fad260dcfca2676155677a3392f9824a888515b", "s26"],
  ["PRISM_CONTROL_SPIFFE_ID:charts/prism/templates/workloads.yaml:45c07251a9897841a8e7cf0dd392f0880c8d70a9700c06a93a1552f10a773d38", "s26"],
  ["PRISM_TRUSTED_AGENT_SPIFFE_ID:charts/prism/templates/workloads.yaml:48250aea76e3273afe66481f53d73fa20fada9a344895ae5e23657bd5a4423ef", "s26"],
  ["PRISM_TRUSTED_CONTROL_SPIFFE_ID:charts/prism/templates/workloads.yaml:de2e35425851798db5203c169185b85ee20564fa1a3d5e6a5e36b488dfafe64f", "s30"],
  ["GOOGLE_APPLICATION_CREDENTIALS:gitops/platform/litellm/resources.yaml:0ad7bf70d04ec47bd0022a7564505a796688cf844443a439c95a2f80fc3c07ae", "s32"],
  ["STORE_MODEL_IN_DB:gitops/platform/litellm/resources.yaml:7e4f7c1cc6e979907c289fd62a82765be531a71f296ff77ef46e4c031715686f", "s32"],
  ["REGISTRY_STORAGE_DELETE_ENABLED:gitops/platform/registry-local/resources.yaml:9ccc23ed6a5d299a60ae4ea3d55e22ddd1bf10ff5ed6b8689c22cb6beadade73", "s33"],
  ["BUSTER_V2_TOKEN:my-values/buster-values.yaml:07141f39ca7f76182ce47bdfb759942d412eb401cf4fa655b5eaa04145f635ed", "s34"],
  ["BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY:my-values/buster-values.yaml:379590d6553d3828d3c7e757b68f61067789224991336f36e92e07d7d6e9aa06", "s34"],
  ["BUSTER_TRUSTED_PEER_SPIFFE_ID:my-values/buster-values.yaml:ffd00aa55f969ed8fd5f68dc923a1b408ae9dea2421e523d273dbbb02886e2cf", "s34"],
  ["BUSTER_PLAN_PORT:my-values/buster-values.yaml:34b3cdc8adf3c8842cda27f0d379504b5c7cf5f6fe07a36163a1e6c28b656a6f", "s34"],
  ["BUSTER_PLAN_STATE_DIR:my-values/buster-values.yaml:bfa65ca7f803746e708e22283efd3aec0395e3ca9940932ac8a325789ac80f22", "s34"],
  ["BUSTER_PLAN_RUN_DIR:my-values/buster-values.yaml:00208c9ff37ff0e42b0effa4ef79573f38620a7e62d766b69f5db8391816e2ab", "s34"],
  ["BUSTER_V2_MAX_ARCHIVE_BYTES:my-values/buster-values.yaml:8606bbc8641bd5efdf47115060927054f40675aaba0332fe9abf89ccbb3ea43d", "s34"],
  ["BUSTER_V2_MAX_EXTRACTED_BYTES:my-values/buster-values.yaml:847aec6142182b7b2b0dd8800d86314c8e2a6aa2d533143cb8687e621dc16ea5", "s34"],
  ["BUSTER_V2_RESULT_ROOT:my-values/buster-values.yaml:4b74b9905e25b0913f9cf70a8e8225f8840f82252db566415686dd51e7fb1832", "s34"],
  ["BUSTER_V2_KUBERNETES_CREDENTIALS:my-values/buster-values.yaml:81fb76a0b9a7e05e7716216d30c2897e11204713655e46479c8ab7a06ce009d4", "s34"],
  ["BUSTER_ALLOWED_SOURCE_SECRETS:my-values/buster-values.yaml:4ca3ea287224137d164e5bdbd6ef4d88ff14d443881ed33846e8caa87db912ff", "s34"],
  ["CONTAINER_BUILD_BUILDKIT_HOST:my-values/buster-values.yaml:1c250c2f6dcd843c3d820650a1ae946e81a9a0a9ce182e310d0b70271cc317f5", "s34"],
  ["BUSTER_BROWSER_PLAYWRIGHT_CGROUP_ROOT:my-values/buster-values.yaml:a31f13bafa3b7878706c9a07b50c0e6cc509ca6f0e8764f78db70dfa9f21f0e2", "s34"],
  ["FLOWS_API_ADDR:my-values/infra/cilium-values.yaml:8208d858d19be4428104ff32b3a7755aa791e4e5fed2c8a7609af95ad79d669e", "s35"],
  ["GOOGLE_APPLICATION_CREDENTIALS:my-values/infra/litellm-deployment.yaml:da307cb36d21a542a54971f098e00bd6bab13c709771f31035aeabc12c5d5d7b", "s32"],
  ["STORE_MODEL_IN_DB:my-values/infra/litellm-deployment.yaml:0f0d152424d9393cc98bc3600c42d343f6a319211671e376230764235aa2dfb9", "s32"],
  ["GOOGLE_APPLICATION_CREDENTIALS:my-values/infra/litellm-values.yaml:c38630caf259c2fd0ceeff4ca3cfd8589a6a62b43b18a3a5e27a08e071a3c625", "s36"],
  ["OTEL_TRACES_EXPORTER:my-values/infra/registry-local.yaml:477389727aa950af9ae50f7ee51add18017ad3203eaf291097d27f7017913af0", "s33"],
  ["REGISTRY_PROXY_REMOTEURL:my-values/infra/registry-mirror.yaml:9e4415479c3621bfd9a220af77dee9eade1219ffcc6508e33efec8e61e55b053", "s33"],
  ["REGISTRY_STORAGE_DELETE_ENABLED:my-values/infra/registry-mirror.yaml:6aa51040d163a50966a9257af760d5114f89d7634fc7dc43695559a80c5cc86f", "s33"],
  ["BUSTER_V2_TOKEN:my-values/nova-values.yaml:40aa581485b24befeed466c9a969211255e7e9f65af880be805c3f5bead6eb33", "s37"],
  ["BUSTER_SOURCE_ATTESTATION_PRIVATE_KEY:my-values/nova-values.yaml:c69d84a11d0e5264f9a78938afd8d9b7e2f4a0b21e74ae17c7096ab29c40f83b", "s37"],
  ["BUSTER_GATEWAY_TOKEN:my-values/nova-values.yaml:c2cd5f950878355800c235104a95c1aebbdb1d231ddeb9d536783d1bbc0cbac0", "s37"],
  ["BUSTER_GATEWAY_REPOSITORY_ROOT:my-values/nova-values.yaml:dcf0258030049e2a0765ad502d8c1116508ba00a0a67e7d6c7b03a10cd3c048f", "s37"],
  ["PRISM_CONTROL_URL:my-values/prism-agent-values.yaml:e1d8f8d8d19b84eb8ba8569dfa63e846d8a5984ecc823788a13f2e3bda854c03", "s38"],
  ["PRISM_STUDIO_PUBLIC_URL:my-values/prism-agent-values.yaml:168f0842746d1e93ad240a04b90068e25f335839bab61917af488a1b9073f3f0", "s39"],
  ["PORT:my-values/prism-agent-values.yaml:41c0734e44da116357da622ca8c8e60efeb952fe4d9f52f9aa78c5f05c9f0720", "s40"],
  ["PRISM_CONTROL_URL:my-values/prism-agent-values.yaml:f3986df54a32ba3e70a132eb7a1314eaaa627eb4b4fa1d0362aec7aa4932cd56", "s40"],
  ["PRISM_STUDIO_PUBLIC_URL:my-values/prism-agent-values.yaml:cd4d3d61bcbca69f2914163fff005b181255e15a6ce2c7c51c1bc48da31902fc", "s41"],
  ["OPENCLAW_GATEWAY_TOKEN:my-values/prism-agent-values.yaml:f72b8005fd69223d1f710db2d0ac54084b2506f8a1de071e22f12fec1671ab29", "s41"]
].map(([identity, scope]) => [identity, reviewedProducerScopes[scope]]));
// REVIEWED_PRODUCER_CUSTODY_END
// Finite helper/caller receipts: selected source grammars and complete optional
// branches are acquired separately. These fingerprints bind custody, not parser
// semantics, container-name heuristics or a deployed-image success claim.
const reviewedHelperProducerScopes = {
  "demoHelper": {
    "process": "Nova Gateway container; ready-client helper enabled and validated",
    "assembly": [],
    "transport": "The Nova Gateway receives the ready-client input from the selected helper branch. No checked-in named environment reader establishes its use; the token and CA mounts do not prove consumption.",
    "evidence": [
      {
        "path": "charts/kubeclaw/templates/_demo-ready-client.tpl",
        "line": 3,
        "endLine": 26
      }
    ]
  },
  "registryHelper": {
    "process": "caller-selected extraContainers entry named buster-v2-runtime",
    "assembly": [],
    "transport": "The registry helper appends this input to the caller-selected values container after validation. Its image and command remain configurable; this receipt does not establish a Buster entrypoint or Node reader from the container name.",
    "evidence": [
      {
        "path": "charts/kubeclaw/templates/_registry-clients.tpl",
        "line": 1,
        "endLine": 52
      },
      {
        "path": "charts/kubeclaw/templates/deployment.yaml",
        "line": 1516,
        "endLine": 1529
      }
    ]
  },
  "productHelper": {
    "process": "Prism Control container with product decisions enabled",
    "assembly": [
      "docker/Dockerfile.prism-control"
    ],
    "receiver": "skills/prism/control/product-decisions.ts through Control startup composition",
    "evidence": [
      {
        "path": "charts/prism/templates/_product-decisions.tpl",
        "line": 1,
        "endLine": 29
      }
    ]
  }
};
for (const [identity, scope] of [
  [
    "KUBECLAW_DEMO_READY_ENDPOINT:charts/kubeclaw/templates/deployment.yaml:f0188554881ec7fb2a89c298edf9ab788ea01d94ba3e2049fbc69fdd197bf826",
    "demoHelper"
  ],
  [
    "KUBECLAW_DEMO_READY_AUDIENCE:charts/kubeclaw/templates/deployment.yaml:ecd5457005570f558c6cf23a952e9d7b2bb53d94b3e057033ee4b559b560dad4",
    "demoHelper"
  ],
  [
    "KUBECLAW_DEMO_READY_TOKEN_PATH:charts/kubeclaw/templates/deployment.yaml:3a1ca0cd7bb67bdaf22e5aa51f2734b408c2427aa495174c2730ded0b337a072",
    "demoHelper"
  ],
  [
    "KUBECLAW_DEMO_READY_CA_PATH:charts/kubeclaw/templates/deployment.yaml:778d8a7b612c6ea7585cb40afcd9de4452efaedcc6a57d16736bca1587ce34a6",
    "demoHelper"
  ],
  [
    "KUBECLAW_REGISTRY_CONFIG:charts/kubeclaw/templates/deployment.yaml:6524da2163ec874a8ca4f5bce14374ff9b01159567ae480dd2d90141e1084996",
    "registryHelper"
  ],
  [
    "KUBECLAW_REGISTRY_USERNAME:charts/kubeclaw/templates/deployment.yaml:2c75aecc7f4c4904269203be3ba4b62b1d1699a0927434b1623292f49bd3cc99",
    "registryHelper"
  ],
  [
    "KUBECLAW_REGISTRY_PASSWORD:charts/kubeclaw/templates/deployment.yaml:974aa2a387782bb06858be84ab35e0d6173b7b39c42c99395e17274417b435b7",
    "registryHelper"
  ],
  [
    "NODE_EXTRA_CA_CERTS:charts/kubeclaw/templates/deployment.yaml:0c79e5e38268dc43049591ca20b060a69ca8164654228a594eb9ccdcf250ad91",
    "registryHelper"
  ],
  [
    "PRISM_PRODUCT_DECISIONS_ENABLED:charts/prism/templates/workloads.yaml:98da0ae4eb090fda02966fc79edffb100f2e170466b717f0528d978fd8f5c259",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_ISSUER:charts/prism/templates/workloads.yaml:ba478b3979976baa2068724821f97b9877bef31fe859afb99fe47a333d18a763",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_OPERATORS:charts/prism/templates/workloads.yaml:56e25d4ec3b02da0889381eef1e520ecdb001ab61f2601e0373187ace95139d8",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_ORIGIN:charts/prism/templates/workloads.yaml:208f5b2f8566d4039f702df82ad1b9adbb89eb68a8b8eee35dbae89f34079b85",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_PRIVATE_KEY_FILE:charts/prism/templates/workloads.yaml:00554c9ef99c0724c1f6f6f91448fb0ae8b6b22d3c5a18b4366acb05f3b78e4d",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_CONTROLLER_URL:charts/prism/templates/workloads.yaml:c65aa123cc8782a4539d6575c7491d193fd52eac9e90342ac089668d4cc23e02",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_CONTROLLER_CA_FILE:charts/prism/templates/workloads.yaml:225cf9edbd5b24bacb1a0ba80365b11ff145457c74ddf26e8373ac23d021379b",
    "productHelper"
  ],
  [
    "PRISM_PRODUCT_CONTROLLER_TOKEN_FILE:charts/prism/templates/workloads.yaml:fdee907cdd15362cde0970ac85f73d267e6c446631510ef36e7c45a3cd0e83c5",
    "productHelper"
  ]
]) {
  reviewedProducerCustody.set(identity, reviewedHelperProducerScopes[scope]);
  qualifiedProducerBindings.add(identity.slice(0, identity.lastIndexOf(':')));
}


// These are source-assembly receipts, not image-content or execution receipts.
// Only launch/COPY/stage/work-directory and executable build instructions are compared.
// A changed first-party recipe must be inspected, not accepted by its filename.
// REVIEWED_IMAGE_ASSEMBLY_BEGIN
const reviewedImageAssembly = new Map([
  [
    "docker/Dockerfile.buster-runtime",
    "91bcdcf74f64d1d7a5eb7c524dbf9a87c8eebe8551471a314d9ef31bbba41daf"
  ],
  [
    "docker/Dockerfile.namespace-controller",
    "8f98bd2765848e48a11302058753915560eeaa6670219ae3928b9ce76a1216ec"
  ],
  [
    "docker/Dockerfile.prism-agent",
    "886bc8deb7d6d09fef70d49b0809411954932e23b45fa33fa13513889ee59902"
  ],
  [
    "docker/Dockerfile.prism-control",
    "3c70ddb96598d1f3c23dbd4cacdff3346713d27f0edb10176294949974075784"
  ],
  [
    "docker/Dockerfile.prism-ingestion",
    "05bee9e836844714837feefa997a882379d8028451fb2c92867f671d63b98b7f"
  ],
  [
    "docker/Dockerfile.prism-studio",
    "10f4674bc569c79f8b0dedd5bff3486521577a0bdf00fd8cf889ddca898dc9e7"
  ],
  [
    "docker/Dockerfile.prism-worker",
    "5b303235aa0232fce6f0a61fbb0831de19e8efc82d00e9f1312cc1355e5b49ad"
  ],
  [
    "ops/pod/Dockerfile",
    "e276d37ecd381af09190930523825794a3eca00db98140d5fce698f2c606ba02"
  ],
  [
    "tools/ops-mcp/Dockerfile",
    "fb90ed406e6ba981f1a7acaadbdc521e1d476f9130cbba97a0436bae4847242b"
  ]
]);
// REVIEWED_IMAGE_ASSEMBLY_END

const reviewedImageRecipeBytes = new Map([
  [
    "docker/Dockerfile.buster-runtime",
    "a312398adeaf6addfd875940cbe04cd4bc53611fb8f26422020fe290d7fcc27c"
  ],
  [
    "docker/Dockerfile.namespace-controller",
    "7d11f9ddce2ba3c5083645531a59b298a1996743306fbadb7f3b47819ab68384"
  ],
  [
    "docker/Dockerfile.prism-agent",
    "5af3027e1d22301277450f994b85cc09094b72860078d7eb616be7c2f889b38b"
  ],
  [
    "docker/Dockerfile.prism-control",
    "3e88f611da0e5de7f3f0e72b5ec8446735e8011f4d9bc22b6e8287c2806f0bc1"
  ],
  [
    "docker/Dockerfile.prism-ingestion",
    "7562bbf083164dba931091011aa3d9e3178797fe51053a08c38afaf3ea2f2a88"
  ],
  [
    "docker/Dockerfile.prism-studio",
    "a41321b9004c262b8c6ea63c04d61f0f39720ceee86afc8eb7165a1053b245d7"
  ],
  [
    "docker/Dockerfile.prism-worker",
    "d976f597b5d66a64c4d983a88dbf4ef64efe509ec20fb790a255b2c550fd27c2"
  ],
  [
    "ops/pod/Dockerfile",
    "d55888e701ea0798c7c2a109f17977cc615442828e010f56e4f17871f6483eb0"
  ],
  [
    "tools/ops-mcp/Dockerfile",
    "bfb97ef41bdd945c49e42db5d87ef878a0b8894bc9af32418027a956ce852e41"
  ]
]);

function imageAssemblyInstructions(text) {
  const instructions = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^(?:FROM|COPY|WORKDIR|CMD|ENTRYPOINT|RUN)\s/u.test(lines[index])) continue;
    let instruction = lines[index];
    while (/\\\s*$/u.test(instruction) && index + 1 < lines.length) instruction += `\n${lines[++index]}`;
    instructions.push(instruction);
  }
  return instructions;
}
function assertImageAssembly(sourceRoot, files, identity) {
  assert.equal(typeof sourceRoot, 'string', `CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED: ${identity}; source root missing for first-party launch authority`);
  return files.map(file => {
    const expected = reviewedImageAssembly.get(file);
    assert(expected, `CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED: ${identity}; unreviewed launch recipe ${file}`);
    const recipeBytes = fs.readFileSync(path.join(sourceRoot, file));
    const recipeByteDigest = crypto.createHash('sha256').update(recipeBytes).digest('hex');
    assert.equal(recipeByteDigest, reviewedImageRecipeBytes.get(file), `CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED: ${identity}; complete exact recipe-byte authority changed in ${file}`);
    const instructions = imageAssemblyInstructions(recipeBytes.toString('utf8'));
    const actual = crypto.createHash('sha256').update(JSON.stringify(instructions)).digest('hex');
    assert.equal(actual, expected, `CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED: ${identity}; selected launch/COPY/build authority changed in ${file}`);
    return { path: file, recipeByteDigest, recipeAuthorityModel: 'complete-exact-bytes.v1', selectedInstructionDigest: actual, boundary: 'checked-in image assembly; deployed image contents and execution not proved' };
  });
}

function scopedTransportContract(name, source, declaration, description) {
  return {
    purpose: description,
    acceptedForm: `The selected declaration at ${source}:${declaration.line}; this record proves transport, not a receiving parser's accepted form.`,
    defaultBehavior: 'The selected producing branch supplies its declared value. No receiving-process default is established by this transport receipt.',
    emptyBehavior: 'A supplied empty string is transported unchanged; this receipt does not establish interpretation by an unproved receiving process.',
    invalidBehavior: 'Declaration and required Secret errors can stop startup. No value-specific receiving validation is claimed.',
    precedence: 'Only the selected container, command and render branch receive this declaration; unrelated readers cannot override or qualify it.',
    impact: 'Changes this transported input on container replacement. Runtime use must be established in the actual receiving process.',
    failure: 'Declaration or required Secret failure can prevent startup; successful injection is not proof of consumption or successful operation.',
    owningSurface: `${source}:${name} selected producing process`, owner: source,
    required: 'conditional on the reviewed workload and render branch', boundary: 'checked-in producer transport; receiving-runtime behavior not established',
    evidence: [declaration.custodyEvidence ?? { path: source, line: declaration.line, endLine: declaration.line }],
  };
}

export function externalProducerContract(name, source, declaration) {
  if (!qualifiedProducerBindings.has(`${name}:${source}`)) return null;
  const identity = `${source}:${declaration?.line ?? '?'}:${name}`;
  assert.equal(declaration?.custody?.schemaVersion, 'environment-producer-source-custody.v1', `CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED: ${identity}; actual declaration/container/command/render custody missing`);
  const digest = crypto.createHash('sha256').update(JSON.stringify(declaration.custody)).digest('hex');
  const scope = reviewedProducerCustody.get(`${name}:${source}:${digest}`);
  assert(scope, `CONFIG_PRODUCER_RECEIVER_CUSTODY_UNQUALIFIED: ${identity}; unsupported declaration/container/command/render placement`);
  const assemblyAuthorities = scope.assembly.length ? assertImageAssembly(declaration.sourceRoot, scope.assembly, identity) : [];
  let contract = scope.transport
    ? scopedTransportContract(name, source, declaration, scope.transport)
    : producerBoundaryContract(name, source, declaration);
  if (!contract) return null;
  if (scope.receiver) contract = { ...contract,
    owner: scope.receiver,
    purpose: `Transports ${name} to ${scope.process}. Exact receiving authority: ${scope.receiver}. Receiving-source parsing/defaults belong to its separate contract; source assembly alone does not prove deployed image content or successful execution.`,
  };
  const selectedBranches = [...declaration.custody.guards, ...(declaration.custody.helperProjection?.branch.guards ?? [])].map(guard => `${guard.directive} ${guard.expression}${guard.branch ? ` (${guard.branch})` : ''}`).join('; ') || 'unconditional source declaration';
  return { ...contract,
    purpose: `${contract.purpose} Actual producing process: ${scope.process}. Selected source conditions: ${selectedBranches}.`,
    owningSurface: `${source}:${name}; ${scope.process}; ${declaration.custody.profilePlacement}`,
    producerCustodyDigest: digest, producerCustody: declaration.custody,
    receivingProcesses: scope.receivingProcesses ?? [{ process: scope.process, receiver: scope.receiver ?? contract.owner, boundary: contract.boundary }],
    assemblyAuthorities,
    evidence: [...(contract.evidence ?? [declaration.custodyEvidence ?? { path: source, line: declaration.line, endLine: declaration.line }]), ...(scope.evidence ?? [])],
  };
}

for (const name of ['BACKUP_MAXIMUM_BYTES', 'BACKUP_MAXIMUM_RETAINED_BYTES', 'BACKUP_MAXIMUM_DURATION_SECONDS']) add(backup, name,
  name.endsWith('DURATION_SECONDS') ? 'Bounds the complete backup, verification or database-smoke operation with timeout.' : name.includes('RETAINED') ? 'Caps total retained backup-directory usage before a new group is created.' : 'Caps one backup group and its per-operation file growth.',
  'A decimal positive integer matching ^[1-9][0-9]{0,12}$; the shell accepts up to 13 digits.', 'No default.', 'The shell :? guard rejects absent or empty.', 'Invalid numeric text returns PRISM_BACKUP_INVALID_<name>; group or retained-capacity limits reject work without deleting completed groups.', processOnly,
  'Changes the bounded backup time or capacity. Retained-capacity exhaustion requires deliberate operator cleanup; this script does not automatically delete backups.', 'The command stops; incomplete groups remain visible and are not published as completed backups.', 'charts/prism/values.yaml:backup', 'required');
add(backup, 'BACKUP_ROOT', 'Selects the backup-group directory and exclusive lock for Prism database and artifact backups.', 'An absolute path other than /, not a symlink, equal to its canonical realpath after creation.', 'No default.', 'The shell :? guard rejects absent or empty.', 'Invalid roots return PRISM_BACKUP_ROOT_INVALID; overlap with the artifact root is rejected during backup.', processOnly, 'Changes the backup history, capacity accounting and lock authority.', 'The operation stops without replacing a completed group.', 'charts/prism/values.yaml:backup.root', 'required');
add(backup, 'PGDATABASE', 'Selects the database dumped by Prism backup and recorded in its metadata.', 'An identifier matching ^[a-zA-Z_][a-zA-Z0-9_]{0,62}$.', 'No default.', 'Empty is rejected when backup_group runs.', 'Invalid identifiers return PRISM_BACKUP_DATABASE_INVALID; libpq reports connection errors.', processOnly, 'Changes the database included in each immutable backup group.', 'Backup stops without a completed group.', 'charts/prism/templates/backup.yaml:PGDATABASE', 'required for backup');

const observerNormalizationEvidence = {
  string: [{ path: observer, line: 47, endLine: 50 }],
  port: [{ path: observer, line: 63, endLine: 70 }],
  boolean: [{ path: observer, line: 5, endLine: 5 }, { path: observer, line: 33, endLine: 37 }],
  'boolean-required': [{ path: observer, line: 5, endLine: 5 }, { path: observer, line: 39, endLine: 45 }],
  positive: [{ path: observer, line: 52, endLine: 61 }],
  integer: [{ path: observer, line: 72, endLine: 81 }],
};
for (const [name, [setting, kind]] of Object.entries(observerSettings)) {
  const contract = contracts.get(`${name}:${observer}`);
  contract.owningSurface = `skills/common/plugins/openclaw-agent-observer/openclaw.plugin.json#$.configSchema.properties.${setting}; OpenClaw plugin config.${setting}`;
  contract.evidence = [{ path: observer, line: 83, endLine: 111 }, ...(observerNormalizationEvidence[kind] ?? [])];
  if (kind === 'event') {
    contract.acceptedForm = 'A Number-convertible integer from 1 through 5242880 bytes.';
    contract.purpose += ' The plugin imports a generated copy of normalizeAgentObservabilityMaxEventBytes. syncContract copies the tracked agent-observability contract source into that generated consumer directory; the tracked normalizer and size constant are the source authority.';
    // The generated copy is ignored by Git. Source links must prove both the
    // canonical behavior and the copy boundary at the documented revision.
    contract.evidence.push(
      { path: observer, line: 1, endLine: 1 },
      { path: 'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs', line: 6, endLine: 14 },
      { path: 'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs', line: 18, endLine: 28 },
      { path: 'contracts/agent-observability/v1/src/routing.ts', line: 1, endLine: 6 },
      { path: 'contracts/agent-observability/v1/src/routing.ts', line: 31, endLine: 43 },
      { path: 'contracts/agent-observability/v1/src/constants.ts', line: 11, endLine: 11 },
    );
  }
  if (name.startsWith('REDIS_')) {
    contract.purpose += ' The Redis writer then requires a trimmed non-empty host and a valid port. Its default secure policy requires a password, TLS, or an accepted network-isolation declaration, including for loopback.';
    contract.evidence.push(
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts', line: 27, endLine: 44 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts', line: 10, endLine: 11 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts', line: 50, endLine: 76 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/redis-transport.ts', line: 112, endLine: 140 },
    );
    if (kind === 'raw') contract.acceptedForm = 'Passed unchanged by config resolution, then normalized as a boolean or trimmed lowercase text: 1, true, yes, on, required, enabled, isolated, network-policy, network_policy or documented marks isolation; other values are false.';
  }
}

export function observerInlineFieldContract(field) {
  const pair = Object.entries(observerSettings).find(([, [setting]]) => setting === field);
  if (!pair) return null;
  const contract = runtimeConsumerContract(pair[0], observer);
  return { ...contract,
    purpose: `Configures observer ${field}. ${contract.purpose}`,
    precedence: `Registration configuration is merged first, then service configuration, then hook configuration. Later defined keys replace earlier keys; undefined keys are ignored. Null and empty values replace earlier values. The merged config.${field}, when not undefined, wins over env.${pair[0]}; normalization then runs.`,
    evidence: [...(contract.evidence ?? []),
      { path: 'skills/common/plugins/openclaw-agent-observer/src/observer-support.ts', line: 21, endLine: 29 },
      { path: 'skills/common/plugins/openclaw-agent-observer/src/index.ts', line: 195, endLine: 200 },
    ],
  };
}

contracts.get(`BUNDLE_TMP_ROOT:${chart}`).acceptedForm = 'The internal fixed path `/tmp/code-bundle`; this is not an operator or external runtime input.';
add(chart, 'HOME', 'Passes the fixed container home directory to external OpenClaw and init commands.', 'The chart supplies /home/node; external commands own home-relative lookup.', 'The producer fixes /home/node for these containers.', 'The supported producer does not supply empty; an overridden empty value can break external lookup.', 'Filesystem or external tool configuration errors fail startup or commands.', 'The rendered container environment supplies the home directory.', 'Changes external home-relative state and configuration lookup.', 'The external command reports filesystem or configuration lookup failures.', 'charts/kubeclaw/templates/deployment.yaml:fixed HOME binding', 'fixed container input', 'external container home-directory lookup');

const postgresInit = 'charts/prism/templates/postgresql.yaml';
for (const name of ['PRISM_MIGRATOR_PASSWORD', 'PRISM_RUNTIME_PASSWORD', 'PRISM_READONLY_PASSWORD']) add(postgresInit, name,
  `Supplies the password used to create the ${name.split('_')[1].toLowerCase()} role when the initial database has no such role.`,
  'A secret string passed as a psql variable and quoted with SQL format %L. The init script does not validate password strength.', 'No script fallback; the required Secret key supplies the value.', 'An empty supplied value reaches SQL as an empty password string; this script does not reject it. Missing variables fail set -u, and missing required Secret keys prevent pod startup.', 'psql or SQL errors stop initialization; existing roles are retained without password changes.', 'The PostgreSQL Pod Secret binding supplies the initial value. CREATE ROLE runs only when that role does not already exist; later redeploys do not rotate its password.', 'Changes initial role credentials only; coordinate rotation through database administration.', 'Pod startup fails at a missing Secret key or the init script stops on a psql error.', 'charts/prism/values.yaml:postgresql.existingSecret', 'required during initial role setup');
for (const [name, value, purpose] of [['POSTGRES_USER', 'postgres', 'Selects the psql administrator role used by initial role setup.'], ['POSTGRES_DB', 'prism', 'Selects the database to which initial role setup connects.']]) add(postgresInit, name, purpose,
  'A non-empty role or database identifier accepted by psql; this script passes it unchanged and does not locally validate syntax.', `The chart fixes ${value}; there is no script fallback.`, 'An empty overridden value is passed to psql; client connection rules determine its effect.', 'Unavailable databases, roles or insufficient rights stop SQL initialization.', 'The fixed rendered Pod environment supplies this initial setup input.', 'Changes the connection authority of role and extension initialization.', 'The init script stops at the psql connection or SQL error.', `charts/prism/templates/postgresql.yaml:fixed ${name} binding`, 'required during initial role setup');

contracts.get(`PRISM_CONTROL_TIMEOUT_MS:${studio}`).owningSurface = 'skills/prism/server/studio-config.ts:standalone process environment; the shipped Prism chart does not expose a timeout Helm field';
contracts.get(`PRISM_QUARANTINE_ROOT:${ingestion}`).owningSurface = 'charts/prism/templates/ingestion.yaml:fixed /quarantine binding and volume mount';
contracts.get(`PRISM_QUARANTINE_TTL_MS:${ingestion}`).owningSurface = 'charts/prism/values.yaml:ingestion.quarantineTtlMs';
contracts.get(`PRISM_CONTROL_URL:skills/prism/server/agent-bridge.mjs`).owningSurface = 'skills/prism/server/agent-bridge.mjs:standalone process environment; the shipped Prism chart does not expose an agentBridge Helm field';
contracts.get(`PRISM_BACKUP_IMAGE:${backup}`).owningSurface = 'charts/prism/values.yaml:images.control, rendered through prism.imageRef in backup.yaml';
contracts.get(`BACKUP_ROOT:${backup}`).owningSurface = 'charts/prism/templates/backup.yaml:fixed /backups binding';
externalNames.POSTGRES_DB[1] = 'charts/prism/templates/postgresql.yaml:fixed prism database binding';

// Bind authentication and initialization claims to their actual consumers,
// not only to the environment loader that captures each value.
contracts.get(`PRISM_INGRESS_SECRET:${studio}`).evidence = [
  { path: studio, line: 5, endLine: 17 },
  { path: 'skills/prism/server/studio-request.ts', line: 53, endLine: 59 },
  { path: 'skills/prism/server/studio-request.ts', line: 80, endLine: 94 },
  { path: 'skills/prism/server/studio-request.ts', line: 96, endLine: 104 },
  { path: 'skills/prism/control/session.ts', line: 15, endLine: 19 },
];
contracts.get(`PRISM_INGRESS_SECRET:${studio}`).acceptedForm = 'The config loader accepts a string without local length or whitespace validation. Proxied use requires a value accepted by Headers; header construction strips leading/trailing HTTP whitespace, and the resulting value must exactly match Control’s configured secret.';
contracts.get(`PRISM_INGRESS_SECRET:${studio}`).invalidBehavior = 'An invalid Headers value fails proxying with HTTP 502 PRISM_STUDIO_UPSTREAM_FAILED before Control is called. Leading/trailing HTTP whitespace can make the normalized header differ from Control’s untrimmed configured secret; Control rejects unequal header values.';
contracts.get(`PRISM_INGRESS_SECRET:${studio}`).failure = 'An empty secret stops proxying with HTTP 503 PRISM_STUDIO_PROXY_NOT_CONFIGURED. Header construction or transport failures return HTTP 502 PRISM_STUDIO_UPSTREAM_FAILED; Control denies requests whose effective header does not exactly match its secret.';
contracts.get(`PRISM_INGRESS_SECRET:${control}`).evidence = [
  { path: control, line: 16, endLine: 19 },
  { path: control, line: 46, endLine: 47 },
  { path: 'skills/prism/control/session.ts', line: 15, endLine: 19 },
];
contracts.get(`PRISM_DISPATCH_SECRET:${control}`).evidence = [
  { path: control, line: 30, endLine: 36 },
  { path: 'skills/prism/server/control-server.ts', line: 175, endLine: 201 },
];
contracts.get(`PRISM_QUARANTINE_ROOT:${ingestion}`).evidence = [
  { path: ingestion, line: 12, endLine: 20 },
  { path: ingestion, line: 63, endLine: 80 },
  { path: ingestion, line: 83, endLine: 96 },
];
contracts.get(`OVERRIDE_SWARM_CONFIG:${chart}`).evidence = [
  { path: chart, line: 627, endLine: 649 },
];
contracts.get(`DISCORD_WEBHOOK:${chart}`).evidence = [
  { path: chart, line: 627, endLine: 633 },
  { path: chart, line: 673, endLine: 674 },
];
