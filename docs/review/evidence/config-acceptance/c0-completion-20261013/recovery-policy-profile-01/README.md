# Complete PostgreSQL recovery policy/profile/receiving definition01

Author `/root/source_concordance_layout_recheck`, 2026-10-14. Additive concrete WCR05 definition beyond the independently verified81-source cut. **Frozen proposal; fresh independent material review required.** No full WCR05/IFR26, canonical field/case, implementation/native or whole-C0 acceptance.

## Sole owner / complete profiles / root evolution

Existing sole author is `my-values/infra/postgresql-recovery.yaml`. Its proposed
`postgresql-recovery-policy.v2` contains **24 complete profiles**: A plus one complete
field-specific B for each of23 leaves. Every B changes exactly its named leaf;
all other settings remain A. A preserves the actual current YAML values, with ten
actual adjustable literals made explicit. No schema/code defaults or optional
policy leaves. The evidence YAML is JSON serialization accepted by js-yaml, at the
same physical target path; no per-profile author files/private operator box.

Actual editable scalar count is **13**, not12 when counting all four CPU/memory
request/limit leaves: seven interval/age/duration/deadline/byte knobs, two persistence
leaves and four resource leaves. schemaVersion is protocol identity, excluded.
Ten additional actual literals yield23. profile-index.json, closed strict schema
and field-definitions.json provide each complete contrast, exact units/domain,
current witness, original candidate links where exact and receiving delta. No
invented canonical field ID or guessed broad-parent association.

| Source literal now explicit in same owner | A / actual receiving units |
|---|---|
| reserveBytes | 67108864B=64MiB; retained allowance subtraction |
| killAfterSeconds | 15 integer seconds; GNU timeout TERM→KILL dump/restore |
| connectionTimeoutSeconds | 15 seconds PGCONNECT_TIMEOUT; positive1 has libpq effective minimum2, selected-client receipt required |
| tocMaximumBytes | 64512×1024=66060288B=63MiB; floor(bytes/1024) Bash -f blocks |
| metadataMaximumBytesExclusive | 65536B; metadata stat size **strictly less** |
| checksumIndexMaximumBytesExclusive | 1024B; index stat size **strictly less**, exact three named SHA256 lines |
| cronJobDeadlineOverheadSeconds | 60s; job activeDeadline=duration+overhead and RPO sum |
| successfulJobsHistoryLimit / failedJobsHistoryLimit | 3 /10 Jobs, not backup-directory deletion |
| temporaryDirectorySize | 256Mi disk emptyDir sizeLimit, not memory tmpfs or guaranteed synchronous hard write quota |

Other A values: backup15min/verification5min, age7200s, duration1800s,
startingDeadline900s, maxBackup68719476736B=64GiB,
maxRetained96636764160B=90GiB, PVC100Gi/storageClass:null,
requests250m/256Mi and limits1CPU/1Gi. The maximum-backup B uses16MiB to permit a
concrete modest genuine disposable dump boundary, not a fabricated huge archive.
All other B values and full bodies are explicit in the owner/index.

The same `config/pipeline.config.json` evolves **proposed v5→v6** with an explicit
`infrastructureSelections` tuple for `role:postgresql-recovery`, trusted deployment
instance, exact existing owner path and profileId. Resolution is under the captured
delivery root (parent of config), not config-relative `../` or arbitrary paths.
Six component authors/bindings and plugin selections are unchanged; no seventh
component, competing root or fabricated deployment roster. All recovery profiles
validate before selection and before chart/PVC/API/credential/DB work.

**Dependency stop:** base provider02 v5 is frozen and currently undergoing
provider03 residual correction (invalid/default-cap profiles and stale active-case
references). This projection conserves that base root, not its whole-generation
acceptance. entry-supersession.json requires an exact additive rejoin of corrected
provider03 owner/schema/root/active-case identities after independent verification.
C3 Buster03 is bounded source-definition closed, not native authority. No parent
root or prior package was edited. C1 transports current values first; C3 v2 readers
are separate later changes; old archived versions never fill from new/current.

## Exact productive receiving chain / proposed v2 deltas

Read actual source and prior full independent review. Productive chain:
`deploy.sh::cmd_infra`1120 invokes renderer `--preflight` with selected namespace,
existing recovery policy, selected PostgreSQL values, LiteLLM deployment and release;
1171 applies the generated manifests. The renderer's real service derivation stages
locked chart and executes Helm, so **full renderer was NOT called here**.

