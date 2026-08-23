# Prism audit remediation plan

Status: repository remediation complete; live cluster acceptance blocked.

Date: 2026-08-22.

## 0. Current execution record

The repository phases in this plan are implemented. The live exit gates remain
blocked until an operator rolls the namespace-controller image and GitHub
publishes the new Prism images.

- Prism tests do not use port-forward. The in-cluster runner uses Service DNS.
- Studio uses the normal Tailscale URL for the human review path.
- The accepted namespace-controller source does not grant `pods/portforward`.
- The deployed controller still tried to grant `pods/portforward` during a clean
  `default` lease test. This proves that the deployed image is behind the
  accepted source. No controller source change is required. An operator rollout
  is required.
- Nova has permission to create a `BusterNamespaceLease`. Nova has no namespace
  create or delete permission.
- The clean lease was deleted after the failed test. The controller removed its
  temporary resources.
- No mock result can satisfy the live Nova, Forge, Buster, backup, restore, or
  failure gates.

Repository completion does not change the release state to production-ready.

This plan closes the open findings from the live namespace test, the architecture
audit, and the Terra Autoreview. Complete the phases in order. A phase is complete
only when its exit gate has real evidence.

## 1. Test access decision

Do not use `kubectl port-forward` for Prism acceptance.

- An in-cluster test-runner Job uses Kubernetes Service DNS.
- A user opens Prism Studio through its Tailscale URL.
- GitHub Actions creates a namespace lease and then creates the test-runner Job.
- The test-runner Job runs inside the leased namespace.
- No agent receives `pods/portforward` permission.
- No agent receives namespace-management permission.

The service addresses in a leased namespace are:

```text
http://prism-control.<namespace>.svc.cluster.local:<port>
http://prism-worker.<namespace>.svc.cluster.local:<port>
http://prism-studio.<namespace>.svc.cluster.local:<port>
```

The Tailscale URL is for user review. It is not the service-to-service path.

## 2. Phase order

1. Verify the existing namespace-controller path and correct only the Prism test transport.
2. Fix the two P1 safety findings.
3. Enforce the accepted Design Document schema.
4. Complete the renderer and Studio contract.
5. Complete publication quality gates.
6. Complete corpus ranking and preference projections.
7. Replace claimed E2E tests with real pipeline tests.
8. Make clean verification reproducible.
9. Run leased startup and failure tests.
10. Run the final audit and release gate.

Do not start feature work while a P1 finding is open.

## Phase 1: verify the controller and correct the test transport

### Work

1. Do not change the controller before a clean test of its existing supported
   path.
2. Create a lease with the same capability and exposure settings used by the
   previously successful end-to-end tests.
3. Confirm that the controller creates the namespace, scoped RBAC, Service, and
   Tailscale exposure without an error.
4. Remove port-forward from `deploy.sh prism-e2e` and all Prism live tests.
5. Do not request the legacy `storage` runner profile only to get port-forward.
6. Add a test-runner Job template to the Prism chart or acceptance workflow.
7. Give the test-runner access only to the required Prism Services.
8. Use Service DNS from the test-runner.
9. Use the Tailscale URL for the Studio user journey.
10. Delete the lease after the test and wait for controller cleanup.
11. Change or roll out the controller only if this clean test finds a controller
    defect or proves that the deployed image is behind the accepted controller
    source.

### Tests

- Nova can create a `BusterNamespaceLease`.
- Nova cannot create a namespace.
- The controller creates `test-prism-*`.
- The controller creates the scoped runner Role without `pods/portforward`.
- The test-runner reaches control, worker, Studio, and PostgreSQL through DNS.
- The test-runner cannot reach a forbidden service.
- Lease deletion removes the namespace.

### Exit gate

One leased namespace reaches Prism readiness without port-forward.

## Phase 2: close both P1 safety findings

### Migration lock

1. Acquire the PostgreSQL advisory lock before schema or migration metadata is
   created.
2. Keep schema creation, migration-table creation, discovery, and migration
   execution under the same lock owner.
3. Release the lock in a guaranteed cleanup path.

### Replay protection

1. Replace the worker-local nonce `Map` with a PostgreSQL nonce table.
2. Store the request audience, nonce digest, issue time, and expiry time.
3. Insert the nonce atomically before work starts.
4. Reject a duplicate nonce across replicas and after worker restart.
5. Delete expired nonce rows with a bounded maintenance job.

### Tests

- Start two first-time migration Jobs at the same time.
- Send one signed request to two worker replicas.
- Restart the first worker and replay the request.
- Prove that one request executes and all replays fail.

### Exit gate

Terra Autoreview reports no open migration-lock or replay-protection finding.

## Phase 3: enforce Design Document v1

### Work

1. Replace free node `type` strings with the accepted v1 node catalogue.
2. Define a strict property schema for each node type.
3. Reject unknown properties.
4. Validate component overrides and state patches against the target node type.
5. Reject changes to node identity or type through a patch.
6. Keep provider data and executable code outside the document.
7. Add valid fixtures for web authentication, a dense dashboard, and a TUI flow.
8. Add invalid fixtures for unknown nodes, unknown properties, bad references,
   cycles, and unsafe values.

### Exit gate

The JSON Schema, TypeScript types, renderer catalogue, and fixtures describe the
same v1 contract.

