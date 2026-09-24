# Pipeline Test Gate Phase 7-C Audit

Date: 2026-08-10

## Purpose

Phase 7-C adds authenticated remote execution for resolved test plans. It uses
the existing Buster plan runner and worker core.

## Buster service

`BusterRemotePlanService` accepts one immutable plan job. It verifies:

- The job, plan, and archive digests.
- The installed registry snapshot digest.
- Each provider package and registration identity.
- Each requested capability against the provider declaration and operator
  allowlist.
- Archive and expanded-source limits.

The service extracts the repository into a job-owned directory. It rejects
absolute paths, traversal paths, links, devices, and other non-file archive
types.

The default executor calls `TestPlanRunner`. The existing worker core still
executes one attempt envelope at a time. Phase 7 does not add another test
engine.

## Durable job state

`FileBusterPlanJobStore` stores the complete job and status in the shared
durable record store.

States are:

- `accepted`
- `running`
- `cancelling`
- `completed`
- `failed`
- `cancelled`

Terminal jobs remain available after restart. An accepted job can start after
restart. A job that was running when Buster stopped becomes an explicit
execution failure. Nova then reconciles attempt results that Buster stored
before the interruption. Buster does not silently repeat those attempts.

## HTTP boundary

The service exposes:

- `POST /v1/plan-jobs`
- `GET /v1/plan-jobs/{jobId}`
- `DELETE /v1/plan-jobs/{jobId}`
- `GET /healthz`

Plan operations require a bearer token. Token comparison is constant-time.
Request and response bytes are bounded. The server returns no cached status
responses.

## Nova dispatcher

`NovaRemotePlanDispatcher` performs this order:

1. Store the plan job and archive.
2. Submit the stored job.
3. Verify every returned status identity.
4. Poll until a terminal state.
5. Request cancellation on abort or timeout.

The dispatcher reconnects after a lost submission response. A duplicate
submission returns the existing job. Retryable network and server errors do
not create a new job identity.

The HTTP client reads responses as a bounded stream. It does not allocate an
unbounded response before applying the limit.

Each submit and status request receives a signal for the remaining dispatch
time. A server that accepts a connection but never responds cannot bypass the
Nova timeout. Cancellation requests use their own bounded completion time.

Plain HTTP is permitted only for loopback development endpoints. Remote
endpoints require HTTPS.

## Recovery boundary

Phase 7-C preserves terminal plan jobs. It does not make Buster the recovery
authority for completed attempts. Nova owns attempt reconciliation through the
Phase 5.7 durable result and closure records.

## Verification

`check-pipeline-remote-plan-runtime.mts` proves:

- Authenticated submission and polling.
- Safe archive extraction.
- Durable terminal status.
- Recovery after a lost submit response.
- Duplicate job identity conflict.
- Bounded cancellation.
- Buster restart handling for interrupted execution.
- Authentication failure.

The existing plan-runner proof continues to cover retries, evidence,
providers, report adapters, fixtures, cleanup, resource limits, and attempt
durability.

## Decision audit

- D-067: Normal providers remain in the shared Buster worker profile.
- D-078 and D-092: Evidence and normalized reports remain durable.
- D-081: Provider code remains outside the Buster host process.
- D-097: One worker envelope remains one immutable attempt.
- D-103: Cancellation and bounded termination remain worker-core functions.
- D-105: Buster receives no Nova gate-policy code.
- D-106 and D-107: Nova remains recovery authority for durable attempts.
- D-110: The authenticated submit, status, and cancel transport is implemented.

## Phase 7-C result

The remote execution and reconnect path is complete. Phase 7-D can import the
terminal result into Nova and apply gate policy.

Phase 7-D added the bounded evidence-read operation needed by a remote Nova.
Nova does not depend on Buster-local `file:` links. It reads an artifact by its
job and content digest, then verifies and stores the bytes before import.