`receiving-abi.md` defines the concrete same-entry CLI admission, immutable closure
and one v2 handoff. New start uses captured entry/trusted deployment tuple and
complete selected owner; old positional policy path is historical replay only,
not fallback. Runtime uses fixed `/recovery/runtime.env`, closed ordered key/value
transport, Bash read/split/whitelist parser **without source/eval** and no assumed
Node binary in the PostgreSQL image. Required new script keys replace the six
script-side literals; Cron substitutes overhead/history/tmp. Generation-qualified
immutable ConfigMap delivery, exact script/schema/source digests and real C1
mount/boot capture are prerequisites, not acceptance from projected symlinks or
checksum annotations. Conflicting ambient settings reject; credentials retain
original external transport, never ordinary profile/runtime.env secret bytes.

The public runtime-A.env is an **unsealed expected shape**, not an eligible runtime
or authenticated generation. Its script hash is the current baseline v1 source;
actual v2 reader/script digest is unavailable until separately authorized C3
implementation. generated-handoff-definition.json explicitly forbids interpreting
that baseline as implemented v2. The shape's digest is navigation, not an authority
certificate; actual full-generation identity comes from the existing C1 authority,
not a new subset identity ledger. Missing authenticated boot/physical/source closure
stops before effects. No v2 script implementation was written.

PGHOST/port/selector come from actual unique Helm Service/StatefulSet
`tcp-postgresql` projection, not a fixed alias. Database `litellm`, admin user
`postgres`, `/backups/litellm`, expected version180006, application image and
credential names are generated from existing DB/application/version/reference
authors. Actual renderer uses infrastructureCharts.postgresql18.11.1/appVersion
18.6.0 and infrastructure image digest; do not silently substitute separate
postgresqlProduction18.11.3/image. Namespace/release/source paths/operation/directory/
sourceVersion are explicit task/source inputs, not new editable recovery knobs.

Public stand carries actual source paths/versions/image/key **references**, but
its fixture Service/role/namespace are deliberately not installed claims. Real
locked chart/archive/service receipt, DB/server/client/image, master/salt/password
original revision and retained roles, PVC/source history and node/native tool
receipts remain unavailable. The copied Secret locator is not a retained revision.
Current verify checks credential fingerprint, **not** credential_authority_ref
revision/equality; the proposed original archive/source admission supplies that
missing revision association rather than pretending current code already does.
Salt compatibility remains unset-only fallback, not present-empty replacement.

## Complete domains / budget relations / preservation

- Script-facing counts/timers/byte values are canonical positive decimal integers,
  at most13 digits (`positive` actual regex), no fractional/suffix/padded values;
  retain native signed64 arithmetic compatibility. Backup and TOC>=1024 for
  productive nonzero Bash blocks. libpq connect is positive signed-int seconds;
  integer seconds GNU timeout and selected time_t/rlim_t/Bash native modes are
  genuine tool-image prerequisites, not universal count/hash proofs.
- Persistence preserves actual positive integer Gi/Ti renderer domain, nullable
  exact storageClass. Resources/tmp preserve positive supported Kubernetes Quantity
  DecimalSI(n,u,m,k,M,G,T,P,E), BinarySI(Ki..Ei) or DecimalExponent syntax;
  uppercase decimal K is not accepted. Pure rational comparisons cover public
  examples, but actual API normalization/CPU/cgroup/byte admission, node capacity
  and measured command working set remain separate native gates—no made-up quota
  or arbitrary field-domain subset to fit one fixture.
- Verification<=backup, backup<=60min and verification<=30min. RPO exact strict
  relation `2*duration + verification*60 + startingDeadline + overhead < maxAge`.
  A sum4860<7200. StartingDeadline is queue/start allowance, not SQL execution
  timeout. Effective connect<=duration/overhead; kill grace<=overhead. Real
  query/list/checksum/publication/verify/quiescence must fit remaining task/job
  budgets; current timeout on dump/restore does not bound every subprocess.
- `maxBackup+reserve<=maxRetained<=PV request/actual capacity`. Charge **all used
  plus incomplete bytes**, compute min(maxBackup,retained-used-reserve), then floor
  /1024. Reserve covers effective TOC + exclusive metadata/index maxima-1 plus
  genuine file/directory/accounting overhead. No real capacity or overhead proof
  is fabricated by the local lower-bound check. The public selected metadata
  upper-size stand is549B; exact three-line index241B; selected caps must exceed
  these. Publication adds actual cap guards before rename; imported TOC gets
  explicit v2 cap guard before native listing.
- Actual PV/private UID1001/RWO/readonly-script/RW-backups/tmp mounts and selected
  tool-image/node resource admission must match; no invented resource field or
  root init. Existing PVC cannot be adopted/expanded/replaced to make B pass.
  Persistence B positive needs a separately approved distinct claim/source stand;
  actual existing100Gi→101Gi preflight rejects migration, no automatic resize.

