# T15-F01 independent configured-writer review

Verdict: **incomplete; do not close T15-F01**.

The frozen scope was independently re-derived from the remote register at
`c38779c71bb92bc15c3fcb89930348e5417aa475`. Exactly 47 entries had status
`implementiert`; their sorted IDs exactly match `partial-47-scope.json`, all are
present at remote MAIN `e644a79fddd4d4d686fbd351b6edaec5575caf57`, and their
original finding text is unchanged. T15-F01 still requires a real, configured
Writer consuming run/source-bound immutable evidence and producing a
source-referencing draft.

## Acceptance boundary

A closing proof must run the original `pipeline-review` and `case-study` stages
through the configured `kubeclaw.runtime-dispatch:openclaw` provider and an
actual Writer session. A canned HTTP response, a deterministic fake writer, a
precomputed result file, or a local assertion over source bytes does not satisfy
that requirement. The same execution must use completed Core histories at two
real source revisions, the original ArtifactStore and `report.evidence.read`,
and retain the exact run/head/snapshot/source/attempt and full ArtifactRefs in
the persisted report. Wrong-run, stale, duplicate, missing and tampered inputs
must fail. The generated prose remains
`narrativeStatus: draft-not-entailment-verified`; citations do not prove its
claims. Older mode-ambiguous histories must reject rather than receive a guessed
marker.

## Independent results

The unchanged source-authority suite passed 10/10 with zero skips. It genuinely
uses two Git/source histories, Core lifecycle/effect journals and original
artifact reads, including the required negative cases. Both original plugin
suites also passed, including authenticated local transport, retry/reopen,
durable replay and persisted output. However, each live suite explicitly emits
`modelExecution:false`; its HTTP responder is a transport fixture. These results
preserve the existing bounded implementation but cannot close the Writer gate.

The environment has no discoverable `openclaw` executable, standard OpenClaw
configuration file, gateway token or configured tools URL. The listener probe is
not evidence of absence: `ss` was denied by the sandbox with
`Cannot open netlink socket: Operation not permitted`. Corrected author
checkpoint `6e91619dda17204d571de4b013b6d28aa09f0abc` records the socket state as
unknown, has exactly two review-only files over sole parent `e644a79`, and is
accepted as an incomplete checkpoint. Superseded `675f3f3` must not be used.
Without configuration and credentials no authorized target can be selected or
called.

No source change is justified. T15-F01 remains open pending an explicitly
authorized environment containing the configured Writer/runtime. The broad E2E
probe must not be used here because it also performs unrelated provider,
messaging, infrastructure and deployment-adjacent actions outside this package's
authorization.

Raw independent output:
[run20-t15-writer-independent.txt](../../evidence/run20-t15-writer-independent.txt).
