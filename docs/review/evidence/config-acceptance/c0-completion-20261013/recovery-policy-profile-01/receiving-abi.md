# Same-entry / same-owner proposed recovery receiving ABI

Proposal only; actual current deploy/render/script do not implement this v2 admission.

## Root selection / immutable delivery

`pipeline-entry.v6` is the **same** `config/pipeline.config.json`, extending the
frozen provider02 v5 with `infrastructureSelections`. Each exact tuple is
`{role:"postgresql-recovery", deploymentInstanceId, ownerPath:
"my-values/infra/postgresql-recovery.yaml", profileId}`. Semantic duplicate role /
deployment identity rejects. Deployment identity is supplied by an authenticated
deploy/boot caller, not inferred from fixture names or PGHOST. File resolution uses
the captured delivery root (parent of config), closed exact path, no caller path or
`../` override. No seventh component or private operator box. Root schema remains
closed; existing six component bindings and plugin selections are unchanged.

Existing recovery YAML evolves from flat schemaVersion1 to
`postgresql-recovery-policy.v2` with **all complete profiles in this one file**.
Its schema is closed, every field required, all declared profiles validated before
selection, no schema/code/ENV defaults. Resolve one exact profile for the trusted
role/deployment tuple. Capture root/owner/schema/script/source paths, digest,
revision/owner authority and selected profile together in one immutable generation;
validate full generation before chart staging/Helm/PVC/API/credential/DB work.
C1 transports original current values first; C3 adds v2 fields/readers later. Old
captured generations remain decoded by their original schema/script and archived
sources, not reinterpreted through v6 or filled from current A. Entry fixture is an
additive projection, not a second running root or complete installed package.

## Concrete caller / generated handoff

Current productive caller is `deploy.sh::cmd_infra`1120, after selected Postgres
release render/preflight, and apply1171. Proposed invocation is the same renderer:
`node scripts/render-postgresql-recovery.mjs --preflight --entry
<captured-delivery>/config/pipeline.config.json --deployment-instance <trusted-id>
NAMESPACE POSTGRES_VALUES LITELLM_DEPLOYMENT RELEASE`. New start requires v6
selection/complete v2 owner; old positional POLICY path is historical-generation
replay only, never a new-start fallback. CLI namespace/release/source paths are
explicit deployment task inputs associated with the deployment identity; they are
not editable policy knobs. No default `helm`/release in the new admission: selected
actual command identities/versions are captured from delivery/tool authority.

Renderer retains the real `statefulDatabaseService` chain: actual authenticated
locked archive/appVersion, selected values, exact Service and selected StatefulSet,
unique `tcp-postgresql`, numeric resolved port/targetPort and selector. No hardcoded
service alias or fabricated Helm result substitutes for it. Source configuration
uses infrastructureCharts.postgresql18.11.1/appVersion18.6.0 and infrastructure
postgresql image digest, **not** the separate postgresqlProduction18.11.3/image.
PGHOST/port/database/postgres admin user, root, expected version, application image,
credential locator/key names and source/client identities are generated or external
source facts. Source objects retain their existing authors; no mutable ENV author.

The generated settings/script ConfigMaps remain transport only. The **single** new
handoff is `postgresql-recovery-runtime.v2` serialized as a closed, ordered,
newline-free name=value file `runtime.env` in the existing script/config delivery,
mounted at `/recovery/runtime.env`; checksum/revision/generation identity covers
selected full policy, generated source data and exact script bytes, not just old
script+data. Immutable generation-qualified ConfigMap identities bind Pod spec,
archive receipt and mounted content; current stable PVC name/ownership remains.
This is not `source`/`eval`: proposed script v2 reads the fixed file using Bash
`IFS= read -r`, splits once at '=', validates version, exact keys/no duplicates/no
unknown/missing names, canonical decimal13-digit/native units and source formats,
then assigns whitelisted readonly shell variables. It rejects conflicting ambient
BACKUP_*/PG*/policy input before commands; no previous optional default fallback.
Credential values are injected only from original authenticated external authority
transport, never serialized in runtime.env or ordinary profiles. No new Node binary
inside the PostgreSQL image is assumed. Boot/mount identity checks and exact physical
capture of projected ConfigMap transport are a C1 delivery prerequisite, not proved
by these source shapes or Kubernetes symlinks/checksum annotations.

