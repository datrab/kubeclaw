import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Qualify only the interfaces that an invocation actually reaches. These rules
// explain executable/library ownership; configuration field semantics remain
// with the shared configuration inventory. Every rule has source guards.
export function invocationDependencyBoundaries(invocation, repositoryRoot, registration = {}) {
  const records = [];
  const remaining = new Set(invocation.diagnostics);
  const evidence = (relative, token) => {
    const file = path.join(repositoryRoot, relative);
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8');
    const position = text.indexOf(token);
    if (position < 0) return;
    return { file, line: text.slice(0, position).split('\n').length, text };
  };
  function qualify(relative, suffix, record, guards) {
    const reached = path.join(repositoryRoot, relative);
    const diagnostics = [...remaining].filter((item) => item.startsWith(`${reached}:`) && item.endsWith(suffix));
    if (!diagnostics.length) return;
    const sources = guards.map(([file, token]) => evidence(file, token));
    if (sources.some((item) => !item)) return;
    for (const diagnostic of diagnostics) remaining.delete(diagnostic);
    records.push({ ...record, evidence: sources.map(({ file, line }) => ({ file, line })) });
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
    }, [...guards, ['package-lock.json', `"node_modules/${name}"`]]);
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
        evidence: sources.map(({ file, line }) => ({ file, line })),
      });
    }
  }
  return { records, diagnostics: [...remaining].sort() };
}
