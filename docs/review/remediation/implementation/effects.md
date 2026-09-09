# WP02 — Effect ownership and lock lifetime

Source baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. This implements
PCR-EFFECT-001 and the effects-side ownership path of PCR-STATE-001. No deployment,
external service recovery or complete-pipeline pass is claimed.

## Root causes and changes

The acquired lock now has one owner/finalizer around **all** subsequent operations:
locked request/receipt reads, identity checks, receipt replay, request setup and
awaited adapter execution. Renewal timer cleanup remains inside the execution
scope, but lock release occurs once at the outer lifetime boundary. Both primary
and release failures are preserved in AggregateError; primary error remains cause.
Expiry is not used to override live ownership. Confidential dispatch is unchanged.

MemoryEffectJournal and FileEffectJournal snapshot requests/receipts at their entry
points. Their maps no longer retain mutable caller payloads after an owned journal
append. Hydrated sidecar results also use the same immutable snapshot boundary.
The JSON format/hash remains unchanged; optional object undefined fields retain
their existing omission behavior. This completes a caller path which the base
FileJournal fix alone would not protect.

Nova's Dockerfile explicitly installs util-linux from its existing Debian snapshot
and asserts `/usr/bin/flock` is executable during image build. This is the runtime
prerequisite for the state fix, not a new service or architectural layer. BuildKit
runtime already declares util-linux. A new Nova image was **not built** here.
All old PID-lock writers must stop before the kernel-lock version starts; see the
state implementation note. Mixed-version access is not safe.

## Actual verification

- Original `node docs/review/evidence/effect-lock-leak.mjs`: reproduced live-owner
  lock surviving TTL after conflicting concurrent journal write, exit 0 because
  this historical program asserts the defect.
- New `node --test tests/verification/reliability/effect-lock-lifetime.test.mts`
  before coordinator change: three negative-path regressions failed because only
  active, no released record was present; real artifact success case passed.
  After change **4/4 passed**: conflict, orphaned receipt and corrupt journal,
  plus real artifact completion/replay. Two original FileEffectJournal instances,
  original FileResourceLockManager and activated artifact-store; no mocked services.
- `node --test tests/verification/reliability/effect-journal-ownership.test.mts`:
  **3/3 passed** for memory, file-inline and file-sidecar caller/read/replay ownership.
  Same tests with import redirected to the untouched baseline checkout failed all
  three on the actual caller mutation. Temporary baseline runner outside repo,
  no implementation substitution. Memory case is only an in-memory contract test;
  the two file cases perform real persistence and reopen.
- Combined seven tests independently rerun and passed by a separate reviewer.
  Reviewer inspected finalizer awaiting, error preservation and sidecar hydration;
  no source blocker found.
- Canonical ESLint on both effects implementation files and both new test files:
  passed. `npm run typecheck --prefix skills/nova`: passed.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root ...`:
  passed with the Nova prerequisite edit. This is source/deployment-contract
  verification, not a container build, Helm installation or live runtime proof.

Broader validation remains separate. Existing SDK/registry/Prism tests are recorded
in their own notes. No CI invoked. Filesystem/network-mount behavior and power-loss
durability are not inferred from local process-crash tests.
