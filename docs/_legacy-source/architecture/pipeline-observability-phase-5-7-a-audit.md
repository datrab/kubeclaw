# Pipeline Observability Phase 5.7-A Audit

Status: complete

## Outcome

The audit started with separate event, result, and evidence paths. The
pipeline-side Phase 5.7 migration now gives these paths shared durable
interfaces. ClawDeck services and production storage drivers remain later
deployment work.

The machine-readable inventory is
`pipeline-observability-phase-5-7-a-inventory.json`.

Each entry contains a source reference. Legacy removal items name the exact
source target, replacement proof, and cutover phase. Stage policies separately
classify safe development work, safety-critical work, and final gates.

## Main findings

- Nova is the only pipeline-decision authority.
- ClawDeck is the accepted observability authority. Its service deployment is
  not part of the pipeline change.
- Worker results and evidence use the embedded durable attempt profile.
- The legacy Buster HTTP job store survives a Nova restart but not reliable Pod
  or node loss.
- Redis is useful for live delivery. It is not the durable result record.
- Local JSONL can remain a diagnostic export. It is not a durable plugin-store
  authority.
- Artifact, plugin-state, wait, and bounded telemetry adapters use the shared
  durable-record interface. Artifact bytes use its content-addressed blob
  interface.
- Direct notifications remain derived outputs. Their request, receipt, and
  failure records are durable and replay-safe. Later ClawDeck ingestion will
  project these records.
- Agent events have rich source data but no common acknowledgement, replay, or
  closure contract.
- Application logs, metrics, and traces do not yet use one pipeline collector.

## Architecture audit

The inventory follows D-096 through D-107:

- Nova keeps scheduling and gate authority.
- Workers own only their current attempt.
- Raw telemetry does not pass through Nova.
- ClawDeck owns completeness and durable observability history.
- Earlier safe work can continue with a visible gap.
- Final authoritative gates require complete observability.

No record class has two accepted future authorities.

## Required migrations

1. Add producer delivery contracts.
2. Add a durable outbox and admission service.
3. Make results and evidence durable before completion acknowledgement.
4. Add Nova reconciliation.
5. Align ClawDeck fixtures and completeness views.
6. Remove the listed legacy authorities only after their replacement proof.

## Pipeline-side cutover

The following active plugin paths are migrated:

1. `artifact-store` no longer uses `catalog.jsonl`.
2. `state-store` no longer uses namespace JSONL files.
3. `wait-store` no longer uses `journalPath` or `waits.jsonl`.
4. `telemetry-store` no longer uses a local JSONL authority.
5. Operator and transport delivery save a durable request before the network
   action. They save a receipt or failure after the action.

The embedded file driver uses atomic replacement, directory synchronization,
cross-process locking, bounded storage, stable stream sequences, content
digests, and idempotency conflict checks. The driver is a pipeline profile. It
is not the final ClawDeck or database implementation.

The following paths are intentionally not removed in this cutover:

- Nova's hash-chained pipeline journal remains its control authority.
- Redis remains a non-authoritative live transport.
- OpenClaw and application telemetry keep their producer interfaces until the
  later ClawDeck ingestion deployment.
- Legacy Buster status and result bridges remain only for unmigrated suites.
  Their removal is tied to the per-suite migration and Phase 7 connection.

## Proof

`check-pipeline-observability-phase-5-7-a.mjs` validates:

- Unique inventory IDs.
- Required ownership fields.
- One future authority for each record.
- Presence of all known current producer classes.
- Presence of active artifact, plugin-state, wait, and direct-notification
  output paths.
- Presence of the required legacy deletion targets.

`check-pipeline-observability-legacy-cutover.mjs` also validates:

- 100 concurrent writes through two embedded driver instances.
- Restart-safe reads and idempotent replay.
- Conflicting identity rejection.
- Content-addressed evidence verification after restart.
- Corruption detection.
- Removal of the old artifact, state, wait, and telemetry JSONL paths.
- Durable notification and transport request, receipt, and failure records.
