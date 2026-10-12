# Lint plugin

Owns the complete deterministic static-analysis behavior for
`kubeclaw.lint.pre-check` and `kubeclaw.lint.full`.

The stage registrations classify canonical lint reports and publish immutable
report artifacts. The independently activated `executor` adapter owns the
privileged filesystem and subprocess boundary behind `lint.execute`. It
validates repository and policy roots before running the package-owned tool
registry.

The Nova v2 compiler uses these registrations for deterministic lint. The package
does not call an agent or forward to a retained v1 lint service.

## Configuration

Stage configuration:

- `policyPath`: canonical lint-policy JSON path.
- `policyProject`: project identifier in that policy.
- `includeDebt`: include baselined findings in report output.
- `includeExperimental`: run experimental tools.

Inspired by the evidence-preservation rules in
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop), the canonical
policy exposes separate `eslint-type-evidence-production`,
`eslint-type-evidence-tests`, and `eslint-type-evidence-generated` experimental,
audit-only tools. Their disjoint scopes exhaustively cover eligible repository
JavaScript and TypeScript files so tracked production, tracked test/fixture, and
generated or otherwise untracked findings remain independently measurable. They report contracts that discard or
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
- `changedFiles`: optional repository-relative changed-file scope.
- `sourceStageId` or `revision`: bind analysis to the exact implementation revision.
- `kubernetes`: explicitly selected raw manifests and Helm charts.

## Execution boundary

The adapter validates the repository and policy roots. Project roots, generic
targets, module scopes and changed files must remain inside the canonical
repository. Missing changed-file leaves are checked through their closest
existing ancestor. Native recursive target checks include source paths excluded
from discovery: a tsconfig or another native tool may still read them. Existing
Kubernetes-specific input checks remain active. In-repository symlinks are
accepted; escaping source symlinks are rejected. Git metadata is excluded from
the source-tree walk. Installed dependencies linked outside the allowed
repository are consequently rejected if reached by a declared target.

Candidate Git and native tools use one asynchronous subprocess lifecycle. The
caller's abort signal covers checkout, tools and result publication. Adapter
shutdown aborts and awaits its active invocations. On timeout/abort, Linux
process groups receive TERM, then KILL after 250 ms, including descendants that
outlive their leader. Completion awaits both leader close and kernel confirmation
that no group member is running. The host process-group ID is captured across PID
namespaces; signal delivery alone is not completion. Failure to confirm exit
within 1,500 ms of termination is an explicit cleanup error. The host init remains
responsible for reaping orphaned grandchildren. Native timeout, failed start,
output overflow and ordinary nonzero finding exits have distinct handling.

Existing per-tool and candidate Git timeouts remain unchanged. There is no new
adapter configuration or independent overall deadline: the caller owns the
invocation signal. Filesystem checks, parsing and cleanup remain synchronous.
These checks are not a sandbox against a concurrently hostile filesystem,
configuration imports or a process that deliberately leaves its process group.
The selected source tree and operator-controlled native configuration must stay
stable while the native tool reads them. A stronger OS boundary is separate work.

## Verification workflow

`npm run build` performs TypeScript checking. `npm test` runs the existing stage,
package, adapter, discovery and ESLint-discipline checks, the remediation suite,
and the original live function test through the real v2 runtime and artifact
adapter. That final suite requires installed `shellcheck` and `shfmt`.

`npm run test:remediation` uses actual ESLint, TypeScript, Git, Node and `/bin/sleep`
with temporary repositories. It verifies canonical path denials, valid lint and
finding outcomes, native timeout classification and report errors, active abort,
shutdown, candidate cleanup and cancellation during a real Git smudge filter.
No native program or plugin provider is replaced with a mock. Its process-state
assertions use Linux `/proc`, including namespace-to-host PID translation.
