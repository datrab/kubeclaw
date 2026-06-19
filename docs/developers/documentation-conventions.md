# Documentation Conventions

Status: current
Audience: documentation authors and reviewers

## Purpose

These conventions define the quality bar for active KubeClaw documentation. Active docs should help an operator or contributor complete a real job without reading source code first, while still making clear which claims are backed by source, generated inventory, tests, verified commands, or upstream documentation.

Use archive files only as historical context. If archived material describes behavior that still matters, verify it against current source before moving it back into the active docs.

## Behavior Categories

Use these labels consistently when a page mixes current behavior, future plans, and unresolved gaps.

### Current behavior

Current behavior is behavior backed by at least one of these sources:

- repository source code, scripts, Helm templates, values files, manifests, or configuration files
- generated inventory or generated reference output committed under `docs/generated/`
- tests or verification scripts in this repository
- a command that was run against the repository or a deployed cluster, with the command and expected result documented
- upstream documentation for behavior owned by another project, such as OpenClaw, Tailscale, LiteLLM, Qdrant, PostgreSQL, Redis, Helm, or Kubernetes

Write current behavior in direct language. Include the source, command, or generated reference when the claim is specific enough to drift.

### Target state

Target state is planned behavior that does not exist yet or has not been verified. Put target-state material in `docs/ROADMAP.md`, `docs/future-implementation-ideas.md`, or a clearly labeled `Planned direction` section.

Do not mix target-state language into operator procedures unless the procedure explicitly tells the reader that the feature is not available yet.

### Open issue

An open issue is unclear, incomplete, risky, or disputed behavior that affects operators or contributors. Capture it in `docs/open-issues.md` with:

- the affected page or feature
- the unresolved question or risk
- the source files, commands, or tests already checked
- the next verification step, when known

Do not document guessed behavior as fact. If a required step is unknown, add the gap to `docs/open-issues.md` and keep the page honest.

## Source References

Do not force a source list onto every page. Add one only when it helps verify implementation-specific claims about:

- script commands, flags, prompts, environment variables, or side effects
- Helm values, rendered manifests, services, volumes, RBAC, network policy, storage, or secrets
- OpenClaw config fields, swarm config fields, plugin hooks, or runtime paths
- Redis streams, status keys, artifact paths, telemetry events, or exit codes
- pipeline states, retry/resume behavior, failure classes, gates, test suites, or generated files
- upstream component behavior that belongs to another project

When source references are useful, place them near the relevant claim or near the end of the page under `## Sources`. Keep entries concrete:

```text
## Sources

- `scripts/deploy.sh`
- `my-values/setup-secrets.sh`
- `charts/kubeclaw/templates/deployment.yaml`
- Tailscale Kubernetes Operator docs: <https://tailscale.com/kb/1236/kubernetes-operator>
```

Prefer links to upstream documentation over copying upstream behavior into KubeClaw docs. KubeClaw docs should explain how KubeClaw uses the upstream component, which local values or secrets matter, and where to verify the integration.

## Example Style

Operator examples should be realistic enough to copy, adapt, and verify.

- Use commands from the repository root unless a page says otherwise.
- Show required environment variables before the command that consumes them.
- Use placeholders that make ownership clear, such as `<namespace>`, `<tailnet-client-id>`, or `<github-read-token>`.
- Include expected output shape or expected Kubernetes state after important commands.
- Explain partial success when it is common, such as existing Secrets being reused while missing keys are patched.
- Include recovery commands when the failure is common and safe to fix locally.
- Avoid fake production defaults. Mark examples as local/dev/staging-like examples when they are not production guidance.

Good command block:

```bash
NAMESPACE=kubeclaw ./scripts/deploy.sh secrets
kubectl -n kubeclaw get secret openclaw-shared-secrets redis-secrets ghcr-secret
```

Good expected state block:

```text
openclaw-shared-secrets   Opaque   8      ...
redis-secrets             Opaque   1      ...
ghcr-secret               kubernetes.io/dockerconfigjson   1   ...
```

## Page Templates

Templates are starting shapes, not rigid boilerplate. Keep useful headings, remove irrelevant ones, and add source references only when a page makes implementation-specific claims.

Reusable template files live in `docs/developers/templates/`:

- `operator-task.md`
- `runbook.md`
- `deployment-component.md`
- `architecture-page.md`
- `reference-page.md`
- `troubleshooting-entry.md`

### Operator task page

Use for deployment and operations procedures.

```text
# Task name

What this page helps the operator do.

## When to use this
## Before you begin
## What happens
## Procedure
## Verify the result
## Expected output or state
## Common failures
## Recovery
## Related reference
## Sources
```

Minimum expectations:

- `Before you begin` names required access, namespace assumptions, local tools, values files, and upstream prerequisites.
- `What happens` explains the system behavior the procedure triggers.
- `Procedure` uses exact commands and says where to run them.
- `Verify the result` includes commands and success criteria.
- `Common failures` maps symptoms to likely causes.
- `Recovery` gives safe next actions or links to a runbook.
- `Sources` is optional and used only when implementation details are referenced.

### Incident runbook

Use for stuck runs, failed gates, missing artifacts, failed infrastructure, and recovery pages.

```text
# Runbook name

## Symptoms
## Impact
## Fast checks
## Likely causes
## Recovery procedure
## Verification
## Escalation
## Prevention
## Related reference
```

Minimum expectations:

- `Symptoms` are observable from CLI output, logs, Discord messages, status files, Kubernetes state, or artifacts.
- `Fast checks` are ordered from least invasive to most invasive.
- `Recovery procedure` separates safe retries from destructive or state-changing actions.
- `Verification` proves the runbook worked.
- `Escalation` names what evidence to collect before handing off.

