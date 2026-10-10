# Test And Manage An Extension

Status: implemented with stated local limits
Audience: extension author, operator, maintainer
Owner: plugin-foundation
Evidence: scripts/verify-plugin-packages.mjs; skills/common/plugin-runtime/foundation/registry; packaging/runtime/roles
Evidence revision: `f68a7294abf0928c1aabf290c6a7e486c651a808`
Applies to: pipeline-plugin-v2, OpenClaw extensions, Codex plugins, Worker engines, runtime roles
Last verified: source and focused local checks on 2026-10-10; no live host result

## Objective

Prove that an extension works at its real boundary.
Then change, disable, or remove it without losing necessary state or recovery data.

A unit test proves only one layer. A complete result connects package bytes, trust,
selection, activation, behavior, failure, and cleanup.

## Terms Used In This Guide

| Term | Meaning here |
| --- | --- |
| Discovery | Read inert metadata and build an index without loading package code |
| Activation | Load one selected executable export after trust and policy checks |
| Package check | Validate one package's manifest, modules, schemas, and tests |
| Platform check | Validate the shared contract and security boundary |
| Live check | Use the actual host, service, network, storage, or cluster |
| Remaining state | Data that an extension does not own or cannot remove safely |

## Use A Proof Ladder

Run the smallest useful check first. Continue until the test reaches the changed
boundary.

| Level | Question | Typical proof | What it does not prove |
| --- | --- | --- | --- |
| 1. Static | Are files and declarations valid? | JSON Schema, type check, import-safety check | The host can activate the package |
| 2. Package | Does owned behavior work? | Package test command | Shared policy or role inclusion |
| 3. Platform | Does the public boundary accept it? | Registry, activation, sandbox, or role check | External dependency health |
| 4. Integration | Do connected components agree? | Real adapter, provider, or engine exercise | Production topology and credentials |
| 5. Live | Does the deployed path work and recover? | Host or cluster acceptance | Behavior outside the tested configuration |

KubeClaw keeps these levels separate because a green inner test cannot prove an
outer boundary.

**Benefit:** A failure report identifies the first boundary that did not work.

**Cost:** Important changes need more than one command and one evidence record.

**Rejected alternative:** One repository-wide command hides skipped tools, missing
hosts, and unavailable live dependencies behind an aggregate result.

**Reconsider when:** A test runner can preserve each level, environment, skip reason,
and result in one machine-readable record.

