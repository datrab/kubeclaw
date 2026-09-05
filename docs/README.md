# KubeClaw Documentation Sources

Status: current
Audience: documentation contributor, maintainer

## Purpose

The published documentation source is [`site/`](site/README.md). It has separate Understand, Use, and Extend tracks.

The other directories contain source material, decisions, implementation records, research, or generated build inputs. They are not published automatically.

Publication uses an explicit allowlist. Phase audits, plans, raw inventories, templates, and migration records stay outside public navigation and search.

## Cilium networking

For the current platform-networking design, start with the short [`Cilium in 5 minutes`](ops/cilium-quickstart.md) guide. It explains the terminology and everyday model without assuming prior Cilium knowledge.

The detailed architecture, policy semantics and one-time K3s/Flannel cutover runbook live in [`ops/cilium-networking.md`](ops/cilium-networking.md), which is the technical source of truth.

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
