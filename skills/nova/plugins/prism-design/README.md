# Prism design stage

This Nova plugin sends an approved architecture input to the standalone Prism
service. It waits for a human approval. It then imports the immutable Prism
Baseline Bundle.

Nova uses the bundle digest when it creates the module plan. Forge receives
read-only design targets. Buster uses the same digest for fidelity tests.

## Authority

The plugin requests these capabilities:

- `runtime.dispatch`
- `artifacts.write`
- `operator.request`
- `signal.wait`

Worker Core remains generic. The plugin does not put Prism types in Worker
Core.

## Result

The result contains the approved Baseline Bundle digest and artifact identity.
The stage rejects an invalid operator identity, approval identity, or digest.
It resumes the same durable Nova run after approval.
