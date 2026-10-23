# Bound stage views: concrete current seams and partial C5 proposal

**Unaccepted C0 definition proposal, not implementation.** This extends the
[carrier constraints](NOVA-MODULE-CARRIER-PROPOSAL-20261013.md), without changing
their independently reviewed historical bytes or choosing an unreviewed new
SDK/snapshot version. Complete owner field partitions and quotas remain open.

## Current seams that the target must use or explicitly migrate

`activateRegistry` loads trusted stage registration exports and stores an execute
function. `StageExecutor.execute` selects that already-activated function by the
original stage type, then calls it with `definition.input` and a fresh invocation
context whose `config` is **definition.config**. This supports preserving original
R code/package/grants while projecting M configuration into the invocation; it
does not itself implement that projection or prove every plugin reads the context.
External registrations follow the existing isolated invocation path instead.

`prepareRuntime` validates all current stage configs and creates the original
registry/grants/activated set. Adapter configs come separately from the platform
adapter map; observer configuration is likewise separate. Replacing every global
adapter/observer config per stage is not module selection and cannot turn R/S/H
dependencies into M knobs. Per-invocation model/task policy must have a supported
real reader within original transport/grant constraints.

Current `pipeline-definition.v2` requires config, input and execution on every
stage. The graph snapshot pins all three. **Names do not determine class:** config
can contain protocol selectors, input can embed operator settings (for example
demo retention and provider-plan policy), and execution includes operator limits
plus task/remediation relationships. No blanket “config = operator/input = task”
partition can satisfy C0.

## Proposed generated view, not a second editable author

For a stage belonging to an accepted module, propose one immutable generated
effective view with required run-foundation digest, membership digest, original
module-binding digest, stage ID/type, original package/registration provenance,
and complete effective **config, input and execution** objects. Task graph and
component profiles remain sole authors of their respective classified fields.
The view is a projection linked to those immutable originals, never an editable
profile, SDK codec selector or a current-global settings merge.

The producer must use a reviewed exhaustive field partition table: each concrete
leaf/pattern has class, original task/operator owner, supported reader and scope,
schema/semantic rule, and original binding dependency. Every required consumer
field has exactly one source. Unclassified/conflicting fields, missing original
references or missing required values reject before acceptance; code/schema/ENV
defaults cannot complete the view. Protocol/version/generated fields retain their
actual typed contracts; matching numeric values do not infer a shared owner.

The same original bound view must reach **all** relevant consumers. Context config
alone is insufficient: PipelineLoop checks execution budgets; StageExecutor uses
execution timeout for invocation/lease deadlines and context stageLifecycle;
reducers/repair recovery use the execution policy again. All must resolve the
same module original when operating on its stages, rather than some reading a
new view while others read old copied graph values. Original accumulated counters,
claims, deadlines, repair relationships and uncertain effects remain retained.
Budget changes for a genuinely unstarted module require exact compatibility with
original R ceilings, not re-creation of consumed allowances.

Use the original activated stage function where its real reader is invocation
context/config/input. Do not reload code or import a newly published package just
because M settings changed. A reader that captures values at activation/process
start requires a separately justified scope/bridge, not generic hot reload.
Any public SDK/context/lease/observer/isolated-worker envelope change needs an
explicit versioned compatibility migration and exact pre-effect validation. No
new public field is assumed accepted by the current v2 contracts.

## Concrete remaining definition work

- Per-owner/per-registration field partitions, correlated complete profiles and
  strict generated-view/event schemas, including settings embedded in inputs.
- Exactly versioned task-only graph/snapshot representation and legacy original
  replay, not mutating existing full copied snapshots in place.
- Original module lookup and all graph/execution/context/lease/reducer/observer/
  isolated-worker view readers, with one durable pre-action acceptance boundary.
- Real manifest/grant/secret/store/accounting compatibility, including original
  cleanup and role/transport bindings. RT-CORE-LEASE-MEMORY is an existing Runtime
  policy row, not a new duplicate WorkerCore author or a physical quota proof.
- Complete future A-started/B-next, retry/repair/recovery, lost ownership, crash,
  skipped stage, schema/package incompatibility and fixed-Eval inputs/oracles.
- Independent definition review. This proposal supplies no runtime PASS or global
  acceptance and does not waive any currently open carrier/field obligation.