### Architecture page

Use for mental models and system behavior.

```text
# Architecture topic

## Overview
## Components
## Runtime flow
## State and ownership
## Failure behavior
## Operator implications
## Related tasks
## Sources
```

Minimum expectations:

- Explain current behavior, not desired behavior, unless a section is clearly labeled planned.
- Name component ownership and data boundaries.
- Include failure behavior and operational implications, not only a static component list.
- Link to task pages for procedures instead of embedding long command sequences.

### Reference page

Use for exact values, fields, flags, and generated or inventory-backed facts.

```text
# Reference topic

## Summary
## Values / fields / flags
## Defaults
## Examples
## Used by
## Generated from
```

Minimum expectations:

- Keep narrative short and exact.
- Mark generated or inventory-backed sections clearly.
- Separate manual explanation from generated blocks.
- Include regeneration or verification commands when the page is generated.

### Troubleshooting entry

Use inside operator task pages, runbooks, and common failure pages.

````text
### Symptom

What the operator sees.

Likely cause:
What usually causes it.

Check:
```bash
command to confirm or rule it out
```

Recovery:
```bash
safe command or procedure
```

Expected recovery state:
What should be true after the fix.
````

Minimum expectations:

- The symptom is observable.
- The check distinguishes this failure from nearby failures.
- The recovery step is safe, or the page clearly labels the risk.
- The expected state tells the operator when to stop.

## Review Checklist

Use this checklist for every active page during the audit and rebuild.

- Audience and job-to-be-done are clear.
- Current behavior, target state, and open issues are not mixed together.
- Operator pages include prerequisites, commands, expected state, verification, common failures, and recovery.
- Runbooks include symptoms, impact, fast checks, recovery, verification, escalation, and prevention.
- Architecture pages explain runtime flow, state ownership, failure behavior, and operator implications.
- Reference pages are exact, dry, and generated or source-backed where practical.
- Upstream behavior links to upstream docs where another project is the source of truth.
- Specific implementation claims cite source files, generated inventory, tests, verified commands, or upstream docs.
- Any unclear behavior is captured in `docs/open-issues.md`.
- Future work is captured in `docs/future-implementation-ideas.md` or `docs/ROADMAP.md`.

## Example Thin-Page Review

`docs/operators/recovery-runbook.md` can be reviewed against this standard without extra context:

- Page type: incident runbook.
- Required shape: `Symptoms`, `Impact`, `Fast checks`, `Likely causes`, `Recovery procedure`, `Verification`, `Escalation`, `Prevention`, and `Related reference`.
- Review result expected during Phase 1: keep and expand if it already maps real operator failures to checks and recovery steps; rewrite if it only lists generic advice; add open issues for any recovery behavior that cannot be verified from pipeline source, tests, status artifacts, or deployment commands.

## Maintenance Rules

- Link to active docs instead of duplicating long explanations.
- Keep generated content in generated blocks or generated files.
- Regenerate inventory-backed docs with the documented commands before committing reference changes.
- Update docs when deployment, config, source, CI, or operator-visible behavior changes.
- Reject thin pages by pointing to the missing convention or template requirement.
- Keep examples practical and source-backed; avoid placeholder-only docs except for explicitly safe secret templates.

Run the docs maintenance checks before review:

```bash
npm run docs:inventory
npm run docs:generate
npm run docs:check:generated
npm run docs:check:refs
npm run docs:check:coverage
npm run docs:check
git diff --check
```

`npm run docs:check` runs stale generated inventory checks, stale generated reference checks, local Markdown link checks, generated-section marker checks, core operator page shape checks, target-state guardrails for pages marked current, SVG diagram smoke checks, cited repository path checks, and topic-map checks.

## Drift Guardrails

Use these commands before closing any docs or source change that affects documented behavior:

| Command | Protects | Typical failure |
| --- | --- | --- |
| `npm run docs:check:generated` | generated JSON inventory and generated reference pages | a source workflow/script/value file changed without `npm run docs:inventory && npm run docs:generate` |
| `npm run docs:check:refs` | local Markdown links and cited repository paths in active docs/current audit artifacts | a doc points at a deleted or renamed script, chart, workflow, test, skill, plugin, config, or local Markdown page |
| `npm run docs:check:coverage` | documentation topic map | a topic-map path points at a deleted active doc or vague weakness language returns |
| `npm run docs:check` | full docs guardrail bundle | any of the above plus existing Markdown/generated marker/page-shape checks |
| `git diff --check` | whitespace hygiene | trailing whitespace or diff formatting problems |

Generated docs currently include `docs/reference/cli.md`, `docs/reference/environment-variables.md`, `docs/reference/helm-values.md`, `docs/reference/secrets.md`, `docs/reference/verification-commands.md`, and `docs/reference/workflows.md`. Their inventory inputs live in `docs/generated/inventory/`.

When a generated-doc check fails, regenerate first:

```bash
npm run docs:inventory
npm run docs:generate
```

If `docs:check:refs` fails, fix the cited path or rewrite the sentence so it no longer claims a concrete source path. `docs/archive/**` is optional historical material and is intentionally outside docs checks. If `docs:check:coverage` fails, update the active topic map in the same change.

Update docs in the same change when touching:

- CLI flags or command behavior
- Helm values, templates, rendered manifests, or values files
- environment variables
- Secret names, keys, ownership, or setup modes
- deployment scripts or setup modes
- OpenClaw/swarm config defaults
- pipeline lifecycle, status, gate, plugin, telemetry, or Buster task contracts
- Buster suite names, suite config, outputs, or failure behavior
- linting rules or tool registry behavior
- observability sinks, telemetry events, Redis streams, or artifact paths
- CI workflows, image publishing, or verification commands
