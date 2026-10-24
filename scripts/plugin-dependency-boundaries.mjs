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
        secret: 'The provider indexes a frozen ordinary-object copy of the environment-name mapping, without an own-property check; do not claim inherited keys are excluded. A falsy lookup raises SECRET_DENIED; an unset or empty selected environment value raises SECRET_UNAVAILABLE. It returns the value for both confidential and nonconfidential invocations; the latter require fence.assertCurrent but are not rejected merely for being nonconfidential. The caller must protect the returned value and result handling. The process/deployment owner supplies and rotates environment values; removing the adapter does not erase them.',
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
          check: `Run the reached operation against its admitted target and verify scanner operation, findings and resultDigest; require databaseEvidence for dependency/image and exact manifest digest for policy. Timeout is the smaller request/runtime limit and covers applicable snapshot checks plus execution. maximumOutputBytes bounds combined stdout/stderr. Separate input/path/image denial, ${operations.some((operation) => operation !== 'kubernetes-policy') ? 'database failure, ' : ''}execution/output failure, timeout and cancellation. ${policy ? 'Policy scans do not inspect vulnerability databases and require no vulnerability-database failure check. ' : ''}A local scanner binary proves no registry auth or image access.`,
        };
        if (operations.includes('dependency')) {
          record.endpoint += ' The dependency target is canonically contained but the runtime does not require a directory; an existing file can reach trivy fs and produce only a partial scan. Before invoking, establish that the selected path is the intended project directory and verify expected project coverage; a successful file-level result is not whole-project evidence.';
        }
        record.endpoint += ' The selected runtime constructor requires a nonempty allowedRegistryPrefixes configuration for every operation, including dependency and Kubernetes policy local scans; this is configuration admission, not a remote scan target.';
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
          check: 'Verify kubectl auth can-i get and patch in controllerNamespace, admitted lease identity/service/expiry, and observed exposure generation Ready with the allowed HTTPS URL. Polling stops at readinessTimeoutMs capped by maximumExecutionMs; subprocess output is capped at one MiB. Failed prepare attempts a bounded owned rollback to off; retain AggregateError on rollback failure. await-readiness additionally requires a retained source lease (cleanupPolicy retain), lease UID, digest-pinned verifiedImage and valid manifestDigest; the fixture default delete retention cannot supply this handoff. Release must observe Off for the same owner; controller readiness does not prove a separate authorized client can reach the preview.',
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
          ['my-values/infra/tailscale-operator-values.yaml', '# OAuth credentials are intentionally', '  clientSecret: ""'],
          ['skills/buster/engine/test-gates/exposure-handoff.ts', 'export function pendingExposureHandoff(', "if(typeof spec.verifiedImage"]);
        break;
      case 'NetworkHttpCapabilityInvoker':
        record = {
          service: 'Buster performs HTTP or allowed WebSocket requests through the configured network consumer. A registry health request has a separate narrow authentication projection.',
          endpoint: 'The request resource canonicalId supplies the URL. Targets must first match allowedOrigins or allowedHostSuffixes and an allowedPort, except the separately configured registry-health origin. Current fixture origins only give an already policy-admitted target exact-origin status; a fixture cannot override the network policy. URL credentials and redirects are denied; allowedMethods/request headers scope operations. The runtime owner supplies these policies and the concrete endpoint.',
          secret: 'The request may supply only allowed headers; the runtime does not resolve secrets.read. Optional registryHealth configuration requires either an HTTPS origin with both nonempty username and password, or an HTTP origin with neither credential field present. Other combinations fail HTTP_REGISTRY_HEALTH_AUTH_INVALID. This separate authority can authorize only GET/HEAD of exactly /v2/ with no body and accept-only input headers. Other paths cannot use platform registry credentials; response checks deny the Basic authorization header, its base64 payload and the password when reflected in checked response bytes or content type; raw username reflection alone is not rejected. The configured runtime and caller own their respective credential sources and rotation.',
          dataOwner: 'The selected HTTP/WebSocket target owns remote state. The consumer owns bounded request/response observation; a mutating HTTP result lost after receiver commit remains uncertain. Fixture leases retain endpoint admission authority.',
          check: 'Run the permitted request against its admitted URL and verify the intended status/body or bounded WebSocket result. Bound requests by maximumExecutionMs, maximumRequestBytes and maximumResponseBytes plus narrower request limits. Verify origin/header/method/auth denial and timeout/cancellation separately; HTTP status alone proves no unrelated target operation.',
        };
        const callerFiles = [...invocation.selectedSources.keys()].map((file) => path.relative(repositoryRoot, file).split(path.sep).join('/'));
        if (callerFiles.includes('skills/buster/plugins/security-providers/src/headers.js')) {
          record.service = 'The security headers provider issues only network.http request/GET calls to configured paths of one typed deployment endpoint; it does not select WebSocket or registry-health operations.';
          record.endpoint += ' This selected provider requires exactly one typed deployment input with exactly one endpoint. Its URL must be a root HTTP/HTTPS origin without credentials/query/fragment; web-https-v1 additionally requires HTTPS. Paths remain on that origin.';
          guards.push(['skills/buster/plugins/security-providers/src/headers.js', 'function deployment(invocation)', 'function check(value, item)'],
            ['skills/buster/plugins/security-providers/src/headers.js', "payload: { method: 'GET'", 'maximumResponseBytes: 65_536, responseHeaders']);
        }
        if (callerFiles.includes('skills/buster/plugins/demo-auth-smoke/src/provider.js')) {
          record.endpoint += ' The demo-auth-smoke session requires allowedMethods to include POST and GET and allowedRequestHeaders to include accept, content-type and cookie; the defaults GET/HEAD and accept alone cannot run login and authenticated requests.';
          record.secret += ' For demo-auth-smoke, config.usernameKey and config.passwordKey name login JSON properties, not credentials or Secret references. Those properties receive the fixed confidential credentials.values.username and credentials.values.password values respectively; changing the property names does not select different credential fields.';
          guards.push(['skills/buster/plugins/demo-auth-smoke/src/provider.js', "payload:{method,headers:{accept:'application/json',...headers}", "const authenticated = await request(config.protectedPath,'GET',{cookie});"],
            [relative, "const methods = options.allowedMethods ?? ['GET', 'HEAD'];", 'this.#allowedRequestHeaders = new Set(headers);']);
        }
        for (const [caller, first, last] of [
          ['skills/buster/plugins/http/src/provider.js', "if (value.schemaVersion !== 'public-endpoint-fixture.v1'", "value.provider !== 'tailscale-ingress'"],
          ['skills/buster/plugins/demo-auth-smoke/src/protocol.js', "e.schemaVersion !== 'public-endpoint-fixture.v1'", "e.provider !== 'tailscale-ingress'"],
        ]) {
          if (!callerFiles.includes(caller)) continue;
          record.endpoint += ' Its public-endpoint fixture must name provider tailscale-ingress; another provider is rejected before requesting the endpoint. This route requires the separately owned Tailscale ingress exposure, not merely a schema-valid URL.';
          guards.push([caller, first, last]);
        }
        guards.push([relative, '  async invoke(', '    const payload = exactPayload'],
          [relative, '  #target(', '  async #responseBytes('],
          [relative, '    const timeoutMs = positiveInteger(payload.timeoutMs', '      return websocket('],
          [relative, '      response = await fetch(url', '      return Object.freeze({'],
          ['skills/buster/engine/test-gates/registry-health-access.ts', 'export function validateRegistryHealth(', "throw new Error('HTTP_REGISTRY_HEALTH_AUTH_INVALID');"],
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
          endpoint: 'kubectlExecutable and controllerNamespace/leaseApiGroup/version select the API/lease consumer. allowedNamespacePrefixes, registry prefixes, Secret references, storage classes and resource/manifest/storage/retention limits scope the request. KUBECONFIG, kubectl default configuration under the inherited HOME when KUBECONFIG is absent, or applicable in-cluster Kubernetes settings supply the concrete API. The platform owner must qualify the effective HOME, selected kubeconfig/context and credential authority before use; no plugin-local API override is implied.',
          secret: 'kubectl receives fixed PATH plus HOME, KUBECONFIG and Kubernetes service host/port. The deployment owns API credentials and lease RBAC, including any default $HOME/.kube/config authority selected when KUBECONFIG is absent. Qualify the actual API/context and credential source rather than assuming service environment selects the cluster. allowedSecretReferences constrain controller copies; optional testCredentials requests a named generated username/password Secret with runnerSubject and credentialReaderSubject readers. The consumer verifies lease and Secret identity, then decodes and returns username/password values in the demo-credentials output: this is secret material, not provenance only. The authorized confidential consumer and selected output/evidence store must enforce access and retention; do not log or publish values as operational proof. This source-side fact does not qualify arbitrary DATA output roles.',
          dataOwner: 'Kubernetes owns leases, namespaces, workloads, Secrets and persistent volumes. The controller owns provisioning and expiry. The consumer binds the fixture to the source manifest/image and returns endpoint/credential evidence. Release requests the lease deletion; retain required data/evidence before namespace cleanup.',
          check: 'Before prepare, require lease create/get/delete plus permissions for server dry-run and ordinary client apply of the lease, workload apply in the namespace, pod list, service/endpoints get, and optional generated-Secret get. This is not --server-side apply. Require the exact manifest digest/immutable image and both runtime/controller Secret allowlists plus storage authority. Verify lease Ready, expected running pods and service endpoints; maximumExecutionMs, output and polling limits bound checks. Only failures inside the post-lease-apply try block attempt bounded lease release. Dry-run or initial ordinary apply errors are outside that cleanup block; an uncertain accepted apply can retain effects. Inspect and reconcile the exact lease before retrying; an attempted release does not prove cleanup. A kubectl binary or Ready lease alone does not prove the deployment’s application task.',
        };
        guards.push([relative, '  async #kubectlRun(', '  async #waitLease('],
          [relative, '    const secretReferences =', '    let testCredentials'],
          [relative, '    const lease = {', '    const resource ='],
          [relative, "    for (const verb of ['create', 'get', 'delete'])", '    } catch (error) {'],
          [relative, '  async #generatedCredentials(', '  async #prepare('],
          ['skills/buster/engine/test-gates/generated-demo-credentials.ts', 'export function generatedDemoCredentials(', "source:boundSource,values};"],
          [relative, '  async #release(', '  async invoke(']);
        break;
      case 'KubernetesRuntimeSecurityCapabilityInvoker':
        record = {
          service: 'Buster runs local kubectl to read controller-produced runtime-security observations from an existing Kubernetes lease. This operation inspects observed workload state rather than running a local Trivy scan.',
          endpoint: 'kubectlExecutable, controllerNamespace and leaseApiGroup identify the lease reader. allowedNamespacePrefixes scope payload.namespace; workspaceRoot admits the source manifest. KUBECONFIG, the default $HOME/.kube/config selected through the inherited HOME when KUBECONFIG is absent, or applicable in-cluster configuration selects the Kubernetes API. The platform owner must qualify the effective HOME, kubeconfig/context and credential source before this read.',
          secret: 'The child receives fixed PATH/locale plus HOME, KUBECONFIG and Kubernetes service host/port. The deployment owns API credential projection/rotation and read access to the admitted lease, including HOME-based default kubeconfig authority when KUBECONFIG is absent; this request supplies no new Secret selector. Inherited HOME is not an isolated credential boundary.',
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
          endpoint: `allowedOrigins and current fixture origins admit the request target; allowedBrowsers/browserExecutables select local binaries. Request routes and checked profiles select pages/viewports. ${axe ? 'The Axe consumer checks redirect destinations against the selected target origin with maxRedirects: 0 and explicit Location handling.' : 'Visual capture checks the original routed request against the selected target origin, then calls route.continue(). Playwright runs this handler only for the original request; redirected requests continue without its origin check. An admitted resource can therefore redirect to another origin. This route check does not establish network containment.'} Source availability proves no browser or application readiness.`,
          secret: 'The checked browser profile constructs presentation/context options; it exposes no plugin-local credential reference or platform secrets.read projection. Browser launch/process environment and any application session or credential handling remain with the runtime/browser owner; do not infer authenticated access from the origin allowlist.',
          dataOwner: `The application owns remote content/state; the consumer owns temporary browser contexts and ${axe ? 'Axe findings/screenshots' : 'captured/comparison images'}. The caller owns supplied ${axe ? 'exclusion/analysis inputs' : 'baseline/mask inputs'} and retained result evidence. Contexts/browsers close during cleanup.`,
          check: `Run the admitted routes/profiles and verify the ${axe ? 'Axe result and violation evidence' : 'bounded captured/comparison image and visual findings'}. ${axe ? 'Enforce maximumCombinations/concurrency/result and screenshot limits; each combination starts its timeout only after all browsers launch. Browser launch receives no request-deadline timeout or abort race; cancellation closes only browsers already registered. Startup can outlast the request timeout, so require separately verified launcher supervision for a hard operation-wide bound.' : 'Enforce maximumCombinations/concurrency/execution/result and screenshot limits plus mask and decoded-image limits.'} Test origin denial, invalid profiles/input sizes, timeout and cancellation. A launched browser or source fixture alone proves no authenticated task success.`,
        };
        if (!axe) {
          record.service += ' capture reaches the application; compare uses only caller-supplied PNG images and local pixelmatch computation.';
          record.endpoint += ' Visual capture closes every WebSocket, including same-origin sockets, with policy code 1008; neither allowedOrigins nor fixture authority enables them. Socket attempts recorded by the post-navigation check fail BROWSER_VISUAL_SUBRESOURCE_ORIGIN_DENIED. Later sockets are still closed and can change the captured application state, so this route cannot establish WebSocket-dependent rendering or functional success.';
          record.check += ' The visual provider requires repository-contained profiles/manifest and bounded digest-checked PNG baselines using kubeclaw.visual-baselines.v2; v1 requires recapture/migration. Browser/profile/viewport/page conditions and the exact captured browser version must match the approved baseline before comparison.';
          guards.push(['skills/buster/plugins/visual/src/browser-identity.js', 'export function assertBaselineVersion(', 'export function assertBaselineBrowserVersion('],
            ['skills/buster/plugins/visual/src/provider.js', 'const baseline = fileInside(', 'entries.set(entry.id,']);
          record.endpoint += ' Before relying on capture containment, the Buster runtime owner must verify independent browser egress enforcement that denies cross-origin redirect traffic, or correct the runtime and prove redirect denial. Stop capture where containment is required until that proof exists; an origin allowlist or a passed screenshot is insufficient. compare selects visual.comparison:pixelmatch-v1 and no remote endpoint.';
          record.check += ' Typed deployment/public-endpoint fixtures must have a valid future expiresAt; expired authority fails before use and the fixture expiry signal also cancels asynchronous capture. Origin admission alone does not extend the lease. Synchronous pixel comparison cannot be preempted by a timer. capture starts its deadline before browser launch, but launch receives no remaining-deadline timeout or cancellation race; the callback closes only browsers already registered after launch. A pending launch can outlast maximumExecutionMs or cancellation, so this is not a hard operation-wide bound. Require separately verified launcher supervision when a hard startup deadline is needed. compare bounds input/decoded/result image sizes and checks cancellation before synchronous comparison; it declares no separate computation timeout.';
          guards.push(['skills/buster/engine/test-gates/fixture-authority.ts', 'export function fixtureAuthoritySignal(', 'return AbortSignal.any('],
            [relative, "    if (request.operation === 'compare')", "    if (request.operation !== 'capture')"],
            [relative, "          await context.route('**/*'", '            return route.continue();\n          });']);
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
          // Only the exact original local forwarding declaration may defer argv
          // classification to its finite git(...) callers. A spread at any other
          // call site (including an allowed verb prefix) is not finite authority.
          if (args && ts.isArrayLiteralExpression(args) && args.elements.some(ts.isSpreadElement)) {
            const forwarder = node.parent?.parent;
            const originalForwarder = node.expression.text === 'execFileSync'
              && file === path.join(repositoryRoot, 'skills/nova/plugins/repository-adapter/src/revision-reader.ts')
              && forwarder && ts.isBlock(forwarder) && ts.isFunctionDeclaration(forwarder.parent)
              && forwarder.parent.getText(source) === "function git(root: string, args: readonly string[], maxBuffer = 1024 * 1024): Buffer {\n  return execFileSync('git', ['-C', root, ...args], {\n    encoding: 'buffer', maxBuffer, stdio: ['ignore', 'pipe', 'pipe'],\n  });\n}";
            if (!originalForwarder) { seen++; valid = false; }
            ts.forEachChild(node, scan); return;
          }
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
    endpoint: 'The adapter selects an allowed local repositoryRoot. freeze_head resolves ref (HEAD when omitted), checks expectedHead when configured and requireClean only when requested, then issues an attempt-bound proof. Subsequent revision operations validate that proof. Prefix admission is operation-specific: changed_manifest, list_revision_paths, inventory_revision and read_revision_text apply allowedPrefixes; changed_line_ranges does not inspect it, and find_revision_references scopes candidate result paths but not sourcePaths. Core grants remain the independent authority for each resource; payload scope is not universal enforcement. The separate read_text operation reads the live working tree without a freeze proof or expectedHead check; it is not revision-pinned. These explicit argv do not select a remote endpoint. Local-only operation additionally requires all needed objects locally available: a partial clone can lazily fetch missing promisor objects through its configured remote and transport.',
    secret: 'The explicit revision-reader argv name no remote credential, but Git inherits process environment and repository/system configuration. A partial-clone lazy fetch can use a configured promisor remote and its credentials. Qualify that remote, transport, credential and reachability owner, or require complete offline object availability before activation; trusted-binary availability alone does not prove local-only execution.',
    dataOwner: 'The repository owner controls source objects and working-tree files. read_text can return any admitted regular file contained under repositoryRoot, including untracked/ignored .env files and .git metadata such as config; it does not require tracking or exclude those names. Before activation the platform configuration owner must assign a disclosure owner and arrange root/grants so colocated sensitive material is not exposed. Its UTF-8 decoding can replace invalid byte sequences, and it returns no immutable object ID or digest. The adapter issues attempt-bound proof and digest records and does not replace source history; a lazy fetch can still contact the promisor remote and populate its local object store. Operational ownership of that remote/cache is separate from the read result.',
    check: 'Resolve the requested commit and run the allowed read operation with its path/size scope. Require external process/wall-time supervision for every enabled Git operation: execFileSync and spawnSync have output caps but no timeout or interruptible cancellation, including status, rev-parse, cat-file, show, ls-tree, diff and promisor/credential I/O. read_text requires the /proc/self/fd descriptor filesystem and supported directory/no-follow flags; ready() only checks that the root is a directory, not that an authorized read succeeds. For revision operations verify applicable returned object identity, size and digest; missing objects, dirty-source checks, ancestry failures or out-of-scope paths stop those requests. Do not infer that read_text checked expectedHead or immutable object identity. Reference search can collect up to 32768 candidates and synchronously verify each with Git show before checking the requested result maxPaths; a small result limit is not a proportional work or wall-time bound. Qualify external supervision/work limits before allowing expensive searches. Verify complete local object availability or explicitly qualify promisor remote access and credentials; a read failure is not proof that no network fetch occurred.',
  }, [['skills/nova/plugins/repository-adapter/src/revision-reader.ts', "['cat-file', '-t', object]"], ['skills/nova/plugins/repository-adapter/src/adapter.ts', 'context.config.repositoryRoot'], ['skills/nova/plugins/repository-adapter/src/repository-file.ts', 'export function readRepositoryFile(', 'const content = bytes.toString'], ['skills/nova/plugins/repository-adapter/src/revision-reader.ts', 'changedLineRanges(pathInput:', 'return { base, head, path, ranges']]);
  qualify('skills/common/plugins/git-workspace/src/runner.ts', 'subprocess target requires command dependency authority', {
    scope: 'remote-command',
    service: 'Git executable selected by gitExecutable. Worktree, commit, merge, rebase and sync_paths operate locally; git.sync fetch and push contact the named project remote.',
    endpoint: 'The request selects an allowed repository/workspace and payload.remote; fetch and push use origin when omitted. The adapter validates remote token syntax, not a remote-name allowlist. Repository/system Git configuration resolves fetch URLs, pushurl and URL rewriting; effective fetch and push targets can differ. The platform grant/payload policy and actual transport must be established separately.',
    secret: 'Git owns remote authentication through its repository/system configuration, credential helpers and SSH configuration. The child receives env: {}; this adapter neither inherits process environment credentials nor resolves secrets.read. The deployment must provide the selected Git transport and its credential authority.',
    dataOwner: 'Creation writes a worktree/branch under workspaceRoot and records the creating attempt. Later workspace-owner checks apply only when workspaceReference is supplied; approved-source checks depend on the selected approval contract. Do not infer either condition for every caller. Local worktree/ref mutations can be partial, and remote ref ownership must be established for the actual selected target.',
    check: 'For a requested local operation, verify the returned source revision and workspace owner. For fetch/push, inspect the actual fetch/push URLs and configured authorization and verify Git exit status plus the expected ref/object. Worktree creation precedes its owner record, removal precedes optional branch deletion, sync_paths mutates paths separately, and some validation follows mutation. Failure, cancellation or lost remote results do not establish rollback; reconcile the exact workspace/refs before retry. ready() alone is empty and proves no remote access. Enforce maxExecutionMs, maxOutputBytes and terminationGraceMs.',
  }, [['skills/common/plugins/git-workspace/src/runner.ts', 'shell: false'], ['skills/common/plugins/git-workspace/src/runner.ts', 'env: {}'], ['skills/common/plugins/git-workspace/src/operations.ts', "['fetch', '--prune', '--', gitToken(request.payload.remote ?? 'origin', 'remote')]"], ['skills/common/plugins/git-workspace/src/operations.ts', "['push', '--porcelain', '--', remote"]]);
  qualify('skills/common/plugins/command-runner/src/runner.ts', 'subprocess target requires command dependency authority', {
    scope: 'selected-program',
    service: 'Host-installed executable selected by command.execute/run. allowedExecutables and executableCatalog constrain executable identity; allowedWorkingRoots constrain the working directory. The selected program can have its own external dependencies.',
    endpoint: 'The request resource is command.executable: a canonical path or catalog:name. The operator selects the permitted binary/catalog and working roots; request args belong to that selected program. Program-specific endpoints must be qualified for that configured instance.',
    secret: 'The adapter rejects payload.environment and launches with an empty environment. It declares no credential projection for a selected program. Files, OS identity, program configuration and any credentials they expose remain the deployment/program owner’s responsibility.',
    dataOwner: 'The selected executable owns its effects under the granted command and working-directory authority. The adapter owns only bounded execution/output and cancellation state.',
    check: 'ready() rechecks canonical executable and directory access, but does not execute a target operation. Run an authorized bounded operation for the selected binary and verify exit/output and intended effects. An ordinary nonzero exitCode or signal close resolves the capability result rather than rejecting it; the caller must interpret and retain nonzero exitCode or signal as command failure, separately from adapter-side rejection. maxExecutionMs, maxOutputBytes and terminationGraceMs bound the process; shell is false.',
  }, [['skills/common/plugins/command-runner/src/adapter.ts', "throw new Error('COMMAND_ENVIRONMENT_DENIED')"], ['skills/common/plugins/command-runner/src/adapter.ts', 'environment: {}'], ['skills/common/plugins/command-runner/src/runner.ts', 'shell: false'], ['skills/common/plugins/command-runner/src/execution.ts', '#close(', '#settle(']]);
  qualify('skills/nova/plugins/lint/src/engine/process.ts', 'subprocess target requires command dependency authority', {
    scope: 'selected-program',
    service: 'The checked policy and tool registry select applicable lint tools. Independently, a requested sourceRevision creates a local shared Git clone and detached checkout of that exact commit; policy does not select that Git prerequisite. Before activation the platform configuration owner must assign actual owners for installed tool versions, PATH, native dependencies and process/environment credential access and rotation; no unspecified operator or process role is an established assignee. A tool can read local files, caches, container sockets or its own remote sources.',
    endpoint: 'allowedRepositoryRoots and allowedPolicyRoots admit the working directory and policyPath. Policy selects applicable tools and arguments; the tool’s declared protocol/configuration owns any endpoint. CONTAINER_HOST, DOCKER_HOST and SSH_AUTH_SOCK are among the explicit subprocess environment allowlist.',
    secret: 'Policy-selected engine tools receive only SUBPROCESS_ENV_KEYS plus permitted overrides, not arbitrary process secrets. The separate sourceRevision Git clone/checkout/rev-parse path calls runProcess without env and therefore inherits the adapter process environment; the deployment owner must assess that entire Git environment, including credential/configuration authority. HOME, tool configuration paths and the allowed SSH socket can expose host-managed credentials. Qualify those authorities for every selected tool; package activation proves no target credentials or access.',
    dataOwner: 'The admitted repository supplies input files. withLintCandidate creates an OS-temporary shared checkout and removes it in finally; the engine also creates mode-0700 kubeclaw-lint-cache directories which are not removed by that candidate cleanup. Selected tools can create their own caches/rendered manifests and temporary files with separate cleanup. The caller retains findings/report evidence; external tool-service ownership remains configuration-dependent.',
    check: 'For a sourceRevision invocation require a working Git executable, a cloneable admitted local repository and the exact requested commit object. Shared clone, detached checkout or HEAD verification failure stops invocation with LINT_CANDIDATE_GIT_FAILED, LINT_CANDIDATE_TIMEOUT or LINT_SOURCE_REVISION_MISMATCH; hexadecimal revision syntax alone proves no object availability. commandExists uses which with a five-second bound and only proves binary availability. Run the policy-selected tool against the admitted input, retain exit/output and parsed findings, and verify the report. A missing selected tool with required=false returns not_applicable; a required missing tool returns an error. runProcess enforces timeout and a combined default ten-MiB output bound. Cancellation targets a detached process group on non-Windows, but child.kill on Windows; Linux acknowledgement checks are Linux-only, not a portable cleanup guarantee.',
  }, [['skills/nova/plugins/lint/src/adapter.ts', "requireInside(payload.policyPath, policyRoots, 'LINT_POLICY_PATH')"], ['skills/nova/plugins/lint/src/engine/execution.ts', 'SUBPROCESS_ENV_KEYS'], ['skills/nova/plugins/lint/src/engine/process.ts', '10 * 1024 * 1024'], ['skills/nova/plugins/lint/src/candidate.ts', 'const git = async', 'return await execute(checkout);']]);
  if (knownSdkCalls('skills/common/plugins/openclaw-agent-events/src/adapter.ts', new Set(['on']))) qualify('skills/common/plugins/openclaw-agent-events/src/adapter.ts', 'external runtime implementation openclaw/plugin-sdk requires dependency authority', {
    scope: 'host-subscription',
    service: 'The OpenClaw host supplies openclaw/plugin-sdk.on(hook, handler). The adapter subscribes only configured SUPPORTED_HOOKS and emits canonical namespaced plugin events through its activation context. This interface does not select a remote OpenClaw endpoint.',
    endpoint: 'The operator installs the adapter inside a compatible OpenClaw host and configures a nonempty, unique hooks allowlist. The host owns event production and plugin subscription permission; Nova owns the granted agent.events.subscribe status interface and canonical journal ingestion.',
    secret: 'The hook subscription interface accepts no credential. The host owns its own model/runtime credentials; these are excluded from the metric-only event projection by sensitive-field filtering.',
    dataOwner: 'The host owns upstream hook events. The adapter retains bounded volatile ingress until context.emit completes; subscription registration provides no upstream acknowledgement or durable replay. The canonical core journal owns committed events.',
    check: 'ready() requires sdk.on and registers every selected hook. Produce an authorized host event, then drain status and verify emitted/failed/rejected counts and the canonical namespaced event. Enforce maxQueueEvents/default 256, maxQueueBytes/default one MiB and drainTimeoutMs/default five seconds; shutdown unsubscribes before draining. Test both capacity rejection and cancellation. Stop until the integration owner establishes the exact OpenClaw SDK version loaded in the Nova process and a deployment topology sharing the real host event source. A configured real host hook must reach a committed canonical Nova event; local/injected registration, ready(), queue/status and a synthetic emitted event alone do not prove real-host activation.',
  }, [['skills/common/plugins/openclaw-agent-events/src/adapter.ts', "require('openclaw/plugin-sdk')"], ['skills/common/plugins/openclaw-agent-events/src/adapter.ts', "throw new Error('OPENCLAW_HOOK_API_UNAVAILABLE')"], ['skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts', 'maxQueueEvents']]);
  if (knownSdkCalls('skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', new Set(['onDiagnosticEvent']))) qualify('skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', 'external runtime implementation openclaw/plugin-sdk/diagnostic-runtime requires dependency authority', {
    scope: 'host-subscription',
    service: 'The OpenClaw host supplies diagnostic-runtime.onDiagnosticEvent(handler). The bridge accepts only object events whose type is model.usage and releases the returned function/unsubscribe/dispose/off subscription during shutdown. Redis publication remains a separate explicit client dependency.',
    endpoint: 'The installed host provides this in-process diagnostic SDK; the bridge has no endpoint selector. api.pluginConfig and the documented observer configuration select the separate Redis transport. Host hook/event permissions and operator.read gateway scope belong to OpenClaw.',
    secret: 'No credential is supplied to the diagnostic subscription. OpenClaw owns model credentials and diagnostic production; observer Redis password/TLS/isolation authority is documented separately and is not proven by SDK availability.',
    dataOwner: 'OpenClaw owns model.usage diagnostics. The observer normalizes model-usage metrics and owns its bounded local queue/status; the configured Redis stream owns retained observability entries.',
    check: 'Require the host diagnostic SDK and onDiagnosticEvent function, produce a real model.usage event and verify its normalized observer metric and Redis record. Non-object and other event types are ignored. Verify subscription release at shutdown; observer selfTest tests its publication path but does not prove that the host emitted a model diagnostic.',
  }, [['skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', "require('openclaw/plugin-sdk/diagnostic-runtime')"], ['skills/common/plugins/openclaw-agent-observer/src/diagnostics.ts', "type !== 'model.usage'"], ['skills/common/plugins/openclaw-agent-observer/src/index.ts', "scope: 'operator.read'"]]);
  for (const [relative, token, dataOwner, guards] of [
    ['skills/nova/plugins/preflight-contract/src/source-stage.ts', "canonicalId:'source-preflight'",
      'The source-preflight artifact persists the full contract and captured subject, including the text content of every selected file. The platform configuration owner must assign the actually selected artifacts.write binding/provider an owner for source-content access, retention, backup/removal and persistence failure response before activation; a source-linked provider candidate is not a deployment selection.',
      [['skills/nova/plugins/preflight-contract/src/source-stage.ts', 'const subject = await captureReviewSubject(', 'artifacts:[stored.artifact as ArtifactRef]'],
       ['skills/common/plugin-runtime/sdk/src/review-subject.ts', 'export async function captureReviewSubject(', 'export async function captureReviewSubject(']]],
    ['skills/nova/plugins/preflight-contract/src/stage.ts', 'async function report(',
      'The validation report persists moduleId, passed status and failure codes/messages/next steps through artifacts.write; it does not persist the complete source-preflight subject. The platform configuration owner must assign the actually selected artifacts.write binding/provider an owner for report access, retention and persistence failure response before activation.',
      [['skills/nova/plugins/preflight-contract/src/stage.ts', 'async function report(', 'export async function execute(']]],
  ]) {
    if (invocation.selectedSources?.get(path.join(repositoryRoot, relative))?.includes(token)) {
      reachedBoundary({ scope: 'artifact-data',
        service: 'The registration persists its report through the actually selected artifacts.write binding.',
        endpoint: 'The artifact.object resource and namespace identify stored report data, not a remote URL; the selected artifacts.write provider supplies its store.',
        secret: 'No local artifact credential selector is declared. The selected artifacts.write binding retains its credential and store-access authority.',
        dataOwner,
        check: 'Verify an authorized bounded report write through the actually selected artifacts.write binding with the expected report namespace/content and assigned data-handling owner. Source-preflight persistence failure returns blocked; validate report-write rejection escapes execute without a reported validation outcome. Retain persistence failure separately from semantic validation results.',
      }, guards, `Selected preflight artifact custody could not be qualified: ${relative}`);
    }
  }
  const prismStage = 'skills/nova/plugins/prism-design/src/stage.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, prismStage))?.includes('const architectureContent=verifiedArchitectureValue')) reachedBoundary({
    scope: 'design-approval-data',
    service: 'When requiresDesign is false the stage returns before configuration or delegated calls. Otherwise it reads verified architecture through artifacts.read, dispatches to Prism and uses separate signal.wait, operator.request and artifacts.write bindings.',
    endpoint: 'issuerId names the exact authorized operator for prism.approval.resolved; timeoutMinutes determines wait expiry at creation. target selects operator publication; agent must be prism. Selected bindings own actual destinations. Schema acceptance alone proves neither approval routing nor live readiness.',
    secret: 'No stage-local credential projection is declared; qualify the actual artifact, runtime, signal and operator binding credentials independently.',
    dataOwner: 'The stage sends the full verified architectureContent in the runtime.dispatch design request. After approval, artifacts.write stores the imported baseline archive, designRequest including architectureContent, and approvedArchitectureDigest in namespace kubeclaw.prism. Assign the selected runtime/artifact providers owners for raw-content access, retention and removal before activation.',
    check: 'Verify architecture identity and exact issuer/expiry-bound wait through authorized bindings. Dispatch precedes wait creation and operator publication; approved dispatch precedes archive verification and artifact write. Later errors return blocked without compensating earlier calls. Preserve and reconcile original dispatch, wait, publication and artifact identities before retry; blocked is not rollback. Configuration and guidance validation before the try block can reject without a blocked result.',
  }, [[prismStage, 'if(!input.requiresDesign)', 'input={...input'], [prismStage, 'const architectureContent=verifiedArchitectureValue', '  }catch(error)']], 'Selected Prism architecture/approval/partial-effect boundary could not be qualified');
  const openclawStage = 'skills/common/plugins/runtime-dispatch/src/openclaw.ts';
  if (invocation.selectedSources?.has(path.join(repositoryRoot, openclawStage))) reachedBoundary({
    scope: 'openclaw-gateway-data',
    service: 'The operational service is the bearer-authenticated OpenClaw gateway at the selected target endpoint, plus an optional authenticated result service. Local tiktoken only counts prompt/output tokens; it is not the gateway.',
    endpoint: 'Activation applies openclaw-config target admission beyond JSON Schema: target IDs and token Secret names use the identifier grammar; maxPollMs and sessionTimeoutMs must be at least pollMs; collectorMode requires subagent; fixed input/output/context caps must fit together. controllerSessionKey must start with agent:<agentId>: and have at most 512 characters. Invalid target admission rejects with RUNTIME_CONFIG_INVALID (unknown fields have RUNTIME_CONFIG_UNKNOWN_FIELD or RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD).',
    secret: 'The gateway uses tokenSecret; the optional result endpoint pairs with resultTokenSecret. Secret resolution and authorized HTTP transport remain selected binding prerequisites. Installation is not credential or endpoint verification.',
    dataOwner: 'The agent is instructed to atomically write its result under cwd. Workspace results are copied into repositoryRoot/resultPathPrefix; collector/history fallback results are persisted there too. The deployment must assign ownership, access, retention, backup/removal and uncertain-result reconciliation for these local durable result files separately from optional remote result storage.',
    check: 'Validate actual target admission and perform an authorized bounded dispatch before declaring gateway readiness. Preserve dispatch/session/result identity on cancellation, timeout or lost response; reconcile local and remote records before retry. Neither a local token count nor a result pathname proves connected gateway success.',
  }, [['skills/common/plugins/runtime-dispatch/src/openclaw-config.ts', 'function targetValid(', 'export function targetsFrom('], [openclawStage, 'function resultLocation(', 'async function pacedSpawn']], 'Selected OpenClaw gateway/configuration/result boundary could not be qualified');
  const reviewStage = 'skills/nova/plugins/review/src/stage.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, reviewStage))?.includes('const policy = resolvedStagePolicy(stageConfig)')) reachedBoundary({
    scope: 'review-policy-settings',
    service: 'The in-pipeline review stage dispatches through its configured runtime agent; profile and policy select review behavior, not a separate remote endpoint.',
    endpoint: 'profile defaults to gate; the schema admits gate, lean or audit. Optional policy overrides are passed to the policy resolver and govern blocking, limits, scope, verification, simplification, ranking, follow-up and governor behavior. Consult the complete recursive configuration reference for each policy field; agent alone does not configure review behavior.',
    secret: 'Review policy does not supply transport credentials. Qualify the actual selected runtime and artifact bindings separately.',
    dataOwner: 'Selected source and review evidence retain the dispatch and artifact custody described for this registration; profile/policy do not establish retention or operational ownership.',
    check: 'Validate the profile/policy and selected provider contracts before review. Configuration and invalid-input failures are separate from proposal, verification, report-persistence and governor outcomes; a source-linked provider candidate is not a configured production binding.',
  }, [[reviewStage, 'function config(', 'function reviewWait('], [reviewStage, 'function resolvedStagePolicy(', 'function resolvedStagePolicy('], [reviewStage, 'const policy = resolvedStagePolicy(stageConfig)', "if ('outcome' in policy)"]], 'Selected review profile/policy settings could not be qualified');
  const auditStage = 'skills/nova/plugins/review/src/repository-audit-stage.ts';
  if (registration.id === 'repository-audit' && invocation.selectedSources?.get(path.join(repositoryRoot, auditStage))?.includes('settingsFile: config.policy')) reachedBoundary({
    scope: 'audit-policy-settings',
    service: 'Repository audit resolves its own configured review policy before plan/dispatch; this policy path is not invoked by repository revalidation merely because it imports the compilation helper.',
    endpoint: 'Optional config.policy is a complete review-policy.v2 object, not a partial patch: the recursive schema/parser requires profile, blocking, limits, scope, verification, simplification, ranking, followUp and governor and rejects unknown fields or invalid values. Omission selects the built-in config.profile policy (profile defaults to audit); a present validated settings_file policy replaces that built-in selection rather than field-merging it. The complete recursive configuration reference defines each nested constraint.',
    secret: 'Policy selection supplies no transport credential. The platform configuration owner must qualify actual runtime/artifact bindings and permitted source disclosure independently.',
    dataOwner: 'The resolved policy and its digest govern review limits and handling, not operational retention or access ownership of selected service/storage providers.',
    check: 'Validate both the built-in profile and any complete settings_file policy before dispatch. resolveReviewPolicy rejects malformed policy with an ordinary Error; executeRepositoryAudit rethrows errors outside its named integrity classes, so invalid policy does not guarantee a blocked StageResult. Keep policy rejection separate from completed plan/report and infrastructure/dispatch failures.',
  }, [[auditStage, 'const parsed = parseInput(input), config = stageConfig(context)', 'const { revision, snapshot'], ['skills/nova/plugins/review/src/review-policy-resolver.ts', 'export function resolveReviewPolicy(', 'const selected = candidates.at(-1)']], 'Selected audit policy replacement/error boundary could not be qualified');
  const architectureStage = 'skills/nova/plugins/architecture-validator/src/stage.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, architectureStage))?.includes('async function reviewedInput(')) {
    reachedBoundary({
      scope: 'source-review-data',
      service: 'The stage dispatches to config.agent and persists an architecture-validation report. Git/source operations are conditional, not guaranteed by declared capability grants.',
      endpoint: 'Only task is required by the public input schema. sourceBinding resolves source-preflight evidence; otherwise input.source captures a review subject. Without either source input there is no subject verification or checkedFiles path-coverage check. A present subject is verified before and after runtime.dispatch and every subject path must occur in checkedFiles.',
      secret: 'No local credential selector is declared. The actual selected runtime.dispatch, Git and artifact bindings retain their credential and authorization requirements; a provider candidate is not a configured binding.',
      dataOwner: 'The runtime-agent request includes architecture and any reviewSubject, including selected source-file text. The architecture-validation artifact stores output and any subject. The platform configuration owner must assign the actual runtime.dispatch and artifacts.read/write providers owners for raw content access, retention, backup/removal and failure response before activation.',
      check: 'Verify both a task-only invocation and a source-bound invocation through authorized selected providers. Do not interpret a passed task-only report as repository verification. Invalid dispatch output or subject checks return blocked; report-write rejection escapes without a semantic result.',
    }, [[architectureStage, 'async function reviewedInput(', 'export async function execute('],
      [architectureStage, 'if (subject) await verifyReviewSubject', 'const artifacts ='],
      ['skills/nova/plugins/architecture-validator/src/protocol.ts', 'export function buildArchitectureRequest(', 'outputContract:'],
      ['skills/nova/plugins/architecture-validator/schemas/input.schema.json', '"required"', '"properties"']], 'Selected architecture optional-source/raw-data boundary could not be qualified');
  }
  const implementationStage = 'skills/nova/plugins/implementation-agent/src/stage.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, implementationStage))?.includes('const evidence = await repairEvidence(context);')) {
    reachedBoundary({
      scope: 'repair-workspace-data',
      service: 'Implementation dispatches to config.agent; Core-issued guidance.repairRequest conditionally reads JSON artifacts through artifacts.read. Optional workspaces use separate selected Git capabilities.',
      endpoint: 'The repair request selects at most 32 same-run/requester-stage JSON artifact references with checked identity, size, digest and no duplicates. Request plus declared evidence bytes and final serialized request/evidence are bounded to 256 KiB. No repairRequest means no repair-evidence reads. The serialized raw evidence joins helperPrompt in the configured runtime-agent task.',
      secret: 'Artifact references are not credentials. The platform configuration owner must establish actual artifacts.read/write, runtime.dispatch and conditional Git bindings with their credential and access authority before these operations execute.',
      dataOwner: 'Assign the actual artifact and runtime providers owners for raw request/evidence access, retention, backup/removal and failure handling. Created but unintegrated workspaces and branches are retained for reconciliation; references are included in blocked error details or stored completion artifacts. Only integrated workspaces enter removal. Integrated cleanup failure is persisted separately and does not establish rollback; no-workspace execution supplies no workspace-cleanup guarantee.',
      check: 'Verify bounded authorized repair-evidence reading and prompt disclosure with approved nonsecret fixtures, plus invalid/duplicate/oversized evidence rejection before dispatch. Exercise unintegrated retention, integrated removal and cleanup failure separately; retain workspace references for reconciliation instead of assuming deletion or rollback. Completion/cleanup artifact persistence has its own failure path.',
    }, [[implementationStage, 'const evidence = await repairEvidence(context);', 'return storeCompletion('],
      [implementationStage, 'async function dispatchImplementation(', 'async function integrateWorkspace('],
      [implementationStage, 'function blockedFailure(', 'export async function execute('],
      [implementationStage, 'async function storeCompletion(', "reason: { code: 'implementation.blocked'"],
      ['skills/nova/plugins/implementation-agent/src/repair-evidence.ts', 'const MAXIMUM_ARTIFACTS = 32;', 'return serialized;'],
      ['skills/nova/plugins/implementation-agent/src/protocol.ts', 'export function buildRequest(', 'outputContract:']], 'Selected implementation repair-evidence/workspace custody could not be qualified');
  }
  for (const [relative, selector, token] of [
    ['skills/common/plugins/state-store/src/adapter.ts', 'root', 'const store = new FileDurableRecordStore(configured,'],
    ['skills/common/plugins/telemetry-store/src/adapter.ts', 'root', 'const store = new FileDurableRecordStore(root,'],
    ['skills/common/plugins/wait-store/src/adapter.ts', 'root', 'const store = new FileDurableRecordStore(root,'],
    ['skills/common/plugins/transport-publisher/src/adapter.ts', 'deliveryRoot', 'const records = new FileDurableRecordStore(config.deliveryRoot,'],
  ]) {
    if (!invocation.selectedSources?.get(path.join(repositoryRoot, relative))?.includes(token)) continue;
    reachedBoundary({
      scope: 'local-store',
      service: 'The selected adapter directly uses a local FileDurableRecordStore; its per-operation lock is separate from any remote service authority.',
      endpoint: `config.${selector} selects the local durable-store directory. The deployment process identity controls filesystem access; the store is not a remote endpoint.`,
      secret: 'The local store resolves no credential service. Protect persisted request/state/wait/telemetry content according to the actual adapter and its callers; OS access is not a redaction guarantee.',
      dataOwner: `Before activation the platform/deployment configuration owner must assign actual responsibility for config.${selector} access, retention, backup/removal and durable-store failure response. The adapter/store owns local persistence, not these operational policies. Shutdown does not erase records or establish a retention/backup policy. Preserve original records for failure and uncertain-effect reconciliation.`,
      check: 'Verify the configured local root and assigned lifecycle/failure-response owner, an authorized bounded write/read, quotas, lock contention and recovery before activation. Stop if ownership or durable access is not established. A successful local read or lock proves neither an external recipient nor remote effect completion.',
    }, [[relative, token, 'async ready()'], [relative, 'async shutdown()', 'async shutdown()']], `Selected local-store lifecycle authority could not be qualified: ${relative}`);
  }
  const transportPublisher = 'skills/common/plugins/transport-publisher/src/adapter.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, transportPublisher))?.includes('const existingTerminal = prior.find(')) {
    reachedBoundary({
      scope: 'publication-effects',
      service: 'The selected transport publisher resolves signingSecret via secrets.read and sends an HMAC-signed POST through the actually selected network.http binding.',
      endpoint: 'targets maps a transport.target ID to its endpoint and signingSecret. The adapter accepts HTTP or HTTPS, but rejects URL userinfo and fragments at activation even when the schema accepts the URI. It does not impose HTTPS-only transport. Establish the actual receiver and credential authority before sending; candidate providers do not select a deployment.',
      secret: 'The signingSecret value is used for HMAC-SHA256 over target, idempotency key and serialized body. Keep the raw publication body and persisted request/reservation/receipt/failure records confidential according to their contents.',
      dataOwner: 'deliveryRoot persists original publication message bodies and terminal delivery state. The deployment owns access, retention, backup/removal and failure response; the receiver owns accepted external effects. Existing in-progress reservations can fall through to another POST, and distinct later attempts can POST again after uncertain failure. Per-record locking and an idempotency-key header do not guarantee exclusive publication or receiver deduplication.',
      check: 'Before authorizing publication establish receiver-enforced idempotency and an authorized reconciliation path. A cached completed receipt can be reused, but a reservation, failure, cancellation or lost response is not proof of no external effect. Concurrent or retried invocations can duplicate delivery; reconcile the original key/receipt with the receiver rather than blindly invoke again. This is an operational prerequisite, not an implemented universal receipt lookup or rollback.',
    }, [[transportPublisher, 'const existingTerminal = prior.find(', 'try {'],
      [transportPublisher, "const resolved = await context.invoke('secrets.read'", 'const receipt = validateResponse(response);'],
      [transportPublisher, 'async shutdown()', 'async shutdown()']], 'Selected publisher duplicate/uncertain-effect boundary could not be qualified');
  }
  const remotePlan = 'skills/nova/plugins/remote-test-gate/src/adapter.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, remotePlan))?.includes('const gate = createProductionNovaTestGate(')) {
    reachedBoundary({
      scope: 'remote-plan-control',
      service: 'The plan adapter resolves configured secrets and composes the production remote plan dispatcher/importer only during authorized invocation; ready() checks stopping state, not endpoint reachability.',
      endpoint: 'The effective production endpoint permits HTTPS, or HTTP only on loopback, and denies URL userinfo. SPIFFE proxy mode additionally admits only localhost, 127.0.0.1 or [::1], checked at activation. Bearer mode activation parses HTTP/HTTPS without the stronger production URL checks; invocation resolves token and source-attestation private key before createProductionNovaTestGate rejects userinfo/non-loopback plaintext. Schema acceptance and ready() therefore do not prove the effective endpoint is usable.',
      secret: 'Bearer mode resolves tokenSecret; all modes resolve sourcePrivateKeySecret. The actual secrets.read provider owns value projection and rotation. Endpoint rejection can occur after those reads and before any remote request.',
      dataOwner: 'The platform configuration owner must assign actual remote endpoint/credential/check authority and local stateRoot access, retention, backup/removal and failure response. Plan dispatch/import state and uncertain remote job effects remain separate from provider installation.',
      check: 'Before activation qualify HTTPS-or-loopback-HTTP without userinfo and the exact SPIFFE loopback restriction when selected. Execute a bounded authorized plan only after credential/source authority is established; inspect actual terminal import evidence. Preserve original job identity on timeout/cancellation or uncertain remote effects, not blind retries.',
    }, [[remotePlan, 'function parseConfig(', 'async function execute('],
      [remotePlan, 'const token = config.tokenSecret', 'const result = await gate.execute('],
      ['skills/nova/core/test-gates/production.ts', 'export function createProductionNovaTestGate(', 'const transport = new HttpRemotePlanTransport('],
      ['skills/nova/core/test-gates/secure-endpoint.ts', 'export function isSpiffeProxyLoopback(', 'return endpoint;']], 'Selected remote-plan endpoint timing could not be qualified');
  }
  const remoteEvidence = 'skills/nova/plugins/remote-test-gate/src/evidence-adapter.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, remoteEvidence))?.includes('const verified=await store.readVerifiedResult(')) {
    reachedBoundary({
      scope: 'local-import-data',
      service: 'The evidence adapter reads verified manifest/decision JSON through artifacts.read and a previously completed local import. It does not contact Buster, dispatch a remote plan or import remote results itself.',
      endpoint: 'stateRoot/imports selects the local FileNovaGateImportStore. manifestStageId and gateStageId bind expected artifact producers and completed gate evidence; the actual artifacts.read provider selects its own store.',
      secret: 'No direct remote credential is resolved by this evidence projection. The selected artifacts.read provider retains its own credential/access contract.',
      dataOwner: 'The platform configuration owner must assign stateRoot/imports access, retention, backup/removal and failure-response authority, and ownership for raw manifest/decision JSON through the selected artifacts.read provider. The separate plan path must already have completed verified import for the requested identities.',
      check: 'Verify authorized integrity-checked artifact reads and readVerifiedResult of a previously completed local import with exact run/stage/source/decision/result identities. ready() checks stopping only; evidence projection is not proof of remote reachability or a fresh remote Buster execution. Missing/corrupt/incomplete import or cancellation stops projection.',
    }, [[remoteEvidence, 'async function readArtifact(', 'async function read('],
      [remoteEvidence, 'const verified=await store.readVerifiedResult(', 'export function activate('],
      [remoteEvidence, 'const store=new FileNovaGateImportStore(', 'return project(context,invocation,store);']], 'Selected evidence local-import custody could not be qualified');
  }
  const approvalStage = 'skills/nova/plugins/human-approval/src/stage.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, approvalStage))?.includes("authorizedIssuer: { type: 'operator', id: config.issuerId }")) {
    reachedBoundary({
      scope: 'approval-control',
      service: 'When approval is pending the stage creates a signal.wait then publishes through operator.request; already resolved guidance is interpreted without a new request.',
      endpoint: 'config.target is the operator recipient, while config.issuerId is the sole authorized signal.wait operator issuer and the issuer accepted by guidance parsing. The recipient and authorization identity are separate configured controls, not provider-selected defaults. timeoutMinutes controls the wait expiry: the local parser defaults it to 60 minutes and admits only integer values from 1 through 525600, independently of the selected wait provider.',
      secret: 'issuerId identifies an authorized decision issuer; it is not a credential value. The platform configuration owner must qualify the trusted operator identity and the selected signal/operator bindings independently of their credential projections.',
      dataOwner: 'The stage sends summary, approval/wait identity, authorized issuer and expiry to the selected wait/operator bindings. The platform configuration owner must assign actual destination handling and verify that only the configured issuer can provide the accepted decision.',
      check: 'For a path that reaches approval, verify target delivery and the exact issuerId authorization contract, rejecting guidance from other issuers. Architecture approval with a passed report and no findings bypasses executeApproval, operator.request and signal.wait and needs no reason or approval-recipient/issuer reachability exercise on that clean path; only the findings path requests approval and approved guidance then needs a nonempty reason. These conditions do not remove manifest capability declarations.',
    }, [[approvalStage, 'const guidance = parseApprovalGuidance(', 'return pendingApprovalResult(wait);'],
      ['skills/nova/plugins/human-approval/src/approval.ts', 'export function parseApprovalGuidance(', 'export function parseApprovalGuidance('],
      ['skills/nova/plugins/human-approval/src/architecture-approval.ts', 'const findings = findingSummary(', 'if (result.outcome'] ], 'Selected approval issuer/conditional boundary could not be qualified');
  }
  const architectureApproval = 'skills/nova/plugins/human-approval/src/architecture-approval.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, architectureApproval))?.includes('const { input, artifact, report } = await approvalReport(')) {
    reachedBoundary({
      scope: 'approval-artifact-data',
      service: 'Architecture approval verifies report JSON via artifacts.read and, only after its result passes, persists the approval decision through artifacts.write. git.repository.read subject verification occurs only if report.subject is present.',
      endpoint: 'The report is selected by artifact ID/namespace and current run/producer attempt; its reference must be JSON with size from 1 through 262144 bytes. A missing subject is permitted, does not invoke verifyReviewSubject and can yield a passed clean result with subject null.',
      secret: 'The actually selected artifact read/write providers retain their credential and store-access authority. The optional subject and guidance can contain source content or sensitive decision data; capability names establish no safe handling policy.',
      dataOwner: 'The stage reads and integrity-checks raw architecture-report JSON up to 256 KiB. When findings require a pending approval, findingSummary projects severity, finding ID, explanation and remediation into the approval summary, alongside input summary and evidence digest, and sends this report-derived data to both signal.wait and operator.request. The platform configuration owner must qualify recipient access/retention for this bounded summary; this is not a redaction guarantee. Only after a passed result, its written approval artifact contains decision, optional review subject (which may include selected source-file contents), guidance, report digest/stage identity and clean flag. The platform configuration owner must assign actual artifacts.read/write provider owners for access, retention, backup/removal and persistence failure response before those paths execute.',
      check: 'Verify report identity, current-run producer selection, JSON size/digest and passed verdict through the selected read binding. Verify source identity only when a subject is supplied, and bounded decision-artifact persistence only after a passed result. A pending/rejected/blocked approval result does not write this passed decision artifact; a persistence rejection is not a successful approval record.',
    }, [[architectureApproval, 'async function approvalReport(', 'export async function execute('],
      [architectureApproval, 'const subject = report.subject === undefined', 'return { ...result, artifacts:'],
      [architectureApproval, 'function findingSummary(', 'async function approvalReport('] ], 'Selected architecture approval artifact custody could not be qualified');
  }
  const networkAdapter = 'skills/common/plugins/network-http/src/adapter.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, networkAdapter))?.includes('const config = parseConfig(context.config);')) {
    reachedBoundary({
      scope: 'network-policy',
      service: 'The selected network.http provider performs bounded fetch requests under its configured origin/method/header policy.',
      endpoint: 'allowedOrigins is normalized with new URL(value).origin; configured path/query text is not an additional route restriction. allowedMethods is uppercased and defaults to GET; allowedHeaders is lowercased and defaults to accept, content-type and idempotency-key. maxRequestBytes and maxResponseBytes each default to 1048576 bytes; timeoutMs defaults to 30000 milliseconds.',
      secret: 'Request URL user credentials are denied. Only configured admitted header names may be supplied; header values remain caller data and must not be logged as proof. Origin admission does not establish deployed authentication.',
      dataOwner: 'The admitted remote target owns its service effects; the provider returns bounded response data and exposes at most a bounded response-body error excerpt. The platform configuration owner must assign actual destination data handling and keep secrets out of retained error evidence.',
      check: 'Verify actual origin, method and header admission plus request/observed-response byte budgets and caller cancellation/timeout. Redirect responses are rejected, not followed; userinfo is rejected and decompressed response bytes are bounded while streaming. ready() is empty. Failure, timeout or abort does not undo a remote mutation already committed.',
    }, [[networkAdapter, 'function parseConfig(', 'function requestHeaders('],
      [networkAdapter, "signal: requestSignal, redirect: 'manual'", 'function decodedBody('],
      [networkAdapter, 'const url = new URL(request.resource.canonicalId);', 'return {'] ], 'Selected network.http request policy could not be qualified');
  }
  const redisTransport = 'skills/common/plugins/redis-transport/src/adapter.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, redisTransport))?.includes('const { stream, dedup } = streamIdentity(')) {
    reachedBoundary({
      scope: 'remote-store',
      service: 'The selected Redis adapter persists the JSON request payload in its configured Redis stream and records the idempotency key in a TTL-bound deduplication key.',
      endpoint: 'context.config.url is the Redis endpoint, with redis or rediss scheme; no typed endpoint override exists. streamPrefix, registration kind and resource canonical ID select the stream; the idempotency key selects its separate deduplication key.',
      secret: 'passwordSecret selects the secrets.read value used for Redis authentication. URL credentials are rejected. The deployment owns secret projection/rotation and the Redis network/TLS/access policy; configuration and ready() do not prove access.',
      dataOwner: 'The configured Redis service owns stream entries containing the serialized request payload and idempotency key, plus the deduplication key/entry ID. The platform configuration owner must assign access, retention, backup/removal and failure-response ownership for this store. maxLen requests approximate stream trimming, not an exact retention guarantee; dedupTtlMs expires deduplication independently. Shutdown does not erase either kind of record.',
      check: 'Verify configured Redis URL, streamPrefix, maxLen, dedupTtlMs, timeoutMs and selected passwordSecret with an authorized bounded publish/append. ready() only checks shutdown state. A timeout, abort or lost response can follow a committed EVAL; reconcile the same stream/idempotency identity before retry. Deduplication is TTL-bound and cannot establish permanent exactly-once delivery.',
    }, [[redisTransport, 'export const REDIS_PUBLISH_LUA =', 'function config('],
      [redisTransport, 'const { stream, dedup } = streamIdentity(', 'return Object.freeze({ accepted: true'],
      ['skills/common/plugins/redis-transport/src/stream-identity.ts', 'export function streamIdentity(', 'export function streamIdentity(']], 'Selected Redis stream/dedup custody could not be qualified');
  }
  const agentObserver = 'skills/common/plugins/agent-observability/src/observers.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, agentObserver))?.includes('payload: projectAgentEvent(delivery)')
    || invocation.selectedSources?.get(path.join(repositoryRoot, agentObserver))?.includes('value: projectAgentEvent(delivery)')) {
    reachedBoundary({
      scope: 'observer-data',
      service: 'The ingester delegates telemetry.emit/append; the evidence observer delegates artifacts.write/put_json in namespace kubeclaw.agent-observability-evidence. Only the selected observer export exercises its respective binding.',
      endpoint: 'The event type selects telemetry.event for ingest; agent-evidence:<eventId> selects artifact.object for evidence. These are logical resource IDs, not network URLs; the actually selected binding supplies the destination.',
      secret: 'No observer-local credential selector is declared. The selected provider owns credential/store access. Only payload values under sensitive-looking keys are structurally redacted; identity is forwarded unchanged and arbitrary secret-bearing strings are not comprehensively detected.',
      dataOwner: 'The outgoing projection contains schema version, delivery/event IDs, event type/sequence, identity, timestamp and redacted event payload. The platform configuration owner must assign destination access, retention and failure-response ownership to the actually selected telemetry.emit provider for ingest or artifacts.write provider for evidence before activation. The caller projection does not establish deployed data-handling policy.',
      check: 'Through the actual selected observer binding, verify a bounded projected event without exposing secrets and qualify its destination data handling. Per-run at-least-once best-effort retry can duplicate telemetry or artifact writes and can exhaust without delivery; it does not grant lifecycle decision authority.',
    }, [[agentObserver, 'export function projectAgentEvent(', 'export async function ingest('],
      [agentObserver, 'export async function ingest(', 'value: projectAgentEvent(delivery)']], 'Selected agent-observability data boundary could not be qualified');
  }
  const telemetryObserver = 'skills/common/plugins/telemetry-observer/src/observer.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, telemetryObserver))?.includes('payload: telemetryEnvelope(delivery)')) {
    reachedBoundary({
      scope: 'observer-data',
      service: 'The observer exports lifecycle envelopes through the actually selected telemetry.emit binding.',
      endpoint: 'The event type is the telemetry.event resource ID, not a network endpoint; the selected provider supplies its actual destination.',
      secret: 'The observer declares no local credential selector. The selected telemetry.emit provider owns its credential contract. Structured redaction applies to sensitive-looking keys in identity/payload, not every secret-bearing string.',
      dataOwner: 'The outgoing telemetry envelope contains delivery ID, observer provenance, event ID, sequence, type, identity, timestamp, causation ID and payload. The platform configuration owner must assign access, retention and failure-response ownership for that data to the actually selected telemetry.emit provider before activation; neither a declared capability nor key-based redaction establishes safe handling.',
      check: 'Verify a bounded envelope through the selected telemetry.emit binding and inspect retained/redacted fields without exposing secrets. The manifest specifies per-run at-least-once delivery with best-effort retry; duplicates and exhausted undelivered entries remain possible and do not turn the observer into a lifecycle decision authority.',
    }, [[telemetryObserver, 'export function telemetryEnvelope(', 'export async function observe('],
      [telemetryObserver, "await context.invoke('telemetry.emit'", 'payload: telemetryEnvelope(delivery)']], 'Selected telemetry observer data boundary could not be qualified');
  }
  const notificationObserver = 'skills/common/plugins/notification-observer/src/observer.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, notificationObserver))?.includes('async function publish(')) {
    reachedBoundary({
      scope: 'observer-data',
      service: 'The observer publishes its projected notification through the actually selected operator.request binding to the configured target.',
      endpoint: 'context.contract.config.target is the operator.target resource ID. Missing or empty target fails when delivery reaches publish; provider installation alone does not validate this recipient.',
      secret: 'The selected operator.request provider owns credentials and destination access. Lifecycle summary/message strings are bounded and control-character filtered, not secret-redacted; the unused sanitize helper does not protect these outgoing fields.',
      dataOwner: 'Lifecycle notifications export run/stage/event identity, labels, summary/message, severity and reason code; preview delivery forwards the top-level artifactId unchanged from event identity, plus bounded nested artifact identity/digest/media type/logical name, not artifact contents. The platform configuration owner must assign destination access, retention and failure-response ownership for the actually selected operator.request binding and recipient, and keep secrets out of summaries and labels.',
      check: 'Verify the configured target with an authorized bounded publish and inspect the projected fields without secrets. Suppressed lifecycle event types skip publish; preview delivery uses its separate projection. Per-run at-least-once best-effort retry can duplicate publishes or exhaust without delivery; a provider error is not proof that no remote publish occurred.',
    }, [[notificationObserver, 'function target(', 'function bounded('],
      [notificationObserver, 'export function lifecycleNotification(', 'async function publish('],
      [notificationObserver, 'async function publish(', 'export async function deliverPreview(']], 'Selected notification observer data boundary could not be qualified');
  }
  const evidenceReader = 'skills/nova/plugins/pipeline-review/src/evidence-adapter.ts';
  if (invocation.selectedSources?.get(path.join(repositoryRoot, evidenceReader))?.includes('const projection = readRunEvidence(selection, options);')) {
    reachedBoundary({
      scope: 'local-store',
      service: 'The selected evidence adapter directly reads the local storageRoot run store and delegates selected JSON artifact reads through artifacts.read.',
      endpoint: 'storageRoot is the local run-store authority, separate from the selected artifacts.read binding. orchestratorIssuerId is the configured control identity used when recovering stage states.',
      secret: 'No additional credential selector is used for direct run-store reads; the deployment process identity controls filesystem access. The delegated artifacts.read provider retains its own credential authority.',
      dataOwner: 'The platform configuration owner owns storageRoot selection, run-store access, retention and failure response, and the configured orchestratorIssuerId used for lifecycle recovery. The owner of the actually selected artifacts.read binding/provider owns persisted JSON artifacts; the reader returns a bounded evidence bundle and does not transfer store ownership.',
      check: 'Before activation the platform configuration owner must verify storageRoot access to the intended run, the correct orchestratorIssuerId, and positive maximumJournalBytes, maximumArtifactBytes and maximumBundleBytes. Through the selected binding, verify artifact integrity and a bounded snapshot with an unchanged second run-store read. ready() is empty and proves neither run-store access nor issuer correctness. Missing/corrupt/mutating run data, mismatched selected artifacts and each byte budget independently fail the read; do not treat a partial result as authoritative.',
    }, [[evidenceReader, 'const storageRoot = context.config.storageRoot;', 'let stopped = false;'],
      [evidenceReader, 'const options = { storageRoot:', 'return { bundle };'],
      ['skills/nova/core/state/read-run-evidence.ts', 'recoverStageStates(', 'recoverStageStates(']], 'Selected evidence-reader local-store/control dependency could not be qualified');
  }
  // Local durable custody belongs to the actually selected adapter, not to a
  // capability name or an inferred deployed provider.
  for (const [relative, record, guards] of [
    ['skills/nova/plugins/demo-handoff/src/adapter.ts', {
      scope: 'local-store',
      service: 'The selected handoff adapter uses a local FileDurableRecordStore plus its configured HTTPS controller and delegated operator/artifact capabilities.',
      endpoint: 'stateRoot is the normalized absolute durable-record directory. The controller endpoint must be canonical HTTPS with exactly /v1/demo-ready; tokenPath and caPath are normalized absolute paths to bounded regular credential and CA files.',
      secret: 'The controller client reads tokenPath for its Authorization token and caPath for TLS verification. These files are local credential authority, not secrets.read names; the deployment owns their access and rotation.',
      dataOwner: 'The adapter persists the controller request body under demo-ready/intents before POST, then validated responses under demo-ready/receipts in stateRoot. These contain handoff/delivery metadata. The deployment owns directory access, retention and backup/removal; shutdown aborts work but does not erase records. Retain the original intent and receipt for uncertain-result recovery.',
      check: 'Verify stateRoot writable durable storage and required token/CA regular-file bounds before the authorized handoff. ready() only checks shutdown state. Reuse the persisted intent: after an uncertain initial POST or a prior intent, query controller /status and validate the response rather than assume a new commit. Lock acquisition alone proves no controller reachability.',
    }, [['skills/nova/plugins/demo-handoff/src/adapter.ts', 'const records=new FileDurableRecordStore(config.stateRoot', 'const execute=async'],
      ['skills/nova/plugins/demo-handoff/src/adapter.ts', "stream='demo-ready/intents'", "await records.append('demo-ready/receipts'"],
      ['skills/nova/plugins/demo-handoff/src/controller-client.ts', 'async function boundedFile(', 'export async function post(']]],
    ['skills/common/plugins/operator-messaging/src/adapter.ts', {
      scope: 'local-store',
      service: 'The selected operator adapter owns a local FileDurableRecordStore and delegates selected target publication through network.http.',
      endpoint: 'deliveryRoot is the local durable-record directory. receiptEndpoint is queried only for format json; discord_webhook does not query that URL and uses its local Discord receipt path. Any supplied receiptEndpoint is still validated at activation in both formats as HTTP(S), without user credentials or fragment, and with the same target origin.',
      secret: 'tokenSecret resolves the HMAC-SHA256 signing secret for x-kubeclaw-signature, not a bearer token. endpointSecret resolves a confidential endpoint URL checked against endpointOrigin; in that mode the same resolved URL value is the HMAC key for request signatures and JSON receipt lookups, and tokenSecret is not selected. The selected secrets.read provider owns projection and rotation.',
      dataOwner: 'deliveryRoot persists reservations, original request payloads, transport bodies, receipts and failures before or during publication. Demo callers can include projected usernames/passwords in those bodies. The deployment must restrict directory access and define retention, backup and removal; shutdown does not erase this sensitive durable data.',
      check: 'Verify deliveryRoot access, configured record/byte quotas, actual target format and credential projection. For json, reconcile receiptEndpoint when configured before resending an uncertain delivery; for discord_webhook use the local validated Discord receipt. A durable reservation or ready() does not prove remote delivery; retain the original payload and receipt identity.',
    }, [['skills/common/plugins/operator-messaging/src/adapter.ts', 'new FileDurableRecordStore(config.deliveryRoot', 'let shuttingDown = false;'],
      ['skills/common/plugins/operator-messaging/src/adapter.ts', "target.format === 'json' && target.receiptEndpoint", "const signature = crypto.createHmac('sha256'"],
      ['skills/common/plugins/operator-messaging/src/delivery-records.ts', 'export async function reserveDelivery(', 'export async function completeDelivery('],
      ['skills/common/plugins/operator-messaging/src/config.ts', 'function receiptConfig(', 'function parseTarget('],
      ['skills/common/plugins/operator-messaging/src/config.ts', 'if (usesSecretEndpoint) {', 'const endpoint = parseUrl(raw.endpoint,'],
      ['skills/common/plugins/operator-messaging/src/receiver.ts', 'export async function receiverReceipt(', '// Receipt reads are fresh']]],
  ]) {
    const selected = invocation.selectedSources?.get(path.join(repositoryRoot, relative));
    if (selected?.includes('new FileDurableRecordStore(')) reachedBoundary(record, guards, `Selected durable adapter custody could not be qualified: ${relative}`);
  }
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
      service: `Local in-process library ${name}; the reached interface uses ${text}. The workspace installation lock records version ${installed.version}, not a runtime lockfile read. The platform configuration owner controls installation roots, trust and package selection and must arrange the locked dependency; this source declaration is not an installation receipt or a remote capability binding.`,
      endpoint: 'This library interface receives in-memory text, not a service endpoint. Remote calls elsewhere in the registration remain separate dependencies.',
      secret: 'The reached parsing/token-counting interface supplies no credential or Secret reference. Treat the parsed input as caller-owned data and enforce its enclosing limits.',
      dataOwner: `The caller owns input text and derived ${name === 'yaml' ? 'parsed documents' : 'token counts'}. The local library supplies computation; the enclosing runtime retains result and dispatch authority.`,
      check: `Before activation qualify the actual library installation separately from invocation. Exercise the enclosing registration through its documented supported operation with controlled authorized inputs and verify its outcome and negative input limits. The parser/tokenizer is internal computation, not a standalone operation exposed by the selected binding. A lockfile declaration or local computation does not prove a separately configured service or tool is reachable.`,
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
