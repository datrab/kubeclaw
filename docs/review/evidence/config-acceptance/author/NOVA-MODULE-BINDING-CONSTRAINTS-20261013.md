# Nova module binding: source constraints and unresolved target carrier

**Not an accepted universal binding/grant/cleanup contract.** This document records
the consequences of the [primary-source map](nova-current-binding-seam-map-20261013.json)
for D20/D21. No production code, SDK contract, lifecycle event or new config index
has been implemented. These unresolved contracts cannot be supplied to another
owner as an independently accepted alias merely by assigning an ID.

## Existing bindings must be preserved

`writeRunSnapshots` already publishes a no-replace, fsynced `run-snapshot.v4` with
the whole graph and registry. The graph includes full StageDefinition configs,
input and execution policy, not only dependencies. Recovery checks the original
configuration, package identities and graph digest. Explicit administrative
decisions/package upgrades are distinct from ordinary profile publication.
SDK runtime dispatch/review cache profiles and historical snapshot encodings are
protocol identities, not tuning selectors. A target must neither mutate that old
graph in place nor claim current binding is universally absent.

Current `prepareRuntime` activates registry packages before the run lock and
before recovery checks the original snapshot. Therefore the target original
generation must be resolved and its foundations/delivery verified before any
incompatible activation, not merely checked afterward. Source inspection alone
does not prove which package activations currently perform external effects.

## First business-module acceptance, not every stage/retry

The compiler emits implementation, lint, optional review and test stages for one
logical module. The loop persists `stage.started` before flushing observers and
calling the executor. That event is per stage/attempt and carries no current typed
module generation closure. Do not infer module membership only from stage-name
prefixes or treat every repair/retry/test stage as a new module start.

A concrete target must define a compiler-generated immutable membership record
linking each exact module/gate to its exact member stages and original task intent,
tied to the graph. It must define one original binding **before the first stage
start/observer flush or other business action of that group**. A crash after
binding but before the first stage event must still retain that binding; later
lint/review/tests, repairs, retries, cleanup and reconciliation cannot select B.
Actual carrier/schema/hash/transaction boundaries remain to be completed.

## D20 dynamic selection without changing foundations

Before a not-yet-started module, resolve one newly published complete owner
generation from the sole system entry. Settings stay at their component authors;
the entry is not a second copy. Validate owner, instance, profile, schema, delivery,
real consumer scopes and compatibility with the run's original graph/permissions
and actual runtime instance before accepting work. Incompatible new selection
rejects explicitly; it does not silently fall back to A, regrant permissions or
repurpose an SDK codec/profile field.

Graph task intent, grants and recovery foundations remain original; field-specific
M/J/R/S/H scope matters. R/S/H policy changes cannot become arbitrary M tuning.
Fixed Eval resolves a specified immutable generation, not the current publication.
New selection never resets consumed budgets, clears uncertain outcomes, invents an
administrative override or changes recorded historical acceptance.

The current graph pins copied operator values alongside task input. A target must
**explicitly** justify the new task/operator separation and graph/snapshot carrier
evolution, with exact schema/producers/readers and legacy rules. Merely placing a
profile reference in a file does not resolve this incompatibility. No snapshot
version is selected or silently reinterpreted by this constraints document.

## Original cleanup and grants

Every actual worker/provider/adapter must join its accepted task/plan/attempt to
the original module binding plus its R/S/H dependencies and actual grant/store
references. Original claim, deadlines, resource/retry budgets, input/output/store
ownership and uncertain effects remain retained. Cleanup uses original references
and constraints, not latest B. Secret references/revisions belong in the binding;
secret values do not. A declared hash or synthetic fixture is not installed code,
an authentic grant, a physical quota or a deployed role.

Missing historical closure cannot acquire a new profile/default. Completed
historical result replay authorizes no new business action. Pending or uncertain
legacy work requires its original compatible runtime or explicit reconciliation;
the exact safe migration/drain behavior must be specified, not waived. A completed
or partly consumed module cannot be restarted as "unstarted" by publication.

## Still required before this can close C0

- Exact physical generated carrier, schema, membership/source producer and atomic
  first acceptance/lookup/hash rules, using existing run state where suitable.
- Complete correlated owner profiles and field applicability/compatibility maps;
  current copied graph values versus future task-only/reference representation.
- Explicit captured foundations, runtime/delivery/role/grant/secret-reference and
  store/quota dependencies, including original cleanup and legitimate administrative
  rules, without a second editable author or a large config-server mechanism.
- Concrete same-run A-started/B-next-unstarted, first-bind crash, incompatible-R,
  stage/repair/retry/recheck, uncertainty, cleanup, legacy missing closure, fixed Eval
  and existing snapshot-version cases with exact inputs and durable oracles.
- Fresh independent definition review. No future runtime implementation or real
  physical fixture execution is claimed by these source constraints.