Original completed and incomplete trees remain charged and immutable; no deletion,
accounting reset, role/secret rotation or same-server restore. Historical source/
policy/script/client/image/credentials/claim authority comes before current A/B at
verify/restore/migrate/evidence. Tighter current admission may reject, not rewrite
old metadata or reset absolute age. Age uses **started**, never completed time.
Scheduled invalid latest can trigger a new backup while preserving old data.
Restore keeps exact direct-child/non-symlink/nlink1/checksum identities, distinct
empty target, retained owners/ACLs, transactional failure rollback and explicit
forward sourceVersion/selected newer client compatibility. Successful pg_restore
remains application-acceptance-required. Kernel stable FD9 flock has no stale-PID
takeover; process timer or Pod deadline does not prove descendant quiescence.

## Finite source / policy cases

original-candidate-lineage.json preserves **81/81 original IDs, complete bodies,
body hashes and current source witnesses** from the original ledger. Each gets a
specific same-boundary/history obligation, not blanket 'protocol' exemption or
invented canonical join. Added literal witnesses missing scanner IDs remain exact
path/line/hash facts without minting ghost SRC/field IDs.

case-definitions.json defines23 complete causal field pairs ×VALUE/EFFECT/BIND/
MUTANT=92 explicit future field oracles,81 original source-clause identity oracles
and nine concrete native phase contracts. public field-pair/task/source stands
state genuine missing inputs. Each EFFECT specifies actual consumer, admission or
observable guard boundary, not a generic serializer assertion. In particular,
valid index format fixes241B: A1024/B1023 cannot fabricate an accepted larger index.
Their quota effect oracle observes first malformed-input guard/mutant, preserving
integrity rejection; no false successful native divergence. EmptyDir disk sizeLimit
requires real kubelet accounting/eviction, not invented immediate ENOSPC. Native
max-byte/TOC/deadline/retained fixtures are explicitly unavailable, not mocked.
All original/derived runtime cases remain **not-run** and original C1 cases unchanged.

## Actual narrowly pure checks / exact reproducibility

Repository cwd:

```sh
node docs/review/evidence/config-acceptance/c0-completion-20261013/recovery-policy-profile-01/collect-definition-checks.mjs --output-dir docs/review/evidence/config-acceptance/c0-completion-20261013/recovery-policy-profile-01/final-run
```

**Actual final exit0,21 named controls,24 complete profiles,23 single-leaf pairs,
81 original candidates,34 recorded input identities, drift0.** Raw stdout/stderr
(empty), exact commands/exits, Node/Ajv/js-yaml binary/module identities, collector
identity and extracted-source digest are retained. Earlier material-draft successful
runs whose output was overwritten are explicitly unused, not fabricated receipts.
No argument writes no files; reviewers can choose their own output directory.

Controls cover all-profile strict schemas and relation negatives; selected and
unselected missing every leaf; parser/unit/quantity/TOC/reserve/metadata/index/RPO/
PV/resource/phase bounds; exact source-A plus ten literals; all23 full causal pairs;
current pure configuration/Cron/network projection and source negatives;
pure existing PVC no-adoption/resize predicate; root v6 schema/base conservation,
selection duplicates/missing profile; exact81 bodies/witnesses and finite case
identities; public task/direct-path/version and strict handoff shape; public existing
application credential-reference predicate without Secret reads.

Collector isolates **unmodified named pure functions only** from renderer source:
validate/budgets/storage, applicationSecret, configuration, cronJob, networkPolicies.
No full renderer or its staging/Helm path is imported/called. VM receives only real
pinned chart-lock metadata through actual pure lock predicate and an explicitly
public structural service stand; no fs/process/subprocess/network in that context.
Pure requireCompatibleRecoveryVolume is called, never preflightRecoveryVolume.
Generated public views24 contain current pure subfunction outputs plus explicitly
expected future literal substitutions; they are not full render/installed manifests
or implemented v2 receipts. Source-specific checks only, no general validator or
broad test suite.

conservation-receipt.json records9/9 old recovery source pins and preserved source
cut/review identities; original2,409 canonical rows and6,845 cases equal git
 a0d5588c4. Root metadata intentionally not equated to historic file hashes.
Only this additive directory was written: no production/source/schema/test/canonical
or old artifact edit; no backup/verify/restore/migrate/deploy/preflight/Helm/Kube/PG/
API/network/credential/native/Eval execution. package-manifest.json freezes package
bytes except itself. Fresh independent material review and corrected provider
integration rejoin remain required; original WCR05/IFR26/whole C0 stays open.
