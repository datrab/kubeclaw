# Original legacy run snapshots

These exact files were captured under native `en_US.UTF-8` by executing the original `graphSnapshot` and `writeRunSnapshots` from commit `b6b2b1bf0579ac92b2e9f565bbc44bc79252a33d`. The regression reads them verbatim; it does not regenerate a historical digest with a replacement serializer.

The ASCII graph remains verifiable under Swedish. The Unicode map graph fails closed under Swedish because its actual original digest was locale dependent. Neither fixture is rewritten during the test. Both use the original `run-snapshot.v1` envelope and `execution-graph-snapshot.v2` graph.

Capture source, exact file hashes, and original source hashes are in `docs/review/evidence/wave47-sdk-source/`. A separate original-Core-to-current-Core full paused approval graph also passed while preserving the actual historical graph digest and snapshot bytes; its raw output and reproduction harness are included there.
