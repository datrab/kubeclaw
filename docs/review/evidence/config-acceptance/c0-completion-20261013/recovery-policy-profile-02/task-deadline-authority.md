# R03: one original whole-task authority and concrete phase protocol

**Definition only.** Current renderer/script have no v2 task-grant reader or
whole-task supervisor. The concrete C1/C3 additions here are not claimed current
APIs, installed control services, native timers or implemented readers. Existing
sole owner/23 policies/24 profiles and original user argv do not change.

## One issuer, one original binding, one clock, one expiry

The issuer is the **existing authenticated C1 delivery/task admission caller** for
this recovery deployment. Extend its original bound task record with this recovery
receipt; do not create a script-owned deadline file/parallel budget ledger, new
config author, new control service, or infer a grant from ENV/Job/PID existence.
A concrete new C1 boundary `bindRecoveryTask(originalC1TaskBindingRef, captured
wholeGeneration, immutableTaskEnvelope, actualExecutionScopeReceipt)` returns a
single immutable `postgresql-recovery-task-authority.v1` member. This named boundary
is a proposed API delta at that caller, not a function claimed present in current
repo. Its actual original task/archive store/admission grant/transport receipt is a
required external input. Missing original binding never invokes a fallback issuer. originalC1TaskBindingRef
uses its exact original artifact SHA / supported JSON member pointer, not an invented
recovery-owned receipt index or a claim the existing task store already has this
new bridge. Its original schema/member/source/grant/archive authority must resolve.

Scheduled: bind the authentic original Cron/Job request UID, first admission ID and
native original process scope to the selected generation/profile. Original controller
scheduled-at/namespace/Cron ownership/Job identity are in the original C1 task binding;
first admission checks controller-scheduled UTC time+selected startingDeadlineSeconds.
This is **queue eligibility only**, not processing timeout. Current source restart
Never/backoff0 is retained. Manual backup/verify/restore/migrate: authenticated
operator/task caller binds an explicit original request UID, original argv/source /
target/archive grant and first native process scope; same reference is mandatory.
Direct shell new start without a bound grant rejects, not a legacy fallback.

The receiver task envelope adds one required `taskAuthorityRef` (artifact SHA/member
pointer). Original operation/directory/sourceVersion fields and argv arities stay
unchanged. Grant schema is closed/all required: original task/origin/operation/argv
hash, same root/owner/profile/deployment identity, original C1 binding ref, original
execution scope, inherited original/host ceilings and clock. Public fixtures have
zero placeholder C1 refs/unsealed scopes: shape positives, **not** authentic grants.

Choose one native clock route: selected Linux kernel boot identity plus the first
`/proc/uptime` field, read by Bash `IFS=' ' read -r uptime _ </proc/uptime`, whose
selected platform receipt must establish trusted procfs and 10ms monotonically
advancing boot-time ticks (including suspend). Read original `/proc/sys/kernel/random/
boot_id` for clock domain. No date/wall timestamp governs work expiry. No Node or
new native clock binary is assumed. No proc/clock read was performed here.
Capture anchorTicks once at **first task admission** from floor uptime ticks into
the original authenticated task binding. The uptime token is exactly canonical seconds + dot + two decimal digits
(`0.00` supported); concatenate seconds/fraction into ticks with canonicalization
and string length/ASCII native bound checks before base10 conversion. Malformed,
padded, regressing, unsupported mode or oversized readings deny. All grant values
are canonical nonnegative decimal, native signed64 checked. budgetTicks is positive and exactly
`min((original maxDuration+overhead)*100, inheritedOriginalCeilingTicks,
hostCeilingTicks)` with authentic ceilings (not caller-supplied replacements).
expiresTicks=anchorTicks+budgetTicks, checked addition. Each sample has186000ticks
(1860s) processing budget. Every receiver uses original expiresTicks and original
clock domain, **never** now+budget again. Current observed floor tick is increased
by1 for conservative <=10ms resolution uncertainty; observedUpper>=expiry rejects.
Clock regression/domain/reboot mismatch, new task UID substituted for a retry,
missing scope/ceiling/original receipt or task/generation/argv mismatch rejects.

Same request/job restart reuses the original grant/anchor/expiry/scope reconciliation
and consumed absolute budget. Cross-node/reboot same-task restart is denied (no
clock conversion or new anchor). Genuine next scheduled request is a distinct
new original task, only after old task/descendant/lock authority is reconciled;
its new budget is not a retry of the previous task and cannot erase old data/age.
Stored backup/archive source task identity remains first authority for replay;
missing original task binding/deadline is a stop, never current-generation fill.

