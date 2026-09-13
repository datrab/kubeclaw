# Native worker node accounting — decision required

Status: proposal, not an accepted decision or completed implementation. This is
separate from the approved Core/Buster split, Linux-task units, generous limits,
Buster fixture lifecycle and dedicated delegated areas. Those decisions remain
accepted and do not need confirmation again.

## Concrete unresolved boundary

The current Core implementation accepts an already prepared empty cgroup-v2
root. It neither creates node delegation nor establishes where that root sits
relative to the Kubernetes Pod hierarchy. Prism requires an absolute configured
root and a trusted node identity; its production startup is still the legacy
path. A durable host-level role root is a possible integration, not an already
implemented chart feature.

A host-level root outside the Pod hierarchy does not become part of a Pod's
resource accounting merely because the supervisor runs in that Pod. Kubernetes
schedules against Node Allocatable; keeping a fixed host execution pool requires
an explicit matching capacity arrangement. This matters on the existing shared
host, including Paperless. The repository does not establish its effective
capacity, kubelet configuration or independent host-recovery contract.
See [Node Allocatable](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/).

The alternative is to keep every attempt inside a runtime-delegated subtree of
its own worker container. Domain-controller delegation requires an empty parent;
the supervisor needs its own child. Moving running processes later does not
transfer existing memory charges. See the [kernel cgroup-v2 contract](https://docs.kernel.org/admin-guide/cgroup-v2.html).

## Alternatives to decide

| Choice | Benefit | Cost and implementation consequence |
| --- | --- | --- |
| A: Host-managed role pools with fixed, explicitly reserved capacity | Persistent role scope can outlive a supervisor container; fits the existing durable scope/fixture recovery model | Requires host preparation and a reviewed scheduler-capacity reservation that also protects other host services. Pool capacity cannot be scheduled again to ordinary Pods. No silent kubelet edits. |
| B: Runtime-delegated subtree inside each worker container | Attempt usage stays under that container's aggregate accounting; capacity follows normal worker Pod scheduling | Requires a version-bound container-runtime integration and careful container replacement/drain handling. A static host-path mount cannot stand in for this implementation. |

Recommendation: A for the existing durable role-scope design, **if fixed host
capacity reservation is acceptable**. It need not require a new VM, but available
capacity cannot be assumed. B is preferable if execution must remain entirely
under ordinary Pod resource allocation; it is a materially different deployment
integration. Neither choice authorizes a deployment or host modification during
this remediation task.

## Reviewable implementation contract for A

1. Explicit policy defines aggregate CPU bandwidth, memory, swap and Linux-task
   ceilings per role and the maximum concurrent reservations. Attempt ceilings
   remain generous; admission refuses work whose full reservation cannot fit.
   Worker supervisor/service overhead and other host services have separate
   capacity. Do not multiply eight 8-GiB attempts into assumed available RAM.
2. Host setup creates only the designated role areas and trusted immutable node
   identity. The worker receives only its own area, never the entire host
   hierarchy. Attempt code runs without host delegation privileges.
3. A read-only deployment preflight compares the selected policy with actual
   host limits and the supported scheduler reservation mechanism. Missing or
   contradictory evidence blocks native activation. A Node annotation alone is
   not evidence that Kubernetes has withheld the resources.
4. Role ownership journals remain durable across supervisor replacement; new
   admission waits for recovery of prior scopes and Buster fixtures. Final
   resource observations precede disposal. Node/boot changes retain explicit
   unresolved evidence rather than invent final counters.
5. Versioned image/chart/producer activation is atomic at the configuration
   boundary, with no silent return to legacy sampled accounting. Prism uses
   ordinary per-attempt scopes; only Buster owns retained-fixture readiness and
   terminal cleanup.
6. Local gates use real files, locks, processes, protocol transitions and actual
   chart renders. The prepared final native live gate must verify enforcement,
   aggregate exhaustion, scheduler capacity, supervisor/Pod replacement and
   unchanged capacity for other host workloads on the selected environment.

The requested decision is only whether to implement A's fixed host reservation
or B's Pod-contained runtime delegation. No resource purchase, concrete host
capacity or change to D13/D14 is inferred. This decision blocks production native
activation and affects both Buster and Prism; unrelated completed infrastructure
findings remain valid.
