# Pipeline Test-Gate Extension Roadmap

Status: discussion handoff; not current behavior
Audience: maintainers, pipeline-extension authors, ClawDeck developers

The active discussion and accepted decisions are recorded in
`docs/architecture/pipeline-test-gate-design.md`.

## Scope

This workstream concerns the tests executed by pipeline quality gates through
`kubeclaw.test-agent` and `kubeclaw.buster-suite-runtime`: suite selection,
execution, composition, isolation, evidence, artifacts, and quality decisions.

It does not concern the repository-owned verification code under `tests/`.
Those tests may later prove the new test-gate behavior, but improving that
verification harness is a separate concern.

## Current Boundary

The test-agent stage invokes `test.suite.execute` first and accepts only its
digest-bound receipt as objective evidence. Buster then reasons over that
evidence through `runtime.dispatch`; an agent-provided stage result is never
accepted directly.

The Buster runtime currently owns thirteen built-in suites:

- manifest
- build
- health
- Kubernetes
- Tailscale preview
- accessibility
- performance
- bundle
- security
- visual regression
- API
- end-to-end
- unit

Execution already has useful foundations: an isolated worker, explicit
capability grants, dependency-aware scheduling, bounded concurrency,
cancellation, timeouts, cleanup, normalized verdicts, immutable receipts,
artifacts, and telemetry.

The main extension limitation is that suite identities, capability mappings,
dependencies, configuration shapes, and implementations are compiled into the
Buster runtime. A project can provide a custom unit command, but it cannot
install a new first-class suite provider through the plugin system.

## Direction

Make pipeline test gates extensible without introducing another general
workflow engine. KubeClaw core remains the lifecycle and capability authority;
the test-agent remains the quality-decision owner; Buster remains the isolated
test-execution boundary. Test providers contribute bounded test behavior and
normalized evidence only.

Useful ideas to adapt from Testkube include:

- tool-agnostic container execution with explicit commands, dependencies,
  resources, setup, and teardown
- reusable templates and parameterization
- matrix execution, sharding, bounded parallelism, and fail-fast behavior
- explicit artifact collection and normalized JUnit, performance, security,
  coverage, and visual reports
- composition of small tests into larger test-gate suites

Testkube is a design reference, not a runtime dependency or a second source of
pipeline authority:

- <https://docs.testkube.io/articles/test-workflows>
- <https://docs.testkube.io/articles/test-workflows-parallel>
- <https://docs.testkube.io/articles/test-workflows-matrix-and-sharding>
- <https://docs.testkube.io/articles/test-workflows-artifacts>
- <https://docs.testkube.io/articles/test-workflows-test-suites>

## Proposed Sequence

1. Audit every current gate, suite, configuration path, execution path,
   capability, fixture, artifact, verdict, and evidence contract.
2. Define a versioned, capability-bounded `test-provider` registration
   contract with stable identities and normalized outcomes.
3. Add a provider SDK plus isolated installation, activation, cancellation,
   and removal for custom test providers.
4. Add declarative custom tests covering content source, image, command,
   arguments, working directory, secret references, resources, artifacts,
   result formats, and required capabilities.
5. Add reusable templates, typed parameters, dependencies, services,
   setup/teardown hooks, conditions, and composition rules.
6. Add matrix execution, sharding, bounded parallelism, fail-fast behavior,
   retries, queueing, and safe cache reuse.
7. Normalize JUnit, SARIF, coverage, performance metrics, screenshots, logs,
   and arbitrary artifacts into one durable test-evidence model.
8. Migrate one built-in suite at a time through the same provider contract.
   Prove equal or better behavior, switch that suite, remove its superseded
   code, and then continue with the next suite. Run the complete real gate and
   failure matrix after the final migration.

## Non-Negotiable Constraints

- No second pipeline lifecycle or workflow authority.
- No direct acceptance of agent-authored success claims.
- No unbounded commands, resources, output, artifacts, retries, or execution.
- No implicit host filesystem, credential, network, Kubernetes, BuildKit, or
  browser access; every privileged surface requires an explicit capability.
- Installation and activation must be transactional, digest-bound, and
  provenance-aware.
- Every terminal result must be correlated to run, gate, module, provider,
  suite, attempt, execution, and immutable receipt identities.
- Custom and built-in providers must use the same execution and evidence
  contracts.
- Each existing built-in retains authority until its own parity-proven cutover.
  The old and new versions must not both control the gate.
- ClawDeck should consume canonical test execution, artifact, and verdict
  events rather than a separate dashboard-specific state model.

## Next-Session Decisions

Before implementation, decide:

1. Whether one provider owns a test tool, one suite, or a related suite family.
2. Which behavior is declarative and which requires provider code.
3. The canonical normalized result and artifact schemas.
4. Whether suite composition belongs in gate configuration, provider
   templates, or a test-plan registration.
5. The minimum installation, isolation, signature, and capability policy for
   third-party providers.
6. The parity and live-E2E evidence required before migrating each built-in.

The repository, manifests, generated inventory, and committed documentation are
the source of truth for the next session. This document records direction only;
it does not claim that custom test providers exist today.