## Concrete transport and receiving API delta

C1 admission hands the supervising script v2 two authenticated readonly descriptors:
FD10 original task grant member, FD11 original generated runtime identity/selected
policy. Root `/recovery/runtime.env` supplies exact TASK_AUTHORITY_SHA256/MEMBER refs
as transport; it is not another budget writer. Captured original C1 trust/provider
revision verifies descriptor/member/authentic signer or authenticated original
binding, physical no-follow/owner/size/read-drift and exact generation source closure
before effects. An arbitrary same-UID file or matching digest is insufficient.
The mandatory task envelope schema references the same member. Source/script version
mismatch (including public baseline v1 digest under v2 shape) denies. The returned
original supervisory task-control handle remains the sole live grant/abort/status
authority: assert_task_live checks its original ownership/cancellation/revocation
state as well as the clock; descriptor hash alone does not authorize a canceled
task. Native scope supervisor propagates revocation to phase children and final
entry guard; this is part of the same C1 bridge, not a new grant/ledger service.

Proposed functions at existing `postgresql-recovery.sh` are:
`read_original_task_authority`, `assert_task_live`, `remaining_phase_work_seconds`,
`run_bounded_phase`, `admit_publication`, `admit_restore`, `finish_task_outcome`.
They consume the same original descriptors; no endpoint substitutes config ownership
for task authority. Fixed private phase subprocess entry is
`bash /recovery/postgresql-recovery.sh __phase <fixed-phase-name>` with inherited
FD10/11 and, for mutations, same FD9. Original public argv remains backup/scheduled/
verify/restore DIRECTORY/migrate DIRECTORY SOURCE_VERSION. __phase is not an operator
operation or new policy knob; it rejects missing original supervisory identity,
wrong descriptors/scope/whitelist/hash and cannot grant itself a task.

Before *every* listed blocking command dispatch, private receiver rechecks same
clock/authority and debits common remaining budget. Entire phase executes inside
one existing GNU timeout-controlled process group; all its commands inherit that
same bounded phase/absolute grant, not per-command fresh budgets. Phase dispatch:
`timeout --signal=TERM --kill-after=<selected killAfterSeconds>
<workSeconds> bash <captured script> __phase <whitelisted-name>`.
workSeconds=`min(phase work ceiling, floor((expiresTicks-observedUpperTicks)/100)
-killAfterSeconds)`, checked, positive; otherwise deny. Dump/restore work ceiling is
original maxDuration; other phases use the same remaining whole-task ceiling.
TERM and KILL grace are reserved/debited from **one absolute expiry**, not appended
to it. At child entry revalidate absolute original grant again, accounting for
launch delay; no command may obtain a new grant because its parent was slow.
Native supervising original execution-scope authority enforces the absolute expiry
independently of relative timeout launch delay and accounts all process groups;
this is an explicit C1/native supervisor delta/required receipt, not Cron alone.
It uses the **same** immutable grant, not a second deadline ledger or service.

## Actual command coverage and exact transitions

| Fixed phase / real source | Commands receiving common remaining bound |
|---|---|
| CONFIG_ADMISSION, configuration12–30 | required reference/authority capture, tool/root/stat/id/private mount checks and mkdir only after mutating-task admission |
| SOURCE_IDENTITY, server_identity39–46/client_version49–54 | psql SHOW/system ID, pg_dump/pg_restore --version; PGCONNECT_TIMEOUT only connection establishment, not SQL execution |
| INITIAL_VERIFY, scheduled170 / restore143 / verify184 | latest directory selection; stat/nlink/size, wc/grep, sha256sum --check, awk metadata, original credential binding and age, pg_restore --list129 |
| ACCOUNTING, backup59–64 | bounded authentic du/cut and checked aggregate from accounting-admission.md before arithmetic/staging |
| DUMP, backup57–73 | mktemp/date identity, native pg_dump/ulimit/TERM/KILL under remaining work and original cap |
| TOC_AND_SEAL, backup74–88 | bounded pg_restore --list/TOC cap, second psql source identity, metadata/credential-bound output, sha256sum, cap guards, sync -f dump |
| PUBLICATION, backup89–93 | final synchronous original live/source/lock guard **immediately before** launching mv; mv --no-clobber and sync -f root within bounded phase; post-command original deadline check |
| POST_VERIFY, scheduled175 | same complete verify/stat/hash/metadata/list phase, using original remaining budget, not restarted maxDuration |
| TARGET_ADMISSION/RESTORE, restore148–155 | original verify + psql target system ID/empty check; final live/source/target/lock guard before actual pg_restore --single-transaction --exit-on-error; remaining-bound native restore |
| FINAL_RESPONSE, scheduled176/verify184/restore156 | final live + original authority/receipt check before accepting result; no new backup-valid/restored-success acknowledgement after expiry |

