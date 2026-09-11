# Buster status-read residual — confirmed RED evidence only

2026-09-11, bounded follow-up. Production source frozen at `36e2027e917dc6d26794c58bcf3b5d6e02d6acf1`; no production/test-gate/package/register changes. Source SHA-256 is recorded in evidence/result.json.

## Reproduced behavior

The original `#execute` catch at `skills/buster/engine/test-gates/remote-plan-service.ts:801` converts a rejected durable status read to null. Line 802 then returns as if the failure were handled. Because the execution fulfills, the new fatal-rejection owner is never invoked. This residual is separate from the fixed escaped terminal-write rejection.

The evidence uses the original registry, plan resolution, Git committed source archive and Ed25519 attestation, original job creator, original FileBusterPlanJobStore and original BusterRemotePlanService. It initializes recovery and submits one accepted job. A synchronous write plus fsync then corrupts only that fixture's actual records/store.json with incomplete JSON, while execution is reading the newly accepted job. No store methods, private execution hooks, process constructors, response values or providers are replaced.

Both runs independently observed:

- Original `store.get(jobId)` rejects with SyntaxError before shutdown.
- Original service readiness returns `{ready:true, code:"BUSTER_READY"}`.
- Original `shutdown(3000)` fulfills.
- Original `store.get(jobId)` still rejects with SyntaxError after the completed drain; the invalid durable bytes remain unchanged.
- The regular file used as runtimeRoot remains unchanged and prevents every provider start.

The actual test expects unknown durable state to prevent successful shutdown. It is **RED**, one failure / zero passes, exit 1 in both runs. The failure is the final assertion on fulfilled shutdown, after the real store-read failures and actual drain are observed. This is not a green diagnostic test or native acceptance evidence.

## Reproduction and limits

From repository root: `node --test docs/review/evidence/resume-84-buster-status-read/original-store-read-red.mts`.

Evidence directory: `docs/review/evidence/resume-84-buster-status-read/`, including two original logs, standalone reproducer and machine-readable result. The reproducer creates and cleans only its own temporary repository/runtime/store. Its deliberately corrupting write models a real unreadable durable file; this does not establish the probability or origin of such corruption in production. Each run used a fresh genuine store. The public read errors and awaited shutdown make the erroneous outcome observable even without inspecting private active-execution state.

No fix was attempted in this timebox. A future fix must distinguish an unknown/unreadable status from a known terminal status and preserve error ownership; it must not invent a successful or terminal record, infer native quiescence, or discard workspace inputs. The existing native restart/adopted-process recovery acceptance remains open. No finding count/status changed, no cluster/provider/browser/database gate ran, and no CI/deployment/host-control changes were made.

## Superseding bounded correction (parent-authorized after the RED evidence)

The subsequent minimal correction now throws AggregateError with both the original execution failure and the actual status-read failure into the existing fatal owner. Known terminal states keep their previous behavior. The sixth production regression uses the same original store corruption, requires readiness false and shutdown rejection, checks both retained causes are the original SyntaxErrors, and verifies corrupted durable bytes and runtime inputs remain untouched. All six production regressions pass locally (fixed-six.log); the earlier RED evidence remains historical and unmodified. This closes the narrowly reproduced status-read suppression only, with no broader native acceptance claim. Parent requested a freeze at18:14:15; actual tool clock at the start of this update was18:14:39, so integration needs parent decision on its remaining review window.
