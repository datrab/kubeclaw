# Control service policy: pre-implementation criteria — 2026-09-21

This slice migrates three operator-owned service settings to required immutable
`operator.prism.control`. It does not migrate trust topology, credentials, listener
bindings or close CONFIG completeness. The [fresh nonauthor review](control-discovery-independent-20260921.md) accepts CC1–CC5/CC-DOC within this scope.

| Criterion | Required observation |
| --- | --- |
| CC1 | Exactly three required fields; reject missing/unknown/invalid values. Explicit defaults preserve current behavior. No runtime numeric/string fallback remains for these fields. |
| CC2 | Reject the three retired Control environment authors, including empty strings, and the old Helm subject key. Capture one validated immutable startup snapshot before asynchronous authority I/O; mutation does not replace settings. |
| CC3 | Two authored profiles reach actual Control consumers: persisted personal-history authorization, content-addressed artifact writes in the authored root, and generated Studio response links. Preserve original route/security assertions and deadlines. |
| CC4 | Actual Helm delivery, mounted loader and checksums carry the author; the artifact PVC mount follows the authored root. Preserve generated trust identities, Envoy transport selection and external credential wiring. |
| CC5 | Original Control/runtime/config, Helm and release suites pass; meaningful negative controls detect a competing subject/root/URL author. Do not fabricate privileged or cluster execution. |
| CC-DOC | Per-field operator guidance, migration errors, defaults/units/consumers and evidence; classify exactly fourteen historical Control reads and the retired Helm subject row without claiming upstream trust/topology completion. |

| Historical author | Canonical author / treatment | Type, unit and current default | Actual consumer |
| --- | --- | --- | --- |
| `PRISM_PIPELINE_PREFERENCE_SUBJECT`, Helm `control.pipelinePreferenceSubject` | `operator.prism.control.pipelinePreferenceSubject` | null (disabled) or `user-` plus 24 lowercase hex digits; authenticated user ID; null | platform authorization and persisted personal preference generation |
| `ARTIFACT_ROOT` (Control only) | `operator.prism.control.artifactRoot` | absolute normalized non-root filesystem directory; `/var/lib/prism/artifacts` | Control content-addressed artifact store and its PVC mount |
| `PRISM_STUDIO_PUBLIC_URL` | `operator.prism.control.studioPublicUrl` | absolute HTTP(S) public base URL without credentials/query/fragment; `https://prism-studio` | Studio links returned by actual Control design-set route |
| `DATABASE_URL` | external Secret/pg credential material | connection string, no local default | production `pg.Pool` |
| `PORT` | unresolved coupled listener/topology author; not migrated | listener TCP port; current local default 8080 | actual listener, Service/probes and Envoy binding need coordinated migration |
| `WORKER_TRUST_SPIFFE_ENABLED` | upstream operator trust-mode author, migration unresolved | boolean environment transport; false unless exactly `true` | Control authentication/dispatch selection and chart sidecars |
| `PRISM_TRUSTED_NOVA_SPIFFE_ID` | deployment-generated identity; upstream author migration unresolved | SPIFFE ID; empty local fallback | proxied peer authorization |
| `PRISM_TRUSTED_WORKER_SPIFFE_ID` | deployment-generated identity; upstream author migration unresolved | SPIFFE ID; empty local fallback | worker result/dispatch trust |
| `PRISM_CONTROL_SPIFFE_ID` | deployment-generated identity; upstream author migration unresolved | SPIFFE ID; empty local fallback | Control identity and agent admission |
| `PRISM_TRUSTED_AGENT_SPIFFE_ID` | deployment-generated identity; upstream author migration unresolved | SPIFFE ID; empty local fallback | agent route authorization |
| `PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID` | deployment-generated optional identity; upstream author migration unresolved | SPIFFE ID; empty local fallback | optional test-runner peer authorization |
| `PRISM_WORKER_URL` | coupled deployment transport binding; migration unresolved | URL; `http://prism-worker:8080`, chart selects loopback Envoy under SPIFFE | native worker dispatch |
| `PRISM_INGESTION_URL` | coupled deployment endpoint author; migration unresolved | URL; `http://prism-ingestion:8080` | acquisition and quarantine cleanup HTTP requests |
| `PRISM_CONTROL_INTERNAL_URL` | coupled deployment transport binding; migration unresolved | URL; `http://prism-control:8080`, chart selects loopback Envoy under SPIFFE | internal artifact references |

