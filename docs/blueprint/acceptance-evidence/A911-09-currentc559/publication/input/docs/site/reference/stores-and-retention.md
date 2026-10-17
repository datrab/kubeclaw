# Stores, Paths, and Retention

Status: bounded reference; discovery and recovery limits stated below
Audience: operator, developer, plugin author, maintainer
Owner: documentation; named contract and store components own behavior
Evidence: [skills/nova/core/execution/run-root.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/execution/run-root.ts); [skills/nova/core/effects/journal.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/nova/core/effects/journal.ts); [skills/common/plugin-runtime/foundation/observability/durable-records.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/common/plugin-runtime/foundation/observability/durable-records.ts); [skills/buster/engine/test-gates/remote-plan-service.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/buster/engine/test-gates/remote-plan-service.ts); [skills/prism/storage/artifacts.ts](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/skills/prism/storage/artifacts.ts); [charts/prism/files/prism-backup.sh](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/charts/prism/files/prism-backup.sh); [docs/site/use/recovery.md](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/docs/site/use/recovery.md)
Applies to: the named store/path/deployment selections and explicit retention/recovery limits below
Last verified: 2026-10-15; current source behavior checked; no migration, backup or recovery executed

## Choose the authority before freeing space

A store holds data for a named consumer. **Authority** is the retained data
needed to decide or recover an operation. A **projection** is a derived view.
A **cache** is an optimization only where its owner establishes rebuildability.
A file called temporary, spool or cache can still contain irreplaceable output
or unresolved ownership; its name is not deletion permission.

1. Identify the configured root, actual deployment/mount and writer/reader.
2. Select the complete consistency group, not one convenient journal or database.
3. Distinguish capacity, retention, expiry, compaction and domain-authorized retirement.
4. Before backup, restore or cleanup, follow the existing owner's procedure
   and writer fence. Stop if original identity, quiescence or the recovery path is unknown.

