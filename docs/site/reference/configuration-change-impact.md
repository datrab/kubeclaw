# Configuration Change Impact

Status: current operational reference
Audience: operator, maintainer
Owner: platform operations
Evidence: skills/nova/core/execution/engine-snapshots.ts; skills/nova/core/execution/engine-runtime.ts; skills/nova/core/execution/engine-run.ts; skills/nova/core/execution/adapters.ts; skills/nova/core/execution/adapter-startup.ts; skills/nova/core/effects/coordinator.ts; skills/nova/core/effects/durable-invocation.ts; skills/common/plugin-runtime/foundation/config/platform.ts; skills/common/plugin-runtime/foundation/config/platform.schema.json; skills/nova/project/recovery.ts; skills/common/plugin-runtime/foundation/config/published-pair.ts; skills/prism/server/control-config.ts; skills/prism/config/native-worker.ts; skills/prism/control/product-decisions.ts; charts/kubeclaw/values.yaml; charts/kubeclaw/templates/deployment.yaml; charts/prism/values.schema.json; charts/prism/templates/workloads.yaml; charts/prism/templates/_product-decisions.tpl; charts/gitops/templates/applications.yaml
Applies to: current configuration families
Last verified: 2026-09-21 at source revision `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
Helm section verified: 2026-10-10 at source revision `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`; other families retain the evidence revisions below.
ConfigMap consumption section verified: 2026-10-10 against Kubernetes source revision `66452049f3d692768c39c797b21b793dce80314e`.
Platform timeout section verified: 2026-10-10 at source revision `fe426bd75db277b04cf405cc2057063b75fa0a1d`.

## Impact classes

| Class | Meaning |
| --- | --- |
| Hot | The documented consumer watches or reads the value for each operation. Do not assume this class without an explicit watcher/read path. |
| Restart | A process captures the value at startup; roll only the affected workload after validation. |
| Recreate consumer | Reload validated configuration and construct fresh consumer objects. The CLI does this on a new invocation; another caller must perform its own reload and recreation. |
| New run | Existing Nova run snapshots pin the graph, package set, or recorded runtime configuration subset. When a change violates those pins, continue with the original inputs and use the changed configuration only for a new identity. Platform timeout capture is a separate boundary, explained below. |
| Republish | The `.swarm` authoring pair must be validated and atomically published together. |
| Host prepare + restart | Root-owned capacity/identity or cgroup state must be reconciled before the worker restarts and reports ready. |
| Data procedure | A persistent format, location, identity, or credential transition needs its component's explicit backup/restore or rotation procedure. Editing config alone is insufficient. |

## Change matrix

| Change | Required class | Why and checks |
| --- | --- | --- |
| `pipeline-platform.v2` package roots, trust, providers, grants, adapters, observers, isolation | New run | Recovery compares the recorded effective runtime and pinned packages. Validate registrations and grants; retain the prior file for active runs. |
| Platform `storageRoot` | New run + data procedure if state must move | The new path selects another store; the loader does not copy run state. Verify durability, permissions, capacity, backup, and restore before cutover. |
| Platform `shutdownTimeoutMs` or `effectLockTtlMs` | Recreate consumer; use a new CLI invocation or restart the owning process if it loads configuration only at startup | Existing objects keep captured values. These two settings are absent from the recorded runtime configuration subset; a timeout-only change does not itself require a new run ID in that comparison. Apply the stop, drain, and recovery checks below. |
| `nova-project.v2` root, module, coverage, agent, lint, source, final, or demo fields | New run | Compiler output or source binding can change the graph digest. Compile first and compare the recorded digest. |
| `pipeline-definition.v2` field | New run | Recovery verifies pipeline ID and normalized graph digest. |
| `.swarm/progress.json` or `.swarm/pipeline.json` | Republish; then new resolved plan/run where consumed | The two files are one generation. Re-run scaffold checks and plan resolution. Never hand-update one current copy. |
| Provider schema/config, suite selection, coverage, matrix, limits | Republish + new resolved plan/run | Plan digest, provider config digest, links, coverage, or node identities can change. |
| Plugin package content/version | New run by default | Registry snapshot pins package version/content digest. An active run accepts only its recorded package or an explicitly governed supported package transition. |
| KubeClaw or Prism image digest | Restart; new run for any pipeline component used by that run | Workload executable bytes change. Render manifests, check digest pinning, and preserve a drain path. |
| Helm resources, probes, replicas, service account, volumes | Rollout for a changed pod template; scale for a changed replica count | Classify the rendered receiver. Replicas are a Deployment setting; the other named pod fields can change its template. Check disruption budget, storage attachment, native worker replica constraint, and readiness. |
| [ConfigMap-backed startup configuration](#configmap-consumption) | Restart | Current services do not promise a live reload. Use a template checksum/generation to prove rollout. |
| Secret-backed environment value | Restart + credential rotation procedure | Existing processes retain their environment. Coordinate old/new acceptance to avoid loss of access; do not print the credential. |
| File-mounted signing key/CA/token | Restart unless its loader explicitly rereads for every action | Prism product authority captures configuration and key at composition. Coordinate controller trust before removing the old credential. |
| Prism service URL, timeout, ingress limit, trust ID | Restart | Loaders capture one startup snapshot. Validate URL/number form and peer policy before rollout. |
| Prism native pool limits, paths, node identity, policy digest | Host prepare + restart | Worker verifies a root-owned policy and actual cgroup state at readiness. Drain attempts, prepare the host, then restart the pinned worker. |
| Prism database or artifact storage location/size | Data procedure + restart | Persistent stores are independent. Prove backup, restore, ownership, and application connectivity. A values edit does not move data. |
| GitOps values source | Restart/rollout when the rendered workload changes | The controller reconciles declared Git state. Manual live edits are temporary and should not be the recorded change. |


## ConfigMap consumption

A successful ConfigMap update changes the API object. It does not prove that a
container has read the new value. First identify how the container consumes it:
a full directory mount, a `subPath` mount, an environment variable, or a
separate API client. An application that reads a file only at startup still
requires its documented restart, even when the mounted file changes.

The following mechanisms describe Kubernetes v1.35.0. The Kubelet setting
`configMapAndSecretChangeDetectionStrategy` selects its ConfigMap manager;
a different server or Kubelet version needs its own verification.
[manager selection](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kubelet.go#L650-L669)

| Manager | How a Kubelet read obtains the object |
| --- | --- |
| Get | Each manager read makes an API GET. It is not a continuous file or process refresh. [direct read](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/configmap/configmap_manager.go#L65-L67) |
| Cache | Reads can use a local cached object. The default time to live is one minute; the Node-provided TTL can override it. An expired or errored entry triggers a fetch. [TTL and cache construction](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/configmap/configmap_manager.go#L110-L131); [Node TTL override](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/util/manager/cache_based_manager.go#L132-L154) |
| Watch | Reads use the object populated by a list/watch cache. A read waits up to one second for initial synchronization and returns an error if synchronization fails. [initial synchronization and cache read](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/util/manager/watch_based_manager.go#L310-L337) |

For Cache, a failed refresh can return the previous cached object when one
exists. A successful fetch with an older resource version does not replace
that object. A NotFound result updates the cached result to absence. Thus a
cache read is not proof that the API is reachable or that the latest edit has
arrived. [refresh and retained cache result](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/util/manager/cache_based_manager.go#L176-L205)

The cache manager adds a reference on the first registration of a Pod, or
when an updated Pod introduces a new ConfigMap reference. It does not
invalidate every existing reference on each Pod update. When the last
reference is removed, it removes the cached item. [last reference removal](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/util/manager/cache_based_manager.go#L117-L128) [reference changes on registration](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/util/manager/cache_based_manager.go#L223-L251)
The Watch manager stops watching an object after it observes `immutable: true`.
Use a new ConfigMap identity for changed immutable data and verify the new
consumer before retiring the old one. [immutable watch stop](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/util/manager/watch_based_manager.go#L338-L358)

### Directory mounts and subPath

The ConfigMap volume plugin requests repeated setup. The volume manager marks
mounted volumes for another setup when their plugin requires it. This makes a
later payload refresh possible; it does not provide a fixed delivery deadline.
[ConfigMap remount requirement](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/volume/configmap/configmap.go#L81-L83) [volume remount marker](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/volumemanager/cache/actual_state_of_world.go#L800-L821)

On a payload change, the atomic writer writes a new timestamped directory and
applies permissions. On Linux, it publishes that directory by renaming the
`..data` symbolic link. The files visible to the container point through this
link. Later reads that resolve the updated path can reach the new payload.
An application must still read and accept that content. [visible symbolic links](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/volume/util/atomic_writer.go#L467-L483) [new directory and permissions](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/volume/util/atomic_writer.go#L189-L211) [platform-specific publication](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/volume/util/atomic_writer.go#L213-L244)

Publication can partially succeed: after changing the link, creating visible
links, removing obsolete links, or deleting the old directory can fail.
An error therefore does not prove that all visible files retained their old
content. Inspect the actual mounted path and Kubelet errors before retrying
or deciding that a rollback succeeded. [errors after publication](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/volume/util/atomic_writer.go#L247-L264)

For a Linux `subPath` mount, the Kubelet resolves the symbolic links, opens the
selected path and binds that opened file into the container. Inference from
this mount path: changing the parent volume's `..data` link does not retarget
that existing bind mount. Recreate the consumer mount through its supported
workload procedure when new content is required. Do not use a wait period as
proof that a `subPath` file refreshed. [resolved path and opened-file bind mount](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/volume/util/subpath/subpath_linux.go#L175-L226)

### Environment variables

`envFrom.configMapRef` and `env.valueFrom.configMapKeyRef` read `data`, not
`binaryData`. The Kubelet reuses one fetched ConfigMap within an environment
construction call. A missing optional object is skipped; a missing selected
key is skipped only when that key reference is optional. Other fetch errors
stop environment construction. [ConfigMap environment source](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kubelet_pods.go#L774-L802) [selected ConfigMap key](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kubelet_pods.go#L867-L893)

The Kubelet processes `envFrom` first. Later sources can replace the same name,
and explicit `env` entries can replace values supplied by `envFrom`. It passes
the resulting key/value list in the new container configuration. [explicit entries and constructed environment](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kubelet_pods.go#L961-L967) [environment passed to runtime options](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kubelet_pods.go#L652-L656) [runtime option construction](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kuberuntime/kuberuntime_container.go#L343-L347) An API edit
does not rewrite the environment of an already running container through this
path. Recreate the container through its workload procedure and check the
resulting application behavior. [environment source precedence](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kubelet_pods.go#L772-L774) [container environment configuration](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/kubelet/kuberuntime/kuberuntime_container.go#L396-L405)

> **Source evidence — ConfigMap consumption**
>
> **Claim:** Manager reads, volume publication, Linux subPath mounts and container environment construction have different update boundaries.
>
> **Implementation:** The pinned links above identify the responsible Kubelet, volume writer and runtime configuration paths.
>
> **Contract or setting:** `configMapAndSecretChangeDetectionStrategy`, Pod ConfigMap volume references, `subPath`, `envFrom` and `env.valueFrom`.
>
> **Test evidence:** No Kubelet, mounted-file, container environment or live refresh exercise was executed for this section.
>
> **Check status:** Pinned original source bytes and the stated branches were inspected on 2026-10-10. This is source evidence, not a cluster result.
>
> **Revision:** `66452049f3d692768c39c797b21b793dce80314e`
>
> **Limit:** Cache propagation, volume setup, the actual container mount and application reload must all succeed. No end-to-end update deadline is established here.

## Platform timeout capture and recovery

The platform loader validates one file, resolves its paths, and freezes the
loaded configuration. A file edit does not modify the object already passed
to a running execution. The adapter runtime and effect coordinator receive
their timeout values when `createAdapterRuntime` constructs them.

| Setting | Accepted value and default | Consumer effect |
| --- | --- | --- |
| `shutdownTimeoutMs` | The schema requires an integer of at least 1 millisecond, with no maximum or platform-loader fallback. Use 1–2,147,483,647 milliseconds for the Node timers. | Sets activation/readiness wait limits, invocation cleanup deadlines, and the normal runtime shutdown deadline. Larger schema-valid values become a 1 ms timer delay. Failed-start cleanup has a separate abort-only limit, explained below. Existing runtime objects retain their captured value. |
| `effectLockTtlMs` | Optional integer from 60,000 to 86,400,000 milliseconds. When absent, the effect coordinator receives 300,000 milliseconds. | The coordinator passes the duration to durable-effect lock acquisition and renewal. Its renewal interval also derives from this captured duration. |

### Timer range and stop condition

Stop before recreating a consumer if `shutdownTimeoutMs` is outside
1–2,147,483,647 milliseconds. Passing platform validation does not prove that
the timer preserves the requested delay. The current schema has no maximum;
the adapter passes the captured value directly to Node's `setTimeout`.
Node changes a delay above 2,147,483,647 to 1 millisecond. A larger configured
allowance can therefore sharply shorten a wait, shutdown deadline, or timed
abort signal. Timer scheduling does not guarantee an exact elapsed duration.

Source: [shutdown schema](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/common/plugin-runtime/foundation/config/platform.schema.json#L94-L96),
[shutdown timer consumer](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapters.ts#L74-L84),
and [Node.js 24.21.0 timer behavior](https://nodejs.org/download/release/v24.21.0/docs/api/timers.html#settimeoutcallback-delay-args).

On 2026-10-10, the unchanged platform loader accepted `2147483648`.
An isolated synthetic adapter's normal shutdown then rejected with
`ADAPTER_SHUTDOWN_TIMEOUT` after about 1.9 ms on Node.js `v24.21.0`, which
reported the overflow and 1 ms delay. A separate `2147483647` boundary check
accepted the value and completed a synthetic readiness operation before the
timer; the timer was cleared. The full long delay was not measured. Pending
synthetic work was released. These checks did not execute a pipeline recovery,
live adapter, or external operation.

If the proposed delay is outside this range, retain the previous valid
configuration and ask the runtime and platform configuration maintainers to
resolve the input. Do not treat a successful schema check as approval to
restart. A future loader or consumer guard must be checked at the boundary and
above it; this reference does not claim such a guard already exists.

### Deadline and cleanup outcomes

These limits do not all enforce the same outcome. Activation and readiness
waits, invocation cleanup, and normal runtime shutdown race their operation
against a rejecting deadline. The host can stop waiting when that deadline
expires; this does not prove that the adapter has stopped its work.
Failed-readiness teardown, startup rollback, and cleanup of an adapter that
activates after its deadline instead send a timed abort signal and await the
adapter's shutdown promise. If the adapter ignores the signal and never
settles, that cleanup can wait indefinitely. The readiness failure reaches
the caller only after its teardown settles.

Keep new work stopped and retain the adapter identity, timeout, unresolved
effects, and observed shutdown result. An elapsed timer or a runtime shutdown
timeout does not prove completed cleanup. Follow the
[adapter startup and shutdown limits](../understand/plugin-runtime.md#activation-is-fail-closed)
before deciding whether recovery is safe.

Source: [startup wait deadlines](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapter-support.ts#L15-L18),
[failed-readiness teardown and rollback](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapter-startup.ts#L144-L165),
[late-activation cleanup](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapter-support.ts#L20-L25),
[invocation cleanup deadline](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapter-invocation-phase.ts#L38-L53),
and [normal runtime shutdown deadline](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapters.ts#L74-L86).

Process capture is different from persisted recovery authority. The recorded
runtime configuration contains `providers`, `grants`, `adapters`,
`activeAdapters`, `observers`, and optional `isolation`. It excludes both
timeout fields. Recovery compares that subset and the pinned package set,
versions, and content digests. It checks the pipeline graph separately.
A timeout-only edit therefore does not cause a runtime-configuration mismatch
in this comparison.

Recovery prepares runtime authority from the supplied platform configuration
and keeps the existing run ID. If its other recovery checks allow execution,
it creates fresh adapter/effect objects from that platform, with its current
timeouts. The CLI loads the selected platform file for its invocation. Thus a
later recovery invocation can select different timing for the same identity;
the stored snapshot does not restore the original values of these two fields.
This is not a promise that recovery will succeed. Terminal runs, waits,
unresolved effects, graph changes, and package/configuration drift still have
their own stop conditions.

Keep these distinctions when planning a timeout change:

1. Preserve the previous platform file, its digest, and the two effective
   timeout values. Validate the proposed file and record the new values,
   including the fallback for an absent `effectLockTtlMs`. Check the shutdown
   timer range above even when platform validation succeeds. Stop on overflow.
2. Before recreating the consumer, stop new work and drain active work through
   the [run-control procedure](../use/operate.md#canonical-run-control-procedure).
   Stop the change if effects or attempts remain unresolved. A shorter shutdown
   allowance can end a deadline-controlled wait sooner or send a failed-start
   cleanup abort sooner. It cannot force an uncooperative adapter to stop.
   A changed lock duration can change effect timing. Do not use a restart to
   bypass those conditions.
3. If an interrupted run must retain its original timing, supply the preserved
   platform values when following the recovery procedure. Do not depend on its
   snapshot to recover them. If changed timing is intentional, assess its effect
   on cleanup and locks before using the changed file.
4. Reload the selected configuration and recreate its consumers at the supported
   execution boundary. Verify the selected file and effective values and retain
   the resulting run and effect evidence.

Starting a new run after draining is a conservative operational choice when
timing changes could affect unfinished work. It is not an implemented new-ID
requirement caused solely by either platform timeout. This exception does not
apply to stage `execution.timeoutMs`, which is part of the pinned graph, or to
timeout values inside adapter configuration, which is part of the recorded
runtime subset.

> **Source evidence — platform timeouts and persisted authority**
>
> **Claim:** The loader validates platform timeout fields. Consumers capture them, but recovery excludes them from its runtime-configuration comparison. Recovery constructs consumers with the supplied platform and existing run ID after its other checks.
>
> **Implementation:**
>
> - [platform validation and frozen load](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/common/plugin-runtime/foundation/config/platform.ts#L51-L70).
> - [prepared configuration subset](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/engine-runtime.ts#L29-L41).
> - [persisted configuration and package comparison](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/engine-snapshots.ts#L28-L42).
> - [graph comparison](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/engine-snapshots.ts#L68-L73).
> - [recovery preparation and retained identity](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/engine-run.ts#L56-L69).
> - [effect check and consumer construction](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/engine-runtime.ts#L75-L87).
> - [CLI platform load and recovery selection](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/cli.ts#L48-L60).
>
> - [Adapter startup and invocation cleanup capture](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapter-startup.ts#L100-L119).
> - [readiness and failed-start cleanup](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapter-startup.ts#L144-L164).
> - [adapter shutdown deadline](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/execution/adapters.ts#L74-L84).
> - [effect-coordinator duration capture](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/effects/coordinator.ts#L12-L31).
> - [lock acquisition duration](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/effects/durable-invocation.ts#L39-L45).
> - [lock renewal and interval](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/nova/core/effects/durable-invocation.ts#L103-L109).
>
> **Contract or setting:**
>
> - [required shutdown field](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/common/plugin-runtime/foundation/config/platform.schema.json#L5-L18).
> - [timeout types and bounds](https://github.com/datrab/kubeclaw/blob/fe426bd75db277b04cf405cc2057063b75fa0a1d/skills/common/plugin-runtime/foundation/config/platform.schema.json#L94-L96).
>
> **Test evidence:** On 2026-10-10, Node.js `v24.21.0` ran 11 isolated assertions with a synthetic local plugin. They exercised the pinned loader, runtime preparation, snapshot writer, and package/graph verifiers. All passed. The recorded subset omitted both timeout fields. Changed shutdown, changed lock duration, both changed, and absent lock duration passed those authority checks without rewriting the stored snapshot. Changed adapter configuration and changed stage execution timeout rejected at their respective pin checks. Invalid timeout bounds rejected at the platform loader.
>
> **Revision:** `fe426bd75db277b04cf405cc2057063b75fa0a1d`
>
> **Limit:** The local checks did not execute a pipeline or resume/recover it under changed timeouts. Consumer capture and recovery handoff were checked from source. No adapter deadline, live effect, lock renewal, drain, readiness, or external operation was exercised.

## Helm render and runtime impact

Compare effective rendered resources before selecting a restart. A values-file
edit can produce the same manifest because an earlier map entry remains or a
template selects a fallback. A changed manifest can also affect a Service,
ConfigMap, Secret reference, or replica count without changing every pod.
The [Helm collection rules](configuration-precedence.md#helm-collection-precedence)
explain how the values reach the template.

There are three separate checks:

1. **Helm render:** Helm merges inputs, validates the complete effective values,
   and runs template guards. Stop on a schema or template error. For example,
   Prism rejects an empty `imagePullSecrets` list and empty or `Always` image
   pull policies before producing a successful render. A restart cannot repair
   this rejected input.
2. **Kubernetes admission and reconciliation:** The API must accept each rendered
   resource. The responsible controller must then reconcile it. Helm render
   cannot prove that referenced Secrets, storage, nodes, or capacity exist.
   An Argo CD Application rendered by the GitOps chart is still a declaration;
   it is not proof that its resources were applied.
3. **Runtime readiness:** New processes must load their environment and files,
   pass their readiness checks, and complete the bounded operation required by
   their component procedure. A changed pod template or a running pod alone
   does not prove that the intended value reached its runtime consumer.

The following effects follow from current local templates and loaders. The
render observations were checked locally; controller actions and runtime
effects were not executed on a cluster.

| Effective change | Rendered receiver and required effect | Failure or unchanged-result boundary |
| --- | --- | --- |
| KubeClaw `extraEnv` changes or becomes `[]` | The `kubeclaw` container's pod-template environment changes. Once applied, the Deployment needs replacement pods for the new environment. | `[]` removes only entries supplied through `extraEnv`; it preserves environment entries emitted elsewhere by the template. Existing processes retain their startup environment. |
| KubeClaw `nodeSelector` overlay becomes `{}` | Earlier selector keys remain in the pod template. This edit alone can leave scheduling unchanged. | An empty later map does not request removal. Compare the rendered template before assigning a rollout. |
| KubeClaw `nodeSelector` overlay becomes `null` | In the checked ordered-file case, Helm removes the mapping and the template omits the selector. If the applied template changes, replacement pods use the remaining scheduling constraints. | Removal does not prove that a node can run the pod. Do not reuse this removal request for a schema that requires the field. |
| KubeClaw nested resource map changes one request | Later supplied keys replace their earlier values; unspecified keys remain. A changed request is part of the pod template. | The local example changed CPU to `444m` and retained memory at `701Mi`; it did not check cluster capacity or resource admission. |
| KubeClaw `gateway.url` becomes empty | The rendered `OPENCLAW_GATEWAY_URL` selects `http://127.0.0.1:<gateway.port>`. A changed environment field requires new pods. | The local render at port `19003` selected `http://127.0.0.1:19003`. It did not disable the destination or check gateway connectivity. |
| KubeClaw `swarmConfigJson`, `semgrepConfigYaml`, or `eslintConfigMjs` becomes empty | The rendered swarm ConfigMap contains the corresponding checked-in file. Its checksum is part of the pod template; a changed payload changes that checksum. | Empty does not remove the file. An identical fallback payload can leave the checksum unchanged. The persistent-file rules below still determine what init copies. |
| Prism `imagePullSecrets` changes to a valid nonempty list | The list is emitted in each application Deployment pod template. Replacement pods use the selected references. | Render validates names and array shape, not registry credentials or Secret existence. The whole list must satisfy its minimum and item contracts. |
| Prism enabled `control.productDecisions.operators` changes to a valid list | The control pod template contains a configuration checksum and the JSON operator list in `PRISM_PRODUCT_OPERATORS`. Control loads the list and signing key at composition. A changed authority requires a control restart. | Validate uniqueness, maximum size, the enabled minimum, all dependent settings, and credential rotation conditions first. Schema-valid operators do not prove a working signing authority. |
| Existing-Secret reference or data changes | A changed name/key in a pod template requires new pods. A data-only edit to the same Secret does not change that reference; environment consumers need an explicit rollout under the rotation procedure. | A synthetic local reference proved only the selected name/key. Neither Secret availability nor hot credential reload was established. |

