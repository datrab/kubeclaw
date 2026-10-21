# Independent four-page communication/platform/data callout review

Reviewer `/root/workflow_acceptance`, independent of author
`/root/operator_acceptance`. Frozen author baseline
`d8e97be18ce7f2114212c64305fced4aa7b691a6`. **One material finding; candidate
NOT_READY until F1 correction and targeted nonauthor rereview.** All other61
bounded callout scopes have Source/semantic Reader/Quality PASS. This is not62
new requirements, whole A91205 or whole publication acceptance.

## F1 — shared credential is not a separate read token

`docs/site/understand/platform-and-operations.md:1014`, Source box30,
“effective operations authority”, adds:

> Nonempty execNamespaces enables Codex token/kubeconfig and namespace-scoped exec; MCP retains its read token separately.

This suggests a separate/read-only MCP credential after exec admission. The
actual workload uses one ServiceAccount (`workload.yaml:38–39`), projects one
`kube-api` token (`147–151`) and mounts that same volume in Codex conditionally
(`74–77`) and MCP (`99–101`). The namespace exec Role/Binding grants that same
ServiceAccount `pods/exec` get/create (`rbac.yaml:65–92`). The generated kubeconfig
also reads that same token file. Consequently, with exec grants enabled, the MCP
container's credential has those effective grants too. The read-oriented MCP
method list does not reduce that credential. The existing surrounding chapter
and original links already explain this correctly; the new field contradicts it.

Finite correction: describe MCP retaining a mount of the **same** ServiceAccount
token, including effective grants; do not call it a separate read token. No
product/RBAC/credential change or live test is needed to correct this prose.
Author remediation is not performed by this reviewer.

## Complete finite review scope

Fully read all62actual parsed Source groups,57new six-field additions, four exact
existing complete groups, the sole LiteLLM implementation-link addition, original
linked claims/limits, and relevant surrounding mechanisms/settings/recovery text.
New field sets were checked against actual controlling functions/callers and
named assertion text, with coherent completed unchanged original topics reused
rather than treating pinned-byte equality as semantic proof.

Per-box verdicts, exact page hashes and original Source spans are in `review.json`
and `independent-static.json`; fresh nontruncated Source read ranges and hashes
are in `fresh-source-read-ranges.json` (27records,26complete modules/files plus
SDK serialization1–100). These include complete native framing; real Redis
migration assertion fixture; real artifact encoding/checkpoint fixture; pooled
PostgreSQL transaction and corpus fixtures; corpus rights test; Worker output
spool/trust; Redis adapter/stream identity; effect journal; artifact adapter;
Prism complexity, architecture-generation/transition, snapshot/subject, material
diversity, native host composition, relational migrations, local CAS; and the
complete Ops workload/RBAC/kubeconfig/values. Tests were read, not imported/run.

### Reuse is scope-aware, not an invented fresh whole-source audit

Read the complete operator-platform acceptance, d477 communication/telemetry union
and parent correction reports; complete state-final audit; LiteLLM whole first
FAIL and correction-final PASS; finished-reader first FAIL and correction-final;
Prism one-diagram corrected-source report and selected upstream/registry manifests.
The source/reader union covers the old unchanged context, not just new keywords.
The record reconciliation in `reuse-impact.json` covers eight exact named records:
whole communication union, whole stores, discovery/drift, dependency traces,
reference-store retention, Prism topics, complete state content and LiteLLM data.
**Every explicitly declared source in each remains unchanged from its recorded
review revision to capturedbaseline.** These source comparisons are necessary
bindings for the named completed semantic reports, not a replacement for them.

All four baseline pages are also byte-identical at the parent-reviewed2e89Source
and d8e97baseline. Existing source, rendered-reader and subsequent impact evidence
retain only their original scopes/authors/limits. Matrix-only summary detail is
not presented as a new fresh review of every function or all5356candidate lines.
In particular the separate Prism diagram review supplies only its15edges and
specific corpus/generation distinction, not a fictional whole Prism-page proof.
The prior whole state/Prism content scopes supply the other unchanged mechanisms.

LiteLLM's historical unsupported OCI layer-equality assertion remains a retained
first failure. The later independent correction limits proof to official Git
contracts and verified registry metadata. No layer/source equality, publisher
signature, image execution, encryption round trip, migration success or live
application restore follows. Existing OpenClaw embedding-source proof similarly
keeps its source/image/live boundary. No upstream fetch was performed here.

