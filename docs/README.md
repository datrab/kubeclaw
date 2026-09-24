# KubeClaw Documentation Sources

Status: current
Audience: documentation contributor, maintainer

## Purpose

The published documentation source is [`site/`](site/README.md). It has separate Understand, Use, and Extend tracks.

The other directories contain source material, decisions, implementation records, research, or generated build inputs. They are not published automatically.

Publication uses an explicit allowlist. Phase audits, plans, raw inventories, templates, and migration records stay outside public navigation and search.

## Commands

```bash
npm run docs:publication:generate
npm run docs:publication:check
npm run docs:publication:build
npm run docs:publish-check
```

The build resolves evidence to the exact Git revision. It also emits a digest and a publication report.

## Transformation Record

The approved [documentation blueprint](blueprint/README.md) classifies existing documentation and defines the publication workflow.

## Current Platform Guidance

- [Platform and operations architecture](site/understand/platform-and-operations.md): Ops, GitOps, networking, persistence, telemetry, and optional infrastructure.
- [Operate KubeClaw](site/use/operate.md): configuration, startup, run inspection, signals, cancellation, and recovery boundaries.
- [Maintain KubeClaw](site/use/maintenance.md): version authority, image selection, upgrades, rollback, rotation, and retirement.

The old reader sources are isolated below `docs/_legacy-source/`. They are extraction inputs, not an alternative documentation route.

## Current work and decisions

- [Open issues](site/status/open-issues.md): generated from the single machine-readable register at `docs/status/open-issues.json`.
- [Live acceptance](site/status/acceptance.md): outstanding environment checks, separate from local finding closure.
- [Decisions](site/decisions/README.md): enduring constraints, approval evidence and supersession.

The review directory is historical migration input. Do not maintain current finding status there.
