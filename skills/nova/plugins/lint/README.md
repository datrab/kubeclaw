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
