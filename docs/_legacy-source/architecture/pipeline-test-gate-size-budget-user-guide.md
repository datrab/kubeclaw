# Size-Budget User Guide

Status: current

## Purpose

Use `kubeclaw.size-budget@1` to measure one declared build artifact.
The provider can enforce total size, file count, matching-file size, and growth limits.

## Scope Exclusions

The provider does not build, deploy, expose, or test an application.
It does not discover an output directory.
It does not open a browser or contact an agent.

## Terms

- A build artifact is one immutable file from an upstream node.
- An expanded byte is one file-content byte inside an archive.
- A stored byte is one byte in the transferred artifact.
- A baseline is a typed JSON artifact from an earlier size-budget result.

## Smallest Blocking Declaration

```json
{
  "uses": "kubeclaw.size-budget@1",
  "mode": "blocking",
  "config": {
    "maximumTotalBytes": 10485760
  },
  "inputs": {
    "build-output": {
      "from": "build-artifact",
      "output": "artifact-1"
    }
  }
}
```

See the [configuration reference](pipeline-test-gate-size-budget-configuration-reference.md) for every field.

## Common Artifact Forms

- Use `application/octet-stream` for one binary or package file.
- Use `application/x-tar` for one uncompressed USTAR archive.
- Use `application/gzip` for one GZIP-compressed USTAR archive.
- Use `application/vnd.kubeclaw.build-output.tar` for a declared build-output archive.

## Blocking and Advisory Modes

A blocking node requires at least one limit.
A breached limit fails the node.
An advisory node can omit every limit and report measurements only.

## Inputs and Outputs

The required input name is `build-output`.
The optional input name is `baseline`.
The output name is `baseline`.

Use an explicit typed link for each input.
Do not share an output directory between nodes.

## Growth Baseline Workflow

1. Run the size-budget node without a growth limit.
2. Download its verified `baseline` evidence from Buster.
3. Review the baseline identity and measured bytes.
4. Store the approved file at `.swarm/baselines/size-budget-baseline.json`.
5. Commit the approved baseline with the project change.
6. Add the baseline producer and growth limits from `size-budget-growth.json`.

The baseline producer uses a real `cp` command and one typed artifact link.
The runner does not inject an ambient artifact from a different run.

## Evidence

The result stores total bytes, stored bytes, file count, and largest files.
It also stores matching-file facts and growth facts when configured.
The typed baseline artifact is retained after pass or fail.

## Retry, Timeout, Cancellation, and Restart

Each retry receives the same immutable input identity.
Each attempt keeps its own result and evidence.
Cancellation stops archive reading and cannot pass a blocking node.
Buster recovery does not execute a completed attempt again.

## Disable or Remove the Check

Remove the size-budget node and all links that target it.
An omitted size-budget node creates no hidden check.

## Local and Continuous-Integration Verification

Run `npm run verify:test-gate:size-budget-implementation` for the focused proof.
Run `npm run verify:contracts` for the complete contract proof.

## Common Errors

- `SIZE_BUDGET_BLOCKING_LIMIT_REQUIRED` means a blocking node has no limit.
- `SIZE_BUDGET_BASELINE_REQUIRED` means a growth limit has no baseline input.
- `SIZE_BUDGET_FORMAT_MISMATCH` means the selected format conflicts with the media type.
- `SIZE_BUDGET_ARCHIVE_ENTRY_DENIED` means the archive contains an unsupported entry type.

See the [error reference](pipeline-test-gate-size-budget-error-reference.md) for corrections.

## Migration Notes

The old suite read `bundle.www_dir` and guessed a default `dist` directory.
The replacement requires one named artifact.
The scaffold converts old kilobyte limits to exact bytes.
The scaffold preserves the old maximum file count.
