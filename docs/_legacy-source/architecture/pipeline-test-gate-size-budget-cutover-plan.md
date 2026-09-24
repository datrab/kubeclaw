# Size Budget Cutover Plan

## Purpose

This phase makes the size budget provider authoritative.

## Work

1. Confirm all 35 parity items.
2. Mark the old bridge entry as migrated.
3. Remove bundle from the old protocol and runner.
4. Delete the old bundle implementation.
5. Remove old setup and example values.
6. Prove that dual authority is impossible.
7. Run the replacement through the real contained path.
8. Run all repository checks and final review.

## Completion Rule

The old suite must be absent. The replacement must be the only authority.
