# Documentation ownership

Status: current documentation ownership and change rules
Audience: maintainer, documentation contributor
Owner: documentation
Evidence: scripts/docs-reader/build.mjs; .github/workflows/docs-checks.yaml
Applies to: the documentation directly under docs/
Last verified: 2026-11-02; repository-layout change

## One current source tree

[`docs/README.md`](../README.md) is the home. The Understand, Use, Extend,
Reference, Status and Decisions tracks are the only current documentation routes.
Examples live with their reader task. Old plans, audits, reviews, inventories and
migration records are retained in Git history, not in parallel documentation trees.

## Own facts and tasks

Each page names an owner and its scope. Product declarations own exact behavior;
a generated snapshot, source citation or successful reader build does not prove
that a deployed system works. State unsupported and untested behavior plainly.
Do not remove a meaningful failure or cleanup instruction merely to shorten a page.

## Review changes proportionately

Follow [Maintain the documentation](../extend/documentation-maintenance.md).
Check affected links, source facts and actual reader tasks. Preserve old public
routes through [explicit redirects](documentation-route-registry.json) when needed.
Repository source moves do not require changing immutable historical permalinks.
Do not reintroduce the retired acceptance/migration apparatus as a reader-build gate.

## Decision records

Keep enduring decisions in the [decision track](../decisions/README.md), with
the reason, owner, scope and supersession. A historical decision is not a new
acceptance result or a requirement to restore deleted migration bookkeeping.
