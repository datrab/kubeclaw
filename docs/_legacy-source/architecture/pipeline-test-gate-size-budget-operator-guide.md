# Size-Budget Operator Guide

Status: current

## Responsibilities

The operator installs the signed provider package and sets runner resource limits.
The project selects artifacts and project-owned budgets.
Nova owns the final gate decision.

## Terms

- Provider isolation is the child-process file and network boundary.
- Artifact retention is the runner policy for stored evidence.
- Expanded bytes are uncompressed file-content bytes in an archive.

## Supported Host Requirements

- Node.js must support permission controls used by the provider loader.
- The Linux host must support the installed provider sandbox.
- The artifact store must provide immutable local files to Buster.

## Installation

Install the Buster runtime bundle that contains `kubeclaw.size-budget`.
Verify the package version and content digest in the provider registry.

## Complete Configuration Example

```json
{
  "format": "tar-gzip",
  "maximumTotalBytes": 10485760,
  "maximumFileCount": 10000,
  "matchingFiles": [
    {
      "id": "javascript",
      "pattern": "assets/**/*.js",
      "maximumBytes": 5242880,
      "requireMatch": true
    }
  ],
  "maximumGrowthBytes": 262144,
  "maximumGrowthPercent": 5,
  "largestFiles": 20
}
```

See the [configuration reference](pipeline-test-gate-size-budget-configuration-reference.md).

## Credentials and Transport Security

The provider accepts no credential field.
The provider has no network capability.
Nova and Buster transport security remains outside this provider.

## File and Network Permissions

The provider loader grants read access to declared input artifact files.
It grants write access only to private scratch and evidence directories.
The provider receives no network permission.

## Capacity and Concurrency

One input artifact is limited to 512 MiB.
Expanded archive data is limited to 2 GiB.
One archive is limited to 100,000 regular files.
Use the `size-budget` concurrency group to limit parallel memory use.

## Preflight Checks

1. Confirm that the registry lists `kubeclaw.size-budget@1`.
2. Confirm that the upstream node emits a supported artifact media type.
3. Confirm that blocking nodes declare one limit.
4. Confirm that growth nodes receive a compatible baseline.

## Start and Stop Procedure

Start Buster with the normal remote-plan service procedure.
No size-budget service or daemon is required.
Stop Buster with the normal graceful shutdown procedure.

## Verification and Expected Output

Run `npm run verify:test-gate:size-budget-implementation`.
Expect a real USTAR artifact to cross one typed link.
Expect the size-budget node to pass with 600 measured bytes.

## Monitoring and Evidence Locations

Read the node result for the gate effect.
Read attempt metrics for total bytes and file count.
Read provider details for largest files and matching-file facts.
Read the baseline artifact from the attempt evidence manifest.

## Troubleshooting

Use the stable error code before you retry.
Digest, path, and archive-integrity errors require input correction.
Resource-limit errors require an operator review.

## Upgrade

Install the new signed provider package beside the old locked package.
New plans can select the new version after verification.
Active plans keep their locked provider version and digest.

## Rollback

During parity, keep the legacy suite authoritative.
After cutover, roll back the full migration commit.
Do not enable two authoritative size checks.

## Final Production Boundary Proof

Run `npm run verify:test-gate:size-budget-production`.
The command starts the production Nova and Buster boundary on an isolated local port.
It uses a signed Git snapshot and persistent Buster stores.
It verifies transfer, import, restart recovery, evidence retention, baseline promotion, and two Nova decisions.

## Operator Checklist

- Provider version and digest are approved.
- Runner limits fit expected artifacts.
- No project receives credential or network authority.
- Focused and complete verification commands pass.
- Only one gate authority is active.
