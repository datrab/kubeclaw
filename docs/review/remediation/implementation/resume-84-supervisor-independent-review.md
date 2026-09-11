# Independent supervisor recovery-stop review

Source `3480724df6c75d323ae56a0b4665ab61164874b5`, tree
`dfdfb376b75f3facbf78118cc69b7037d38d15d6`, reviewed against `7d172b6` in the
isolated `review-supervisor-final` checkout. No production changes by reviewer.

Bounded approval: no introduced defect found. Abort admission is checked before
launch, after listener registration, at retry-loop boundaries and after adopted
process observation. The recovery wait unregisters its listener and timer on
either timeout or abort. JavaScript's synchronous timer/listener setup leaves no
uninitialized binding window for its already-aborted check. `return await`
retains lease ownership and signal listeners until the async supervisor actually
settles, before the original finally releases them. Status semantics and adopted
external process signalling remain unchanged; no process ownership was widened.

The new SIGTERM/SIGINT regression executes the real supervisor/npm/pipeline CLI
and status reader using intentionally invalid canonical graph input. It checks
exit130, no recovery invocation, no extra attempt diagnostic and released lease.
The 1.2-second positioning delay is a test scheduling assumption; the observed
no-relaunch/lease outcome is real and is not claimed as arbitrary scheduler proof.

Independent tests:

- Actual stop/status/start integration command: **8 passed, 0 failed, 0 skipped**.
- Original repository-review-operations tests: **5 passed, 0 failed, 0 skipped**.
- `node --check scripts/supervise-repository-review.mjs`: exit0.

Raw evidence is under `docs/review/evidence/resume-84-supervisor-independent-review/`.
The first invocation mistakenly named the new stop test without its integration
subdirectory; Node ran only the five existing operations tests. That output is
retained as `tests.txt`, not counted as stop proof. Corrected invocation:

```
node --test scripts/tests/integration/repository-review-supervisor-stop.test.mjs scripts/tests/repository-review-supervisor-status.test.mjs scripts/tests/integration/repository-review-supervisor-start.mjs
```

Its `integration-tests.txt` records the eight actual intended cases. Existing
source lint debt documented by the implementer is not represented as clean. This
review does not claim native adopted-process identity, successful model execution,
full pipeline recovery, or closure of a broader original finding. No native gate
was retried, and no deployment/CI was performed.
