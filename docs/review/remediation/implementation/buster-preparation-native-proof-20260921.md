# Actual native Buster preparation proof: preimplementation contract

This extends BP1–BP7/DOC with maintained guest cases. It does not replace original
Buster tests or close B1/IFR16. No root test runs on the development host and no
VM is launched by the test author. A new authenticated guest/source capture must
be reviewed separately; previous native/HA guest snapshots exclude this code.

Use the existing mandatory `KUBECLAW_WORKER_TEST_CGROUP_ROOT`,
`KUBECLAW_WORKER_TEST_LAUNCHER`, `KUBECLAW_WORKER_TEST_NODE_IDENTITY_FILE` and
`KUBECLAW_WORKER_TEST_POOL_LIMITS_FILE` contract. Read preparation budgets through
the original strict `SWARM_CONFIG` author/loader. No second pool resolver, hidden
budget defaults, skipped unavailable cases, quota increase or simulated owner
is permitted. The selected authored profile must actually fit the prepared pool.
The production default 8 GiB preparation budget is not claimed to fit the older
small guest pool merely because test payloads are small.

Required cases before bounded acceptance:

1. Actual `executeBusterPreparation` starts the fixed owned host, validates a
   real signed V1 wire/archive and durably retains exact wire bytes. Actual
   journal/process/result identity and positively unpopulated ownership bind the
   retained input; only then may the actual V2 store persist acceptance. Root
   never bulk-decodes the wire as part of productive preparation.
2. Persisted acceptance survives parent SIGKILL before extraction. A restarted
   actual owner/journal/ledger reads the same input and extracts through
   `extractBusterPreparation`; identities, grants and original bytes remain
   unchanged. A stored acceptance proof is explicitly distinguished from an
   actual emitted HTTP 202; complete HTTP/runtime image composition remains a
   separate prerequisite where not executed.
3. Actual extraction publishes only after native quiescence. UID 1000 cannot
   modify source files or replace gate ancestors; its real mutable repository
   copy accepts ordinary provider writes and preserves executable semantics.
   The guest parent has the actual production capability set, including no
   DAC_OVERRIDE or DAC_READ_SEARCH, rather than unrestricted guest-root power.
4. Two simultaneous gates use the fixed distinct UIDs 1003/1004. Each owned host
   may read/write its own gate; foreign read/write/rename/chmod and signaling are
   denied. Observations include actual credentials/capabilities. Reuse waits for
   native quiescence and gate revocation; preopened descendants cannot outlive
   publication. Landlock unavailable means failure, not fallback.
5. Cancellation and process death before allocation, during staged/extracted
   writes, after physical cleanup but before receipt, and before/after ledger
   release exercise actual recovery paths. Original failed receipts remain
   unchanged; at most one bounded retry is accepted per recovery invocation.
   Unknown/live ownership, wrong markers and foreign cleanup proofs stay fenced.
6. Actual competing recovery/admission retains one current extraction generation;
   correctly released generations permit progress. Small quotas retain all old
   receipt/reference bytes and reject admission before unreserved side effects.
   Invalid archive and source-identity cases run through the actual owned host,
   preserving unrelated/preexisting sentinels.
7. DOC and evidence record each executed case, exact source/tool/profile binding,
   failures and negative controls. Missing image/provider/runtime prerequisites
   remain explicit. Read-only historical stop verification and published-source
   retirement are distinct gates; a terminal status never substitutes for native
   quiescence or authorizes cleanup of published data.

Required materialization inputs still to bind: root-owned compiled generic
sandbox and native launcher, actual GNU tar/gzip and Node runtime dependencies,
immutable source/loader graph, trusted node identity, prepared aggregate cgroup
pool, and one centrally authored preparation profile compatible with that pool.
The old frozen systemd guest is not evidence for these new files. Privilege
setup, filesystem preparation and source copying happen in the separately
reviewed guest builder, not via silent setup inside production tests.

## Maintained implementation status (not executed in a native guest)

`npm run verify:buster:preparation-native` is a distinct mandatory native gate.
It retains all existing verification scripts and first typechecks the three new
native modules and their child fixtures. It requires an explicit `SWARM_CONFIG`
as well as the four existing native pool inputs. Missing inputs fail; cases are
not skipped. The guest builder must prepare `/var/lib/buster-native-proof` as a
root-controlled directory, the actual production parent capability set, and the
immutable tool/source graph. Failed case directories are retained for diagnosis.

The current source contains thirteen cases: signed two-phase preparation and actual
UID 1000 copy/write behavior; stored-acceptance SIGKILL/restart; simultaneous
1003/1004 host isolation; pre-aborted admission; cancellation after validation;
invalid JSON wire; parent crashes immediately before and after durable release;
competing extraction requests; and a separately authored two-record quota that
must retain its original input while rejecting another native allocation.
Additional cases cover deletion before a cleanup receipt, an authenticated
truncated gzip archive processed by actual GNU tar, and a preexisting same-UID
directory that must survive exclusive creation failure and remain fenced.