> **Discovery boundary:** [The registry builder validates package declarations and creates separate indexes](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugin-runtime/foundation/registry/build.ts#L265-L317).
>
> **Activation boundary:** [Foundation checks selected package integrity before it imports executable code](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugin-runtime/foundation/registry/activation.ts#L103-L137).

## Record A Reproducible Result

For each command, record these facts:

- the complete command and working directory;
- the reviewed Git revision;
- the package version and digest when the runtime reports them;
- required environment variables without their secret values;
- the host, operating system, and external services;
- passed, failed, skipped, unavailable, and not-run results as different states;
- the first relevant error and the retained evidence location;
- the boundary that the command did not reach.

Do not change `unavailable` to `passed` without running the check.
The recorded local result came from a host without timeout-capable `flock` or a C compiler.
Check the current host before reusing that result.
The catalogue pages state the current local result and its environment limit.

## Test A Pipeline Stage

Use the minimal plugin journey for the complete first stage. For later stages, apply
this focused procedure:

1. Validate the manifest and every referenced schema.
2. Import the declared module and named export.
3. Invoke success with the smallest valid input.
4. Invoke one invalid input and verify rejection before work starts.
5. Deny each requested capability and verify the public denial result.
6. Exercise timeout, cancellation, and duplicate input when they apply.
7. Verify every declared artifact and output against its schema.
8. Activate the stage through Foundation with the intended grant.
9. Run it through Nova and inspect the committed lifecycle result.
10. Remove the stage from the graph and verify that no new invocation occurs.

Core owns lifecycle changes. A stage test must not accept direct journal mutation as
proof of a supported plugin result.

> **Invocation boundary:** [The SDK context exposes bounded capability, event, and artifact services](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugin-runtime/sdk/src/runtime.ts#L21-L43).
>
> **Result interpretation:** [Nova validates the result, records it, applies lifecycle rules, and always cleans the attempt](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/nova/core/execution/stage-executor.ts#L31-L52).

## Test An Observer

An observer consumes committed events. It must not control the pipeline.

1. Validate subscriptions and checkpoint schema.
2. Deliver one matching committed event.
3. Verify one non-matching event causes no delivery.
4. Repeat the same event and verify the declared duplicate behavior.
5. Stop delivery during an external write.
6. Restart from the durable checkpoint.
7. Exhaust the retry policy and inspect the terminal delivery record.
8. Disable the observer and verify later events remain available to Core.

An observer can fail its delivery. That failure does not reverse the committed
pipeline event.

> **Bounded delivery:** [Nova binds the observer identity, delivery attempt, lease, grants, timeout, and cleanup](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/nova/core/telemetry/observer-delivery.ts#L15-L43).

## Test A Capability Adapter

An adapter test must prove policy and the external effect.

1. Validate the provided capability ID against the closed vocabulary.
2. Verify provider selection from platform configuration.
3. Invoke with no grant and expect denial before the external call.
4. Invoke at each important constraint boundary.
5. Verify the external receipt and the redacted audit record.
6. Interrupt after dispatch and before receipt persistence.
7. Reconcile the uncertain effect by stable operation identity.
8. Verify cancellation stops owned local work.
9. Disable the adapter and verify selection fails closed.

Do not prove an effect only with a mock. Use a mock for deterministic inner tests,
then use the real protocol in an integration or live check.

> **Provider resolution:** [Foundation maps each capability to one installed adapter and rejects invalid mappings](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugin-runtime/foundation/registry/capabilities.ts#L75-L119).
>
> **Effect recovery:** [The durable invocation records request and acceptance, recovers receipts, fences calls, and records completion](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/nova/core/effects/durable-invocation.ts#L88-L157).

## Test A Provider Or Report Adapter

Buster binds both surfaces through a resolved test plan.

For a test provider:

1. Validate its provider contract and declared matrix fields.
2. Run the smallest valid plan in the provider sandbox.
3. Deny one required grant and verify failure before provider work.
4. Exercise fixture prepare, health, test, collect, and cleanup paths.
5. Verify evidence size, count, type, and retention bounds.
6. Exercise timeout, cancellation, retry safety, and remote interruption.
7. Import the signed result through Nova.

For a report adapter:

1. Validate the format identity and accepted media type.
2. Parse a small valid report.
3. Reject malformed and oversized input.
4. Preserve executed, failed, skipped, and error counts.
5. Verify bounded diagnostic output.

The provider produces facts. The report adapter normalizes facts. Gate policy decides
whether those facts pass.

> **Provider binding:** [Buster verifies the plan digest, registry snapshot, provider identity, and report-adapter identity](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/buster/engine/test-gates/runner.ts#L234-L267).
>
> **Package snapshot:** [The provider loader verifies the digest and copies exact package bytes into the attempt workspace](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/buster/engine/test-gates/provider-loader.ts#L52-L79).

## Test An OpenClaw Or Codex Extension

Test the host contract, not only the exported function. These are acceptance
requirements, not an installation procedure. First apply the [packaged OpenClaw
route](#operate-the-packaged-openclaw-hosts) or the [Codex host
boundary](#codex-host-lifecycle-boundary). Stop at their unavailable controls.

For OpenClaw:

1. Validate `openclaw.plugin.json` with the target host version.
2. Verify the built image contains the package.
3. Verify allowlist and entry configuration.
4. Start with the extension disabled.
5. Start with valid and invalid configuration.
6. Invoke every hook or tool through OpenClaw.
7. Stop during queued work and verify bounded shutdown.
8. Restart and inspect external records for duplicates.

For Codex:

1. Validate `.codex-plugin/plugin.json` and every skill path.
2. Install the exact package version.
3. Exercise trigger and non-trigger prompts.
4. Exercise connected and missing external tools.
5. Verify that read-only guidance does not perform mutations.
6. Update the package and repeat its critical workflow.
7. Remove it and verify that the skill is no longer discoverable.

The current Ops package has no package-local automated test. Its connected-tool and
missing-tool exercises remain required acceptance work.

## Test A Worker Engine Or Runtime Role

A Worker engine test starts with its versioned attempt envelope.

1. Reject the wrong contract, engine digest, or schema identity.
2. Apply resource limits before specialist execution.
3. Execute success, domain failure, timeout, and cancellation.
4. Terminate all owned child work.
5. Collect bounded evidence and cumulative resource facts.
6. Run cleanup after every terminal path.
7. Retry or recover with the same immutable attempt identity.

A role test proves packaging around that engine:

1. Run ownership and role-closure checks.
2. Build a clean role bundle.
3. Inspect selected packages, extensions, entrypoint, and digests.
4. Build the role image.
5. Start the process and verify readiness.
6. Run one real task and one failure.
7. Stop and restart while recoverable work exists.

> **Attempt lifecycle:** The [operation interface defines required and optional functions](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L68-L80).
> Worker Core applies the following conditions when it calls them:
>
> - [Preparation must finish synchronously](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L381-L389).
> - [Execution starts after the remaining-time and cancellation checks](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L405-L418).
> - [Measurement follows execution and its error handling](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L431-L449).
> - [Cleanup runs when the operation supplies it](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L452-L462).
> - [Evidence collection runs when the operation supplies it](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L497-L514).
> - [Final measurement follows the completion functions](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L552-L560).
>
> [Termination has its own timeout](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/worker/core/worker/attempt-executor.ts#L615-L627).
> Worker Core calls it after an execution error and on cleanup failure or expiration,
> as shown in the execution and cleanup links above.
> It is not an unconditional step after every successful execution.
>
> **Role closure:** [The role checker verifies ownership, dependencies, capability providers, and plugin selection](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/scripts/check-runtime-role-manifests.mjs#L77-L145).

## Install And Activate By Surface

| Surface | Install action | Activation action | Positive observation |
| --- | --- | --- | --- |
| Stage or observer | Stage approved package bytes in an installation root | Select it in graph or platform configuration | Registry identity and successful invocation or delivery |
| Capability adapter | Stage package and configure its provider mapping | Add it to active adapters with a bounded grant | Receipt plus redacted effect record |
| Test provider or report adapter | Include package in the Buster role | Bind it into a resolved test plan | Provider result or normalized report |
| OpenClaw extension | Use the packaged host route below | The role chart selects its own host entry | Image and entry checks are partial proof; host invocation has the stop rule below |
| Codex plugin | No versioned operator installation route is supplied | Stop before host installation | Manifest discovery is local proof only; see the Codex boundary below |
| Worker engine | Integrate engine and exact profile | Route a matching attempt to its role | Accepted attempt and durable result |
| Runtime role | Build and deploy immutable bundle or image | Start its entrypoint with role configuration | Readiness and one real task |

Installation authority belongs to the operator. Project input can select approved
behavior, but it cannot install executable code or grant itself authority.

## Operate The Packaged OpenClaw Hosts

This route covers `kubeclaw-agent-observer` version `0.0.0` in the Buster
gateway and `kubeclaw-prism` version `0.1.0` in the Prism agent. The image
builds select OpenClaw `2026.9.4` with a fixed image digest. Both manifests
require plugin API and gateway version `2026.9.1` or later. That minimum is
not proof that every later host version works. Use the pinned build version.
A host is the process that loads the extension. Its SDK is a library interface;
SDK availability alone does not show that the host selected this extension.

### Install, start, and inspect

1. Use the [platform installation procedure](../use/install.md), including its
   release-image selection, bound administration shell, namespace selection,
   Secrets, trust, and dependency checks. The platform operator needs image and
   chart deployment authority. Stop if release-image selection is absent. Do
   not install arbitrary source files into a running container.
2. Select the Buster gateway or Prism agent deployment from that installation.
   The Docker builds install the observer at
   `/app/dist/extensions/kubeclaw-agent-observer`. The Prism agent build also
   installs its tools at `/app/dist/extensions/kubeclaw-prism`. The role bundle
   extension list is packaging metadata; it does not prove host activation.
3. Keep `agentRole` equal to `buster` for the observer host or `prism` for the
   Prism tool host. The chart writes `plugins.allow` and `plugins.entries`.
   For Buster, it allows `kubeclaw-agent-observer`, sets its entry `enabled` to
   `true`, sets `config.enabled` to `true`, and allows conversation access.
   For Prism, it allows `kubeclaw-prism`, sets its entry `enabled` to `true`,
   and sets `config.controlUrl` to `http://127.0.0.1:28080`. These entries are
   fixed chart content, not independent Helm value switches.
4. Complete rollout and dependency checks in the installation and
   [Prism operation procedure](../use/prism-studio.md). Retain the deployed
   image digest, chart values, role, and rollout result. A ready Pod proves
   process readiness only.
5. In the bound administration shell, select `HOST_POD` as the exact running
   Pod name from that rollout and `HOST_PLUGIN` as one of the two IDs above.
   Use `NAMESPACE` from the installation. This read requires `get` on Pods
   and `create` on `pods/exec`; obtain that authority before use. It runs only
   a file check and a restricted configuration read in container `kubeclaw`.

```bash
: "${NAMESPACE:?Use the namespace selected during installation}"
: "${HOST_POD:?Set the exact deployed host Pod name}"
: "${HOST_PLUGIN:?Set kubeclaw-agent-observer or kubeclaw-prism}"
case "$HOST_PLUGIN" in
  kubeclaw-agent-observer|kubeclaw-prism) ;;
  *) printf '%s\n' 'Unsupported host plugin ID' >&2; exit 1 ;;
esac
bound_kubectl -n "$NAMESPACE" exec "$HOST_POD" -c kubeclaw --   test -f "/app/dist/extensions/$HOST_PLUGIN/openclaw.plugin.json"
bound_kubectl -n "$NAMESPACE" exec "$HOST_POD" -c kubeclaw --   node -e 'const fs=require("node:fs"); const id=process.argv[1]; const c=JSON.parse(fs.readFileSync("/home/node/.openclaw/openclaw.json","utf8")); const e=c.plugins?.entries?.[id]; const allowed=c.plugins?.allow?.includes(id)===true; console.log(JSON.stringify({id,allowed,entryEnabled:e?.enabled===true,observerEnabled:id==="kubeclaw-agent-observer"?e?.config?.enabled===true:undefined,controlUrl:id==="kubeclaw-prism"?e?.config?.controlUrl:undefined})); if(!allowed||e?.enabled!==true) process.exit(1);' "$HOST_PLUGIN"
```

A missing file means the image does not contain the selected package. A false
`allowed` or `entryEnabled` means selection failed. For the observer, require
`observerEnabled: true`. For Prism, require the control URL above and independently
verify the bridge and control dependency through the Prism procedure. Stop on
any mismatch. Preserve these restricted results; do not print the complete host
configuration because it can contain sensitive values. Restore the approved
complete image and chart configuration through the maintenance procedure after
an owner has assessed compatibility. Do not repair a running image by copying
individual package files.

### Prove host registration and a real result

The observer registers hooks, a service, and gateway methods
`kubeclaw.agentObserver.status` (`operator.read`) and
`kubeclaw.agentObserver.selfTest` (`operator.admin`). Status includes
`registered_hooks`; this is the extension's declared list, not independent proof
that the host delivered every hook. Self-test writes a synthetic lifecycle event
and flushes it; it does not prove receipt of a real host event. The Prism extension
registers `prism_create_design_set` and `prism_apply_revision`; their calls write
through the local control endpoint with job, fence, and generation identity.
Do not submit a dummy design or revision merely to check installation.

**Stop before claiming complete host activation.** The repository supplies these
registration interfaces and local tests, but no pinned operator client procedure
for enumerating their registration and invoking the observer methods. The
OpenClaw integration owner must supply the exact authenticated gateway client,
its supported version, endpoint and identity selection, read/admin scope checks,
expected status fields, a controlled real-hook event and its matching Redis
record, and a negative disabled-host observation. For Prism, use the controlled
Studio journey for a real operation; its current live prerequisites and stop
rules apply. Tool registration still needs an exact host enumeration procedure
from the same owner. Until those procedures and results exist, image presence,
configuration, SDK checks, local registration tests, and Pod readiness remain
separate partial observations. Do not substitute Nova compile/start/audit for
them.

### Disable, update, or remove

The chart has no independent observer or Prism extension disable value. Startup
copies managed `plugins.allow` and `plugins.entries` from the chart into the
persistent configuration. It also removes entries from other roles. An edit to
`/home/node/.openclaw/openclaw.json` or `/config/openclaw.json` is not a durable
operator disable route. Package bytes are part of the immutable host image.
Changing `agentRole` would change the process role and is not plugin disablement.

**Stop before independent disablement, replacement, or package removal.** The
OpenClaw integration and runtime-packaging owners must provide a reviewed chart
control or a complete replacement image, exact rollout and drain steps, host
registration absence and no-later-event/tool proof, and a tested rollback to the
old image and configuration. The platform operator must approve the affected
workload scope. If urgent containment requires stopping the whole host, use the
[run control boundary](../use/operate.md) and the workload owner's approved
containment procedure; host stoppage affects other work and does not prove
removal. Keep Redis records, Prism database documents, job identities, receipts,
and old images according to their owners' retention and recovery rules. The
extension does not delete them. No accepted old/new host-package compatibility
pair or state migration is supplied; follow the maintenance safe stop before
upgrade.

## Codex Host Lifecycle Boundary

`kubeclaw-ops` version `0.2.0` declares `./skills/` and the
`troubleshoot-kubeclaw` skill. It has no pipeline registration, OpenClaw entry,
or MCP server declaration. Its interface `Read` capability describes intended
use; it does not grant or restrict operating-system, tool, or Kubernetes rights.
The Ops Pod deployment and its MCP service are separate installations. Deploying
them does not install this Codex plugin.

**Stop before install, activation, update, disable, or removal.** No supported
Codex host version, plugin installation directory, versioned install/connect
control, or disable/removal control is supplied for this package. The Codex
environment owner must provide those exact controls and paths, an approved Ops
MCP connection with endpoint and credential ownership, and effective tool/RBAC
authority. Before continuation, that owner must show skill discovery for the
installed version, a trigger prompt that uses the expected tools, a non-trigger
prompt, a missing-tool result that reports the unavailable connection without
mutation, and skill absence after disable/removal. Retain the package version,
host version, connection identity without credentials, results, and remaining
conversation/service data. If a tool is missing, stop the investigation at that
boundary; do not replace a missing read tool with shell or cluster mutation.
The package has no automated host lifecycle test or general external-data deletion
operation. Plugin removal does not remove conversation or external service data.

## Nova Adapter With An OpenClaw SDK Dependency

`kubeclaw.openclaw-agent-events:source` version `1.0.0` is a Nova capability
adapter, not either OpenClaw host extension above. Its manifest provides
`agent.events.subscribe`. Select its adapter and provider through the
[Nova lifecycle](../use/plugins.md#canonical-plugin-lifecycle-procedure).
Its `activate` function loads `openclaw/plugin-sdk` and requires `on` during
`ready()`. No compatible SDK version is declared by this package. The Nova role
selects it, but that selection does not prove that the pinned OpenClaw SDK exports
this interface or that a real host shares its event source with the Nova process.

Stop at readiness if `OPENCLAW_HOOK_API_UNAVAILABLE` occurs or the SDK import
fails. The Nova/OpenClaw integration owner must supply an exact compatible SDK
version and execution topology, prove `on` on the actual loaded module, and
show one configured real host hook reaching a matching committed Nova event.
Do not use the observer's focused diagnostic SDK export as proof of this distinct
root export. Configured hooks must be supported and unique; invalid, unsupported,
or duplicate hooks fail before readiness. The adapter's `status` operation
reports `activeSubscriptions`, queue facts, and `shuttingDown`; it is an adapter
invocation, not a host gateway command. A local injected SDK test does not prove
the real source. Failed partial registration releases subscriptions. Shutdown
releases subscriptions and drains the queue under its signal. Keep committed
Nova events and recoverable runs when selection stops; source removal does not
delete their journals. Apply the Nova drain and retained-byte rules before
removing adapter selection or its package.

## Host Lifecycle Source Evidence

The following links support the available controls and their limits. They do not
establish a live deployment result. Revision: `f68a7294abf0928c1aabf290c6a7e486c651a808`.

| Claim | Implementation or contract | Check and limit |
| --- | --- | --- |
| Observer version and host compatibility | [Package](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugins/openclaw-agent-observer/package.json#L4-L22) | Manifest inspection; later host compatibility is unproved |
| Prism version and host compatibility | [Package](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/prism/openclaw-plugin/package.json#L2-L11) | Manifest inspection only |
| Fixed host build and observer image path | [Buster Docker build](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/docker/Dockerfile.buster-gateway#L5-L30), [final image copy](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/docker/Dockerfile.buster-gateway#L95-L102) | Image build and live image inspection were not run |
| Prism tool image path | [Prism image](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/docker/Dockerfile.prism-agent#L110-L124) | Image presence does not prove registration |
| Role-controlled entries and configuration | [Chart](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/charts/kubeclaw/templates/configmap-gateway.yaml#L262-L322) | Source inspection; entries are fixed chart content |
| Persistent entry overwrite and role filtering | [Persistent source synchronization](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/charts/kubeclaw/templates/deployment.yaml#L440-L473), [runtime role filtering](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/charts/kubeclaw/templates/deployment.yaml#L224-L245) | Source inspection; direct edits are not durable disable controls |
| Observer methods, authority, and service stop | [Registration](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugins/openclaw-agent-observer/src/index.ts#L241-L300) | Local registration code; no authenticated gateway-client execution |
| Prism tool names and external writes | [Tool registration](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/prism/openclaw-plugin/index.mjs#L10-L59), [revision call](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/prism/openclaw-plugin/index.mjs#L59-L81) | [Original registration test](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/prism/openclaw-plugin/index.test.mjs#L5-L16); local API fixture only |
| Codex identity, skills, and interface authority | [Manifest](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/plugins/kubeclaw-ops/.codex-plugin/plugin.json#L1-L26), [skill](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/plugins/kubeclaw-ops/skills/troubleshoot/SKILL.md#L1-L29) | Source inspection; no host installation or connected-tool execution |
| Nova adapter is a distinct registration | [Manifest](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugins/openclaw-agent-events/plugin.json#L1-L18), [SDK dependency and lifecycle](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugins/openclaw-agent-events/src/adapter.ts#L73-L119) | [Original injected-SDK test](https://github.com/datrab/kubeclaw/blob/f68a7294abf0928c1aabf290c6a7e486c651a808/skills/common/plugins/openclaw-agent-events/tests/live-function.test.ts#L45-L106); local fixture, not a real host |

## Update Or Replace

Use an update when identity and compatible contracts remain stable. Use a replacement
when identity, host contract, authority, state format, or recovery bytes change.

1. Record the old package version, digest, configuration, and state owners.
2. Read the new compatibility and migration notes.
3. Run static, package, and platform checks against the new bytes.
4. Build a new complete role when role contents change.
5. Stop new selection of the old implementation.
6. Drain work that must finish with the old bytes.
7. Migrate owned state only through a documented migration.
8. Activate the new identity for new work.
9. Run one success, one denial, and one recovery exercise.
10. Retain old bytes while an attempt can still request them.

Do not replace files inside a running bundle. That action breaks the connection
between evidence, digest, and behavior.

## Disable Safely

Disablement stops new use. It does not mean removal.

| Surface | Disable control | Required check |
| --- | --- | --- |
| Stage | Remove it from new graphs | Existing recoverable runs keep resolvable bytes |
| Observer | Remove the configured observer ID | Core continues to commit source events |
| Adapter | Remove active selection or provider mapping | Requests fail closed with no external call |
| Provider or report adapter | Stop binding it into new plans | Existing plans keep exact implementation identity |
| OpenClaw | No independent deployment toggle is supplied | Stop before an entry edit or byte removal; see the host stop rules below |
| Codex | No versioned disable or removal control is supplied | Stop until the Codex environment owner supplies the host procedure and absence proof |
| Engine or role | Stop routing new attempts | In-flight and recoverable work has a drain plan |

## Remove And Inspect Remaining State

Remove package bytes only after selection stops and recovery no longer needs them.

| State | Typical owner | Removal consequence |
| --- | --- | --- |
| Nova journal and pipeline records | Core | Package removal does not delete them |
| Observer checkpoints and delivery attempts | Observer runtime or store | Keep them for replay policy and audit |
| External effects and receipts | External system plus effect journal | Reconcile or retain them separately |
| Buster evidence and resolved plans | Test evidence store | Keep them for result verification and recovery |
| OpenClaw Redis records | Observer and Redis retention policy | Host-extension removal does not delete them |
| Codex conversation or external tool data | Codex or connected service | Plugin removal does not delete them |
| Worker evidence and attempt records | Worker and pipeline stores | Keep them while audit or recovery requires them |
| Role bundles and images | Artifact or image store | Retain referenced versions, then apply store policy |

After removal, verify package discovery, configuration references, running processes,
queued work, external credentials, durable records, and retention rules. Delete data
only through its owner's procedure.

## Diagnose A Failure

Follow the first failed boundary:

1. If discovery fails, inspect the manifest, schema paths, exports, and package digest.
2. If selection fails, inspect graph, platform mapping, plan binding, or host entry.
3. If activation fails, inspect trust, grants, allowlists, and role contents.
4. If invocation fails, inspect bounded input, dependency health, timeout, and logs.
5. If recovery fails, inspect stable identity, checkpoint, retained bytes, and cleanup.
6. If removal fails, find the remaining selector or state owner before deletion.

Do not start by increasing authority or retry limits. First identify whether the
failure occurred before dispatch, during work, or after an uncertain external effect.

## Commands

Run the commands that match the changed surface:

```bash
npm run verify:plugin-packages
npm run verify:plugin-live-capabilities
npm run verify:plugin-system:phase12
npm run verify:worker-core:attempt-executor
npm run verify:runtime-packaging:roles
npm test --prefix skills/common/plugins/openclaw-agent-observer
node --test skills/prism/openclaw-plugin/index.test.mjs
```

Package-specific commands appear on each catalogue page. Live checks require their
named host, credentials, external services, or cluster. Record those prerequisites
instead of silently skipping them.

## Completion Checklist

- The test reached the real changed boundary.
- The record identifies environment, revision, package identity, and result state.
- Success, invalid input, denial, timeout, cancellation, and cleanup have coverage.
- Duplicate and uncertain-effect behavior has coverage when an external effect exists.
- Role or host installation has direct proof.
- Update or replacement preserves recoverable work.
- Disablement stops new use and fails closed.
- Removal checks every remaining state owner.
- Unavailable and live checks remain explicit.
- Every behavior claim links to current contract, implementation, configuration, or test evidence.
