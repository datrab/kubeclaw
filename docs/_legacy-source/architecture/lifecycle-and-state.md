# Lifecycle And State

Only v2 core owns lifecycle truth. Stages return validated typed results; the
reducer in `skills/nova/core/lifecycle/reducer.ts` maps them to
canonical transitions.

Durable state is split by responsibility:

- lifecycle and recovery journals;
- effect requests, receipts, locks, and fencing;
- wait requests and resume signals;
- registration-bound plugin state;
- observer deliveries and checkpoints;
- content-addressed artifacts and telemetry.

Recovery verifies the exact frozen graph and package snapshot before replay.
Ambiguous external effects fail closed until an operator reconciles a provider
receipt.
