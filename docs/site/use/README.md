# Operate KubeClaw

Status: implemented procedures with stated implementation and live-proof limits
Audience: platform operator, product operator, incident responder, release maintainer
Owner: platform operations
Evidence: scripts/deploy.sh; skills/nova/core/cli.ts; docs/site/status/open-issues.json
Applies to: current repository and selected release manifests
Last verified: 2026-09-16, source and local documentation checks

## Purpose

This track gives operators one ordered path through the KubeClaw lifecycle.
It starts before installation and ends after controlled retirement.

Use the pages in this order for a new environment:

1. [Plan and Install](install.md).
2. [Configure and Operate](operate.md).
3. [Observe and Diagnose](diagnose.md).
4. [Back Up and Recover](recovery.md).
5. [Maintain and Retire](maintenance.md).

Use [Worker Trust](worker-trust.md) when identity or mTLS needs a focused procedure.

## Choose the Correct Page

| Need | Start here | Result |
| --- | --- | --- |
| Prepare a cluster or make the first deployment | [Plan and Install](install.md) | A verified installation or an exact blocked step |
| Configure plugins, run work, inspect results, or operate Prism | [Configure and Operate](operate.md) | A recorded run or an identified unsupported control |
| Investigate health, waits, lost responses, pressure, or delivery gaps | [Observe and Diagnose](diagnose.md) | A cause class, retained evidence, and a safe next action |
| Protect or restore state, a node, a cluster, or access | [Back Up and Recover](recovery.md) | A verified recovery or a declared missing prerequisite |
| Upgrade, rotate credentials, control retention, or remove KubeClaw | [Maintain and Retire](maintenance.md) | A compatible change, rollback decision, or removal record |

## Operating Rule

Do not repeat an operation with an uncertain external result.
First, inspect the durable request and receipt.
Then reconcile the external system.

Do not use an application Pod as the only recovery path.
Keep an independent cluster or host administration path.

Do not treat source checks as live acceptance.
[Operational and live acceptance](../status/acceptance.md) keeps those results separate.

## Shared Placeholders

| Placeholder | Meaning | Required property |
| --- | --- | --- |
| `<repository-root>` | Clean KubeClaw checkout | Matches the selected source revision |
| `<context>` | Kubernetes context | Names the intended cluster explicitly |
| `<namespace>` | Application namespace | Defaults to `kubeclaw` only when intentional |
| `<release-commit>` | Source commit for selected release receipts | Immutable full Git commit |
| `<run-id>` | Durable Nova run identity | Comes from command output or stored evidence |
| `<backup-group>` | One completed backup unit | Includes verification metadata and checksums |
| `<evidence-dir>` | Operator-controlled incident or change record | Sits outside disposable workload storage |

Never paste a placeholder without replacing it.
Never store credentials in `<evidence-dir>`.

## Current Limits

The repository does not provide a complete host or K3s bootstrap.
It also lacks a proven independent recovery path outside the Ops Pod.

The pipeline CLI has no separate operator cancellation command.
It accepts start, audit, recover, and resume-signal operations.

Backup tooling does not establish one environment-wide RPO or RTO.
Each page identifies the exact supported boundary and the open issue.

See [Current Status](../status/current.md) and [Open Implementation Work](../status/open-issues.md) before a production change.
