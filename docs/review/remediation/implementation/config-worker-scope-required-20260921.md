# Worker Core: explicit active-scope capacity

This bounded D17 change removes the hidden `128` fallback from
`NativeWorkerOwnership`. It does not complete Worker Core configuration,
CONFIG, or native host acceptance. Before-source snapshots are retained in
[the evidence directory](../../evidence/config-worker-scope-required-20260921/before.json).

Acceptance criteria recorded before implementation:

1. `maximumActiveScopes` is a required typed option. Missing, noninteger,
   nonpositive or unsafe values fail before filesystem or supervisor admission.
2. The resource pool receives the explicit value without a fallback. Both
   production compositions retain the value from the trusted host-pool policy:
   Prism `nativePrismSupervisorConfig` and Buster `preparation-supervisor`.
   This change must not create another service-side capacity authority.
3. Existing assertions remain intact. Native test profiles explicitly author
   their former 128-scope setting. The ordinary-directory negative continues
   reaching the real filesystem rejection. New invalid-input tests preserve
   stored ownership and never admit work; restoring the old bypass must fail.
4. Worker types, affected native-test types and maintained ownership tests
   pass. Actual native execution remains separately unexecuted for this change;
   an ordinary-directory fixture cannot demonstrate kernel capacity enforcement.
5. Operating documentation explains the required host-policy setting and
   absence of a code default. A fresh nonauthor review is required.

Other concrete Worker Core defaults remain open: `LocalWorkerRuntime` has
drain/cancellation/replay fallbacks of 300000 ms, 30000 ms and 65536 IDs. Buster's
runner constructs that runtime without these settings. Those values require
a separate complete author-to-consumer migration; they are not covered here.

## Implementation and author checks

The option is now required; the constructor forwards it unchanged and startup
validation no longer exempts `undefined`. The two production consumers already
provide the trusted pool value and required no edit. Three supervisor test
profiles and one modeled ownership-lease profile now explicitly supply 128.
Existing assertions were preserved. The new maintained ownership test rejects
nine missing/invalid inputs before even resolving an absent cgroup path and
checks unchanged durable ownership bytes and no admitted operation.

[Corrected author results](../../evidence/config-worker-scope-required-20260921/corrected-results.json):
10/10 ownership tests and 3/3 modeled quiescence tests pass; Worker Core types
and native-test types pass. The old fallback plus optional validation bypass
is restored only through a private module hook: the new test fails with an
assertion because startup reaches filesystem access instead of rejecting the
missing capacity. This is a validation-order regression proof, not native
capacity enforcement or a running cgroup test.

Two initial failures are retained. The first ownership run used the host's
BusyBox `flock`, which does not support the required timeout option; all ten
cases failed. The rerun uses the existing bound util-linux tool under `proot`,
without changing production code or replacing the kernel lock with a mock.
The initial native-test typecheck found the indirect ownership-lease fixture
also needed the explicit option; its original assertions remain unchanged.

The [host-pool operating guide](../../../operations/native-worker-host-pools.md)
now states the requirement. The initial test identity files describe that initial
run only, not a full transitive final acceptance binding.

## Independent acceptance

The [fresh nonauthor review](independent-config-worker-scope-required-20260921.md)
accepts this bounded change. It found that the maintained native-test type
configuration initially omitted the ownership module and that its initial
source binding omitted part of the actual import closure. The test type
configuration now includes the ownership module without removing other tests.
The final independent run passes all ten ownership cases, three modeled
quiescence cases, 18 input counterprobes and the expanded typecheck, with 889
source/dependency/config identities bound before and after and no drift.
Scoped lint and the old-fallback negative control also pass their intended
oracles. Historical failures and the superseded binding are retained.

No native fixture execution or complete Worker Core/D17 acceptance is claimed.
