# Security suite Phase 8 implementation plan

## Goal

Replace the single legacy header check with five composable provider nodes. Keep each security domain independent. Use real Trivy, real HTTP, the checked Kubernetes manifest, the immutable built image, and controller-observed runtime state.

## Authority split

- The project selects nodes, paths, the header profile, and exact temporary acceptances.
- Nova resolves and signs the plan. Nova imports the final evidence and owns the gate decision.
- Buster schedules isolated providers. Providers cannot run tools or read cluster credentials directly.
- `security.scan` owns the pinned Trivy executable, offline database, registry allowlist, paths, time, and output limits.
- The namespace controller observes runtime resources. `kubernetes.runtime-security` reads only the lease status produced by that controller.

## Implementation steps

1. Register five provider contracts: headers, dependencies, image, static Kubernetes policy, and runtime Kubernetes security.
2. Add strict JSON schemas. Unknown fields are errors.
3. Install Trivy 0.74.0 with verified archives in the Buster image. Freeze its database into the same immutable worker image.
4. Require digest-pinned image input and digest-checked manifest input.
5. Store normalized findings and deterministic result digests.
6. Run a signed Nova-to-Buster vertical proof with a real Trivy database.
7. Keep live attack testing out of this suite. D-035 remains deferred.
8. Render the production Helm chart and verify that the CRD preserves every
   security input and the bounded runtime status. Verify the controller RBAC
   against the collection reads that the Go implementation performs.
9. Test the production Go runtime-security rules directly. Do not maintain a
   second TypeScript decision oracle.

## Exit gate

Phase 8 passes only when all providers register, the real provider test passes,
the signed remote proof imports evidence, the rendered CRD and RBAC checks
pass, the production Go rule test passes, TypeScript checks pass, and no mock
scanner or Kubernetes emulator supplies acceptance evidence.
