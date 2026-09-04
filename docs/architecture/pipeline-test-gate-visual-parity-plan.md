# Visual Regression Phase 9 Parity Plan

## Objective

Account for every observed legacy behavior and every accepted decision D-038 through D-043 before deletion.

## Method

The baseline is frozen from cutover parent `4029dabd3`. Each item has one disposition: preserved, improved, or removed defect. Proof must name an executable assertion or an accepted recorded legacy fact. Source text alone is not proof.

The executable old/new comparison runs the frozen legacy Pixelmatch function and the replacement capability against the same unchanged and changed PNG inputs. Separate real-provider assertions cover multiple routes, digest mismatch, identity mismatch, path escape, cancellation, deterministic settings, masks, browser egress denial, resource limits, evidence identity, and blocking semantics. The cutover proof confirms that removed implicit discovery and Discord verdict coupling do not survive.

## Workflow improvement

The earlier workflow permitted a nonempty proof string. This plan requires proof-file existence, unique item identity, exact counts, and executable semantic assertions. Production acceptance remains a separate state and cannot be inferred from source parity.

## Phase exit

All 30 items must be proved. No deferred source behavior is permitted. The real-browser comparison and authenticated vertical proof must pass. Mocks, fake browser results, image emulators, and compatibility wrappers must be zero.
