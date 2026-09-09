# IFR-20-001 — Explicit ingestion sizing and health recovery

The optional Prism ingestion Deployment previously had no CPU/memory requests or
limits and no liveness probe. Enabling it now requires the operator to supply
`ingestion.resources.requests.cpu`, `.memory`, `limits.cpu` and `.memory`.
The default remains disabled with empty sizing fields; no host capacity or
recommended allocation is inferred. The template renders the supplied quantities
and independently rejects missing fields. The conditional schema checks positive
quantity syntax and numeric values. Kubernetes admission remains responsible for
full quantity semantics, request/limit ordering and cluster policy; these local
checks do not establish scheduling feasibility or memory headroom.

The existing `/ready` readiness probe remains. The new liveness probe calls the
original service's `/health` endpoint. It detects an unresponsive process, not
corpus quality, downstream availability or measured capacity.

`ingestion.quarantineTtlMs` exposes the existing one-hour default and accepts whole
milliseconds from 60000 through 86400000. The chart passes it to the original
`PRISM_QUARANTINE_TTL_MS` runtime configuration. Direct service configurations
retain the existing finite integer clamp to one minute through one day. Nonfinite,
unsafe and fractional values now reject before serving instead of allowing NaN
to disable quarantine reaping. Quarantine means temporary acquired source bytes;
this does not add any expiry for logs, reports, accepted results or credentials.
The existing disk-backed emptyDir size limit remains 4Gi.

## Verification

- Actual Helm 3.18.4: three tests pass, zero skips. Default-disabled ingestion is
  absent, two explicitly supplied resource sets survive rendering, both probes
  target the real routes, TTL is wired, and missing/invalid quantities or TTL fail.
  Explicit replicas=0 remains a supported operator pause and renders unchanged.
  Test sizing, image digest vectors and the database Secret reference are render
  fixtures only; no image is pulled and no Secret or workload is created.
- Original service in real Node child processes: two tests pass, zero skips.
  Health/readiness remain available after an actual EISDIR cleanup error, auth is
  preserved and retry succeeds without restart. Startup reaping removes expired
  acquired bytes while retaining recent bytes under the original finite clamp.
  NaN, Infinity and fractional TTL configurations exit with the explicit error.
- Canonical ESLint passes both changed tests. The service has the same 13 existing
  findings as exact HEAD (environment/default policy, complexity/depth and console);
  baseline and current logs are preserved. No suppressions or unrelated rewrite.
- Scoped `git diff --check` passes. No native Pod scheduling, OOM recovery or host
  RAM measurement was performed; those remain operational gates.

Commands from the repository root:

```sh
KUBECLAW_TEST_HELM=/workspace/scratch/4e25cf57c177/toolchains/bin/helm node --test tests/verification/deployment/prism-ingestion-resources.test.mjs
node --test skills/prism/tests/ingestion-service.test.mts
node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs tests/verification/deployment/prism-ingestion-resources.test.mjs skills/prism/tests/ingestion-service.test.mts skills/prism/server/ingestion.ts
```

Raw logs are `docs/review/evidence/prism-ingestion-resources-*`: `chart-final3.txt`
and `service.txt` are passing execution evidence; `test-lint.txt` passes;
`lint.txt` and `lint-baseline.txt` show the unchanged 13 findings. Earlier chart
failures are retained in `chart.txt` (initial RE2-incompatible schema regex) and
`chart-final.txt` (missing existing database Secret reference in the render fixture).
The regex and fixture were corrected; production requirements were preserved.
`chart-final2.txt` records the earlier passing render before the explicit zero-replica
compatibility regression was added; `chart-final3.txt` includes that regression.

## Exact scope

- charts/prism/templates/ingestion.yaml
- charts/prism/values.yaml
- charts/prism/values.schema.json
- skills/prism/server/ingestion.ts
- skills/prism/tests/ingestion-service.test.mts
- tests/verification/deployment/prism-ingestion-resources.test.mjs
- docs/review/remediation/implementation/prism-ingestion-resources.md
- docs/review/evidence/prism-ingestion-resources-chart.txt
- docs/review/evidence/prism-ingestion-resources-chart-final.txt
- docs/review/evidence/prism-ingestion-resources-chart-final2.txt
- docs/review/evidence/prism-ingestion-resources-chart-final3.txt
- docs/review/evidence/prism-ingestion-resources-service.txt
- docs/review/evidence/prism-ingestion-resources-lint.txt
- docs/review/evidence/prism-ingestion-resources-lint-baseline.txt
- docs/review/evidence/prism-ingestion-resources-test-lint.txt

No deployment, external communication or commit is included.

Root counterreview preserved the original replicas=0 pause behavior rather than adding an unrelated minimum-one restriction. Independent combined original service/Helm rerun passes five tests, zero skips; raw output: prism-ingestion-resources-root.txt. Native scheduling/resource/OOM evidence remains open.
