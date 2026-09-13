# Buster terminal source cleanup parent validation

The terminal cleanup helper previously removed `jobRoot/workspace/repository`
without validating its parent. A persisted `workspace` symlink could redirect
that recursive deletion into another job or retained directory. The helper now
uses lstat to require real job/workspace directories before deleting any source
copy; a linked or non-directory parent fails closed before the archive is
removed. Absent directories remain an idempotent no-op. A leaf symlink is
unlinked without following it to its target.

Three real filesystem tests pass with no skips: the original cleanup/retained
artifact test, a linked-parent refusal preserving another job's source, and a
leaf-link/idempotency test preserving its evidence target. Canonical lint and
the complete Buster engine TypeScript check pass.
Raw results are in `docs/review/evidence/pr6-buster-cleanup-parent/`.

This is a bounded additional guard, not a claim of race-free cleanup against a
concurrently running writer. The caller must first prove process quiescence;
ordinary path validation cannot replace that ownership boundary. Buster's
production runner still uses LocalWorkerRuntime V1, and capability invokers and
report adapters still need to move into the same admitted native attempt scope.
The existing native fixture lifetime wrapper is not yet consumed by that runner.

PCR-BUSTER-ENGINE-001 and PCR-BUSTER-ENGINE-004 therefore remain unclosed. The
next complete change must connect the registered launch policy and actual
attempt host, move all local capability/report work inside the same scope,
connect fixture readiness/teardown, and use durable scope drain before terminal
cleanup/restart recovery. Only then can the old runner, file-capability helper
and sampled fallback be removed together. No deployment or new finding-count
increase follows from this guard. Current count remains140/154 locally verified.