A consistency group is the data that must represent one compatible point.
Quiescence means the owning work has stopped, not only that a timeout expired.
Use [Recovery](../use/recovery.md#state-inventory) for the canonical state/owner
selector and [Define a Backup Set](../use/recovery.md#define-a-backup-set) for
credentials, independent destination, schedule, retention, loss/time targets
and restore proof. This reference explains boundaries; it does not introduce
a competing backup workflow or claim that the procedures have run.

## Paths are formulas tied to an actual configuration

`storageRoot`, adapter roots, Buster roots, `ARTIFACT_ROOT` and host roots below
are separate inputs. Obtain them from the exact owning configuration and
selected deployment. Do not assume they share one directory or volume.
A content-addressed path uses the content hash as its key; `HH` below is the
first two hexadecimal characters, and `rest` is the remaining hash.

| Store / configured path formula | Owner, writer and reader | Authority and consistency group | Loss / cleanup boundary |
| --- | --- | --- | --- |
| Nova `storageRoot/runs/v2-<SHA256(runId UTF-8)>` | Nova run creation/execution/recovery; original run readers | Events, effects, snapshots, observer checkpoints/deliveries, effect result blobs and related adapter roots | Do not restore one journal alone. A legacy `runs/<runId with : replaced by _>` is selected only after existing event-file/run identity checks |
| Run `effects.jsonl` plus `effect-results/sha256/HH/rest.json` | Effect coordinator/journal writes and replays requests/receipts | Large serialized results are referenced from completion records | Journal without referenced result bytes is incomplete recovery authority; no global age/byte retirement policy established here |
| `storageRoot/resource-locks/locks.jsonl`, `metadata.guard`, `<resourceKey>.active/{owner,claim}.json` | Resource lock manager; lease/fence and recovery consumers | Shared ownership and accepted-effect context can outlive a simple file observation | Lease TTL governs ownership time, not history deletion or proof external work stopped |
| Adapter `<root>/records/store.json`; blobs `<root>/blobs/sha256/HH/rest` | Selected state/wait/telemetry/artifact adapter and Foundation store | Metadata, idempotency/replay headers and referenced blobs under the actual domain owner | Keep separate configured roots and payload dependencies. Explicit retirement is not blanket blob garbage collection |
| Buster configured `stateRoot` records and `stateRoot/results/blobs/...`; separate `runtimeRoot` | Remote-plan service, runner, result/evidence and retained-source readers | Accepted jobs, source archives/bindings, result blobs, runtime evidence and receipts | Back up the matched group. A completed status alone does not prove every attempt/cleanup/evidence source is disposable |
| Worker `<ownershipRoot>/owners.json`, `supervisor/lifetime`; caller-selected spool `<root>/{stdout,stderr}` | Bound native supervisor/host owner and original result readers | Host/boot/claim identity and process output/receipts | No generic delete-on-restart or tmp cleanup. Preserve host binding, active ownership and validated output |
| Prism selected PostgreSQL `prism` schema plus `ARTIFACT_ROOT/HH/<fullhash>` | Prism SQL/application and immutable artifact store | Database rows reference immutable artifacts; one matched group with role/key authority | DB-only restoration can lose referenced objects; artifact-only integrity is not application recovery |
| `prism.worker_request_nonce`; separate RAM engine cache | Nonce replay protection vs `EngineExecutionCache` optimization | Nonce table is persistent security state; RAM cache is not durable Control request/result authority | Expiry index alone does not prove a cleanup job. Cache restart loses entries, not permission to replay an uncertain durable operation |
| Redis stream/dedup keys and receiver-selected persistence | Selected transport and downstream receiver | Stream data, dedup window, RDB/AOF files and physical volume are separate dimensions | RDB is a snapshot format; AOF is an append-only persistence file. Migration preparation is not client cutover or complete recovery |
| Backup root `backup-*` and `.incomplete-*` groups | Named backup owner and original restore/application consumers | DB dump, artifact set/index, metadata and checksums, plus external credentials/keys | Keep incomplete failures and previous completed media; no automatic age-prune policy inferred |

**Source — Nova path selection, related journals and externalized effect results:**
[runRoot hash and verified legacy selection](../../../skills/nova/core/execution/run-root.ts#L62-L76) (`skills/nova/core/execution/run-root.ts:62–76`, current-checkout SHA-256 `38ac1d4f579cbda7db66487edc274619e79d212f03e7f5a193a7c8a7168907b3`). [effect, resource-lock and observer store construction](../../../skills/nova/core/execution/engine-runtime.ts#L74-L97) (`skills/nova/core/execution/engine-runtime.ts:74–97`, current-checkout SHA-256 `de279faaeffc78713d3b3049d43a2efb9add45e4ad05a89c0f4efde1dbe120ec`). [effect result root and replay](../../../skills/nova/core/effects/journal.ts#L84-L112) (`skills/nova/core/effects/journal.ts:84–112`, current-checkout SHA-256 `1ab8839b77c51008973975a324d675af129e8aa45152ae0fde97c954d5af3b95`). [completion reference and exact result path](../../../skills/nova/core/effects/journal.ts#L148-L175) (`skills/nova/core/effects/journal.ts:148–175`, current-checkout SHA-256 `1ab8839b77c51008973975a324d675af129e8aa45152ae0fde97c954d5af3b95`). [resource lock root and owner/claim paths](../../../skills/nova/core/effects/locks.ts#L42-L79) (`skills/nova/core/effects/locks.ts:42–79`, current-checkout SHA-256 `7ca675286800ee88314919f7c0d524c7b5cde99928b9e93c8036e566ecc4b793`).

**Source — adapter/Buster/Worker/Prism path owners:**
[record root and serial writer fence](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L44-L73) (`skills/common/plugin-runtime/foundation/observability/durable-records.ts:44–73`, current-checkout SHA-256 `c9a0c42b8cdd3a2f188ec38a3cab5270d0f032444801626ea2c6860e534582dd`). [blob root and per-object/total limit ownership](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L230-L266) (`skills/common/plugin-runtime/foundation/observability/durable-records.ts:230–266`, current-checkout SHA-256 `c9a0c42b8cdd3a2f188ec38a3cab5270d0f032444801626ea2c6860e534582dd`). [separate stateRoot/runtimeRoot and selected budgets](../../../skills/buster/engine/test-gates/production.ts#L212-L235) (`skills/buster/engine/test-gates/production.ts:212–235`, current-checkout SHA-256 `79c47d55e525f5ebb5e7e05a9c52e18514f9e464401c51e7def38dcec7f646a3`). [job admission, record and result stores](../../../skills/buster/engine/test-gates/remote-plan-service.ts#L71-L86) (`skills/buster/engine/test-gates/remote-plan-service.ts:71–86`, current-checkout SHA-256 `3be9e75c8619da96c22bfaabd7fbab548bc07085787d092a83ba1f20130434f9`). [host ownership file and supervisor lifetime fence](../../../skills/worker/core/worker/ownership-store.ts#L60-L95) (`skills/worker/core/worker/ownership-store.ts:60–95`, current-checkout SHA-256 `d784b4196a6103a0ad1e1eaa086640d89ea3205db74be0b0d569045183d20b79`). [exclusive private output files and shared byte bound](../../../skills/worker/core/worker/native-output-spool.ts#L27-L67) (`skills/worker/core/worker/native-output-spool.ts:27–67`, current-checkout SHA-256 `da9b2bdd9f5b8f9418e98a451eb3275aadec117a9ee7ca733566e571870898c7`). [immutable content-addressed object publication and get](../../../skills/prism/storage/artifacts.ts#L36-L68) (`skills/prism/storage/artifacts.ts:36–68`, current-checkout SHA-256 `8177fe9d5199d1af866a2ad7d5d7fdfa82b99b0fe6df5b7f0c3c04e96536ef1f`).

## Capacity is not one universal byte limit

| Actual route | Quota / full behavior | Retention consequence |
| --- | --- | --- |
| Durable record store | Positive configured record count, per-record bytes and total metadata bytes; actual store checks own admission | More disk is not permission to discard replay identity. Keep the owner's supported full-store response |
| Artifact adapter | Default object maximum 16 MiB, record count 100,000 and metadata maximum 256 MiB; separate blob-total maximum 256 MiB; metadata per record 64 KiB | These are separate limits, not a combined 256 MiB promise. Metadata is admitted before blob completion; an idempotent retry can finish a missing content-addressed write |
| State / wait / telemetry adapters | Each reads its own configured record/byte limits from its actual root | One adapter's defaults/retirement applicability do not apply to another root or owner |
| Buster | Selected record/archive/result/result-store/extracted-byte and active-job limits | Result liability and retained source/evidence can block new admission; no generic completed-job deletion rule |
| Native ownership / output spool | Ownership count/byte limits and one combined stdout/stderr byte limit | Spool rejects overflow; accepted writes synchronize. Active process/output authority must not be silently rotated or deleted |
| Prism RAM cache | Defaults 4 in flight, 32 completed entries, 16 MiB completed data; own bounded eviction | Only an optimization; restart/eviction is not durable operation cancellation or terminal proof |
| Redis | Approximate stream `MAXLEN`, separate dedup-key PX time-to-live (TTL), selected volume capacity and persistence policy | Stream trimming, dedup expiry and filesystem fullness have different loss/repeat effects; TTL is not canonical journal retirement |
| Backup media | Per-group/stage allowance plus retained-media capacity | Capacity rejection can leave an incomplete group for diagnosis. A schedule is not evidence of successful backup or pruning |

**Source — actual artifact budgets and ordered metadata/blob write:**
[artifact metadata admission and blob completion](../../../skills/common/plugins/artifact-store/src/adapter.ts#L130-L177) (`skills/common/plugins/artifact-store/src/adapter.ts:130–177`, current-checkout SHA-256 `12fa6150089d49da0a9065de560fb53436dc46e3f10f15da0f3fe8b112a50154`). [state adapter budget selection](../../../skills/common/plugins/state-store/src/adapter.ts#L25-L51) (`skills/common/plugins/state-store/src/adapter.ts:25–51`, current-checkout SHA-256 `1805e68a4d478af60df925fb6c38204344d53e17a8134fafdd47732263c473c7`). [wait adapter budget selection](../../../skills/common/plugins/wait-store/src/adapter.ts#L188-L204) (`skills/common/plugins/wait-store/src/adapter.ts:188–204`, current-checkout SHA-256 `b55d76d4913c0c6f4074af43615046365ba226dfb51189fd26fa6d486753b92d`). [telemetry adapter budget selection](../../../skills/common/plugins/telemetry-store/src/adapter.ts#L5-L40) (`skills/common/plugins/telemetry-store/src/adapter.ts:5–40`, current-checkout SHA-256 `f5a3ff64dce028471c800e9a5da01bcc3a405f26b1e68ccdd8e78cd54e00fb13`).

**Source — RAM optimization versus nonce persistence and Redis policy:**
[engine RAM cache default limits and purpose](../../../skills/prism/engine/execution-cache.ts#L1-L24) (`skills/prism/engine/execution-cache.ts:1–24`, current-checkout SHA-256 `13c9664a99457aadcb2de822dc82a63764d3afe799fd37a2ab1bedb097ccf90a`). [bounded completed-entry eviction](../../../skills/prism/engine/execution-cache.ts#L69-L82) (`skills/prism/engine/execution-cache.ts:69–82`, current-checkout SHA-256 `13c9664a99457aadcb2de822dc82a63764d3afe799fd37a2ab1bedb097ccf90a`). [nonce expiry column/index declaration only](../../../skills/prism/storage/migrations/003_worker_nonce.sql#L1-L9) (`skills/prism/storage/migrations/003_worker_nonce.sql:1–9`, current-checkout SHA-256 `55af2848fecbd3d99fbe819a2eb2d0f3bc155efbb5b1b483765121a4c1c40768`). [Redis stream trimming and separate dedup expiry](../../../skills/common/plugins/redis-transport/src/adapter.ts#L14-L46) (`skills/common/plugins/redis-transport/src/adapter.ts:14–46`, current-checkout SHA-256 `15c91e7eed9a98784d6fbdcb931160202295ea6ef20b1c18367bcd9eaab4cc01`).

## Distinguish retirement from arbitrary cleanup

The Foundation's explicit durable-record retirement API rechecks the exact
selected v2 records, owner and payload digest under the real store writer
fence, and calls the domain authorizer there. It retains tombstones and a
retirement receipt to preserve replay identity and requires positive byte
saving. A tombstone retains identity/history without the original payload.
This is not evidence of a connected age scheduler, applicability to every
state/wait/telemetry owner, or deletion of every referenced blob.

Buster compaction has a different contract: completed job with result, no
cleanup errors or incomplete attempts, bounded readable evidence, verified
retained source and positive net metadata savings. It retains a compacted
header/receipt. Its terminal-workspace helper deletes only reproducible input
copies—`repository.tar.gz`, `workspace/repository`, and
`workspace/test-provider-snapshots`—after the terminal caller owns quiescence.
Workspace, scratch, evidence, artifacts, observability, job records and logs
are explicitly not generic disposable input copies. An invalid/replaced parent
or uncertain orphan owner is a stop, not permission for recursive cleanup.

**Source — domain-authorized retirement and bounded compaction/cleanup:**
[retire selected v2 records with owner authorization and receipts](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts#L134-L174) (`skills/common/plugin-runtime/foundation/observability/durable-records.ts:134–174`, current-checkout SHA-256 `c9a0c42b8cdd3a2f188ec38a3cab5270d0f032444801626ea2c6860e534582dd`). [completed job, evidence/source and byte-saving compaction conditions](../../../skills/buster/engine/test-gates/remote-plan-service.ts#L263-L310) (`skills/buster/engine/test-gates/remote-plan-service.ts:263–310`, current-checkout SHA-256 `3be9e75c8619da96c22bfaabd7fbab548bc07085787d092a83ba1f20130434f9`). [only reproducible input copies are disposable](../../../skills/buster/engine/test-gates/terminal-workspace.ts#L1-L25) (`skills/buster/engine/test-gates/terminal-workspace.ts:1–25`, current-checkout SHA-256 `ede9e4ffd51edd40de683eade25ba313b5b2395d6a7bbcf5ce50e583f7940c59`).

## Select the deployed storage route

A PersistentVolumeClaim (PVC) requests storage from the cluster. Its declared
capacity/access mode and actual mounted receiver must match the selected
route. A values file alone is not an observed mounted filesystem or effective
upstream retention job.

| Source selection | Declared storage / lifetime | What remains conditional |
| --- | --- | --- |
| Selected GitOps `registry-local` Deployment | Its Pod template declares no storage volume; it is the adopted ephemeral route | Do not promise surviving image data or a backup mount. Storage/image change needs its own migration |
| Alternate `my-values/infra/registry-local.yaml` template | `/var/lib/registry` and `ReadWriteOncePod` (RWOP) PVC; explicit storage class/capacity placeholders | Render with supported storage. Do not apply placeholders or replace RWOP with weaker access merely to schedule; actual CSI/receiver and exclusive garbage-collection maintenance must be established |
| Selected Redis values | Standalone authenticated receiver; master persistence size 2 GiB | Effective AOF/RDB/durability comes from the selected receiver/configuration, not PVC size alone |
| Selected Prometheus values | `retention: 15d`, PVC request 20 GiB | Actual receiving chart/operator/version and deletion behavior need verification; metrics do not restore Nova lifecycle |
| Selected Loki values | Filesystem storage, `retention_period: 720h`, 20 GiB PVC | Effective compactor/expiry/deletion and backup are not proved from declarations; logs remain a separate projection |

CSI is the Container Storage Interface used by a storage provisioner. RWOP
means one Pod may mount the claim for writing; it is not a universal storage
migration or backup guarantee. The two registry routes are alternatives, not
layers to merge into one assumed configuration.

**Source — actual route declarations, not observed receiver behavior:**
[selected registry Pod template without a volume](../../../gitops/platform/registry-local/resources.yaml#L1-L38) (`gitops/platform/registry-local/resources.yaml:1–38`, current-checkout SHA-256 `f728da90b05f3185afce2d7de85484ff4bab8f29e7db88d797ce1dcbf78916a7`). [alternate persistent RWOP template and required parameters](../../../my-values/infra/registry-local.yaml#L1-L34) (`my-values/infra/registry-local.yaml:1–34`, current-checkout SHA-256 `966ab5af3851d5a6f9305d8819574301ca78d6c20f6d19074d078bf3b8e28d53`). [selected Redis authentication/persistence declaration](../../../gitops/platform/values/redis.yaml#L1-L21) (`gitops/platform/values/redis.yaml:1–21`, current-checkout SHA-256 `e0523d1b0ca368d5567e9be9275c6a8ce54793315d346805b41b8979bb69d8ca`). [selected metric retention and volume request](../../../gitops/platform/values/prometheus.yaml#L38-L50) (`gitops/platform/values/prometheus.yaml:38–50`, current-checkout SHA-256 `4fd5cddf6469e535f6d44a4903eef8781218cbbc2f65595cddf58ce3a1270509`). [selected log retention and filesystem volume](../../../gitops/platform/values/loki.yaml#L1-L24) (`gitops/platform/values/loki.yaml:1–24`, current-checkout SHA-256 `7795a3ee39b969422b037d546a5ffbf0ab5152e8310772fb46b216d661332e76`).

## Backup groups and original-reader proof

Use the existing [Backup Set](../use/recovery.md#define-a-backup-set),
[Prism Backup Group](../use/recovery.md#prism-backup-group),
[Pipeline State Recovery](../use/recovery.md#pipeline-state-recovery) and
[Verification](../use/recovery.md#verification) procedures. Required credentials,
clients/versions, independent destination, capacity/time bounds and writer
fences belong to those procedures. Do not substitute another parser, client,
server or source identity to obtain a successful-looking restore.

| Group / operation | What its actual source establishes | What it does not establish |
| --- | --- | --- |
| Nova run plus adapter stores | Original identities, stopped writers, matched raw copies, strict copied-journal inspection and external-effect reconciliation before legal recovery | A single `events.jsonl` copy, audit JSON or new run cannot replace complete original recovery authority |
| Prism DB/artifact backup | DB snapshot first, immutable artifact superset copied next; artifact index, metadata, checksums and bounded completed-group publication; administrative deletion/restore must not overlap | DB-only consistency, automatic age pruning, external credential recovery or completed disaster recovery |
| Prism scheduled SQL proof | Unique temporary same-server database, native restore and selected application-table queries, then owned cleanup | An independent failure-domain restore, all artifact/application readers or live cutover |
| PostgreSQL native recovery | Verifies selected source/client/version, refuses same server and nonempty target, requires original owner/ACL roles, bounded single-transaction restore | It explicitly still requires application verification; a native-success message is not restored service readiness |
| Redis offline preparation | Selected-version snapshot conversion, AOF configuration/restart checks and a receipt saying cutover not performed | Client migration, original application acceptance, full live recovery or an inferred complete retention policy |

A database migration also changes state. Prism's runner sorts selected SQL
filenames, locks the migration transaction and applies unapplied names. The
ledger records names, not a checksum comparison of previously applied SQL.
A changed SQL file under an already recorded name is therefore not proved
rejected by that ledger. Retain the exact migration/application versions and
use the original consumer's supported direction; do not invent rollback.

**Source — matched backup, limited smoke test and native restore boundaries:**
[database-first immutable artifact backup and completed group](../../../charts/prism/files/prism-backup.sh#L67-L115) (`charts/prism/files/prism-backup.sh:67–115`, current-checkout SHA-256 `4164f2d8237a83359a797fc397f49c3405380792cdfc6e8d061ec49efcec8135`). [same-server temporary SQL smoke check](../../../charts/prism/files/prism-backup.sh#L127-L153) (`charts/prism/files/prism-backup.sh:127–153`, current-checkout SHA-256 `4164f2d8237a83359a797fc397f49c3405380792cdfc6e8d061ec49efcec8135`). [different-server empty-target native restore boundary](../../../scripts/postgresql-recovery.sh#L141-L156) (`scripts/postgresql-recovery.sh:141–156`, current-checkout SHA-256 `86601e569d0de0c138a59632d0c70f601f47f7a1e82e0ed8b5bb18d7cd310f0b`). [AOF restart proof with no client cutover](../../../scripts/redis-prepare-migration.sh#L79-L107) (`scripts/redis-prepare-migration.sh:79–107`, current-checkout SHA-256 `baaa7e6c33e72ec2ca0133ca44fdbf6335bd6394d9d81259e073e62ada360e4b`). [ordered SQL-name ledger under migration transaction lock](../../../skills/prism/storage/index.ts#L21-L72) (`skills/prism/storage/index.ts:21–72`, current-checkout SHA-256 `e5105909e5f1abf1eb2178270dd63d1b8e2aa337177dcb620b6ae43199a3a199`).

## Audit and inspection are not universally write-free

Audit adds no new lifecycle/audit entry, but its actual `FileJournal`
construction prepares the parent, opens/creates a stable append-lock and uses
`/usr/bin/flock`. Loading a nonempty journal without a final line feed (LF)
truncates to its last LF, possibly zero bytes, and synchronizes before parsing
committed chain/hash records. Empty/LF-terminated bytes do not need tail repair;
lock metadata effects remain. Invalid committed data can still fail.

Missing `events.jsonl` fails before construction (`AUDIT_JOURNAL_MISSING`);
missing run selection fails afterward (`AUDIT_RUN_MISSING`). Even a failed
lookup can already have changed bytes. Before audit or retry preserve the first
diagnostic, partial output and original evidence. Do not assume interruption
left bytes unchanged. Where original bytes must be retained, use only a
correctly bound inactive copy of the run root, not the sole retained original;
audit can modify that copy too. Preserve run/head binding and do not merge
outputs from different runs or journal heads.

Follow the canonical [Pipeline State Recovery](../use/recovery.md#pipeline-state-recovery)
order: stopped owners, verified raw run/adapter copies, strict copied-journal
inspection, then the original supported audit/recovery route only when its
prerequisites pass. Do not use audit to make a corrupt copied journal pass.
No read-only/no-record bypass flag, pure-parser substitute or general repair
guarantee is asserted. Other durable-store readiness/reads can acquire locks;
qualify the actual call path instead of labelling every read write-free.

**Source — original audit/constructor/lock effects:**
[missing-file guard and post-construction run lookup](../../../skills/nova/core/telemetry/audit.ts#L15-L27) (`skills/nova/core/telemetry/audit.ts:15–27`, current-checkout SHA-256 `59eb49b7c0e2e430b38c53572edb5d7563724957996bd2dfda261fe1a1569bfd`). [constructor and conditional incomplete-tail load](../../../skills/nova/core/state/journal.ts#L30-L81) (`skills/nova/core/state/journal.ts:30–81`, current-checkout SHA-256 `25be25a991c93c0e523178e3c45e2f7fb15ecad6e1a03566fca241d6b27f40bf`). [stable lock file and flock child](../../../skills/nova/core/state/file-mutex.ts#L8-L24) (`skills/nova/core/state/file-mutex.ts:8–24`, current-checkout SHA-256 `d6d347d6b615796ff761c0c608ed6a4d9f4f834bea92ddd2870d2312b5d04c7c`).

## Respond to loss or pressure without destroying evidence

- **Full store:** preserve the first admission error, configured quota dimension,
  actual owner/root and retained liability. Do not delete another store or
  raise a host bound without its authority. Use explicit retirement only where
  the domain proves records no longer needed and its supported API authorizes it.
- **Missing blob/result:** retain metadata, reference digest, original request
  and source bytes if available. Repair through the owning idempotent write or
  supported backup route; do not invent content or a terminal receipt.
- **Expired lease or unknown native owner:** stop new conflicting work until
  host identity, quiescence and accepted effects are reconciled. Time expiry
  alone is not deletion permission.
- **Corrupt journal or partial restore:** retain raw bytes and diagnostic;
  keep writers fenced. Restore the complete group only through its supported
  procedure, not a silent tail edit or single-file replacement.
- **Lost cache/projection:** use the owner's established rebuild/replay path
  only from retained authority. Where no path or source remains, report the
  gap rather than claiming recovery or re-executing a business action.

Expected recovery proof includes original application readers, accepted
identities/permissions, referenced artifacts/effects, cleanup and measured
loss/time separately from targets. LiteLLM isolated operator restore,
application verification and cutover are not supplied by the current native
backup/test alone. Prism's independent failure-domain recovery is also not
proved by its same-server SQL smoke test.

## Coverage and maintenance limits

The named roots and selected deployment routes above are finite. All SQL
tables/migrations, host/OpenClaw/Codex/operations state, cluster/Secrets/SPIRE,
every PVC/cache/mirror, external receiver and conditional retention owner are
not globally inventoried here. Absence from this page is not proof that data
is disposable or a conditional supported route is irrelevant.

Use [Documentation maintenance](../extend/documentation-maintenance.md) when
paths, owners, readers, quota dimensions, expiry, retirement or restore behavior
changes. Preserve authored explanation separately from generated facts; the
current page generator does not generate this hub. We ran no backup, database,
cleanup, restore, audit, replay or live application recovery for
this page. We claim no successful restore/loss/time result.
