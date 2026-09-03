# Lighthouse suite Phase 9 parity plan

Status: source proof implemented  
Audience: migration reviewers  
Owner: Pipeline architecture

## Goal

Phase 9 proves each baseline item. It does not use a source file name as sufficient evidence. Each item points to an executable assertion, an accepted architecture decision, or both.

## Comparison method

The legacy record establishes that the old suite ran one Lighthouse command, mixed four categories, used flat score thresholds, and wrote one report. The replacement proof runs a controlled local web application through real Lighthouse. It proves sequential sampling, median selection, budgets, reports, category separation, audit acceptance, and exact-origin denial.

The comparison classifies each item as preserved, improved, or removed. A removed behavior needs an explicit defect-removal reason. No item can be deferred without an owner, a reason, and a production acceptance command.

## Required proof

- The provider live test uses a real local HTTP server, real Chrome, and real Lighthouse.
- The isolated vertical test resolves the provided suite and runs it through `TestPlanRunner`.
- The project-setup test rejects unsafe legacy `perf` configuration.
- The real-workspace test declares the production node and named settings file.
- The cutover gate proves that old runtime authority is absent.

## Workflow improvement

Earlier suite workflows allowed a nonempty proof string to close an item. This phase requires the proof path to exist and requires named executable assertions for behavior claims. This rule reduces false completion records.

## Exit criteria

All 40 baseline items must be present in the ledger and have status `proved`. The ledger must report zero deferrals and replacement-only authority.
