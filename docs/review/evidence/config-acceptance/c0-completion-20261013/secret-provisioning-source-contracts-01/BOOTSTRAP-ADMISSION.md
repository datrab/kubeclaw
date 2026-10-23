# Exact infrastructure entrances and noncircular bootstrap

Additive PT-01/PT-02 correction. Read after TARGET-CONTRACT and OAuth caller
supplement. It changes only prerequisite ordering/application-association schema
choice; all original source/family/candidate/case bodies remain unchanged.
Definition only; no actual deployment/credential issuance or native acceptance.

## Before every real dependent deployment, even when helper was skipped

`scripts/deploy.sh::cmd_infra` must effect-free load/validate and resolve the SAME
selected provisioning policy and original deployment task at entry, BEFORE the
first Redis/PostgreSQL Helm/apply and BEFORE LiteLLM apply (currently1152–1191).
Check per-family prerequisites immediately before each dependent primitive:
Redis requires its admitted Redis credential object; PostgreSQL requires the
selected DB credential/application authority; LiteLLM requires selected shared
master, DB URL/credential, Google where actually required, and original salt/
recovery association. Do not require unrelated disabled OAuth families for Redis.
An external DB is admitted only through its real original DB authority, not by
disabling the PostgreSQL component and fabricating a local role.

Direct `infra`, `setup`/`all` after helper mode auto/false skips, and other callers
of these same deployment functions cannot bypass this prerequisite guard.
Skipping provisioning is task intent to use a verified existing prerequisite,
NOT permission to deploy with missing/wrong/half credentials. Direct functions
cannot consume an arbitrary caller readiness flag. The same guarded task receiver
validates the actual selected objects and exact consumer prerequisites; missing
policy/task is BLOCKED and incomplete required target is INCOMPLETE before Helm/
apply. OAuth's later operator check is not an early Redis/PG/LiteLLM gate.

## Captured credentials first, authenticated consumers second

Use `original-task-reference.bootstrap.schema.json` as additive revised schema
for this target. It preserves all original three association variants and adds
closed `captured-awaiting-consumer`. That state has every actual captured
revision/DB/application/salt/recovery reference of original `captured`, except
consumerAcceptanceRef; instead it REQUIRES bootstrapAuthorizationRef and
pendingConsumerActionRef. Each resolves the SAME original authorized deployment
task, exact selected image/DB/source/revisions, expected target preconditions,
allowed consumer startup operation and original grants/deadline. A hash pointer
alone never authenticates permission. No placeholder acceptance ref is allowed.

State ordering under the existing original task/outcome graph:

1. `pending-original-actions`: original bound issuance/copy graph exists, revisions
   not yet captured. Guarded credential actions may complete/reconcile; consumer
   startup denied until all required source/revision/pair/DB/recovery facts exist.
2. `captured-awaiting-consumer`: authentic compatible actual revisions are captured.
   Permit ONLY the exact original separately authorized consumer bootstrap action
   (selected PostgreSQL/DB application and/or selected LiteLLM consumer). Before
   each Helm/apply revalidate original task, captured identities and expected
   current target conflict guards; no unrelated deployment/ordinary dependent
   workload, preview, external request or USABLE/completion success is authorized.
3. Original `captured` WITH authentic consumerAcceptanceRef means captured-usable.
   Accept actual selected DB/application/image/credential association under its
   own grants; object apply, pod readiness, URL syntax or secret existence alone
   does not supply that evidence. Only now can ordinary dependent work and the
   target's all-enabled completion be admitted. Existing/copied installations may
   reuse acceptance only when current original identity/revisions and target
   consumer/image/application scope still match exactly.

For a new internal installation, state2 permits starting the specific DB/consumer
needed to obtain state3, removing the circular prerequisite. It does not waive
the state1/2 source/key/revision checks or label bootstrap as usable success.
Consumer failure/unavailable proof leaves state2 BLOCKED for ordinary work, no
new credentials/rotation/rollback or fake acceptance. Crash between capture,
startup and acceptance resolves the original pending consumer action/result
BEFORE current B; uncertain startup reconciles exact original target/image/effect,
not a new Helm action or replacement credential. Original deadlines/counters/
uncertainty remain; missing original history denies continuation. `not-required`
still applies only to explicitly disabled LiteLLM association; each enabled
Redis/PG/OAuth family's own prerequisite remains checked.

## Refined existing SP-INVOCATION/ASSOCIATION/READINESS/RECOVERY oracles

No original case IDs/bodies are deleted. Extend their named caller controls:

- Direct infra with missing/wrong Redis target rejects BEFORE Redis Helm; matched
  complete original target reaches the same guarded primitive. Repeat for PG
  credential and LiteLLM association before their exact Helm/apply. Repeat setup/
  all with helper skipped; skip cannot suppress these checks.
- New internal DB/application: pending actions denies consumer startup; complete
  captured-awaiting-consumer plus authentic exact bootstrap grant permits ONLY
  the named startup; missing/wrong/cross-task grant denies before effect. No
  consumerAcceptanceRef is invented. Ordinary workload/preview still denied.
- Actual successful consumer acceptance promotes to original captured/usable;
  failed, stale-image, wrong-credential or unavailable acceptance leaves ordinary
  work blocked without rotating revisions. Existing independent copied complete
  association still requires authentic still-applicable consumer acceptance.
- Crash at each capture/start/result/acceptance cut retains original revisions,
  task/source/image/grants/spent/absolute deadline and uncertain effect. Bad B
  cannot refill history. Fixed Eval remains original generation.

Mutants: remove only early cmd_infra guard and require missing-Redis/PG/LiteLLM
negative to fail because primitive is reached; allow ordinary deployment in
awaiting state and require readiness negative to fail; require fake acceptance
before bootstrap and require the genuine fresh-install positive to fail. Restore
each exact guard and repeat matched positive. Future native tests need real
disposable receivers/API/task authority; setup failure is not semantic proof.
