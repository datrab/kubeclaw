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

## Operations Infrastructure Sources

- [Codex Ops Pod architecture](architecture/ops-pod.md): authority, runtime, networking, persistence and failure domains.
- [Codex Ops Pod operations](ops/ops-pod.md): deployment, acceptance, diagnosis, upgrades, credential rotation and recovery.

These are repository source documents; adding them here does not add them to the
published site's explicit allowlist.

## Runtime Image Operations

- [Runtime versions and role images](operations/runtime-versions-and-images.md): central version authority, Nova/Prism separation, image acceptance and upgrades.

## Current work and decisions

- [Open issues](site/status/open-issues.md): generated from the single [JSON register](site/status/open-issues.json).
- [Live acceptance](site/status/acceptance.md): outstanding environment checks, separate from local finding closure.
- [Decisions](site/decisions/README.md): enduring constraints, approval evidence and supersession.

The review directory is historical migration input. Do not maintain current finding status there.
