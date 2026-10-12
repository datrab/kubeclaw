# Independent run 3 VM fixture review

Bounded preparation accepted. This reviewer authored the process-limit correction
and does **not** independently accept that production change here; its separate
[non-author review](independent-native-process-scope-limits-20260921.md) supplies
that acceptance. No VM was booted by this reviewer.

The launcher is byte-identical to run 2 after replacing only run-path names.
Resource limits, watchdogs, no-network/no-device configuration and readonly
source export remain unchanged. The guest script adds only the maintained
four-case policy test to node-pools: original twelve native cases and all original
35 node-pools cases remain unchanged, including deadlines. Missing systemd parser
and prior timeout cancellations remain explicit unresolved limitations.

Independent comparison of both source manifests finds exactly four changes:
process runner, new policy test, native typecheck inclusion and package command
inclusion. The package semantic delta is only that test inclusion. All 35,441
regular source files have distinct inodes from the prior export. The original
frozen exports remain unchanged; run 3 uses a fresh disk and guest UUID, mode0444,
with the same original production identity preflight.

Nineteen small prepared artifact hashes match. The author's verification-only
run passed, with no VM boot; this reviewer did not repeat the whole 8 GiB disk
hash. Initial disk hash is
`707ed827cecc3124b7af44ef069389b982859892ed25ccf3066f5ea2111a6d9e`;
source manifest hash is
`04a29d1d0ea7f195aadd777cc1541b4cae01068c9ca2cfa416002eb429b0e89e`.
Exact checks are recorded in
`../../evidence/isolated-native-vm-independent-20260921/run3-preparation.json`.

This remains the narrowly updated frozen baseline, not the complete current
workspace. Concurrent Buster configuration and other disclosed current changes
are excluded. Preparation acceptance is not kernel execution, physical-host,
full native/Buster or overall goal acceptance. The coordinator launches and
retains the raw outcome under the same fixed bounds.
