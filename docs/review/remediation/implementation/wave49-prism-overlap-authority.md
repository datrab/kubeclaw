# PATH-T02-002: started stale action authority boundary

2026-09-09; production source frozen at `961f606`. This package only extends
the original HTTP diagnostic and its evidence. It changes no production state
machine, claim permission, test threshold or register status. PATH-T02-002
remains incomplete.

## Existing causal state machine

- `control/agent-jobs.ts::claimAgentJob` retires an **accepted, never-claimed**
  stale generation as `superseded`. A fence and attempt envelope were never
  issued, so the external action was not authorized to start.
- A claimed action occupies its complete project session until reconciled.
  A successor round cannot be claimed while its predecessor is `running` or
  `needs_nova`. Source supersession does not itself revoke an external gateway
  execution or prove it has ended.
- `storage/index.ts::createDirectionSet` checks the accepted job/fence and
  original bound round before inserting documents. A stale A1 result is denied;
  its document/result transaction rolls back. There is intentionally no
  successful document receipt for the rejected result.
- `server/agent-process.ts` produces only `localProcessClosed: true` after a
  genuine child exit with code zero. The existing comments explicitly exclude
  external gateway termination/cancellation authority. `agent-job-runner.mjs`
  wraps that local execution with the original Worker Core, stores its logs,
  and sends the resulting bound V2 receipt to the original Control finish route.
- `finishAgentRun` verifies the exact accepted V2 binding. It reaches `completed`
  only when both the local receipt is completed **and** the fenced tool result
  was committed. Without that result it enters `needs_nova`, retaining the
  original job, fence, accepted envelope and receipt. Expiry or a local launch
  error similarly cannot authorize a new action.
- `014_agent_jobs.sql` explicitly makes `superseded` a **no-fence** state.
  Reusing it for an already-started A1 would violate the existing authority model
  and schema. No existing authenticated reconciliation route or persisted
  gateway-run termination attestation was found in the Prism producer/consumer
  implementation.

## Genuine local producer diagnostic

The original `control-generation-http.test.mts` now continues the failing full
acceptance scenario past local completion:

1. Original HTTP dispatch/claim starts A1; original dispatch makes A2 current.
2. The original registered design tool sends A1's stale result over actual HTTP;
   Control rejects it and creates zero documents. A2 remains unclaimable.
3. A real **Node child**, explicitly not OpenClaw or a fake gateway, executes
   through the unmodified `AgentProcess` and `WorkerAttemptExecutor`. The
   resulting V2 receipt is genuinely produced, not assembled by the test.
   Original `WorkerArtifactClient` uploads its real full log over HTTP to
   Control's original artifact handler; the test reads and verifies the log.
4. Original HTTP `/finish` accepts that actual bound local receipt but persists
   `needs_nova`, because A1 has no committed tool result. A2 still cannot claim.
5. After closing and reopening the real disk database and original service,
   the exact receipt and `needs_nova` remain; there are still zero documents and
   no successor claim.

This demonstrates that even the strongest current **local** end-of-process
evidence does not satisfy the missing **external** authority. It is not a
native OpenClaw, model, gateway, Envoy or native pg.Pool test. No fabricated
completion, deadline manipulation, direct SQL unlock or substituted application
endpoint is used. Green diagnostics prove the preserved guard, not completion
of the finding's A2-acceptance requirement.

## Required next authority decision and proof — not implemented

A safe started-action retirement would need an authoritative, authenticated
gateway/session terminal or cancellation observation bound to the original
job/fence, session and request (including the actual external run identity),
plus a durable outcome establishing that stale A1 cannot still invoke tools.
The current `localProcessClosed` field and absent callback are not that proof.
An explicitly defined rejected/superseded-after-start outcome would also need
to be distinct from successful design completion and from the existing
unstarted `superseded` state. Unknown or contradictory evidence must continue
to block. These are requirements to design against an actual gateway contract,
not a new automatic force-clear permission for Nova or the test.

Next action: obtain and validate the real installed OpenClaw/gateway session/run
reconciliation contract and its genuine terminal producer evidence; then design
and independently verify the bounded reconciliation transition, including late
callbacks and restart. Without that prerequisite this package cannot safely
make A2 complete. Do not repeatedly rerun this unchanged local diagnostic as a
substitute for the missing external authority.

The saved Product/Controller/Chart package remains separate. Its Control wrapper
must be adapted to the reviewed `ControlService` composition, not blindly
cherry-picked over `server/control.ts`; native CRD/CEL acceptance remains required.

## Evidence

`docs/review/evidence/wave49-prism-control-http/lifecycle-authority.txt` contains
the 2/2 original HTTP cases and the explicit local/Core/Control state diagnostic.
`typecheck-lifecycle.txt` and `lint-lifecycle.txt` contain the full Prism
typecheck and focused canonical test lint. Exact commands:

```sh
node --test skills/prism/tests/control-generation-http.test.mts
npm run typecheck -w @kubeclaw/prism
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/tests/control-generation-http.test.mts
```

No deployment, CI, paid resource, model call or message to a third party.
