# Lint plugin

Owns the complete deterministic static-analysis behavior for
`kubeclaw.lint.pre-check` and `kubeclaw.lint.full`.

The stage registrations classify canonical lint reports and publish immutable
report artifacts. The independently activated `executor` adapter owns the
privileged filesystem and subprocess boundary behind `lint.execute`. It
validates repository and policy roots before running the package-owned tool
registry.

The package does not call an agent and does not forward to the retained v1 lint
service. Until the platform-wide v2 registry, capability, lifecycle, and
recovery cutover is complete, this package remains non-authoritative and the v1
runtime remains the active consumer.

## Configuration

Stage configuration:

- `policyPath`: canonical lint-policy JSON path.
- `policyProject`: project identifier in that policy.
- `includeDebt`: include baselined findings in report output.
- `includeExperimental`: run experimental tools.

Inspired by the evidence-preservation rules in
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop), the canonical
policy exposes separate `eslint-type-evidence-production` and
`eslint-type-evidence-tests` experimental, audit-only tools. Their disjoint
scopes exhaustively cover eligible repository JavaScript and TypeScript files
so production and test findings remain independently measurable. They report contracts that discard or
fabricate type evidence, including chained assertions, broad `object`
parameters, module mocks, known-key widening, `unknown` return contracts,
aliases that conceal `unknown`, and widen-then-assert flows. The official
type-aware `@typescript-eslint/no-unsafe-type-assertion` rule supplements those
repository-specific checks where a TypeScript project owns the source. Files
without project type information still receive every syntax-level evidence
rule and are never dropped from the audit. Experimental findings remain visible when
`includeExperimental` is enabled but cannot contribute to blocking or debt
counts; rules move into the main ESLint gate only after repository evidence and
rule-admission approval justify that change.

Adapter configuration:

- `allowedRepositoryRoots`: canonical roots the adapter may inspect.
- `allowedPolicyRoots`: canonical roots from which policy files may be loaded.

Input:

- `workingDirectory`: selected project root.
- `project`: optional report name.
- `modulePath`: optional project-relative module scope.
- `changedFiles`: optional project-relative changed-file scope.

## Verification workflow

`npm test` builds the package and runs a live function test with real
`shellcheck` and `shfmt` processes against a temporary project. The test
activates the real lint and artifact adapters and executes the stage through
the generic v2 runner. No agent runtime, agent spawn, or full E2E harness is
used. Focused tests additionally prove stage-result classification, adapter
root denial, cancellation, unsupported-capability rejection, and the absence
of v1 imports or opaque command forwarding in production package files.
