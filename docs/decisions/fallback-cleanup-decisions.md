# Canonical Authority And Defaulting Decisions

Status: current
Audience: maintainers, developers

## Required Authority Fails Loudly

Values required for runtime correctness produce typed failures when absent. Runtime code does not infer or substitute run, task, step, completion, artifact, terminal, credential, model, timeout, or retry authority.

## Defaults Belong To Normalization

Product defaults are applied once by configuration/schema normalization. Runtime call sites consume normalized values and do not introduce local convenience defaults.

## Optional Absence Is Typed

Optional data is omitted or represented by an explicit domain state such as `not_configured`, `not_emitted`, `not_applicable`, or `unavailable`. Generic placeholders such as `unknown` are not authority.

## One Canonical Field

Runtime contracts use one field name for one meaning. Alias reads and parallel compatibility shapes are not retained. Explicit modeled source precedence is allowed only when the contract names those sources and their order.

## Dependency Wiring Is Explicit

Runtime composition supplies required dependencies. Tests may inject fakes at the same boundary, but production modules do not construct hidden fallback dependencies.

## Harness And Product Stay Separate

The E2E harness may prepare workspaces, checkpoints, faults, and external controls. Production code does not import scenario definitions or branch on harness-only identifiers. Generic production observability checkpoints are allowed when they are useful outside tests.

## Agent Output Authority

Agents provide semantic conclusions and evidence. The pipeline owns immutable identity, schema, timestamps, output paths, and atomic publication through `skills/common/pipeline/agent-artifact.ts`.

## Verification

The active fallback ledger is empty. Current guards include:

```bash
node tests/verification/contracts/check-canonical-pipeline-compat-debt-free.mjs --source-root "$PWD"
node tests/verification/contracts/check-canonical-pipeline-compat-freeze.mjs --source-root "$PWD"
node --test tests/skills/common/pipeline/agent-artifact.test.mjs
```

The immutable ledger backup records the completed audit baseline; it is not an active runtime compatibility list.