All tasks get these applicable phases: scheduled includes initial verify (failure
may lead backup only while still live), dump/seal/publication and post verify;
backup gets dump path and final outcome; verify only bounded readonly verify;
restore/migrate include full verify/identity/empty-target/native transaction path.
Forward migration retains original source/client/version requirements, no new budget.
Blocking SQL/list/hash/sync can consume remaining bound just as dump can. No merely
'measured favorable timing' replaces enforcement. Script exit code, elapsed timeout,
Cron activeDeadline or file rename alone is not acceptance.

## Expiry, accepted intents, uncertainty and FD9

Expired before command entry: deny command/effect; do not stage/publish/restore;
retain original complete/incomplete trees and target state. Expired after dump/seal
but before publication: never launch mv; incomplete tree remains charged. Expired
before native restore: no restore dispatch. The final live guard is a dispatch fence,
not a magical atomic clock/filesystem/DB transaction.

Already dispatched mv/fsync/restore may complete after expiry despite cancellation.
Such **accepted intent is uncertain**, never acknowledged as timely valid backup /
application restore. Preserve whatever original stage/final directory/target state
actually exists; no delete, rollback claim, re-rename or retry merely to make B pass.
Original task authority records intended operation/source/path/target in its
existing original task record before launch (same owner/API, no side ledger).
That bounded intent-record operation consumes remaining time, followed by a new
final live/clock/source guard before actual mv/restore dispatch; no guard is held
across blocking journal/I/O work. If intent is recorded then expiry occurs before
dispatch, no operation is launched and the original record remains denied, not
newly authorized. If dispatched, reconcile its outcome in that same task record. No script-private status /
budget file or latest-history substitution. Newly visible final backup remains
unacknowledged under the original task outcome until authentic read-only reconciliation
establishes source/hash/age/quiescence; later verification cannot reset its started
age or original credentials/deadline, or manufacture a timely original completion.
Transaction failure may roll back only if native server proves no commit; a killed
client with unknown commit outcome is not assumed rollback/safe automatic replay.

At work deadline send TERM, then selected KILL by original absolute expiry; native
supervisor covers descendants/escaped groups/orphaned children through original
scope identity. All mutating supervisor/phase processes retain same existing FD9
open description; no explicit unlock, inode replacement, PID takeover or early exit
that exposes a new writer while old descendants/effects remain. Parent death/Pod
expiry/last-FD close alone is **not** quiescence. Original task/controller authority
must attest native descendants/DB transaction and publication uncertainty plus lock
release before new mutating-task admission. Missing proof leaves original task
uncertain and denies new mutation, even if flock is now obtainable. This is a
required original-scope reconciliation gate, not another lock or deadline registry.
Readonly reconciliation after expiry uses the existing public **verify** operation
with a distinct, explicitly read-only original C1 task grant; it is not a sixth
operator operation. Its original C1 task/source binding names the prior uncertain
publication/target/scope record and exact archive path before execution (same
existing source/task authority, not a verify-directory argv or config knob).
Original pending intent wins over a later latest() selection; the new verifier
cannot substitute another backup, mutate target or relaunch the expired operation.
Native original task-control reconciliation covers descendant/transaction status
under that read-only binding and records facts in the same original task archive; it cannot renew the expired grant or authorize more restore /
publication. No cleanup/deletion/rotation/reset of used+incomplete/history follows.

## Local versus genuine missing external inputs

Closed schemas/transport/clock arithmetic/phase coverage and expiry transitions are
locally defined now. Actual original C1 task store/issuer/boot-bound descriptor /
native supervisor, trusted proc clock/scope/Job source receipts, v2 script/reader/image,
DB/credentials/client/volume/descendant/commit/quiescence grants remain unavailable
activation inputs and separately authorized implementation work. Public fixture
clock ticks/refs are structural only and cannot perform effects. All original native
cases remain not-run; no implementation/native/global-C0 approval is inferred.
