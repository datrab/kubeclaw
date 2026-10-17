# Phase 12 Changelog

Phase 12 made v2 the sole runtime authority.

## Removed

- The Nova, Buster, and shared v1 pipeline implementations.
- The v1 built-in registry, scheduler, lifecycle stores, compatibility facades,
  worker transport, tests, fixtures, generated migration controls, and docs.
- The dedicated Buster pipeline container, image, entrypoint, Helm values, and
  image-build job.

## Added Or Changed

- `skills/nova/pipeline.ts` is a thin v2 core/CLI entrypoint.
- Runtime dispatch can execute real OpenClaw sessions through the Gateway,
  monitor them, read terminal transcripts, and propagate cancellation.
- Gateway result envelopes and native-subagent terminal state are normalized
  against the production OpenClaw response shapes.
- Status polling uses unique read-effect identities so durable idempotency does
  not replay a stale running receipt.
- Agent completion parsers bind lifecycle identity in core while normalizing
  the small set of validated native response variants.
- Observer drains use one immutable source generation and exclude
  observer-delivery effect plumbing, preventing telemetry feedback loops.
- The permanent inventory derives packages and registrations from manifests.
- Deterministic testing work executes in the authoritative Nova runtime through
  registered capability adapters. Kubernetes, Playwright, and suite tooling
  remain in the general runtime image; image builds use a rootless BuildKit
  tool sidecar over a shared Unix socket. The sidecar has no scheduler, queue,
  plugin, or lifecycle authority. Its operator-controlled local-registry
  endpoint is validated and rendered into the same explicit HTTP/insecure
  daemon policy used by the retained in-cluster registry workflow. BuildKit
  and projected Kubernetes credentials are explicit opt-ins so the default
  chart remains compatible with Restricted Pod Security.
- A TypeScript real-run harness proves model dispatch, repository mutation,
  command execution, artifacts, telemetry, and durable core journals.

## Release Evidence

- `tests/verification/contracts/check-plugin-system-v2-phase12.mts`
- The original TypeScript smoke harness has been retired. The current system runner is `tests/verification/e2e/run-real-pipeline-e2e.mjs`.
- `tests/verification/deployment/check-deployment-truth.mjs`

The original Phase 12 smoke run used `openai/gpt-5.6-sol` and succeeded across architecture,
implementation, command-backed testing, review, and summary. It proved a real
repository mutation, core-owned lifecycle commits, and durable telemetry
delivery.