## Phase 4: complete renderer and Studio v1

### Work

1. Implement every accepted v1 node type or record an approved smaller v1
   catalogue before release.
2. Remove generic renderer fallbacks for canonical nodes.
3. Replace the normal raw JSON property editor with typed controls.
4. Keep raw JSON in an expert diagnostic view only.
5. Make one Puck change produce one atomic Prism operation set.
6. Support views, states, flows, compact/regular/wide sizes, history, restore,
   undo, redo, and revision conflicts.
7. Keep Puck behind the editor adapter.
8. Test a second minimal adapter against the same operations.

### Exit gate

A non-designer can complete Brief, Directions, Prototype, and Approve without
editing JSON.

## Phase 5: complete evaluation and publication

### Work

1. Add rendered accessibility and keyboard checks.
2. Add visual hierarchy, consistency, content, and completeness checks.
3. Check required loading, empty, error, recovery, success, permission, and
   destructive states when the architecture requires them.
4. Block publication on every error.
5. Require an explicit approval record for every warning.
6. Store the quality report and accepted limitations in the bundle.
7. Verify every bundle path and digest before publication.
8. Keep publication idempotent after restart.

### Exit gate

An incomplete design cannot publish. A warning cannot publish without an
authorized decision.

## Phase 6: complete retrieval and learning

### Retrieval work

1. Add required, preferred, and excluded filters.
2. Add source-family caps, diversity, freshness, and overuse penalties.
3. Return score explanations and a coverage-gap report.
4. Apply rights and expiry before each result is returned.

### Preference work

1. Separate personal, project, domain, craft, and novelty projections.
2. Add decay and diversity safeguards.
3. Keep every learned preference explainable and retractable.
4. Add blind regression briefs.

### Exit gate

Retrieval explains why each result was selected. Retracting one preference
changes later ranking as specified.

## Phase 7: replace false-complete E2E evidence

### Work

1. Replace the direct Prism-control script with a real Nova-started run.
2. Do not inject a canonical fixture Design Document into the success path.
3. Generate two directions through the configured provider.
4. Approve through the real Tailscale identity path.
5. Resume the same Nova run.
6. Give Forge read-only access to the exact Baseline Bundle digest.
7. Make Forge implement a small real application.
8. Send the same digest to Buster.
9. Insert controlled visual, keyboard, and flow defects.
10. Require Buster to identify each defect through its real gateway.
11. Correct the defects and pass against the unchanged baseline digest.
12. Remove the shell-command assertion that only claims Buster found defects.

### Exit gate

The evidence chain proves Nova to Prism to Forge to Buster. Direct control API
calls are not accepted as pipeline E2E evidence.

## Phase 8: reproducible clean verification

### Work

1. Make one documented bootstrap command install all locked development tools.
2. Put nested packages in the root workspace or give each one a lockfile.
3. Make `npm run verify:prism:production` work from a fresh checkout.
4. Fail when a required live check is skipped.
5. Record which tests use PGlite and what PGlite does not prove.

### Exit gate

A clean checkout passes the production verifier with the documented command and
no manual nested installs.

## Phase 9: leased startup and failure proof

### Startup proof

1. Resolve the four Prism image digests from the GitHub build.
2. Create a `BusterNamespaceLease`.
3. Install Prism in the leased namespace with the exact digests.
4. Use a real PostgreSQL pod and persistent storage.
5. Create structurally valid provider Secrets.
6. Run migrations and readiness checks through Service DNS.
7. Open Studio through Tailscale.
8. Run one real generation after provider credentials are available.

Basic startup does not require a successful model request. A generation test
does require valid provider credentials.

### Failure proof

- Stop control before dispatch.
- Lose the dispatch response after acceptance.
- Restart Nova during approval wait.
- Stop a worker during render.
- Restart PostgreSQL.
- Disconnect artifact storage.
- Return a provider rate limit.
- Corrupt a bundle artifact.
- Use a stale approval.
- Expire corpus rights during retrieval.
- Prove backup and restore on persistent storage.

### Exit gate

The startup test passes once. The full success journey passes twice in new
leased namespaces. All required failures reach their specified recovery state.

## Phase 10: final audit and release gate

1. Audit code against all accepted Prism architecture documents and decisions.
2. Audit Helm output, RBAC, NetworkPolicy, Secrets, storage, and Tailscale.
3. Run Terra Autoreview with high reasoning.
4. Fix all valid P0 through P3 findings.
5. Repeat the full clean and live test sets.
6. Publish immutable evidence with commit, image, namespace, test, and artifact
   digests.
7. Change the blueprint to `implemented` only after all gates pass.

## Definition of done

Prism is ready only when:

- No agent manages namespaces.
- The controller can create and clean a leased Prism namespace.
- Prism acceptance uses Service DNS, not port-forward.
- Both P1 findings are closed.
- The strict Design Document schema is enforced.
- Renderer and Studio implement the accepted v1 contract.
- Publication quality gates are complete.
- Retrieval and preference learning implement the accepted safeguards.
- The clean verifier is reproducible.
- Real Nova, Prism, Forge, and Buster evidence exists.
- The success journey passes twice in clean leased namespaces.
- The real failure matrix, backup, restore, telemetry, and alerts pass.
- Terra Autoreview has no open P0 through P3 finding.