Classification of a generated read is not resolution of the upstream trustDomain,
namespace, service-account, service-name or port author. Backup's separate
`ARTIFACT_ROOT` environment is a job-specific mounted transport and is not retired
by this Control-only migration. Secrets remain external, never copied into the
public swarm document. The new path/URL validation makes formerly unchecked
malformed operator values fail at startup rather than during requests.


## Implemented behavior and evidence status

The three-field object is required by the shared strict schema and frozen with the
other startup settings. Control maps it once before asynchronous product-authority
loading. Old environment keys are rejected, including empty strings, and the old
Helm subject key is removed and rejected. Helm delivers the same file/checksum to
both roles and mounts the Control artifact PVC at the authored directory. The
existing generated SPIFFE identities, Envoy transport URLs, Secrets and listener
port remain on their existing paths. No independent replacement trust author was
introduced.

Evidence directory: `docs/review/evidence/config-control-policy-20260921/`.
`source-identities.json` records the selected final source hashes and snapshots,
including unchanged original consumers. This is not a full dependency archive.

- `policy-http-helm.txt`: 244/244 pass, no skips, before test-label escaping only.
  Includes original HTTP generation assertions and two additional profiles through
  real composed Control, persisted SQL history, authenticated artifact HTTP writes
  verified from disk, and actual design-set Studio links. Actual Helm profiles
  verify mounted loading, artifact PVC path, checksum change, retained SPIFFE
  identities/Envoy endpoints and rejected old Helm subject values.
- `runtime.txt`: 209/209 pass, no skips, original affected worker/native/resource/
  input/HTTP behavior and supervisor configuration suites.
- `control.txt`, `control-final.txt`, `release.txt`, `release-final.txt` were
  interrupted by environment restarts before final summaries. They are retained as
  incomplete evidence; partial passing lines are not suite passes. The preliminary
  mutant logs are empty after those interruptions and establish no negative control.
- Final serial Control/release, mutants, typecheck/lint and documentation results
  are recorded below once complete. No privileged native host or cluster execution
  is claimed. The [fresh independent review](control-discovery-independent-20260921.md) is complete for this bounded migration.

Only the fourteen historical Control reads and old Helm subject row were updated.
The historical scanner omitted five additional local-helper credential reads
(session, ingress, ingestion, dispatch and worker secrets). Those external secret
inputs are not moved into public configuration; the historical fourteen are not
complete Control discovery. Other trust/topology/port authors remain unresolved.

### Completed serial verification and source freeze

The final runs use one test process at a time after the interrupted concurrent
runs. Every result below has a terminal exit status, not only partial output:

- `control-serial.txt`: **34/34 pass**, zero skips, exit 0. Full original Control,
  E2E, platform subject and artifact durability selections, including the two new
  real HTTP profiles. Original assertions/deadlines were retained; setup now writes
  the authored file instead of setting the retired environment keys.
- `release-serial.txt`: **25/25 pass**, zero skips, exit 0. Original release,
  image/runtime-input and actual materialization/Helm tests.
- `typecheck-completed.txt`, `lint-completed.txt`: exit 0 for Prism typecheck and
  canonical lint of all nine changed TypeScript/JavaScript sources/tests.
- `mutant-subject-completed.txt`, `mutant-root-completed.txt`,
  `mutant-studio-completed.txt`: each **0 pass / 2 fail**, zero skips, exit 1.
  The loader hook changes one production mapping at a time while running the same
  real HTTP profiles. The subject mutant loses the selected persisted identity;
  the root mutant writes outside the asserted authored directory; the Studio
  mutant returns the wrong link. Each failure is at its semantic assertion, not
  import/setup failure. No original production file is changed by the hook.
- Documentation inventory/reference generation completed normally. `docs-check.txt`
  and `docs-refs.txt` pass (928 active Markdown files, 2240 local links and 813
  repository references at that point). Concurrent work may change those global
  counts; the root reviewer owns the final integrated generated-document refresh.

`commands.txt` records the exact invocations. The selected source manifest was
rechecked after these runs and all hashes still matched. Production and test source
are frozen for fresh independent review. This author does not self-accept CC1–CC5
or CC-DOC and does not claim native-host, cluster, CONFIG F1 completeness or whole
goal closure.

### Post-review image integration finding

Root subsequently found a retained Control Docker `ARTIFACT_ROOT` author that
conflicted with this loader. The prior bounded review missed this image path, and
the old image proof hid it by constructing synthetic environments. The [corrective
image check](control-image-environment-20260921.md) records the failure, correction
and new regression. The correction now has [fresh independent local acceptance](control-image-environment-independent-20260921.md); actual built-image proof remains a separate gate.