Release-crash cases deliberately run a failing real helper (`/usr/bin/false`)
inside the actual preparation host to create a partial owned source. This is a
helper-failure case, not proof of malformed GNU tar handling. A test-only wrapper
pauses the actual root ledger method before or after its real durable release
write; the parent sends SIGKILL. Subsequent recovery uses the real native journal,
cleanup host and original failed result. This boundary follows the sealed cleanup
result. A separate `after-delete` variant covers the earlier boundary: a private
test loader changes only the cleanup command's entrypoint to a wrapper importing
the unchanged production cleanup host. The wrapper checks the exact assigned
data path, awaits successful real `fs.rm`, verifies absence, emits a bounded
stderr marker into the actual journal spool and pauses. Before SIGKILL, the root
observer requires the durable cleanup association, an unreleased slot and no
sealed cleanup result. Restart uses the original host, retains the interrupted
predecessor and permits exactly one bound retry. Loader and wrapper hashes must
be included in the future guest capture; these are instrumented crash cases,
not unmodified-host positives.

All thirteen cases and their child fixtures typechecked successfully, and the
complete scoped canonical lint passed (`native-test-types-run6.txt`,
`native-test-lint-run5.txt` under
`docs/review/evidence/buster-native-preparation-design-20260921/`). The two loaders'
final byte-decoding adjustment separately passed canonical lint. Both exact
loader anchors were also exercised by importing their real target module only;
those imports executed no native attempt. Initial type and missing-config lint
invocation failures remain alongside the corrected results. None of these
checks proves a kernel, image, permissions, crash recovery, or HTTP 202 outcome.

The maintained `scripts/tests/buster-preparation-native-mutations.mjs` runs the
unchanged release-crash case before applying a private exact-anchor loader that
omits its durable release write. It requires an actual semantic recovery failure,
rejects timeout/import/syntax failures as detection, and preserves both logs. It
has not been executed. No on-disk production source is changed by either loader.

Still required before this proof gate can be accepted: execution of every case
and the negative control; complete
fresh source/tool/profile binding; and actual isolated execution plus
fresh independent review. Existing local modeled preparation/caller results and
older native VM snapshots do not satisfy these requirements.

The scoped handoff manifest is
`docs/review/evidence/buster-preparation-native-proof-20260921/source-identities.json`.
It binds authored tests/loaders/script, this report, package registration and the
unchanged production cleanup host imported by the crash wrapper. It is not a
complete transitive guest/runtime capture. In particular the prior guest's pool
must not be assumed sufficient: the simultaneous-host case requires two actual
authored memory/task reservations to fit the existing pool. A smaller central
guest profile must still pass the original strict loader, real Node/sandbox
startup and all cases; this handoff neither selects nor changes that policy.

## Unwired additions retained after the thirteen-case checkpoint

The maintained native command still selects the same three modules and exactly
thirteen cases. The following seven files are unfinished fixture work, not seven
additional maintained cases. No native case or kernel proof was executed here.
Exact current bytes, SHA-256 hashes, snapshots and check limits are retained in
`docs/review/evidence/buster-preparation-native-proof-20260921/unwired-handoff/source-identities.json`.
All file names below are under `tests/fixtures/test-gate/`.

| File | Intended boundary | Actual checking status |
|---|---|---|
| `native-preparation-host-boundary.mts` | Real partial write or inherited writable descriptor inside the actual host | Transitively typechecked; no lint/runtime run |
| `native-preparation-host-loader.mjs` | Exact private preparation-host entrypoint substitution | No import, lint or runtime check |
| `native-preparation-stage-write.mts` | Pause after part of actual `request.json` write | Typechecked; no lint/runtime run |
| `native-preparation-extract-write.mts` | Pause after part of actual `repository.tar.gz` write | Typechecked; no lint/runtime run |
| `native-preparation-retained-descriptor.mts` | Actual same-scope descendant with a preopened writable archive FD | Typechecked; no lint/runtime run |
| `native-preparation-partial-crash.mts` | Root observer for pending journal and partial bytes before SIGKILL | Not in native tsconfig; no type/lint/runtime check or parent test case |
| `native-preparation-descriptor-proof.mts` | Observe exact descendant identity/quiescence at actual gate publication | Not in native tsconfig; no type/lint/runtime check or parent test case |

The only post-checkpoint static execution was scoped TypeScript with the three
new entrypoint files included, importing the boundary helper transitively:
`native-test-extension-types-initial.txt`, exit 0. This did not include the last
two child fixtures and did not execute a host. Their parent test orchestration,
unknown/live owner, wrong-marker and foreign-cleanup negatives remain unfinished.
No future reader should infer these obligations from the existing thirteen-case
registration or earlier clean lint log.

The separate production extraction race is now boundedly accepted by the
[fresh independent concurrency review](independent-buster-extraction-concurrency-20260921.md):
the original nineteen-case local suite and five independent checks passed. Its
canonical-root coordination and proof boundaries are described in
[the implementation report](buster-extraction-concurrency-20260921.md). This does
not accept any unwired fixture or supply the missing native guest evidence.
