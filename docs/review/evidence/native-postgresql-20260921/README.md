# Actual PostgreSQL operation replay — 2026-09-21

The original `skills/prism/tests/native/operation-journal.mts` passed on an isolated
PostgreSQL 18.6 server using original migration 017 and pgvector 0.8.1. The test
creates the original application roles, runs concurrent reservations on separate
connections, kills an actual committed writer, verifies durable journal replay,
and rejects conflicting results and unreconciled legacy pending operations.
The added resource-policy case loads a second authored configuration with changed
CPU, memory and task values. Reserving the same business identity returns exactly
the original stored envelope and budgets. This is persistence evidence, not a
successful native worker execution or kernel isolation claim. The journal receipt
explicitly records a never-launched failure.

`operation-journal.txt` contains the original 1/1 result, with zero skips.
`run.json` records the command, isolated directory, port and before/after hashes;
the recorded source set was unchanged. `tested-source.tar.gz` preserves those
source inputs. This source set covers Prism, Worker Core, the Worker contract and
configuration foundation, but does not capture every transitive fixture/package
input. Package archives and their hashes are described in `package-identities.json`.

`run-operation-journal.py` is the replay harness. It uses the downloaded, extracted
Alpine packages in the ignored cache, starts its own empty loopback server, and
stops that server in `finally`. It never installs packages system-wide or connects
to an existing database. Original GNU flock is supplied through proot because the
host BusyBox implementation lacks the required option; no database or worker
behavior is mocked. Temporary server directories remain for diagnosis.

The first attempt failed because setting `extension_control_path` through client
PGOPTIONS also affected the unprivileged application role. Its raw output and
manifest remain in `attempt-1-client-option-rejected`. The successful harness
sets this extracted-package lookup path at server startup instead. No application
SQL, role grants or assertions were changed to bypass that failure.
