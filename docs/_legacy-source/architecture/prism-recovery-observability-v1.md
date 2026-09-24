# Prism Recovery and Observability v1

Status: accepted architecture contract

## Decision

Prism reuses platform recovery and observability. It adds only the backup, restore,
health, and telemetry rules for Prism-owned data and services.

```text
daily PostgreSQL backup
+ versioned artifact storage
+ weekly restore proof
+ quarterly complete recovery proof
+ rebuildable derived data
+ existing worker-core and ClawDeck systems
```

Prism does not create a backup service, telemetry database, worker recovery system,
or second observability platform.

## Data classes

### Canonical data

Prism must protect:

- projects and brief revisions;
- Design Document revisions;
- published baseline records;
- corpus records and rights policies;
- preference events;
- idempotency records;
- published Baseline Bundles;
- approved assets;
- permitted corpus source content;
- required provenance and approval evidence.

PostgreSQL stores canonical records. The artifact store holds content-addressed large
objects.

### Rebuildable data

Prism does not require separate backups for embeddings, search indexes, preference
profiles, thumbnails, rendered previews, evaluation reports, or caches. Prism
rebuilds this data from canonical records and permitted artifacts.

### Temporary data

Worker temporary files, quarantine files, browser state, Studio sessions, preview
messages, and process caches expire after their task or configured retention time.

## PostgreSQL backup

V1 creates one daily backup of the dedicated Prism database. The backup records the
database, schema migration, PostgreSQL, and required extension versions. Backups are
encrypted, digest-verified, and retained by deployment policy.

V1 does not require continuous WAL archiving. Add point-in-time recovery when the
accepted data-loss limit becomes shorter than one day. This is an operations-policy
change and does not change Prism contracts.

## Artifact protection

The artifact store uses content digests and object versioning or an equivalent
immutable retention mechanism. Required objects are encrypted and protected by
retention policy.

After restore, Prism verifies each required object against the digest stored in
PostgreSQL or the Baseline Bundle.

## Restore proof

A backup is valid only after Prism proves that it can restore and use it.

The weekly automatic test:

1. restores the latest backup into a temporary database;
2. opens one project;
3. loads one Design Document revision;
4. opens one published Baseline Bundle;
5. verifies required artifact digests;
6. reports success or failure;
7. deletes the temporary restore environment.

The quarterly complete test also rebuilds one embedding and search entry, recreates
one derived preference profile, renders one preview, and saves a new test revision.

A major PostgreSQL or extension upgrade requires a successful restore test before
production migration.

## Recovery order

```text
1. restore PostgreSQL
2. restore or reconnect the artifact store
3. verify published bundles and required digests
4. start Prism control in recovery mode
5. rebuild embeddings and indexes
6. rebuild profiles, reports, and previews
7. enable writes
8. resume workers and ingestion
```

Published baselines and Design Document history have priority over corpus search.
Prism can operate with reduced retrieval while derived data rebuilds.

## Service recovery

- Prism control reloads durable state from PostgreSQL and worker-core after restart.
- Studio is stateless and reloads the selected project and revision.
- Workers are stateless. Worker-core owns retry, cancellation, receipt, and attempt
  recovery.
- PostgreSQL uses persistent storage, readiness checks, controlled migrations, and
  tested restore procedures.
- Artifact uploads are content-addressed. A retry can reuse a verified existing
  object.

## Recovery targets

V1 does not lock fixed recovery-point or recovery-time targets in the architecture.
The Helm operations policy declares them for each deployment.

The first deployment must state:

- accepted maximum data loss;
- accepted maximum recovery time;
- backup retention;
- restore-test schedule;
- the trigger for enabling WAL archiving or stronger artifact replication.

## Observability

Prism uses the existing ClawDeck and OpenTelemetry architecture. Generic worker
attempts, evidence, retries, receipts, and pipeline reconciliation remain in the
existing platform systems.

Prism emits bounded domain facts for:

- control, Studio, worker, PostgreSQL, artifact, queue, and renderer health;
- generation, render, evaluation, and publication duration and failures;
- revision conflicts and invalid document operations;
- ingestion, quarantine, expiry, deletion, and embedding backlog;
- corpus size, coverage, retrieval time, and result count;
- Studio save failures, preview crashes, and operation conflicts;
- backup, restore, and digest-verification results.

Telemetry uses internal IDs, digests, counts, durations, and error codes. It must not
contain credentials, private design content, source content, prompts, or provider
responses.

## Initial alerts

V1 alerts only for conditions that require operator action:

- PostgreSQL backup failure;
- restore-proof failure;
- PostgreSQL or artifact-store outage;
- missing or corrupt published-bundle artifact;
- worker queue that stops progressing;
- missed rights-expiry or deletion deadline;
- sustained renderer failure rate;
- low storage capacity.

An individual rejected design, failed quality check, or user edit is not an
operational alert.

## Degraded operation

- If embeddings are unavailable, Prism uses text search.
- If an external provider is unavailable, Prism uses the local corpus.
- If the renderer is unavailable, Studio shows the last valid preview as stale.
- If workers are unavailable, users can inspect existing projects and previews.
- If Studio is unavailable, Prism control and workers continue.
- If ClawDeck is unavailable, producers keep bounded durable delivery state and mark
  observability incomplete.

Publication stops when required evidence, storage, approval, or authoritative
observability is incomplete.

## Customization

One versioned operations policy configures backup schedule, retention, recovery
targets, restore-test schedule, alert thresholds, data expiry, and rebuild order.

Projects cannot weaken platform backup, rights, audit, or required observability
policy.

## Acceptance checks

Point 12 is implemented only when tests prove that:

1. a daily backup is created and digest-verified;
2. the weekly restore test can open real canonical Prism records;
3. the quarterly test can rebuild derived data and render a preview;
4. missing or corrupt required artifacts are detected;
5. Prism can start with degraded retrieval while derived data rebuilds;
6. worker recovery remains owned by worker-core;
7. telemetry reaches the existing observability path without private content;
8. authoritative publication stops when required observability is incomplete;
9. alerts cover the accepted operator-action conditions;
10. WAL archiving can be enabled later without changing Prism domain contracts.
