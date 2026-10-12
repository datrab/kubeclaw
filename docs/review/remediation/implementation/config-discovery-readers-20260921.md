# Configuration discovery: explicit environment readers

Pre-edit criteria, 2026-09-21. The historical discovery scans property reads and
uppercase first helper arguments. It misses computed literal reads and local
helpers whose environment-name parameter is not first, including the actual
Control `required(environment, 'PRISM_SESSION_SECRET')` calls.

- CD1: Retain existing candidate discovery; add explicit literal computed environment reads and literal call arguments of local named function declarations that directly read their environment argument by their name argument.
- CD2: Resolve which actual argument supplies each parameter. Do not infer unrelated second string arguments as environment names. Dynamic unresolved names remain explicitly outside completeness claims.
- CD3: Discovery records names and callsites only; never evaluate helpers, read environment values or execute scanned source.
- CD4: Cover real Control source plus adversarial argument ordering, unrelated helpers, computed reads and unresolved dynamic cases. A mutation dropping second-argument recognition must fail the new regression.
- CD-DOC: Explain supported syntax and remaining gaps. Retain the historical manually classified inventory unchanged; new discovery is supplemental and does not prove F1 completeness. Fresh independent review required.

## Implemented discovery scope

The added AST-only module reports computed literal reads and parameter-indexed
reads in top-level named function declarations when the actual environment
argument is one of the scanner's existing recognized forms. The original scan
still supplies property reads and first-argument helper candidates. Neither path
executes source or reads the named environment values. Helper defaults are not
invented; secret-named entries retain the existing redaction policy.

Five focused cases pass, including all five real Control credential helper calls.
The full current discovery adds 28 candidate callsites: five Control readers and
23 observer/Redis readers. These are callsites, not 28 independently authored
settings. Captured candidate sources and hashes are retained alongside the full
output in `../../evidence/config-discovery-readers-20260921/`. The manually
classified historical inventory has not been regenerated or overwritten.
Canonical lint passes. A private-copy mutation losing non-first name arguments
fails exactly the two helper/actual-Control regressions; the other three pass.

This remains syntax-based candidate discovery. Aliases, imported/anonymous
helpers, lexical shadowing/reassignment, destructuring, dynamic names, hardcoded
settings and template constants still require semantic review. Finding a matching
local declaration is not proof of runtime binding or operator authority. Neither
the old scan nor this extension proves F1 completeness. The [fresh independent review](control-discovery-independent-20260921.md) accepts CD1–CD4/CD-DOC within this discovery scope.

A comparison against the unchanged discovery logic initially failed because `rg`
file enumeration order differed. Comparing complete candidate multisets (including
duplicate counts and every field) proves all 1,349 current legacy candidates are
unchanged and exactly 28 are added. Both outputs and the empty content delta are
retained. The scanner now sorts file paths for deterministic enumeration. These
current-source totals differ from the historical inventory because production
configuration migrations have already removed old reads; no historical rows
were discarded. The comparison is a discovery-regression check, not proof that
all configuration settings have been found.

A pre-review adversarial probe exposed a crash on a zero-argument invocation of
a first-name helper: TypeScript's node predicate received an absent argument.
The retained `missing-argument-before.txt` shows that failure. Missing or dynamic
arguments are now ignored before predicate use. The same five cases include
these calls and literal template names; all pass, with the omission mutation
still detected. Final scanner/test hashes are in `final-source-identities.json`;
earlier selected snapshots describe the preceding iteration.
