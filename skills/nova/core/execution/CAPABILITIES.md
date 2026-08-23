# Capability runtime

The v2 capability vocabulary is closed and core-owned. Concrete stage types are
open and plugin-defined, but adding a new privileged operation requires an
explicit core security-contract change.

The machine-readable vocabulary and provider/effect mapping is
[`plugin-system-phase5-capabilities.json`](../../../../../docs/architecture/plugin-system-phase5-capabilities.json).
`capability-vocabulary.ts` defines the allowed operation, resource type, and
closed constraint schema for each capability.

## Resolution

For each enabled registration, startup resolves three distinct sets:

1. **Required** comes only from that registration's inert manifest.
2. **Granted** comes only from operator-owned platform policy and must exactly
   cover the required set without adding unrequested authority.
3. **Available** is the granted set for which one installed, trusted, configured
   adapter provider has been selected.

Provider selection is explicit. Missing, invalid, or ambiguous providers fail
startup. Enabling a registration recursively enables only the adapters needed
for its required capabilities. Stages, observers, and adapters in the same
package never inherit one another's grants.

Adapter dependencies are resolved through capabilities, not private plugin
imports. Cycles fail startup before any adapter is activated.

## Closed constraints

Every grant has exactly the constraint fields defined for its capability:

- state and artifact operations use allowed namespaces;
- runtime dispatch uses allowed agents;
- repository reads use allowed path prefixes;
- Git mutation uses allowed repository/workspace roots;
- waits use allowed signal types and issuer identities;
- operator and transport publication use allowed targets;
- telemetry uses allowed event prefixes;
- secret resolution uses allowed secret names;
- HTTP uses allowed origins;
- command execution uses allowed executables and working roots;
- lint execution uses allowed project IDs, repository roots, and policy roots;
- agent-event access uses allowed event sources.

Unknown fields, missing fields, empty sets, unknown capabilities, invalid
operations, invalid resource types, and out-of-scope resources fail closed.
Artifact reads additionally verify that the requested artifact identity,
namespace, and digest occur together in the adapter-owned catalog.

## Context and revocation

Stage invocations, observer deliveries, and adapter lifecycles receive separate
contexts. Each context is revoked on completion, timeout, cancellation,
activation rollback, shutdown, or ownership loss. Calls started after
revocation fail, and cancellation propagates to downstream adapter work.

Plugins never receive lifecycle mutation, scheduler advancement, canonical
event mutation, or registry mutation authority.

## Audit and confidential operations

Every adapter operation emits requested, accepted, and completed/failed audit
evidence. Durable ordinary effects use receipts and idempotency keys.
Confidential operations are audited with a redacted completion marker while
their returned values are never written to the effect journal, lifecycle
journal, or receipt.

Trusted adapter registrations may also use their adapter-only
`invokeConfidential` context method when a granted downstream operation must
carry a credential-bearing resource, such as a Discord webhook URL. Ordinary
grant and authorization checks still apply, while request and response data
are represented only by redacted audit markers.

Stage and observer module graphs are statically rejected when they import
filesystem, subprocess, network, worker, Redis, or module-loading authority, or
use direct environment/network globals. Only adapter registrations may own
those implementation dependencies.

This is a trusted-source compliance gate, not an isolation boundary for
adversarial JavaScript. Until the isolated runner is completed in Phase 11,
only audited first-party packages may execute in process; restricted and
external packages remain disabled.
