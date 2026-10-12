# Buster extraction concurrency: preimplementation criteria

The actual `reserveExtraction` method can return the same incomplete envelope
to concurrent requests. Both callers can then observe `gate === null` before
either has committed its gate binding; exclusive creation can surface raw
`EEXIST` before the native journal's attempt fence is reached. This is a source-
proven coordination gap; the thirteen-case native checkpoint remains historical.

EC1. Capture and validate the input before waiting. Coordinate the entire real
`extractBusterPreparation` path, before reservation/gate creation, by canonical
source root plus exact input identity. A duplicate concurrent request receives
`BUSTER_PREPARATION_EXTRACTION_BUSY` before durable reservation or launch.

EC2. Different inputs retain the existing authored parallel capacity. Bound
in-memory coordination by that capacity, release it in `finally` on success,
failure and cancellation, and remove idle root entries. No new persistent lock
tree, quota author, queue or productive fallback is introduced.

EC3. This is only in-process request coordination. Durable authority remains the
existing ledger, native journal and `NativeWorkerOwnership.supervise` lifetime
fence. The sole production composition constructs one ledger inside that owner;
startup recovery is awaited before `servePreparationRequests` exposes extraction.
Canonical root identity also unifies aliases or distinct ledger wrappers within
that process. No unknown crash ownership is released by clearing memory.

EC4. A deterministic regression calls the actual extraction entrypoint and
pauses its real reservation boundary before any gate creation. Prove same-input
rejection before that boundary, different-input parallel progress, captured input
ownership and guard release after thrown/aborted work. Its unreachable native
dependencies fail if accessed; it proves coordination, not native execution.

EC5. A private guard-removal mutation must fail the same regression at its
intended reservation/duplicate assertion. Preserve the existing actual-native
competing extraction case, original local preparation cases and all deadlines.
Run scoped types and canonical lint. The native case still needs later genuine
isolated execution and fresh independent review.

DOC. Record the exact production entrypoint/recovery trace, before/after source
identities, original and negative-control results, and proof limitations. Keep
BP/B1/IFR16 open. No root-native test, deployment or VM launch is authorized here.

Before-source identities were recorded in
`docs/review/evidence/buster-extraction-concurrency-20260921/before-identities.json`
before implementation edits.

## Implemented result, bounded independent review accepted

The [fresh nonauthor review](independent-buster-extraction-concurrency-20260921.md)
accepted this coordination slice after the original nineteen-case suite and five
independent checks. Native guest execution and the broader BP scope remain open.

`extractBusterPreparation` now clones and validates the staged identity, resolves
the canonical existing source root, and synchronously acquires a bounded
in-process entry before invoking its unchanged reserved extraction body. The
key includes the full input digest. Root aliases and separate ledger wrappers
therefore share coordination. Different inputs remain parallel up to the authored
`maximumActivePreparations`; `finally` removes the input and removes empty root
entries. No new disk locks, records, queue or policy defaults were added.

The production trace is concrete: `runBusterPreparationSupervisor` constructs
one `PreparationSourceLedger` inside `NativeWorkerOwnership.supervise`, awaits
native recovery, historical import and ledger recovery, and then exposes the
sole productive `extractBusterPreparation` caller through
`servePreparationRequests`. Recovery mutates the same durable ledger before
request serving; it neither starts this in-memory guard nor relies on it to
release ownership. A restart still needs all existing native recovery proof.

Executed checks:

- The new actual-entrypoint barrier module passed four cases: canonical alias
  duplicate rejection/caller capture, two distinct inputs progressing together,
  and guard release after thrown or aborted work.
- The maintained `verify:buster:preparation` command passed scoped TypeScript and
  all nineteen cases: all fifteen existing cases plus these four. The original
  GNU flock binary ran through the existing private proot binding. No cases were
  skipped and no assertions or deadlines in the existing cases were changed.
- Canonical lint passed for the modified production module and new test.
- A private loader restored the exact recorded before-source. The same duplicate
  regression failed with `DUPLICATE_REACHED_RESERVATION` instead of the required
  `BUSTER_PREPARATION_EXTRACTION_BUSY`. This is an actual boundary assertion
  failure, not an import or timeout failure; production files were not rewritten.

Raw logs are `types-initial.txt`, `tests-initial.txt`, `lint-initial.txt`,
`original-preparation-suite.txt` and `mutant-original.txt` in this change's evidence
directory. The local barrier deliberately intercepts reservation before any
native owner/gate access; those dependencies throw if reached. It proves request
coordination only. The unchanged native competing-extraction case still requires
actual isolated execution. BP, B1 and IFR16 remain open.
