# Pipeline Runtime Packaging Phase 5.6 Final Audit

Status: complete

## Outcome

Phase 5.6 replaced the broad Common overlay with exact role bundles.

The repository has one source for each implementation. A role bundle installs
only the packages and plugins that its manifest declares.

Nova contains the orchestrator core. It does not contain the worker core or
the Buster engine.

Buster contains the neutral worker core and the Buster engine. It does not
contain the Nova core.

## Completed Phases

- Phase A classified packages, plugins, owners, and dependency rules.
- Phase B moved the mixed core into real shared, Nova, worker, and Buster
  packages. No implementation was copied.
- Phase C added exact Nova and Buster role manifests.
- Phase D added dependency-set bundle assembly.
- Phase E proved role isolation, repeatability, and negative failures.
- Phase F made package-set archives authoritative in the release workflow and
  deployment chart.

## Current Runtime Sets

The Nova manifest selects eight packages, 28 pipeline plugins, and one
OpenClaw extension.

The Buster manifest selects ten packages, nine pipeline plugins, and one
OpenClaw extension.

Shared packages and plugins have one source. Both roles can install the same
source package when they need it.

## Main Safety Rules

- Shared code cannot import a role package.
- Nova cannot import worker or Buster packages.
- Worker code cannot import Nova or Buster packages.
- Buster can import shared and worker packages. It cannot import Nova.
- A role cannot install an undeclared package or plugin.
- The builder rejects missing dependencies, path escapes, source links, and
  target collisions.
- The builder fails if selected source changes during assembly.
- The chart protects installed entrypoints, contracts, packages, links, and
  plugins from user-skill replacement.

## Proof Result

The full contract suite passes. It includes all 40 plugin registrations, the
test-gate contracts, the worker contracts, the plugin isolation checks, and
the package installation checks.

The packaging proofs pass for both roles. They prove exact selection, isolated
entrypoint loading, selected-plugin loading, negative dependency failures,
and byte-identical release archives.

Documentation checks, type checks, decision traceability, deployment checks,
and Git whitespace checks pass.

The production dependency audit reports no known vulnerability. The lock file
pins `fast-uri` 3.1.5 because earlier compatible releases have a high-severity
URL parsing advisory.

Each phase used Codex `gpt-5.6-terra` with high reasoning. Accepted findings
were fixed before the next phase started. The final cross-phase review found
no remaining actionable finding.

## Items That Remain Open

This phase creates only Nova and Buster role manifests. Prism and DeepSec need
their own manifests when those runtimes are implemented.

Nova still needs the Phase 7 connection to the Buster service. The role
manifest declares that external capability. It does not implement the network
connection.

No provided test provider has migrated to the new test-provider contract yet.
The old 13-suite runtime remains active until each suite completes its parity
proof and cutover.

Distributed queues, multiple worker replicas, shared evidence storage, and
worker authentication remain later worker-platform work.

## Next Step

Phase 6 creates report adapters. JUnit is the first adapter.
