# Version generator integration after Trivy freshness and workflow split

Two original generator failures were exposed while checking the subsequent
GitHub action pin change. These are causal integration repairs of earlier slices,
not action version upgrades.

Trivy freshness (`fab6f1d`) added `ARG TRIVY_DATABASE_REFRESH=manual`. The original
version generator treated every unrecognized ARG as an unmanaged software
version, so `versionOutputs` rejected the actual Dockerfile. The generator now
classifies exactly that argument in exactly `docker/Dockerfile.buster-runtime`
as an operational build-cache key. It does not exempt a prefix or other
Dockerfiles. The actual argument occurs only in its declaration and the
`RUN test -n` cache-layer input; it does not select a tool or base-image version.
Unknown ARGs still fail, and using the refresh parameter as a FROM base still
fails the independent central-base authority check.

Workflow trust split (`fbaeb3c`) introduced separate Ops validate/publish jobs,
each with the same centrally managed Helm version. The original generator
required exactly one matching field and rejected the second. Its replacement
helper still defaults to exactly one match; the Ops call explicitly requires
exactly two and replaces both with the same central `ops-pod.HELM_VERSION`.
Missing/extra matches continue to reject. This does not infer tool versions from
action pins or comments.

The original versions test now proves the actual refresh-key uses, rejection of
a similarly named unknown ARG and its misuse as a base, both real Ops workflow
Helm fields receiving a changed central version, and rejection when a field is
removed. Synthetic version strings in this existing propagation test are never
built or represented as real releases. Both original tests pass, and the actual
`node scripts/versions.mjs --check` reports 21 checked outputs with zero changes.

The generator retains two original canonical lint errors (function length and
complexity); baseline/current diagnostics and exact commands are in
`docs/review/evidence/version-generator-integration.txt`. The test lint passes.
No generated output, CI trigger or version manifest was changed.

Separate causal commit scope: `scripts/versions.mjs`,
`tests/verification/deployment/versions.test.mjs`, this note and its evidence.
The two production hunks share one generator; Root may commit them together.
