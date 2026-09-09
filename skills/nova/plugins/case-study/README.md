# Case study protocol

The optional writer produces a Markdown draft with six ordered sections and
explicit `[evidence:ID]` citations. The project ID comes from the pinned pipeline.

The v4 input is exactly `{task, source}`. `source` contains `runId`, the exact
current `journalHead` and `snapshotDigest`, `sourceStageId`, `sourceRevision`, and
qualified `artifacts` references from completed attempts. Migrate authored v3
inputs explicitly: caller `facts`/`evidence`, project labels and target attempt
numbers are no longer an authority source and have no legacy fallback.

Configure `report.evidence.read` through `kubeclaw.pipeline-review:evidence`, with
an explicit `allowedRunIds` grant. Configure its absolute original Nova
`storageRoot`, `orchestratorIssuerId`, and positive `maximumJournalBytes`,
`maximumArtifactBytes` and `maximumBundleBytes`. Its `artifacts.read` dependency
uses the original artifact store with explicit namespace grants. No new store is
created. Source snapshots require `effectAuditVersion: coordinator-mode.v1`,
written by the original Coordinator audit producer. Older mode-ambiguous history
is explicitly unverifiable and is not automatically migrated. Confidential mode
is determined by the Coordinator, not supplied by callers. See `schemas/evidence-config.schema.json` in pipeline-review.

The reader validates the original pinned graph and journal chain, recovers stage
states with the original lifecycle reducer, reconciles durable effects against
lifecycle audit, and resolves selected artifacts by
full producer identity, digest and byte count. Reopened, waiting, incomplete,
stale-head and unresolved-effect sources fail. Completed failed/cancelled runs
can describe their failure. The source revision comes from the selected actual
implementation artifact. Lint and test facts require matching source revision
and known producer types. Unselected artifacts and omitted content classes are
explicit in the embedded, digest-bound source bundle.

`execution` always identifies the active report lease; `reportTarget` identifies
the historical run/head/snapshot/source. Stored artifact identity and bytes remain
bound to execution. `evidenceStatus: verified-source-bundle` describes the
selected records, while `narrativeStatus: draft-not-entailment-verified` describes
the generated prose. Required evidence citations bind references, not the truth
of arbitrary sentences. A passed report stage proves report generation; it does
not replace mandatory tests or authorize publication.

Raw logs, credentials, prompts, registry configuration, effect payloads and
unstructured agent claims are not exported in this bundle. Original private
operator logs and demo credentials are retained under D01/D07; this projection
neither deletes nor changes them. Effect journal completion is checked, but
omitted effect payload blobs are not represented as verified report evidence.

Original tests exercise real Git source runs, Core, authenticated runtime HTTP,
the artifact store, authorized retry and durable replay. The local HTTP responder
is a transport fixture, not a model factuality demonstration. See
`docs/review/remediation/implementation/report-evidence.md` for evidence and limits.
