# PR 6 LiteLLM database recovery checkpoint

IFR-12-001 now has a separate full logical database recovery path. The database
is treated as authoritative for keys, authorization and stored models. The
central infrastructure policy specifies a configurable two-hour recovery-point
objective, 15-minute dump interval, 5-minute verification interval, 30-minute
dump deadline, 100 GiB PVC, 64 GiB dump ceiling and 90 GiB retained ceiling.
These are explicit initial settings, not an operator-approved data-loss promise.

The Bash implementation uses actual pg_dump/pg_restore, cluster identity,
full object ownership/ACLs, checksums, private incomplete directories, fsync and
atomic publication. Failed/oversized dumps remain incomplete; they never
replace a previous complete package. Kernel flock prevents competing writers.
There is no automatic retention deletion. Credential binding is domain-separated
so it does not disclose LiteLLM's SHA256-derived encryption key. Restore rejects
wrong credentials, wrong version/image, corruption, over-age packages, the source
cluster and nonempty destinations before running a single-transaction restore.
Required login roles and original encryption keys remain external authorities.

The deployment renderer uses the actual locked upstream Helm chart to bind
Service name, selector, Service port and container target port. Custom names and
ports are tested against that chart. It emits a digest-pinned CronJob, private
PVC, ConfigMaps and narrow Cilium rules. The job has no API token, drops all
capabilities and uses a read-only root. Existing incompatible PVCs are refused
before infrastructure mutations. Managed credential shapes that cannot be bound
unambiguously are rejected. deploy.sh infra installs these resources after the
managed database release. The actual deployment was not executed.

## Native evidence

One full native integration test passes against two actual PostgreSQL 18.6
servers with separate ext4-backed clusters. It imports the full declarative
schema from the exact LiteLLM source commit pinned to the selected image,
creates representative virtual-key/permission and encrypted model rows, dumps
and restores, compares all 1,012 columns and 217 indexes and original key/model
JSON, verifies actual SQL password authentication and decrypts both legacy
XSalsa20 and AES-GCM model credentials using the unchanged original LiteLLM
crypto module. Wrong-key controls fail. Corruption, stale RPO, retained capacity,
incomplete size-limited dumps and unsafe restore targets are rejected.

Two real Helm rendering tests pass, including overridden Service/name/port
binding and rejection of an impossible RPO. The PVC metadata cases are manifest
contract checks, not a Kubernetes API simulation. Canonical lint, Bash syntax
and the 27 generated version outputs pass. Raw logs, pinned schema/crypto
provenance and reproduction commands are retained with this checkpoint.

The crypto runtime uses the exact upstream Python source and uv.lock dependencies
installed with required hashes. Upstream's default Rust-disabled Python path is
used unchanged. Initial package/source-wheel attempts did not succeed: the
stable PyPI release was unavailable and the local Rust compiler failed with
SIGBUS. Neither a built root wheel nor Rust extension is claimed. The native
test verifies original module bytes before import; it installs no replacement
crypto implementation or mocked application module.

The schema is the complete declarative Prisma schema generated with Prisma CLI
5.17.0, not execution of every historical SQL-only migration. This is not a full
LiteLLM HTTP/image acceptance. The exact PostgreSQL image's hash-verified layers
contain all 17 inventoried recovery tools; that inventory is static evidence,
not execution of the Bitnami entrypoint or its UID/filesystem behavior.

## Remaining boundaries

The operator's final live gate covers actual image/UID execution, PVC attachment,
Cilium, schedules and failure visibility, independent-copy restore and actual
LiteLLM API authentication/model/budget behavior. The runbook explicitly requires
reconciling post-backup key revocations before traffic is switched. No cluster
run or live gate is claimed here. Cross-store/off-node disaster recovery remains
IFR-26-001; storage migration/capacity and general major upgrades remain separately
open. The four original worker/fixture/retention findings are not closed by this
change. See docs/operations/litellm-postgresql-recovery.md.