### ConfigMap payload and persistent startup files

The KubeClaw init script copies `swarm.config.json` from the rendered ConfigMap
to the configuration volume on each init execution. Before creating the runtime
copy, it removes any authored top-level `discord_webhook_url` from that
persistent source. It then creates the runtime copy and inserts
`discord_webhook_url` only from a nonempty `DISCORD_WEBHOOK` environment value.
With an empty environment value, the runtime copy has no webhook URL, even if
the rendered ConfigMap contained one. Rendering that ConfigMap or expanding a
compact configuration therefore does not prove the final startup value.
This is a startup action, not a file watcher.

Source: [copy and webhook removal](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L627-L633)
and [runtime copy and environment insertion](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L673-L675).

The same script treats `.semgrep.yml` and `eslint.config.mjs` differently. It
copies them from the ConfigMap only if the target file is absent or
`OVERRIDE_SWARM_CONFIG` is `true`. Helm sets that environment value from
`swarmConfig.overrideOnRestart`, whose checked-in value is `false`. An existing
policy file can therefore remain after a checksum-triggered restart even when
the ConfigMap has changed. The script copies that retained file into the runtime
directory. Follow [lint policy delivery and effective-digest checks](lint-policy.md#deployment-and-persistent-config-precedence)
to inspect or replace these files. Preserve local policy edits before enabling
replacement. Do not delete the persistent volume to force an update.

The charts contain selected checksum paths, not a promise that every external
ConfigMap or Secret edit triggers a rollout. KubeClaw hashes its gateway and
swarm ConfigMap templates. Prism hashes enabled product-decision configuration
and selected SPIFFE trust payloads. Inspect the exact affected annotation and
pod template. If neither changes, use the consumer's documented restart or
rotation procedure when startup-captured data has changed.
Use the [maintenance render comparison](../use/maintenance.md#render-and-compare)
before applying resources and the [credential rotation procedure](../use/maintenance.md#canonical-rotation-procedure)
when credentials change.

> **Source evidence — Helm changes at receiver boundaries**
>
> **Claim:** KubeClaw emits collection changes into pod fields and hashes selected ConfigMaps, but init preserves existing Semgrep/ESLint policies unless replacement is enabled. Prism Control captures authority inputs at startup; rendering does not prove live reload.
>
> **Implementation:**
>
> - [KubeClaw template and checksum fields](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L19-L40).
> - [environment collection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1393-L1395).
> - [resource receiver](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1442-L1442).
> - [selector receiver](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1655-L1662).
> - [persistent swarm/policy copy conditions](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L627-L648).
> - [runtime copies and webhook insertion](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L673-L681).
> - [override environment selection](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/templates/deployment.yaml#L1156-L1157).
>
> - [Prism checksums and pull-secret receiver](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/workloads.yaml#L32-L50).
> - [operator environment receiver](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/templates/_product-decisions.tpl#L16-L27).
> - [Control startup snapshot](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/server/control-config.ts#L63-L72).
> - [operator validation and signing-key load](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/skills/prism/control/product-decisions.ts#L23-L34).
> - [GitOps desired revision and reconciliation settings](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/gitops/templates/applications.yaml#L41-L64).
>
> **Contract or setting:**
>
> - [policy replacement default](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/kubeclaw/values.yaml#L469-L474).
> - [Prism image-policy schema](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L5-L28).
> - [pull-secret list schema](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L94-L109).
> - [operator collection constraints](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L141-L150).
> - [enabled operator minimum](https://github.com/datrab/kubeclaw/blob/ec2a42ed215a2fa7dbd3172ef70ef446084963a9/charts/prism/values.schema.json#L250-L258).
>
> **Test evidence:** On 2026-10-10, isolated Helm 3.22.0 checks asserted the rendered environment, selector, resource map, URL, file payloads, and synthetic Secret reference. See [Configuration precedence](configuration-precedence.md#helm-collection-precedence). Prism schema-negative cases exited one as expected. The init copy rules and startup capture were checked from source, not through a running pod.
>
> **Revision:** `ec2a42ed215a2fa7dbd3172ef70ef446084963a9`
>
> **Limit:** These Helm checks did not execute API admission, Argo CD reconciliation, scheduling, pod replacement, persistent-volume initialization, runtime readiness, credential rotation, or rollback. Follow the affected component's procedure before applying a change.

## Safe change sequence

1. Classify the changed field by its actual consumer and use
   [Configuration precedence](configuration-precedence.md).
2. Preserve the old source, digest, rendered manifest, and required secret
   references. Back up persistent state before a data procedure.
3. Run schema and semantic checks. For project changes, compile to a new path.
   For Helm changes, render before applying.
4. Confirm stop conditions: active effects, waits, worker attempts, unavailable
   capacity, incompatible snapshots, or a missing old credential.
5. Apply through the canonical source. Publish coupled files together.
6. Roll or start the required new run; do not mutate an existing run to make it
   accept a new digest.
7. Verify readiness, effective non-secret values, identities, and one bounded
   operation. Retain evidence that identifies the source revision.

“Restart” does not mean delete retained storage. “New run” does not mean reuse
an old run ID. “Republish” does not mean copy two files sequentially.

## Rollback boundary

Configuration rollback is safe only while the older executable, package,
schema, credential, and state format remain supported. Before rollback, check
whether new work wrote data that the old release cannot read. Nova recovery
uses the original graph and runtime authority; restoring old configuration is
necessary but not sufficient if packages or durable records changed.

For uncertain external effects, inspect effect receipts and run evidence before
retrying. A timeout does not prove that an external operation did not happen.

> **Source evidence — pinned recovery and startup capture**
>
> **Claim:** Nova recovery rejects graph, recorded runtime configuration, and package drift. Coupled project files commit as one generation. Prism Control captures one environment snapshot at composition.
>
> **Implementation:**
>
> - [graph and runtime recovery checks](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L28-L72).
> - [coupled publication commit](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/published-pair.ts#L78-L113).
> - [Control startup snapshot](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/prism/server/control-config.ts#L67-L72).
>
> **Contract or setting:** [run snapshot versions and integrity](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L75-L109)
>
> **Test evidence:** [project graph drift rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/reliability/project-recovery-version.test.mjs#L18-L31); [runtime isolation drift rejection](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/reliability/isolation-session.test.mjs#L101-L114)
>
> **Check status:** On 2026-10-09, Node.js `v24.21.0` ran `node --test tests/verification/reliability/project-recovery-version.test.mjs tests/verification/reliability/isolation-session.test.mjs` against implementation revision `c8987b18b450bc27571d5037cb6ce3fb26e0cbd0`: all 18 tests passed, exit zero. `npm run plugin-system:sandbox:build` built the native sandbox. A temporary PRoot file binding supplied util-linux `flock` 2.42.3 at `/usr/bin/flock`. A checkout without the native binary, or with BusyBox locking, does not meet these test prerequisites. No deployed worker or live migration was exercised.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`
>
> **Limit:** Local checks cannot choose a maintenance window or prove that an external dependency honors a credential overlap period.
