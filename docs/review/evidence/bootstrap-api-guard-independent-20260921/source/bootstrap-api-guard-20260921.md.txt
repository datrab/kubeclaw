# Bootstrap namespace API guard — bounded H1 slice

Criteria written before implementation on 2026-09-21. `setup` targets an existing
cluster; no cluster installer or absent-cluster fallback exists in this command.
The defect is its generic text matching: a failed namespace lookup containing
`not found` is interpreted as permission to create a namespace.

| Criterion | Required observation |
| --- | --- |
| HA1 | Successful named namespace lookup performs no namespace creation |
| HA2 | Successful validated empty namespace collection lookup creates exactly the requested namespace |
| HA3 | Nonzero lookup, including credential executable `not found`, Forbidden, connection refused and API resource NotFound, stops before create or Helm calls |
| HA4 | Failed creation stops before Helm calls; no overwrite, deletion or retry fallback |
| HA5 | Actual deploy.sh entry point executes with recorded CLI fixtures; tests disclose that fixtures prove shell orchestration, not Kubernetes or a host |
| HA-DOC | Operator setup documentation distinguishes existing cluster setup, missing namespace and failed lookup, explains safe rerun and remaining host prerequisites |

No H1-wide, H2, H3, fresh host, recovery, real API or live closure follows from
this slice. Fresh independent review is required after implementation.

## Implementation and evidence

The first candidate used `--ignore-not-found`; it was replaced during author
review because the contract must reject API failures rather than suppress 404s.
The final command lists namespaces with an exact name field selector, validates
JSON list shape and each returned namespace identity, and allows creation only
for a successful empty list. This explicitly adds namespace `list` permission;
operator documentation records that requirement and the existing-cluster boundary.

`collection-after.txt` records final CLI-fixture orchestration results. The fixtures
execute original `deploy.sh`; they do not stand in for a live cluster. The actual
kubectl client probe uses a local HTTP API fixture and verifies successful empty
list output versus a generic API 404. Its first run exposed that kubectl emits
`kind: List`, not `NamespaceList`, for an empty collection. Both valid list kinds
are now supported; other shapes and wrong namespace identities remain rejected.
The initial failed probe is retained separately. This is actual client behavior,
not evidence of real API authorization, cluster health, host preparation or restore.

Historical `before.txt` and `after.txt` concern the earlier candidate. The first
fixture wrote errors to stdout; the final fixture correctly writes them to stderr.
The abandoned `ignore-not-found-probe.txt` failed discovery due to a fixture URL
routing bug and proves nothing about suppression behavior. It is retained as a
failed attempt, not counted as evidence of a production property.
