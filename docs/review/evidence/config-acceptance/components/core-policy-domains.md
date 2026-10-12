# C0 Core policy domains and exact consumer relationships

This closes the domain definition of the thirteen Core operator rows (twelve
numeric policies and one existing boolean API). It does not implement configuration,
prove F-EFFECT, or change historical corrected proposals. The numeric literals
have no adjustable CONFIG/API parameter today. The bounded next migration uses
**required integer const equal to the observed existing value** for these twelve
policies. These remain operator policies/author obligations, not protocol invariants.
Missing policy cannot acquire the literal through code/ENV/schema defaults. A
future expanded supported domain is a separate reviewed proposal, not an unknown
bound blocking this exact value-preserving definition.

| Existing ID suffix | Required proposed domain | Real boundary / alias relationship |
|---|---|---|
| INPUT-BYTES | integer const16777216, JSON/canonical UTF-8 bytes | WorkerAttemptExecutor preflightJson before clone/freeze/schema/operation; byte count includes keys/escaping, not string.length. Native role assigned input/ingress buffers remain distinct narrower instance limits, not duplicate authors of the Core guard. Actual Node MAX_STRING_LENGTH/Buffer constants recorded; they are implementation ceilings, not permission to allocate that size or a proven safe adjustable policy. |
| JSON-NODES | integer const100000, visited JSON values | Same preflight counts each value once, tracks cycles/types/own descriptors; shared input and returned/finalized specialist result nodes use same author. Keys are encoded bytes, not visited nodes. JSON schema arrays independently max1024; a100000-value control must be nested bounded arrays, not an invalid100000-item array. |
| JSON-DEPTH | integer const64, root depth0 | Iterative preflight rejects depth65 before recursive freeze/digest/Ajv; result/finalized specialist paths same guard. JS recursive stack/heap safety is runtime-dependent; positive-safe-integer is not a valid universal depth range. |
| LOG-PARTS | integer const10000, operation chunks | Actual log callback checks count before increment/chunk emission; independent framed/UTF-8 byte ceilings and65536-unit wire chunking also apply. Count increments before retainLogs=false branch, so retention does not disable enforcement. Final system terminator is separate. No huge accepted count range inferred from JS array length or available memory. |
| DRAIN-POLL-MS | integer const10, ms | NativeWorkerResourceScope.terminateAndDrain writes real cgroup.kill then repeatedly reads real counters; delay=min(selected10, remaining absolute performance deadline). Not the distinct supervisor pollIntervalMs author; no delay/deadline reset or empty observation fabrication. Signed32 timer limit is underlying API boundary; preserving10 is established, arbitrary new cadence is not. |
| POOL-FILE-BYTES | integer const65536, stat/read bytes | O_RDONLY/NOFOLLOW/NONBLOCK→fstat root-owned nonwritable regularfile size1..65536→readFileSync UTF8→JSON/path/role/domain validator. Host producer owns actual capacity/paths; Core ceiling does not make a second pool author. Producer immutable-file publication/trust remains delivery requirement. |
| RUNTIME-IDENTITY-FILE-BYTES | integer const4096, stat/read bytes | Same trusted FD predicate size1..4096 then JSON compares actual /proc boot ID and cgroup namespace device/inode. Width does not license fake identities or namespace changes. Host prepare producer also has4096 loader guard (delivery classification obligation, not second Core author). |
| NODE-IDENTITY-FILE-BYTES | integer const128, stat/read bytes | Same trust predicate size1..128, trim then32hex/UUID grammar. UUID width32/36 is supported data domain, not replacement policy128. This reader does not prove physical Kubernetes placement or semantic policy digest provenance. |
| JOURNAL-RECORD-BYTES | integer const65536, canonical payload bytes | Sole selected Core policy must feed NativeAttemptJournal FileDurableRecordStore.maximumRecordBytes; nativeJournalTerminalMetadataBytes payload bound and reserve calculation input+maxOutput+maxResult+recordBytes must use same reference. Record ceiling is payload, total framed record/state/foreign rows and crash blobs charged separately; reserve two state copies and reject unsafe sums/total capacity. No generic store default replaces supplied Core quota. |
| JOURNAL-DIAGNOSTIC-UNITS | integer const4096, JS UTF16 units | validateJournalState signal/fault length1..4096 or null; capacity projection uses '\\u0000'.repeat(selected units), so worst JSON escaping may cost6bytes/unit **for each** signal/fault. Selected diagnostic and record/state bounds must be checked by actual serialized future terminal reservation, not4KiB bytes. Existing retained history validated against its captured closure, not a lower latest limit. |
| OWNERSHIP-DIAGNOSTIC-UNITS | integer const4096, JS UTF16 units | native-worker-ownership diagnosis .slice(selected units).toWellFormed; ownership-state.validateDiagnosis max same selected author; ownership-capacity maximumDiagnosis projection same reference. Diagnostic clipping does not forge successful empty/disposed state. Captured diagnosis/metadata constraints remain stable through recovery. |
| LOCK-STRIPES | integer const2, trailing hexadecimal width | journalKey hash(workerId,attemptId,generation), key.slice(-2) selects256 potential stripe directories; each lifetime calls real withDurableStoreLock→mkdir/private file→/usr/bin/flock. No retarget while old/new processes overlap. Width2 is R policy, not digest invariant; digest256bit remains protocol. Retain2 for migration; a new width requires explicit coordinated versioned routing/lifetime/publication transition and capacity evidence, not invented1..64 range. |
| RETAIN-LOGS | required boolean true/false per actual Core instance/profile | Existing typed API supports both; omitted currently means true. Prism native supplies storeFullLog and omits retention; Buster preparation/historical/source-cleanup explicitly false. Target selected complete Core instance/profile must supply explicit value before each actual constructor, preserve each role's current choice, and pass false rather than accidentally omit it. No globally inferred true applied to those roles. |

