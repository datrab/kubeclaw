# JUnit contract child-process context

Pre-edit acceptance, 2026-09-21:

- JC1: The original six JUnit scenarios, all modes, assertions and import/recovery checks remain unchanged.
- JC2: The child Node test runner starts with its own test-runner context, preserving other environment values and its existing arguments. It actually emits XML; no hand-authored replacement for existing real-Node scenarios.
- JC3: Both the package's original direct invocation and the aggregate `node --test` invocation execute the complete contract. Restoring context inheritance must reproduce the missing XML failure in the aggregate invocation.
- JC-DOC: Retain before/after commands and outputs, distinguish this harness correction from production behavior, and obtain independent review. No native runner acceptance is inferred.

Before edits, direct execution with real GNU flock passes. Under `node --test`,
the nested child inherits `NODE_TEST_CONTEXT` and its requested JUnit destination
is absent. Plain execution without GNU flock reaches a separate unsupported
BusyBox flock option; this is not a product assertion failure. Prior three-module
runner results must not be treated as three confirmed production defects.

Implementation removes only `NODE_TEST_CONTEXT` from a copied child environment.
It preserves the parent environment, all six scenarios, both modes, child command
arguments, explicit zero/error XML contract vectors and every existing assertion.
Both complete direct and aggregate invocations now pass with real GNU flock.
Commands, test-file before/after hashes and raw logs are retained in
`../../evidence/junit-child-context-20260921/commands-results.json`.
The [independent review](independent-junit-child-context-20260921.md) repeats both invocations and the original-file negative control and accepts this harness correction.

The TypeScript AST comparison records all eleven original assertion calls
unchanged in `assertion-identity.json`. Canonical lint passes both the captured
original and modified test. Only the test-file identity was captured across the
root reproduction; concurrent Store refactoring is separately owned and needs
its own final consumer regression. Do not infer a complete dependency snapshot
from this small patch's source hashes.

The root negative control restores only environment inheritance for the nested
spawn in a temporary sibling module. The actual aggregate run then fails with
`ENOENT` for `all-skipped.xml`, before any fabricated replacement could hide the
missing Node reporter output. The temporary module is removed in `finally`;
`run-mutant.py`, `mutant-result.json` and `mutant.txt` retain reproduction and
failure evidence. This author check does not replace independent review.