## Preservation and actual static/quality checks

- Independent actual installed MarkdownIt (`html:true`), same production
  top-level Source selection:14communication+16platform+16data+16Prism=62.
  All six fields belong to each same actual parsed block. It is not a raw
  document-wide regex count. Every group was then semantically read.
- Independent complete candidate/baseline SHA verification and heading/ordered
  original URL checks PASS. Every changed addition lies inside an actual parsed
  Source group; the only removed lines are the three inherited unquoted blanks
  replaced by quoted blanks for the same encoding claim. No Source headings are
  consolidated. See `independent-preservation.json`.
- Four previously complete groups remain byte-exact: platform readiness/storage,
  selected embedding client; data retention identification; Prism corpus/generation.
  Existing plain labels are valid and preserved, not replaced with generic fields.
- The six LiteLLM links are exact existing same-section URLs, including full
  original revisions/ranges. They match schema, encryption selection and startup
  admission/failure mechanisms under the preserved narrow Claim/limits. See
  `litellm-six-link-preservation.json`. No new semantic/image/execution assertion.
- Independent225author-listed local complete pinned objects all current-byte
  equal/ranges valid. The all-page check additionally includes12unranged migration
  table links:237revision/path objects total, all current-byte equal. Those12
  explain the larger independent count; they are not12new semantic approvals.
  Nineteen external identities stay unchanged and retain historical proof scope.
- Actual original reader-boundary CLI on the four candidate pages/current copied
  status source: terminal0, `reader-boundary.stdout`. This is a four-page bounded
  check, not main's whole corpus/publication check or a built-reader observation.
- Initial parser harness selected a nonexistent package `index.mjs`, failing
  before any parser/check ran with ERR_MODULE_NOT_FOUND. Corrected to the normal
  package `createRequire` API; terminal check produced62blocks/no missing fields.
  No validator or product behavior changed to obtain the result.

## Semantic decisions and counterexample boundaries

Communication preserves separate bridge/Control/native Worker/domain owners,
dynamic provider policy versus static fallback, model/mention selection versus
observed traffic, bounded framing versus specialist meaning, Redis dedup expiry
versus consumer completion, and publisher request/reservation/terminal identity
versus exactly-once fiction. The dated passing stubbed direct probes and failed
Core-backed publisher admission remain explicit and unchanged. SPIFFE proxy
identity supplements capability/fence authority. The showcase remains a target.

Platform preserves existing-cluster bootstrap, independent storage adoption,
exclusive CNI/Helm/Argo owners, builder/cache versus receipts, explicit anonymous
lab registry and direct retained versus GitOps ephemeral profiles, configured
client routing versus ready probes, model/channel/provider credentials and
optional monitoring. F1 is the sole new contradiction of these distinctions.

Data preserves receipt versus Ed25519 source attestation; temporary/inactive
state; store-local integrity/locks versus whole-backup/rollback assurance;
run/config provenance; large-effect result recovery groups; signal issuer versus
authentication; Worker sealed result versus native scope ownership; original
Buster evidence; matched Prism database/artifact superset with deletion stopped;
LiteLLM credential authority; selected profile capacities; dedup expiry and exact
artifact codec/reference identity. Named checkpoint/migration assertions do not
become fresh execution receipts.

Prism retains active architecture/round frontier, exactly-three material diversity,
structural/semantic/complexity separation, transactional revision CAS and new
revision restore, subject-bound preference snapshots, approval versus complete
v2 archive and distinct digest identities, fixed rendering versus browser/media
limits, local CAS versus authorization, restricted/active corpus transitions,
rights/ranking/diversity rules, separate native/job/nonce/product stores and
owner-specific connection deadlines. Backup capacity and finished-Job TTL do not
become automatic backup age retirement or off-host restore.

## Remaining boundary

No main/public/register/generator writes, product/target/test imports or runs,
services, native hosts, providers, renderer, browser or global current-graph DATA
acquisition. Semantic Reader review is not a clean-context reader persona.
Parent owns corrected-source integration, ownership refresh and grouped fresh
rendered Reader checks. These four callout scopes do not resolve the remaining
corpus or grant whole A91205/global/release/runtime acceptance.
