# PR 6 fixed host-pool checkpoint

D16 is accepted. This checkpoint implements aggregate resource reservations and
host-pool preparation/capacity verification. It closes no additional finding:
137/154 remain locally verified and 17 incomplete, including the original four.
No new architecture confirmation is needed for the accepted host reservation.

## Implemented

Core requires a real finite aggregate pool and checks memory, zero swap, Linux
tasks and CPU bandwidth against the host-owned policy. It refuses ordinary
filesystem substitutes. Synchronous full memory/task/slot reservations cover
pending allocation as well as running hosts. Idempotent release follows durable
quiescence and disposal. Unresolved allocation/cleanup fences admission. An
already journal-accepted attempt rejected for capacity produces a durable
never-launched failure and does not permanently fence the worker.

Prism's prepared native supervisor reads its role root, ownership directory,
node-identity path, concurrency and aggregate ceilings from one generated,
root-owned non-writable policy file. Changing per-worker environment variables
cannot enlarge those aggregate settings. Ordinary attempt budgets keep their
existing generous independent units and settings. This is not production V3
startup activation.

A central host policy generates separate role policies, standalone setup,
systemd unit and a kubelet reservation fragment. Setup is restricted to its
actual delegated systemd subtree and selected Node runtime. Existing divergent
pools/identities or unknown children fail before role reconfiguration. It does
not change arbitrary host groups, install kubelet settings or delete old scopes.
The real deployment CLI exposes bundle generation and read-only host preflight.

The preflight compares actual Node name/UID/machine/boot, kubelet configz,
CPU/memory Allocatable, required daemon/worker reservations and finite aggregate
Pod task limits against kernel PID/thread capacity. It checks installed policy
binding and both real role roots and rejects facts that change during checking.
The snapshot is not an authorization for later unfenced host configuration drift.
The initial systemd hierarchy is explicit; unsupported custom kubelet roots fail.

## Local evidence

22 focused tests pass: three admission-capacity invariant cases, nine real
filesystem/ownership/flock/process cases, six real journal cases and four host
policy cases. The host cases run the actual deployment CLI, filesystem policy
reader and systemd 255 unit parser. Quantity/Node/kubelet vectors are explicitly
protocol-contract tests, not a substituted Kubernetes API or live cluster.
There are no mocked services and no skipped tests in that run.

The prepared native gate also passes a dedicated TypeScript check using Core's
strict optional-property policy. That exposed an existing Prism render call
which explicitly supplied an undefined optional field; the call now omits the
field when absent, without weakening the type configuration. Nine original
Prism renderer/Engine/Studio cases additionally pass.

Core/Prism typechecks, canonical lint, shell syntax and all 27 generated-version
checks pass. Initial lint diagnostics are preserved; functions were split without
loosening the canonical policy. Earlier incremental test logs remain historical
and are not additional unique cases. Raw logs: docs/review/evidence/pr6-node-pools/.

The native live test now binds actual aggregate limits through an explicit pool
policy file, exhausts a real reservation before owner creation, proves reuse
after drain and checks durable capacity-failure receipt replay without fencing.
It retains the original real launcher/accounting/recovery cases. This positive
kernel test has not run in the read-only local cgroup environment. It is prepared
for the operator's final native acceptance, not represented as passed.

## Remaining implementation

Production image/launcher, container-runtime cgroup-namespace and role-only mount
integration, V3 producer/startup activation, Buster whole-host capability ownership,
retained-fixture lifecycle/admission headroom and complete cross-store retirement
remain open. The host preflight is not yet an end-to-end production activation
proof. In particular a writable host-path mount alone cannot establish the
runtime migration/delegation boundary. The next work continues these integrations
under D16 without another choice between host and Pod accounting.

Operations and final live acceptance: docs/operations/native-worker-host-pools.md.
