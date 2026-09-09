# Independent review of worker terminal resource accounting

Reviewed exact implementation commit `9348a49`, 2026-09-09. Read the full
production diff, the complete phase-deadline behavior, terminal result flow,
Buster provider-session/recovery lifecycle and the new/original tests. This
review changes no functional code.

**No additional blocking defect found within the declared causal slice.**
This does not close whole-attempt ownership, native attribution, orphan cleanup
or the infrastructure/kernel prerequisites listed in the implementation report.

## Checked behavior

- The early assessment remains before cleanup/finalization. Existing overruns
  still prevent optional report finalization. The added final assessment is
  after cleanup, evidence collection, full-log persistence and specialist result
  finalization, before constructing the receipt. A missing final sample cannot
  publish the prior sample as a terminal observation.
- The phase runner's quarantine also applies to maintenance observations. A
  timed-out unresolved phase cannot be followed by an invented measurement;
  unresolved/cancellation/execution causes retain their existing precedence.
- V1 rejects decreased cumulative CPU or sampled peaks. V2 validates complete
  batches, clones observations and clears all observation values to unavailable
  on invalid/regressed final input. Requested budgets still require observable
  metrics; explicit unavailable observations under unrequested V2 budgets are a
  distinct supported policy and are not zero usage.
- Core's claim reservation includes the additional measure phase. Buster's
  issuer also reserves it; its executor uses `retainLogs: false` and supplies no
  `storeFullLog`, so its phase count does not accidentally omit a configured
  durable-log hook. Existing claim/deadline behavior is exercised below.
- Prism retains the maximum of actual RSS samples so the second observation
  cannot reduce its earlier sampled peak. It remains shared-parent RSS, not an
  attempt-exclusive or child-inclusive maximum. Its frozen execution CPU
  measurement is explicitly unchanged and incomplete for later phases.
- Buster retains the original session's last sample after awaited termination,
  refuses post-close PID resampling and avoids repeat-termination overwriting
  recovered totals. Recovery starts only after original termination succeeds;
  sampled CPU is accumulated across those sequential sessions, while memory
  and process peaks use maximum rather than summation. Failed termination does
  not reach successful snapshot deletion.

## Independent executions

All commands run in `/workspace/scratch/0d8f8ddb55c3/wave47-resources`, still at
`9348a49` when checked:

| Command | Result | Actual scope |
| --- | --- | --- |
| `node --test tests/verification/reliability/worker-terminal-resources.test.mts tests/verification/reliability/worker-deadline.test.mts` | Exit 0; 17 passed, zero skipped | Original Core with actual local CPU/file/log work; includes late cleanup/finalization overrun, invalid final V2 binding, early failure, native blocking deadline and unsettled hook behavior. |
| `node tests/verification/contracts/check-pipeline-worker-attempt-executor.mts` | Exit 0 | Original executor contract and immutable receipt/resource regression vectors; vectors are not native production resource accounting. |
| `node tests/verification/contracts/check-pipeline-worker-local-runtime.mts` | Exit 0 | Original local-runtime state/attempt contract. |
| `node node_modules/typescript/bin/tsc --noEmit -p skills/worker/core/tsconfig.json` | Exit 0 | Original strict Core typecheck. |

Raw logs are under `docs/review/evidence/wave47-resource-independent/`.
Existing structural lint debt was inspected in the implementation evidence;
this review does not relabel that as repo-wide lint success. No fake provider,
compiler, resource owner, replacement browser or cgroup was introduced.

## Exact retained limits

Sampling cannot account for short-lived descendants, parent-side capability
RPC, shared JavaScript execution or a true aggregate kernel peak. Buster native
recovery accumulation has source/type evidence here, not a newly successful
original sandbox recovery run. The current code can still perform final
termination after the final observation under cancellation/claim expiry; this
is not proof that all late termination work belongs to the published numeric
snapshot. The existing report explicitly retains that late-owner boundary.

The fresh second call helps only where the operation truthfully measures its
whole declared cumulative scope. It does not turn Prism's frozen execution CPU
into completion-inclusive CPU, nor provider-session observations into
whole-attempt accounting. These limitations are concrete remaining work, not
reasons to discard the verified Core improvement. Full ownership and native
acceptance described in `attempt-resource-accountability-boundary.md` remain
required for closing PCR-PRISM-WORKER-002/-003 and PCR-BUSTER-ENGINE-001/-004.