## Cross-contract relationships, not copied authors

- Core preflight byte/node/depth policies apply to accepted task JSON and result
  JSON, including operation.values recursive schema branches. They constrain task
  data, do not authorize its contents or substitute for the task/role schema.
- Input-byte guard16MiB does not replace Prism ingress/native input policy or
  Buster preparation maximumInputBytes64KiB. Journal/role/spool/native process
  bounds retain their distinct owner/scope and must all admit the same selected
  immutable closure; exceeding the earliest applicable guard rejects there.
- Journal record+diagnostic+input/output/result/state/total quotas are coupled
  through **real** futureRecordBytes/reserveNativeJournalMetadata and actual
  usedJournalBytes; preserve receipt and crash leftovers. FileDurableRecordStore
  payload limit65536 is not a total-store payload-only accounting shortcut.
- Ownership diagnostic clipping, validation, future serialized reservation and
  store byte/record limits are one captured instance contract. The12 native
  counters/topology fields remain generated records; none becomes CONFIG data.
- Root file byte guards do not alter kernel quota readback, path trust, nofollow,
  role or producer domain checks. Exact parser positives below do not claim pool
  capacity readback or deployed node identity.
- Drain cadence does not affect the absolute termination deadline or permit
  reporting sampled/empty observations as proof. No C syscall ceiling is inferred
  for policies used solely in JS JSON/string/FD readers. Native launcher argv
  bounds remain separate role-generated/C safety obligations.

## Actual C0 consumer observations

`node docs/review/evidence/config-acceptance/components/check-core-domain-definition.mjs`
executes real constructor/preflight, trusted FD reader/proc identity, retained
state validators, terminal metadata projection, FileDurableRecordStore and
NativeAttemptJournal admission/replay in a fresh local temporary directory.
`core-domain-definition-attempt2.log`:24 checks passed. Root UID and actual Node
Buffer/string constants are recorded. Local flock helper processes are the only
children; no business worker/host, cgroup mutation or production host configuration.

First run:23 passed/1failed. The100000-item array crossed actual contract maxItems1024,
not Core node count. Retained failed log and script snapshot; revised only evidence
input to nested arrays each<=1024. Second run admits exact100000 visited values and
rejects100001 at the intended Core boundary. Do not promote first-run failure.

Root-owned policy documents and UUID are **synthetic definition fixtures** with
real FD/stat trust checks; no actual pool capacity/physical node claim. Runtime
identity control contains current actual local boot/namespace and verifies real
/proc readback. Zero resource counters in synthetic journal-state schema controls
are not kernel observations and never dispatched/persisted as real native results.

Log-part and10ms cgroup-poll checks are exact source-definition observations only.
Proposed real emitting provider/native host and genuine delegated-cgroup consumer
cases are linked, not-run; no fabricated measured operation or cgroup mock.

## Exact required implementation cases

Per policy: required-single-author VAL rejects absent/wrong type/nonconst/equal
old author before real constructor; projection loads selected value and observes
all named aliases; real consumer control/excess checks cover byte/node/depth,
log chunks, FD sizes, serialized payload/diagnostic/future capacity and lock route.
Retain exact old attempted alternate profiles as **historical unsupported domain
proposals**, never valid A/B under the const-only numeric definition. Existing
EFFECT case IDs are retained: status not-run, with explicit domain correction;
no two-valid-profile EFFECT claimed for these currently nonadjustable policies.
Finite preservation is not acceptance of wider tuning or global CONFIG.

## Prism phase allowance is separately authored

`AUTH-PRISM-NATIVE-COMPLETION-PHASE-ALLOWANCE` is parent-owned, not Buster authority.
`nativePrismExecution.execute` process timeout = envelope.timeoutMs + selected
allowance*cleanupTimeoutMs; native-worker-process actual timer<=2147483647 and
safe arithmetic; native acceptedLimits clips to original active claimRemaining.
Prism nativeOperationFor supplies no cleanup/collectEvidence/finalizeResult;
native-worker-host storeFullLog with omitted=>true retention gives actual minimum
phase allowance4 (base3+fullLog1). Changing retention/hook membership requires
rechecking that relation. Current allowance8 needs selected module execution
snapshot before dispatch/recovery; it is not currently in attemptSpecDigest.
Independent AUTH-PRISM-CLAIM-LIFETIME is10min, not Buster's timeout+allowance claim.
Keep original producer claim/queue and recovered requested resource budgets;
never transfer Buster authority or rebuild them from current phase policy.
