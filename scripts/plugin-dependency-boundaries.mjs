import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Qualify only the interfaces that an invocation actually reaches. These rules
// explain executable/library ownership; configuration field semantics remain
// with the shared configuration inventory. Every rule has source guards.
export function invocationDependencyBoundaries(invocation, repositoryRoot, registration = {}) {
  const records = [];
  const remaining = new Set(invocation.diagnostics);
  const evidence = (relative, token, lastToken = token) => {
    const file = path.join(repositoryRoot, relative);
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    const position = text.indexOf(token);
    if (position < 0) return;
    const end = text.indexOf(lastToken, position);
    if (end < 0) return;
    return { file, line: text.slice(0, position).split('\n').length,
      endLine: text.slice(0, end + lastToken.length).split('\n').length, text };
  };
  function qualify(relative, suffix, record, guards) {
    const reached = path.join(repositoryRoot, relative);
    const diagnostics = [...remaining].filter((item) => item.startsWith(`${reached}:`) && item.endsWith(suffix));
    if (!diagnostics.length) return;
    const sources = guards.map(([file, token, lastToken]) => evidence(file, token, lastToken));
    if (sources.some((item) => !item)) return;
    for (const diagnostic of diagnostics) remaining.delete(diagnostic);
    records.push({ ...record, evidence: sources.map(({ file, line, endLine }) => ({ file, line, endLine })) });
  }
  function reachedBoundary(record, guards, diagnostic) {
    const sources = guards.map(([file, token, lastToken]) => evidence(file, token, lastToken));
    if (sources.some((item) => !item)) { remaining.add(diagnostic); return; }
    records.push({ ...record, evidence: sources.map(({ file, line, endLine }) => ({ file, line, endLine })) });
  }
  if ((invocation.evidence ?? []).some((item) => item.kind === 'local-process' && item.name === 'fixed flock lock holder')) {
    reachedBoundary({
      scope: 'local-command',
      service: 'The durable store uses local /usr/bin/flock with GNU --exclusive and --timeout 5, /bin/sh and /bin/cat. These are required executable interfaces, not a remote service.',
      endpoint: 'The enclosing store selects the local lock file and writable data directory. Kernel locking coordinates writers; no network endpoint is selected.',
      secret: 'The fixed lock argv supplies no credential selector. The host OS identity owns directory and lock-file access; the child inherits its process environment.',
      dataOwner: 'The enclosing store owns durable data and lock files. The lock holder owns only transient OS lock state; ending stdin releases the holder and retains store data.',
      check: 'Before using a store, check that /usr/bin/flock supports GNU --exclusive --timeout, and /bin/sh and /bin/cat are executable. A BusyBox symlink or binary existence does not prove compatibility. On an isolated writable store, verify bounded lock acquisition, a durable write/read, contention failure after the five-second lock wait, and release/recovery. OBSERVABILITY_STORE_LOCKED and OBSERVABILITY_STORE_UNLOCK_FAILED stop the operation; retain the original store and evidence.',
    }, [['skills/common/plugin-runtime/foundation/observability/durable-delivery.ts', 'async function acquireKernelLock(', '  let error = "";'],
      ['skills/common/plugin-runtime/foundation/observability/durable-delivery.ts', '  return async () => {', 'async function cleanupCrashArtifacts(']], 'Fixed local lock dependency could not be qualified');
  }
  // Qualification depends on a reached computed environment read and the
  // actual secrets.read provider contract, never on its package identity.
  if ((registration.providesCapabilities ?? []).includes('secrets.read')) {
    const selectors = (invocation.environmentInputs ?? []).filter((item) => item.dynamic);
    for (const selector of selectors) {
      const relative = path.relative(repositoryRoot, selector.file).split(path.sep).join('/');
      reachedBoundary({
        scope: 'credential-provider',
        service: 'The secrets.read provider resolves a logical resource ID from configured environment-name authority inside its current process. It does not contact a remote Secret service.',
        endpoint: 'context.config.environment supplies the allowed logical-ID-to-environment-name mapping. names[request.resource.canonicalId] selects the environment name; process.env[environmentName] supplies the current value.',
        secret: 'Only mapped logical IDs can resolve. An unmapped ID raises SECRET_DENIED; an unset or empty environment value raises SECRET_UNAVAILABLE. The provider returns the credential value to the authorized confidential caller. The process/deployment owner supplies and rotates environment values; removing the adapter does not erase them.',
        dataOwner: 'The deployment owns the process credentials and allowed environment-name mapping. The caller owns its request/result handling; the provider creates no durable credential store.',
        check: 'ready() is empty and proves no credential access. Through the selected runtime authority, perform one permitted confidential secrets.read/resolve and retain only a redacted success status. Verify unmapped, missing and empty values separately, plus operation/cancellation denial. Never log the returned value. Nonconfidential requests must pass fence.assertCurrent before resolution.',
      }, [[relative, 'const mapping = context.config.environment;', 'const names = Object.freeze'],
        [relative, 'async ready() {},', "throw new Error('ADAPTER_CANCELLED')"],
        [relative, 'const environmentName = names[request.resource.canonicalId];', 'return { value };']], 'Computed secrets.read provider selector could not be qualified');
    }
    if (!selectors.length) remaining.add('secrets.read provider has no qualified credential selector');
  }
  for (const route of registration.routes ?? []) {
    const requests = (invocation.capabilityRequests ?? []).filter((item) => item.capability === route.capability);
    if (!requests.length) continue;
    const provider = route.providerFiles.find((file) => fs.readFileSync(file, 'utf8').includes(`export class ${route.constructor} `));
    if (!provider) { remaining.add(`Delegated ${route.capability} has no resolved constructor source`); continue; }
    const relative = path.relative(repositoryRoot, provider).split(path.sep).join('/');
    const guards = [[relative, `export interface ${route.constructor}Options {`, '\n}']];
    const allowedOperations = {
      ContainerBuildCapabilityInvoker: ['build_push_verify'], SecurityScanCapabilityInvoker: ['dependency', 'image', 'kubernetes-policy'],
      TailscaleExposureCapabilityInvoker: ['prepare', 'release'], NetworkHttpCapabilityInvoker: ['request', 'websocket'],
      DirectCommandCapabilityInvoker: ['run'], KubernetesFixtureCapabilityInvoker: ['prepare', 'release'],
      KubernetesRuntimeSecurityCapabilityInvoker: ['inspect'], BrowserAxeCapabilityInvoker: ['scan'],
      BrowserVisualCapabilityInvoker: ['capture', 'compare'], BrowserLighthouseCapabilityInvoker: ['audit'], BrowserPlaywrightCapabilityInvoker: ['run'],
    }[route.constructor];
    if (!allowedOperations || requests.some((item) => !allowedOperations.includes(item.operation))) {
      remaining.add(`${route.capability} operation requires resolved caller authority`); continue;
    }
    let record;
    switch (route.constructor) {
      case 'ContainerBuildCapabilityInvoker':
        record = {
          service: 'Buster selects a local buildctlExecutable, a BuildKit daemon and a separate OCI registry. build_push_verify pushes an image and verifies its immutable manifest digest; client installation alone proves neither dependency.',
          endpoint: 'The runtime owner supplies buildkitHost, registryBaseUrl and registryReference. The registry URL host must equal registryReference. workspaceRoot, repositoryPrefix, allowedPlatforms and allowedBuildArguments scope the build request; stop if the selected runtime configuration or instance is absent.',
          secret: 'Optional registryUsername and registryPassword must be configured together. Authenticated nonloopback registries require HTTPS. The consumer writes mode-0600 Docker auth under a mode-0700 temporary directory, passes DOCKER_CONFIG to buildctl and sends Basic auth for manifest verification, then removes the temporary tree. The runtime owner rotates registry credentials. The BuildKit child receives only PATH, BUILDKIT_HOST and optional DOCKER_CONFIG; this interface declares no independent BuildKit credential selector.',
          dataOwner: 'The admitted workspace owns build inputs. BuildKit owns build execution/cache; the registry owns pushed image/manifest state. The consumer retains bounded logs, definition identity and verified immutable digest. Cancellation or a lost result does not remove an image already pushed; reconcile the same registry identity before retry.',
          check: 'Use the admitted build definition/platform and verify buildctl output, metadata digest and bounded GET of that exact registry manifest. maximumExecutionMs covers build plus verification; maximumLogBytes and maximumManifestBytes bound output. Separate launch/build failure, registry status/size/digest failure, timeout and cancellation; retain identities and stop before replacing an uncertain pushed image.',
        };
        guards.push([relative, '    this.#baseUrl = new URL(options.registryBaseUrl);', '    this.#options = options;'],
          [relative, '  const url = new URL(`/v2/', '  const actual = `sha256:'],
          [relative, '    const dockerConfig = path.join(temporary', '    const deadline = createContainerBuildDeadline'],
          [relative, '      const result = await this.#execute(this.#buildctl', '    } catch (error) {'],
          [relative, '      deadline.dispose();', '      fs.rmSync(temporary']);
        break;
      case 'SecurityScanCapabilityInvoker': {
        const operations = [...new Set(requests.map((item) => item.operation))];
        if (operations.some((item) => !['dependency', 'image', 'kubernetes-policy'].includes(item))) {
          remaining.add('security.scan operation requires resolved caller authority'); continue;
        }
        const image = operations.includes('image');
        const policy = operations.includes('kubernetes-policy');
        record = {
          service: `The reached security.scan operations are ${operations.join(', ')}. Buster selects local trivyExecutable, cacheDirectory and databasePolicy.${image ? ' Image scanning additionally reads a remote registry by immutable image digest.' : ' Dependency scanning uses local repository files; Kubernetes policy scanning uses the supplied local manifest. These paths do not scan a live Kubernetes cluster.'}`,
          endpoint: image ? 'payload.image selects registry/repository@sha256 within allowedRegistryPrefixes and must match payload.digest. unsupportedHttpRegistry is explicitly denied. The runtime owner supplies the allowed registry and locked scanner/database/cache; stop if these authorities are missing.' : 'workspaceRoot admits the local projectDirectory or manifestPath. Dependency arguments disable database updates, version checks and telemetry and enable offline scan; policy arguments disable check updates, version checks and telemetry. There is no remote target selected by these reached local scan operations.',
          secret: image ? 'registryAccess supplies registryReference, username/password and optional readable caFile. Auth is projected only when the image registry matches registryReference, through mode-0700 temporary Docker config with a mode-0600 file and optional --cacert; the directory is removed in finally. The child does not inherit arbitrary process credentials. The runtime owner supplies and rotates registry auth.' : 'These operations do not project registryAccess or process credentials. The child receives fixed PATH/HOME/cache/locale settings. Local OS access to the admitted input, executable and cache remains the runtime owner’s authority.',
          dataOwner: `The project owns local input; ${image ? 'the registry owns immutable image content; ' : ''}the runtime owner owns the Trivy cache and approved database snapshots. The scanner returns bounded findings and resultDigest.${policy ? ' Policy verifies manifestDigest before scanning.' : ' Dependency/image scans require database freshness and unchanged snapshot evidence before/after execution.'}`,
          check: 'Run the reached operation against its admitted target and verify scanner operation, findings and resultDigest; require databaseEvidence for dependency/image and exact manifest digest for policy. Timeout is the smaller request/runtime limit and covers snapshot checks plus execution. maximumOutputBytes bounds combined stdout/stderr. Separate input/path/image denial, database failure, execution/output failure, timeout and cancellation. A local scanner binary proves no registry auth or image access.',
        };
        guards.push([relative, '  constructor(options: SecurityScanCapabilityInvokerOptions)', '  async invoke('],
          [relative, "    if (operation === 'dependency')", "    } else throw new Error('SECURITY_SCAN_OPERATION_DENIED');"],
          [relative, '  #registryConfiguration(', '  async #scan('],
          [relative, '      const before = operation', '      bounded.throwIfAborted();'],
          [relative, '    } finally {', '      if(credentialDirectory)fs.rmSync']);
        break;
      }
      case 'TailscaleExposureCapabilityInvoker':
        record = {
          service: 'The exposure consumer runs local kubectl against the Kubernetes API and changes an existing BusterNamespaceLease. The namespace controller and Tailscale operator own eventual remote exposure; the adapter does not call a Tailscale API directly.',
          endpoint: 'The runtime owner supplies kubectlExecutable, controllerNamespace, leaseApiGroup/version, allowedNamespacePrefixes and allowedHostSuffixes. kubectl resolves its API from KUBECONFIG or Kubernetes service environment. The request selects a lease/service/expiry; controller status supplies the HTTPS preview URL, whose host/path are checked against the allowed suffix and requested path.',
          secret: 'kubectl receives only PATH, KUBECONFIG, KUBERNETES_SERVICE_HOST and KUBERNETES_SERVICE_PORT. The deployment owns kubeconfig or in-cluster Kubernetes credentials and scoped lease get/patch RBAC. Tailscale operator OAuth credentials belong to its separately configured deployment, not the exposure request. Do not substitute a credential or publish a guessed preview URL.',
          dataOwner: 'Kubernetes owns the lease and resourceVersion. The consumer binds exposure annotations to the original attempt and request; the namespace controller owns Ingress/status and the Tailscale operator owns the remote route. Release preserves the lease and requires matching owner; a superseded owner cannot disable the current exposure.',
          check: 'Verify kubectl auth can-i get and patch in controllerNamespace, admitted lease identity/service/expiry, and observed exposure generation Ready with the allowed HTTPS URL. Polling stops at readinessTimeoutMs capped by maximumExecutionMs; subprocess output is capped at one MiB. Failed prepare attempts a bounded owned rollback to off; retain AggregateError on rollback failure. Release must observe Off for the same owner; controller readiness does not prove a separate authorized client can reach the preview.',
        };
        guards.push([relative, '    this.#environment = { PATH:', '  #namespace('],
          [relative, '  async #run(', '  async #lease('],
          [relative, '  async #wait(', '  #verifyLease('],
          [relative, '  async #rollbackFailedPrepare(', '  #prepareInput('],
          [relative, "    for (const verb of ['get', 'patch'])", '    assertHandoffSourceRequest'],
          [relative, '  #publicURL(', '  async #release('],
          [relative, '  async #release(', '  async invoke('],
          ['cmd/buster-namespace-controller/main.go', 'func (c *controller) ensurePreviewExposure(', 'func (c *controller) previewServiceReady('],
          ['cmd/buster-namespace-controller/main.go', 'func previewIngress(', '\nfunc '],
          ['my-values/infra/tailscale-operator-values.yaml', '# OAuth credentials are intentionally', '  clientSecret: ""']);
        break;
      case 'NetworkHttpCapabilityInvoker':
        record = {
          service: 'Buster performs HTTP or allowed WebSocket requests through the configured network consumer. A registry health request has a separate narrow authentication projection.',
          endpoint: 'The request resource canonicalId supplies the URL. allowedOrigins, allowedHostSuffixes and allowedPorts admit targets, together with currently valid fixture origins. URL credentials and redirects are denied; allowedMethods/request headers scope operations. The runtime owner supplies these policies and the concrete endpoint.',
          secret: 'The request may supply only allowed headers; the runtime does not resolve secrets.read. Optional registryHealth origin/username/password can authorize only GET/HEAD of exactly /v2/ with no body and accept-only input headers. Other paths cannot use platform registry credentials; response checks deny reflected credential bytes. The configured runtime and caller own their respective credential sources and rotation.',
          dataOwner: 'The selected HTTP/WebSocket target owns remote state. The consumer owns bounded request/response observation; a mutating HTTP result lost after receiver commit remains uncertain. Fixture leases retain endpoint admission authority.',
          check: 'Run the permitted request against its admitted URL and verify the intended status/body or bounded WebSocket result. Bound requests by maximumExecutionMs, maximumRequestBytes and maximumResponseBytes plus narrower request limits. Verify origin/header/method/auth denial and timeout/cancellation separately; HTTP status alone proves no unrelated target operation.',
        };
        guards.push([relative, '  async invoke(', '    const payload = exactPayload'],
          [relative, '  #target(', '  async #responseBytes('],
          [relative, '    const timeoutMs = positiveInteger(payload.timeoutMs', '      return websocket('],
          [relative, '      response = await fetch(url', '      return Object.freeze({'],
          ['skills/buster/engine/test-gates/registry-health-access.ts', '  headers(url:', '  assertResponse('],
          ['skills/buster/engine/test-gates/registry-health-access.ts', '  assertResponse(', '\n  }']);
        break;
      case 'DirectCommandCapabilityInvoker':
        record = {
          service: 'The Buster command runtime selects a catalog executable and a local sandbox. The selected executable can have its own dependencies, which the runtime owner must qualify before permitting it.',
          endpoint: 'executableCatalog resolves command.executable catalog:name; workspaceRoot admits writableRoot/workingDirectory, runtimeReadRoots bound read access and executableSearchPath supplies PATH. Program arguments select any program-specific target; this runtime declares no remote endpoint itself.',
          secret: 'The child receives only the checked request environment plus fixed PATH and isolated HOME/TMPDIR. PROTECTED_ENVIRONMENT denies platform/cloud/credential and SSH/Git environment names. The program can still use admitted files or OS identity; qualify those credentials for the selected catalog entry. No arbitrary process environment or secrets.read projection is supplied.',
          dataOwner: 'The admitted workspace owns command files and effects. The consumer owns bounded process/output tracking and isolated home/temp directories. The selected command owns its external effects; uncertain results require reconciliation before retry.',
          check: 'Verify executable/sandbox access and read/write roots, then run an admitted bounded command and check its exit/output and intended effect. Request limits cannot exceed maximumExecutionMs/output/process/memory/CPU caps. cgroupRoot or the explicitly permitted sampled-process mode owns resource enforcement; terminationGraceMs bounds termination escalation. Binary discovery alone proves no program target access.',
        };
        guards.push([relative, 'const PROTECTED_ENVIRONMENT =', '\n'], [relative, 'function environment(', 'function positiveLimit('],
          [relative, '    this.#runner = new CommandRunner({', '  invoke('],
          [relative, '    return this.#runner.run({', '    }, signal).catch']);
        break;
      case 'KubernetesFixtureCapabilityInvoker':
        record = {
          service: 'Buster runs kubectl against the Kubernetes API and a namespace-lease controller to prepare/release an admitted deployment fixture. Controller-created namespace, copied Secrets, generated demo credentials, storage and workload readiness are separate authorities.',
          endpoint: 'kubectlExecutable and controllerNamespace/leaseApiGroup/version select the API/lease consumer. allowedNamespacePrefixes, registry prefixes, Secret references, storage classes and resource/manifest/storage/retention limits scope the request. KUBECONFIG or in-cluster Kubernetes service settings supply the concrete API; no plugin-local API override is implied.',
          secret: 'kubectl receives fixed PATH plus HOME, KUBECONFIG and Kubernetes service host/port. The deployment owns API credentials and lease RBAC. allowedSecretReferences constrain controller copies; optional testCredentials requests a named generated username/password Secret with runnerSubject and credentialReaderSubject readers. The consumer verifies lease and Secret identity before returning credentials; avoid retaining credential values in operation evidence.',
          dataOwner: 'Kubernetes owns leases, namespaces, workloads, Secrets and persistent volumes. The controller owns provisioning and expiry. The consumer binds the fixture to the source manifest/image and returns endpoint/credential evidence. Release requests the lease deletion; retain required data/evidence before namespace cleanup.',
          check: 'Before prepare, require scoped lease create/get/delete RBAC and exact manifest digest/immutable image/allowed Secret and storage authority. Verify lease Ready, expected running pods and service endpoints; maximumExecutionMs, output and polling limits bound checks. On prepare failure the consumer attempts lease release. A kubectl binary or Ready lease alone does not prove the deployment’s application task.',
        };
        guards.push([relative, '  async #kubectlRun(', '  async #waitLease('],
          [relative, '    const secretReferences =', '    let testCredentials'],
          [relative, '    const lease = {', '    const resource ='],
          [relative, "    for (const verb of ['create', 'get', 'delete'])", '    } catch (error) {'],
          [relative, '  async #generatedCredentials(', '  async #prepare('],
          [relative, '  async #release(', '  async invoke(']);
        break;
      case 'KubernetesRuntimeSecurityCapabilityInvoker':
        record = {
          service: 'Buster runs local kubectl to read controller-produced runtime-security observations from an existing Kubernetes lease. This operation inspects observed workload state rather than running a local Trivy scan.',
          endpoint: 'kubectlExecutable, controllerNamespace and leaseApiGroup identify the lease reader. allowedNamespacePrefixes scope payload.namespace; workspaceRoot admits the source manifest. The configured kubeconfig or in-cluster service environment selects the Kubernetes API.',
          secret: 'The child receives fixed PATH/locale plus HOME, KUBECONFIG and Kubernetes service host/port. The deployment owns API credential projection/rotation and read access to the admitted lease; this request supplies no new Secret selector.',
          dataOwner: 'Kubernetes owns the lease; the namespace controller owns runtimeSecurity observations. The consumer verifies namespace, source manifest digest, immutable image, freshness/accounting and result digest before returning bounded findings. It does not update the workload or lease.',
          check: 'Run inspect for the exact admitted namespace/lease/manifest/image and verify an Observed snapshot with valid pod/service counts, accounting, resultDigest and maximumObservationAgeMs. Polling stops at the smaller request/runtime timeout; maximumOutputBytes caps kubectl output. Separate identity/digest/freshness failure, API denial, timeout and cancellation; stale observations cannot prove current service health.',
        };
        guards.push([relative, 'async function kubectl(', '    const stdout:'],
          [relative, '  async invoke(', '    const deadline ='],
          [relative, '      const lease = object(JSON.parse', '      await new Promise<void>']);
        break;
      case 'BrowserAxeCapabilityInvoker':
      case 'BrowserVisualCapabilityInvoker': {
        const axe = route.constructor === 'BrowserAxeCapabilityInvoker';
        record = {
          service: `Buster runs local Playwright ${axe ? 'browsers and Axe analysis' : 'browsers, PNG decoding and visual comparison'} against an admitted application origin. The runtime owner installs compatible browser binaries and libraries.`,
          endpoint: 'allowedOrigins and current fixture origins admit the request target; allowedBrowsers/browserExecutables select local binaries. Request routes and checked profiles select pages/viewports. The consumer restricts subresources to the selected target origin; source availability proves no browser or application readiness.',
          secret: 'The checked browser profile constructs presentation/context options; it exposes no plugin-local credential reference or platform secrets.read projection. Browser launch/process environment and any application session or credential handling remain with the runtime/browser owner; do not infer authenticated access from the origin allowlist.',
          dataOwner: `The application owns remote content/state; the consumer owns temporary browser contexts and ${axe ? 'Axe findings/screenshots' : 'captured/comparison images'}. The caller owns supplied ${axe ? 'exclusion/analysis inputs' : 'baseline/mask inputs'} and retained result evidence. Contexts/browsers close during cleanup.`,
          check: `Run the admitted routes/profiles and verify the ${axe ? 'Axe result and violation evidence' : 'bounded captured/comparison image and visual findings'}. Enforce maximumCombinations/concurrency/execution/result and screenshot limits${axe ? '' : ' plus mask and decoded-image limits'}. Test origin denial, invalid profiles/input sizes, timeout and cancellation. A launched browser or source fixture alone proves no authenticated task success.`,
        };
        if (!axe) {
          record.service += ' capture reaches the application; compare uses only caller-supplied PNG images and local pixelmatch computation.';
          record.endpoint += ' compare selects visual.comparison:pixelmatch-v1 and no remote endpoint.';
          record.check += ' compare bounds input/decoded/result image sizes and checks cancellation before synchronous comparison; it declares no separate computation timeout.';
          guards.push([relative, "    if (request.operation === 'compare')", "    if (request.operation !== 'capture')"]);
        }
        guards.push([relative, axe ? 'function profileOptions(' : 'function profile(', axe ? 'async function mapBounded<' : 'async function boundedMap<'],
          [relative, '        const executablePath =', axe ? '      let screenshotCount =' : '      let accumulatedResultBytes'],
          [relative, "          await context.route('**/*'", '          const page ='],
          [relative, axe ? "      const response = { schemaVersion: 'browser-axe-result.v1'" : "      const response = { schemaVersion: 'browser-visual-result.v1'", '    } finally {']);
        break;
      }
      case 'BrowserLighthouseCapabilityInvoker':
        record = {
          service: 'Buster runs local Chrome and Lighthouse through a local exact-origin proxy. Chrome debugging/proxy listeners are local computation interfaces; the admitted application is the remote target.',
          endpoint: 'chromeExecutable supplies the local browser. allowedOrigins and current fixture authority admit target.origin; request routes and checked profiles select each audit. The proxy denies other origins, and actual CDP network evidence checks the audited page origin.',
          secret: 'The consumer creates a fresh temporary Chrome profile and exposes no platform credential field or secrets.read projection. The runtime/browser owner supplies browser process environment; application authentication is separate from target admission.',
          dataOwner: 'The application owns page content/state. Lighthouse owns derived audit reports; the consumer owns temporary profile/proxy state and bounded retained output. Final cleanup kills Chrome, closes the proxy and removes the temporary profile.',
          check: 'Verify a permitted audit’s actual CDP origin and report. maximumRuns, per-audit maximumExecutionMs and maximumResultBytes bound execution/results. Distinguish Chrome launch, proxy/page origin, timeout/cancellation and report-size failure. An audit score or Chrome debug port alone does not prove functional service behavior.',
        };
        guards.push([relative, 'async function exactOriginProxy(', 'async function withTimeout'],
          [relative, '    const proxy = await exactOriginProxy', '      try { await chrome.launch(); }'],
          [relative, '        const output = await withTimeout', '      const response ='],
          [relative, '    } finally {', 'function pathIsExecutable(']);
        break;
      case 'BrowserPlaywrightCapabilityInvoker':
        record = {
          service: 'Buster runs local Playwright tests inside a configured sandbox through a local exact-origin proxy. Browser/runtime binaries, read roots and OS isolation are operator prerequisites; the admitted application is a separate remote dependency.',
          endpoint: 'allowedOrigins/allowedTargetPorts and current fixture authority admit the target. playwrightExecutable, sandboxExecutable, runtimeNodeModules and browsersPath select local runtime dependencies; workspaceRoot admits repository/project/config and readOnlyRoots bound runtime files. The generated overlay sends browser traffic through the selected target proxy.',
          secret: 'The child receives a fixed PATH, isolated HOME/TMPDIR, CI and target/report/browser-path variables, not arbitrary process credentials or secrets.read projection. The project test/config owns any application credential use through admitted files; the runtime owner must qualify that selected test before allowing access.',
          dataOwner: 'The project owns tests/config; the application owns remote effects. The consumer owns temporary overlay/proxy/cgroup/runtime links and collected JSON/artifact evidence. It checks file identity and output bounds and cleans temporary state; cleanup does not undo application effects already performed by a test.',
          check: 'Run the admitted project/config and verify its JSON report, exit/signal and bounded artifact identities. Request/runtime caps cover workers, execution, output/result/artifact bytes/files and processes/memory/CPU; terminationGraceMs bounds escalation. Require separate runAsUid/Gid for configured cgroups, or explicit sampled-resource mode. Test target/file/resource denial, timeout and cancellation; browser installation alone proves no application task success.',
        };
        guards.push([relative, 'function startExactOriginProxy(', 'function cgroupRoot('],
          [relative, '  constructor(options: BrowserPlaywrightCapabilityInvokerOptions)', '  async invoke('],
          [relative, '    try { group = this.#cgroupRoot', '      if (!fs.existsSync(reportPath))'],
          [relative, '      const result = { schemaVersion:', '\n  }']);
        break;
      default:
        remaining.add(`Delegated ${route.capability} consumer ${route.constructor} requires dependency authority`);
        continue;
    }
    reachedBoundary({ scope: 'runtime-client', ...record }, guards,
      `Delegated ${route.capability} consumer source guards no longer qualify dependency authority`);
  }
  function finiteLocalGit(calls, allowed) {
    let seen = 0;
    let valid = true;
    for (const [file, text] of invocation.selectedSources) {
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function scan(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && calls.includes(node.expression.text)) {
          const args = node.arguments[1];
          if (['execFileSync', 'spawnSync'].includes(node.expression.text) && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]) || node.arguments[0].text !== 'git')) { ts.forEachChild(node, scan); return; }
          // execFileSync('git', ['-C', root, ...args]) is the local helper's
          // forwarding site; its finite callers below supply every command.
          if (node.expression.text === 'execFileSync' && ts.isArrayLiteralExpression(args) && args.elements.some(ts.isSpreadElement)) { ts.forEachChild(node, scan); return; }
          seen++;
          if (!args || !ts.isArrayLiteralExpression(args)) valid = false;
          else {
            let index = 0;
            while (index < args.elements.length && ts.isStringLiteralLike(args.elements[index]) && args.elements[index].text.startsWith('-')) {
              if (args.elements[index].text === '-C' || args.elements[index].text === '-c') index += 2;
              else index++;
            }
            const verb = args.elements[index];
            if (!verb || !ts.isStringLiteralLike(verb) || !allowed.has(verb.text)) valid = false;
          }
        }
        ts.forEachChild(node, scan);
      }
      scan(source);
    }
    return seen > 0 && valid;
  }
  function knownSdkCalls(relative, allowed) {
    const text = invocation.selectedSources.get(path.join(repositoryRoot, relative));
    if (!text) return false;
    const source = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true);
    let seen = 0;
    let valid = true;
    function scan(node) {
      if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'sdk') {
        seen++;
        if (!ts.isPropertyAccessExpression(node.expression) || !allowed.has(node.expression.name.text)) valid = false;
      }
      ts.forEachChild(node, scan);
    }
    scan(source);
    return seen > 0 && valid;
  }
  if (registration.kind === 'OpenClaw extension') {
    for (const [file, text] of invocation.selectedSources) {
      if (!text.includes('api.registerTool(') || !text.includes('const response = await fetch(new URL(path, base)')) continue;
      const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
      reachedBoundary({
        scope: 'runtime-client',
        service: 'OpenClaw registers host tools that send direct HTTP POST requests to the Prism control server. OpenClaw owns tool activation and permission; this client is not a Nova capability-provider binding.',
        endpoint: 'Per-tool context.config.controlUrl wins when truthy, then process PRISM_CONTROL_URL, then http://127.0.0.1:28080. The host/operator must admit the actual control-server instance before calling the registered tools.',
        secret: 'This client sends content-type: application/json and JSON tool parameters. It supplies no Authorization header or credential selector; required job/fence/generation/source identities belong to the request contract, not a bearer-token projection. The control server and host own separate access policy.',
        dataOwner: 'The Prism control server owns design-set and document-revision state. The tool owns its request/result projection; an HTTP response lost after server commit requires checking the same document/generation/revision before repeating the write.',
        check: 'Through the activated OpenClaw tool, send an admitted design-set or expectedRevision-bound revision and verify returned control-server state. A non-OK response throws its returned error or HTTP status; invalid JSON falls back to an HTTP error object. This client declares no timeout, response-size cap, abort signal or automatic retry; source availability proves no bounded request or functional server readiness. Stop on an uncertain result and reconcile server state before another write.',
      }, [[relative, 'async function post(', 'export default function register(api)'],
        [relative, 'export default function register(api)', '  api.registerTool({'],
        [relative, '    async execute(_id, params, context)', '  });'],
        [relative, '      required: ["jobId", "fence", "generationId", "projectId", "documentId", "expectedRevision"', '      properties: {']],
      'OpenClaw registered HTTP tool consumer could not be qualified');
    }
  }
  if (finiteLocalGit(['sourceGit'], new Set(['rev-parse', 'archive']))) qualify('skills/nova/core/test-gates/source-git.ts', 'subprocess target requires command dependency authority', {
    scope: 'local-command',
    service: 'Local Git source snapshot: the reached callers use only rev-parse and archive against an existing allowed repository. This subprocess does not fetch or push a remote.',
    endpoint: 'The test.plan.execute request selects repositoryRoot and an immutable revision inside allowedRepositoryRoots. Git reads the local object database; the separate configured Buster endpoint owns plan submission.',
    secret: 'This Git snapshot path requests no Git credential. The enclosing remote-plan adapter separately resolves its bearer token and source-attestation private key through secrets.read.',
    dataOwner: 'The project repository owns source objects. The snapshot records the exact commit, tree and archive identity; the import store owns the resulting gate evidence.',
    check: 'Require successful bounded revision/tree resolution and archive creation for the requested revision before submission. A missing local object stops snapshot creation; another branch head cannot substitute for it.',
  }, [['skills/nova/core/test-gates/source-snapshot.ts', "['archive', '--format=tar.gz', revision]"], ['skills/nova/core/test-gates/source-git.ts', "spawn('git'"]]);
  if (finiteLocalGit(['git', 'spawnSync', 'execFileSync'], new Set(['rev-parse', 'show', 'merge-base', 'grep', 'diff', 'ls-tree', 'cat-file', 'status']))) qualify('skills/nova/plugins/repository-adapter/src/revision-reader.ts', 'subprocess target requires command dependency authority', {
    scope: 'local-command',
    service: 'Local Git revision reader: the reached argv families inspect commits, trees, blobs, status, ancestry, differences and references; they contain no fetch, push or clone operation.',
    endpoint: 'The adapter selects an allowed local repositoryRoot. The caller supplies a full object identity, proof, allowed path prefixes and bounded read sizes. No remote Git endpoint is selected by these read operations.',
    secret: 'No remote credential is requested by the explicit revision-reader argv. The deployment owns the trusted Git executable and repository configuration; this claim covers the repository reader interface, not arbitrary replacement binaries or Git extensions.',
    dataOwner: 'The existing repository owns immutable source objects. The adapter issues attempt-bound proof and digest records; it does not replace source history.',
    check: 'Resolve the requested commit and run the allowed read operation with its path/size scope. Verify the returned object identity, size and digest; missing objects, dirty-source checks, ancestry failures or out-of-scope paths stop the request.',
  }, [['skills/nova/plugins/repository-adapter/src/revision-reader.ts', "['cat-file', '-t', object]"], ['skills/nova/plugins/repository-adapter/src/adapter.ts', 'context.config.repositoryRoot']]);
  qualify('skills/common/plugins/git-workspace/src/runner.ts', 'subprocess target requires command dependency authority', {
    scope: 'remote-command',
    service: 'Git executable selected by gitExecutable. Worktree, commit, merge, rebase and sync_paths operate locally; git.sync fetch and push contact the named project remote.',
    endpoint: 'The request selects an authorized repository/workspace and payload.remote; fetch and push use origin when remote is omitted. The selected repository Git configuration resolves that remote name to its URL. The adapter declares no independent URL override.',
    secret: 'Git owns remote authentication through its repository/system configuration, credential helpers and SSH configuration. The child receives env: {}; this adapter neither inherits process environment credentials nor resolves secrets.read. The deployment must provide the selected Git transport and its credential authority.',
    dataOwner: 'The local project owns worktrees and commits; the configured remote owns fetched/pushed refs. Workspace ownership is bound to the original attempt and approved revision.',
    check: 'For a requested local operation, verify the returned source revision and workspace owner. For fetch/push, use the authorized named remote and verify Git exit status plus the expected ref/object; ready() alone is empty and proves no remote access. Enforce maxExecutionMs, maxOutputBytes and terminationGraceMs.',
  }, [['skills/common/plugins/git-workspace/src/runner.ts', 'shell: false'], ['skills/common/plugins/git-workspace/src/runner.ts', 'env: {}'], ['skills/common/plugins/git-workspace/src/operations.ts', "['fetch', '--prune', '--', gitToken(request.payload.remote ?? 'origin', 'remote')]"], ['skills/common/plugins/git-workspace/src/operations.ts', "['push', '--porcelain', '--', remote"]]);
  qualify('skills/common/plugins/command-runner/src/runner.ts', 'subprocess target requires command dependency authority', {
    scope: 'selected-program',
    service: 'Host-installed executable selected by command.execute/run. allowedExecutables and executableCatalog constrain executable identity; allowedWorkingRoots constrain the working directory. The selected program can have its own external dependencies.',
    endpoint: 'The request resource is command.executable: a canonical path or catalog:name. The operator selects the permitted binary/catalog and working roots; request args belong to that selected program. Program-specific endpoints must be qualified for that configured instance.',
    secret: 'The adapter rejects payload.environment and launches with an empty environment. It declares no credential projection for a selected program. Files, OS identity, program configuration and any credentials they expose remain the deployment/program owner’s responsibility.',
    dataOwner: 'The selected executable owns its effects under the granted command and working-directory authority. The adapter owns only bounded execution/output and cancellation state.',
    check: 'ready() rechecks canonical executable and directory access, but does not execute a target operation. Run an authorized bounded operation for the selected binary and verify exit/output and intended effects. maxExecutionMs, maxOutputBytes and terminationGraceMs bound the process; shell is false.',
  }, [['skills/common/plugins/command-runner/src/adapter.ts', "throw new Error('COMMAND_ENVIRONMENT_DENIED')"], ['skills/common/plugins/command-runner/src/adapter.ts', 'environment: {}'], ['skills/common/plugins/command-runner/src/runner.ts', 'shell: false']]);
  qualify('skills/nova/plugins/lint/src/engine/process.ts', 'subprocess target requires command dependency authority', {
    scope: 'selected-program',
    service: 'Lint tools and candidate Git selected by the checked policy and tool registry. The operator owns installed tool versions, PATH and required native dependencies. A tool can read local files, caches, container sockets or its own remote sources.',
    endpoint: 'allowedRepositoryRoots and allowedPolicyRoots admit the working directory and policyPath. Policy selects applicable tools and arguments; the tool’s declared protocol/configuration owns any endpoint. CONTAINER_HOST, DOCKER_HOST and SSH_AUTH_SOCK are among the explicit subprocess environment allowlist.',
    secret: 'The lint engine passes only its SUBPROCESS_ENV_KEYS allowlist plus permitted overrides; it does not copy arbitrary process secrets. HOME, tool configuration paths and the allowed SSH socket can expose host-managed credentials. Qualify those authorities for every selected tool; package activation proves no target credentials or access.',
    dataOwner: 'The repository owns input files; the lint engine owns findings and bounded report evidence. Tool caches and remote tool services retain their respective owners.',
    check: 'commandExists uses which with a five-second bound and only proves binary availability. Run the policy-selected tool against the admitted input, retain exit/output and parsed findings, and verify the report. runProcess enforces timeout and a combined default ten-MiB output bound; cancellation terminates the native process group.',
  }, [['skills/nova/plugins/lint/src/adapter.ts', "requireInside(payload.policyPath, policyRoots, 'LINT_POLICY_PATH')"], ['skills/nova/plugins/lint/src/engine/execution.ts', 'SUBPROCESS_ENV_KEYS'], ['skills/nova/plugins/lint/src/engine/process.ts', '10 * 1024 * 1024']]);
  if (knownSdkCalls('skills/common/plugins/openclaw-agent-events/src/adapter.ts', new Set(['on']))) qualify('skills/common/plugins/openclaw-agent-events/src/adapter.ts', 'external runtime implementation openclaw/plugin-sdk requires dependency authority', {
    scope: 'host-subscription',
    service: 'The OpenClaw host supplies openclaw/plugin-sdk.on(hook, handler). The adapter subscribes only configured SUPPORTED_HOOKS and emits canonical namespaced plugin events through its activation context. This interface does not select a remote OpenClaw endpoint.',
    endpoint: 'The operator installs the adapter inside a compatible OpenClaw host and configures a nonempty, unique hooks allowlist. The host owns event production and plugin subscription permission; Nova owns the granted agent.events.subscribe status interface and canonical journal ingestion.',
    secret: 'The hook subscription interface accepts no credential. The host owns its own model/runtime credentials; these are excluded from the metric-only event projection by sensitive-field filtering.',
    dataOwner: 'The host owns upstream hook events. The adapter retains bounded volatile ingress until context.emit completes; subscription registration provides no upstream acknowledgement or durable replay. The canonical core journal owns committed events.',
    check: 'ready() requires sdk.on and registers every selected hook. Produce an authorized host event, then drain status and verify emitted/failed/rejected counts and the canonical namespaced event. Enforce maxQueueEvents/default 256, maxQueueBytes/default one MiB and drainTimeoutMs/default five seconds; shutdown unsubscribes before draining. Test both capacity rejection and cancellation.',
  }, [['skills/common/plugins/openclaw-agent-events/src/adapter.ts', "require('openclaw/plugin-sdk')"], ['skills/common/plugins/openclaw-agent-events/src/adapter.ts', "throw new Error('OPENCLAW_HOOK_API_UNAVAILABLE')"], ['skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts', 'maxQueueEvents']]);
  if (knownSdkCalls('skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', new Set(['onDiagnosticEvent']))) qualify('skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', 'external runtime implementation openclaw/plugin-sdk/diagnostic-runtime requires dependency authority', {
    scope: 'host-subscription',
    service: 'The OpenClaw host supplies diagnostic-runtime.onDiagnosticEvent(handler). The bridge accepts only object events whose type is model.usage and releases the returned function/unsubscribe/dispose/off subscription during shutdown. Redis publication remains a separate explicit client dependency.',
    endpoint: 'The installed host provides this in-process diagnostic SDK; the bridge has no endpoint selector. api.pluginConfig and the documented observer configuration select the separate Redis transport. Host hook/event permissions and operator.read gateway scope belong to OpenClaw.',
    secret: 'No credential is supplied to the diagnostic subscription. OpenClaw owns model credentials and diagnostic production; observer Redis password/TLS/isolation authority is documented separately and is not proven by SDK availability.',
    dataOwner: 'OpenClaw owns model.usage diagnostics. The observer normalizes model-usage metrics and owns its bounded local queue/status; the configured Redis stream owns retained observability entries.',
    check: 'Require the host diagnostic SDK and onDiagnosticEvent function, produce a real model.usage event and verify its normalized observer metric and Redis record. Non-object and other event types are ignored. Verify subscription release at shutdown; observer selfTest tests its publication path but does not prove that the host emitted a model diagnostic.',
  }, [['skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', "require('openclaw/plugin-sdk/diagnostic-runtime')"], ['skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', "type !== 'model.usage'"], ['skills/common/plugins/openclaw-agent-observer/src/index.ts', "scope: 'operator.read'"]]);
  const lock = path.join(repositoryRoot, 'package-lock.json');
  const lockValue = fs.existsSync(lock) ? JSON.parse(fs.readFileSync(lock, 'utf8')) : {};
  for (const [relative, name, guards, text] of [
    ['skills/common/plugins/runtime-dispatch/src/openclaw.ts', 'tiktoken', [['skills/common/plugins/runtime-dispatch/src/openclaw.ts', 'get_encoding(name)'], ['skills/common/plugins/runtime-dispatch/src/openclaw.ts', 'encoder.encode(text).length']], 'get_encoding plus encode count local prompt tokens against the fixed OpenClaw token budget'],
    ['skills/nova/plugins/review/src/review-prompt-budget.ts', 'js-tiktoken', [['skills/nova/plugins/review/src/review-prompt-budget.ts', 'getEncoding(encoding)'], ['skills/nova/plugins/review/src/review-prompt-budget.ts', 'encoder.encode(text).length']], 'getEncoding plus encode count local review prompt tokens; the configured encoding and request budgets bound dispatch'],
    ['skills/nova/plugins/lint/src/engine/kubernetes-manifests.ts', 'yaml', [['skills/nova/plugins/lint/src/engine/kubernetes-manifests.ts', 'parseAllDocuments(content'], ['skills/nova/plugins/lint/src/engine/kubernetes-manifests.ts', 'maxAliasCount: 100']], 'LineCounter and parseAllDocuments parse local bounded manifest text; max_documents and max_rendered_bytes reject oversized input and YAML conversion bounds aliases to 100'],
    ['skills/nova/plugins/lint/src/engine/openapi-tool.ts', 'yaml', [['skills/nova/plugins/lint/src/engine/openapi-tool.ts', 'parseDocument(fs.readFileSync(file'], ['skills/nova/plugins/lint/src/engine/openapi-tool.ts', 'maxAliasCount: 0']], 'parseDocument validates a local OpenAPI file with unique keys; conversion rejects aliases and path-item references resolve only local JSON pointers'],
  ]) {
    const installed = lockValue.packages?.[`node_modules/${name}`];
    if (!installed?.version || !installed.integrity) continue;
    const supported = new Set(name === 'tiktoken' ? ['get_encoding'] : name === 'js-tiktoken' ? ['getEncoding'] : ['LineCounter', 'parseAllDocuments', 'parseDocument']);
    const calls = (invocation.externalInterfaces ?? []).filter((item) => item.package === name && item.file === path.join(repositoryRoot, relative));
    if (!calls.length || calls.some((item) => !supported.has(item.interface))) continue;
    qualify(relative, `external runtime implementation ${name} requires dependency authority`, {
      scope: 'local-library',
      service: `Local library ${name}@${installed.version}, selected by the workspace package lock. The reached interface uses ${text}. The package owner must install the locked dependency; this is not a remote capability binding.`,
      endpoint: 'This library interface receives in-memory text, not a service endpoint. Remote calls elsewhere in the registration remain separate dependencies.',
      secret: 'The reached parsing/token-counting interface supplies no credential or Secret reference. Treat the parsed input as caller-owned data and enforce its enclosing limits.',
      dataOwner: 'The caller owns input text and derived token counts or parsed documents. The local library supplies computation; the enclosing runtime retains result and dispatch authority.',
      check: 'Run the package’s focused input/encoding/parse tests with the locked library. Verify token-count or parsed-document results and negative input limits. This check does not prove any separately configured dispatch service or tool is reachable.',
    }, [...guards, ['package-lock.json', `"node_modules/${name}"`, `"integrity": "${installed.integrity}"`]]);
  }
  if (registration.manifestFile === 'plugins/kubeclaw-ops/.codex-plugin/plugin.json' && registration.kind === 'Codex plugin' && registration.module === './skills/' && remaining.has('Registration has no executable entrypoint')) {
    const sources = [evidence('plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md', 'list_argocd_applications'), evidence('tools/ops-mcp/src/config.mjs', 'OPS_MCP_BEARER_TOKEN_FILE'), evidence('tools/ops-mcp/src/authentication.mjs', 'Configure exactly one Ops MCP bearer token source'), evidence('tools/ops-mcp/src/kubernetes.mjs', 'KUBERNETES_API_URL'), evidence('tools/ops-mcp/src/hubble.mjs', 'HUBBLE_SERVER')];
    if (sources.every(Boolean)) {
      remaining.delete('Registration has no executable entrypoint');
      records.push({
        scope: 'host-tools',
        service: 'Codex skill guidance invokes separately connected read-only Ops MCP tools. The skill package contains no server connection or executable; the Codex host/operator owns the installed MCP connection. The repository server reads Kubernetes/Argo resources and Hubble observations.',
        endpoint: 'The host connection selects the MCP URL. Server HOST/PORT default to 0.0.0.0/8080; OPS_LOCAL_ONLY=1 requires 127.0.0.1. Kubernetes uses KUBERNETES_API_URL or https://kubernetes.default.svc. Hubble uses HUBBLE_SERVER or hubble-relay.cilium.svc.cluster.local:4245 and the configured HUBBLE_BIN.',
        secret: 'Configure exactly one OPS_MCP_BEARER_TOKEN_FILE or OPS_MCP_BEARER_TOKEN; the server rejects missing/invalid authentication. Kubernetes reads KUBERNETES_TOKEN_FILE and KUBERNETES_CA_FILE, defaulting to projected service-account token/CA files. The deployment owns read-only RBAC, token projection/rotation, allowed namespaces and client credentials; Codex interface capability Read is not a Nova or Buster grant.',
        dataOwner: 'Kubernetes and Argo own observed resource state; Hubble owns bounded current observations. Requested logs/flows can contain sensitive unredacted data. The skill owns diagnostic guidance and makes no cluster mutation.',
        check: 'Connect the configured Ops MCP through the host and call a permitted namespace_overview or list_argocd_applications. Verify expected authorized resources, pagination/partial status and negative namespace/authentication denial. Server listening alone proves no Kubernetes/Hubble reachability. Kubernetes requests have ten-second/eight-MiB bounds; Hubble queries have a twelve-second bound, two-query concurrency and at most fifteen-minute windows.',
        evidence: sources.map(({ file, line, endLine }) => ({ file, line, endLine })),
      });
    }
  }
  return { records, diagnostics: [...remaining].sort() };
}
