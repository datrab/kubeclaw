# Adding Buster Suites

Status: current
Audience: developer, maintainer

## Purpose

Use this page when adding deterministic test behavior to Buster. Suites should produce structured evidence that Nova can safely use without scraping console output.

## Current Worker Contract

Buster consumes Redis tasks, validates payloads, runs requested suites, writes artifacts under task-scoped paths, emits telemetry, and acknowledges only after completion or dead-letter evidence exists.

Accepted task types:

- `module_test`
- `gate_test`

Suite results are normalized through the verdict schema. Critical failures can prevent a follow-up agent session.

## Existing Suite Pattern

Suites live under:

```text
skills/buster/pipeline/suites/
```

Common shape:

```ts
export default async function mySuite(context) {
  const startTime = Date.now();
  // read context.config.<suite-name>
  // run deterministic checks
  return createSuiteVerdict('my-suite', STATUS.PASS, {
    critical: false,
    duration_ms: Date.now() - startTime,
    findings: [],
    metadata: {}
  });
}
```

Use `createSuiteVerdict`, `createFinding`, `STATUS`, and `SEVERITY` from `services/verdict-schema.ts`.

## Required Behavior

A suite should:

- read only its own config and shared context
- validate paths through existing repo/path helpers
- write artifacts only under task/module/gate paths
- return structured findings and metadata
- distinguish `FAIL` from `ERROR`
- mark whether failures are critical
- support evidence-only behavior when thresholds are absent if that matches the suite family
- redact secrets from logs, metadata, screenshots, and telemetry
- respect task and suite deadlines

## Suite Config

Add suite config under module or gate `test_config`:

```json
{
  "test_suites": ["build", "health", "my-suite"],
  "test_config": {
    "my-suite": {
      "thresholds": {
        "max_failures": 0
      }
    }
  }
}
```

If the suite needs a local app URL, reuse the `serve` config and localhost URL helpers instead of accepting arbitrary origins.

## Registration

Register the suite in the Buster suite registry used by `runSuites`. Keep the suite name stable because projects reference it in `progress.json`.

Add a short reference entry in:

- [test suites reference](../reference/test-suites.md)
- [Buster task config](../reference/buster-task-config.md) if payload requirements change
- example `progress.json` docs if the suite is operator-facing

## Failure Behavior

Use these conventions:

- `PASS`: checks passed, or evidence-only findings stayed within non-enforced policy.
- `FAIL`: enforced checks failed.
- `ERROR`: the suite could not execute correctly, dependency missing, config invalid, or runtime crashed.
- `SKIP`: suite intentionally skipped because an optional capability or configured precondition is absent.

Do not silently convert missing required inputs into PASS. Requested API suites, for example, require an existing non-empty spec file.

## Verification

Add tests for:

- valid config PASS
- threshold-enforced FAIL
- invalid config ERROR
- missing optional capability SKIP or noncritical evidence, if applicable
- artifact paths stay task-scoped
- telemetry does not contain secrets
- integration with `runSuites`

Run:

```bash
node --test tests/verification/e2e/*.test.mjs
```

Run task validation tests if payload shape changes:

```bash
node --test tests/verification/e2e/*.test.mjs
```

## Sources

- `skills/buster/pipeline/runners/suite-runner.ts`
- `skills/buster/pipeline/services/verdict-schema.ts`
- `skills/buster/pipeline/services/task-validation.ts`
- `skills/buster/pipeline/suites/*.ts`
- `docker/Dockerfile.sandbox`

## Contract Checklist

| Requirement | Source owner | What to preserve |
| --- | --- | --- |
| Suite name and registration | `skills/buster/pipeline/runners/suite-runner.ts` | add the suite to the registry and dependency ordering; unknown names fail validation |
| Capability boundary | `skills/buster/pipeline/services/capabilities.ts` | declare required capabilities so denied operations become structured `ERROR` verdicts |
| Timeout behavior | `suite_timeout_ms` from validated task payload and suite-local defaults | suites must stop within the shared deadline and report timeout as `ERROR` or `FAIL` according to suite policy |
| Output shape | `skills/buster/pipeline/services/verdict-schema.ts`; `skills/buster/CONVENTIONS.md` | emit parseable JSON with `PASS`, `FAIL`, `ERROR`, or `SKIP` at suite level; task-level outcome normalizes to PASS/FAIL completion |
| Artifacts | `skills/buster/pipeline/runners/suite-runner.ts` | write suite verdict files under Buster results paths and append `suites.jsonl` when a swarm results dir exists |

## Failure Signals

- `unknown_suite` or `invalid_suite_name`: registry/suite list mismatch.
- `missing_suite_timeout_ms`: task payload did not include required timeout config.
- `buster_capability_denied`: suite requested behavior not allowed by the task capabilities.
- `BUSTER_TASK_MALFORMED`: payload identity/path validation failed before suite execution.
- task ACK without completion/dead-letter is blocked by the terminal guarantee.

After adding a suite, run the focused suite test, task validation/completion tests, and the Buster contract check before relying on operator docs.