New required generated script keys:
`BACKUP_RESERVE_BYTES`, `BACKUP_KILL_AFTER_SECONDS`, `PGCONNECT_TIMEOUT`,
`BACKUP_TOC_MAXIMUM_BYTES`, `BACKUP_METADATA_MAXIMUM_BYTES_EXCLUSIVE`,
`BACKUP_CHECKSUM_INDEX_MAXIMUM_BYTES_EXCLUSIVE`, plus the existing generated keys.
Actual script consumers replace only the corresponding literal: allowance reserve,
GNU TERM kill grace at dump/restore, libpq connect timeout, TOC floor(bytes/1024)
ulimit, and exclusive metadata/index comparisons. Current Bash file-size mode
(default1024B block, **not POSIX-mode512B**) and integer widths must be established
from selected actual image/tool receipt; request values without that receipt stop.
TOC verify gains an explicit <=effective TOC size guard before listing so the
selected cap is enforced for imported/historical files, not merely new dumps.
New publication must reject oversize metadata/index/TOC before rename; no invalid
completed archive published then 'fixed' by deletion. Fixed three-file checksum
index format/digest/domain separation are versioned integrity protocol, not a
blanket excuse to omit adjustable size guards.

Cron renderer substitutes selected overhead into activeDeadlineSeconds
(maxDuration+overhead), history limits and tmp emptyDir size. No new resources or
mounts are invented: same UID/GID/fsGroup1001, nonroot/seccomp, readonly root,
no API token, script RO, backups RW, tmp disk emptyDir, RWO PVC. Quantity/resource
relations and authentic node/tool/volume capacity determine eligibility. All actual
Bash/SQL/date/awk/grep/cut/wc/stat/du/mktemp/mv/sha/sync/flock/timeout/pg commands
and script mounts must exist at captured approved executable identities; command
presence alone is not availability, same-image compatibility or descendant fencing.
The proposed v2 runtime.env reader/tool/mount ABI is not implemented or proved.

## Task / data / historical authority

Keep original operation argv: backup/scheduled/verify each no additional operand;
restore one exact direct backup directory; migrate backup directory and explicit
positive sourceVersion (>=100000 and <selected target). Task schemas reject unknown
operation/extra args/escape or slash below direct backup child. Verify remains
read-only/unlocked; mutating operations use the existing kernel FD9 nonblocking flock
on same stable lock inode, no unlink/stale-PID takeover. Locks, directories and
completed/incomplete data are never reset to admit B.

Archive includes original generation/policy/script/client/image/server system ID /
credential authority revision plus existing recovery-v1 metadata/checksums; no
credential bytes/encryption key snapshot. Credential binding remains the existing
domain-separated fingerprint; salt fallback is unset-only, not present-empty.
Archive identity lookup is not retained-secret availability. Before verify/restore/
migrate/evidence, use the backup's original source/version/credentials/script policy
capture first; an explicit current task's tighter read-only admission caps can reject
without rewriting/deleting the old backup. Original age is now minus **started**,
never completion/reset timestamp. Scheduled mode may create another valid backup
when prior latest is invalid, while preserving that prior tree and charging bytes.

Restore requires distinct empty disposable target, retained roles/owners/ACLs,
matching original master/salt and database authority, explicit target/client/image
capture. Same server and nonempty database reject before restore. Forward migration
retains original sourceVersion and uses the selected newer pg_dump/pg_restore
compatibility proof; do not rewrite metadata or implicitly rotate users/secrets.
Transactional --exit-on-error --single-transaction failure rolls back; successful
pg_restore still emits application-acceptance-required, not IFR26 closure.

## Budget / deadline stops

Policy relations are in field-definitions.json and the narrow collector. Size
allocation uses **used including incomplete** from du, available=maxRetained-used-
reserve, dump allowance=min(maxBackup,available), effective floor(allowance/1024)*1024.
Reserve must cover effective TOC + exclusive metadata/index maxima plus real file/
directory/accounting overhead; the authentic storage/tool budget receipt supplies
that overhead, not a ghost policy leaf or assumed physical capacity. PV capacity
must cover maxRetained; tmp disk budget and tool working set must fit actual node /
pod resource admission and command mounts. No optimistic product formula replaces
these independent budgets. New larger PVC/other StorageClass is a separate new
approved claim/migration stand, not adoption or resize of an existing claim.

RPO: 2*maxDuration + verificationMinutes*60 + verificationDeadline + overhead <
maxAge. Deadline is Cron **starting** delay, not SQL timeout. Each selected connect (libpq effective max(2,value)) /
kill grace must fit declared duration/overhead; measured query/list/checksum/
publication/verify execution and quiescence must fit remaining phase budgets, with
actual scheduled job maxDuration+overhead and explicit manual caller deadline.
A timer firing/Pod deadline alone is not proof descendants terminated/locks released.
All tasks stop on unavailable native width/timeout/libpq/image/DB/secret/volume/grant /
source archive/budget/mount/history authority. No automatic deletion, accounting
reset, same-server restore, role/secret rotation or metadata mutation.
