# Independent review: native node-pools environment matrix

The recorded host execution supports 62 passing cases across the exact nine
complete non-root modules, with zero failures, cancellations or skips. The
command has no test-name filter or fake-root option. It runs actual Node 24.21.0
as UID 1000 and binds the real GNU flock executable. The original test deadlines
remain in the source files. The tenth deployment module is explicitly assigned
to a genuine root guest with the real systemd parser; it is not silently dropped.
Independent comparison confirms the ten-module matrix matches the current
package script exactly.

**Source closure needs correction before complete matrix acceptance.** The runner
records 568 files and reports no drift, but its selected roots omit executed
runtime dependencies. In particular, `resource-policy.mts` imports foundation
`config/swarm.ts` and reads the canonical chart configuration; neither is in the
manifest. `worker-envelope.ts` imports Prism `config/native-worker.ts`, likewise
missing. The contract validators also execute `ajv-formats`, while the runner
captures only Ajv's dist tree. Package-lock identity does not bind the actual
installed dependency bytes. These omissions do not demonstrate a test failure,
but the selected-file stability statement cannot establish full source closure.

[Independent checks](../../evidence/native-node-pools-matrix-independent-20260921/checks.json)
bind the reviewed runner/result/matrix/log identities, confirm current stability
of the recorded files and identify concrete missing paths. The reviewer made no
production changes and did not rerun heavy tests. Correct the capture roots and
rerun the same complete modules; keep this initial result rather than attaching
new hashes retrospectively as if they had been checked during it.

Even after that correction, this is filesystem/protocol/host-process evidence,
not cgroup delegation or actual root enforcement. The separate original native
guest evidence and pending complete deployment module remain distinct. The old
failed combined guest runs and interrupted storage diagnostic remain failed.

## Corrected capture and complete rerun

The second run corrects the finding and is accepted for the bounded host scope.
The unchanged nine complete modules again passed 62/62 with no cancellations or
skips, UID 1000 and no fake-root option. The expanded capture includes the entire
foundation, Prism configuration, actual installed dependency files, native tool
runtime, explicit chart configuration and the Node executable. Symlink targets
and file modes are recorded; before/after enumeration checks additions and
removals as well as changed bytes. Private cache exclusions are explicit, while
the actual native-host-tools root is separately included.

Independent review compared the before/after manifests: all 31,179 identities
match exactly. The previously omitted configuration, schema, Prism and
ajv-formats paths are now present and their current hashes match. Exact evidence
identities are in [the second-run review](../../evidence/native-node-pools-matrix-independent-20260921/run2-checks.json).
The earlier incomplete-capture finding and result remain historical. No heavy
suite was rerun by this reviewer. The complete root deployment module and
separate native kernel evidence retain their distinct environment requirements;
this accepted host run does not relabel historical combined guest failures.
