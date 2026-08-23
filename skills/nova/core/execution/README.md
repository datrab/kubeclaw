# Execution ownership

Generic graph scheduling, attempts, leases, budgets, cancellation, and
concurrency only.

Capability grants, adapter selection, resource constraints, revocation, and
auditing are documented in [CAPABILITIES.md](CAPABILITIES.md).

At run creation, core validates and freezes:

- all configured nodes and their plugin-defined stage types;
- ordinary dependency edges, including fan-out and fan-in;
- declared remediation edges;
- stage configuration, input, attempt/remediation budgets, and timeouts;
- maximum run concurrency.

The canonical graph is sorted and digest-pinned in `graph-snapshot.json`.
`registry-snapshot.json` records the same digest with the frozen stage owners.
Resume fails closed when either package provenance or graph identity differs.

Scheduling is registration-driven. This directory contains no Forge, Buster,
gate, validator, generator, or fixed-stage dispatch table.
