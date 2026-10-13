# Complete Buster C3 profile — additive registry-reference correction03

Author `/root/source_concordance_layout_recheck`, 2026-10-13. Corrects the concrete BC3-R02-01 source-shape finding from independent review02. **Frozen author proposal; fresh independent material recheck required. No acceptance claimed.** Proposal01/02, their reviews/manifests and original canonical arrays remain exact. This does not close WCR02/whole C0 or authorize implementation.

## Exact source domain and material delta

The sole author remains `config/components/buster-engine.config.json#/profiles/<explicit>/settings`; all six full owner documents,96 profiles (91 Buster), root.v4, complete policies and91 generated runtime/registry projections are byte-for-byte equal to02. All-profile full generation validation and separately gated selected capability source/I/O eligibility are unchanged. No new registry source/writer, invented profile/default, C1 backfill or installed-provider assertion.

Only the proposed generated runtime reference schemas change. `registryPeer`, `securityScan.registry` and the repeated registry members of `containerBuild` now allow the exact five source fields: endpoint, host/reference, optional worker `registryCaFile`, and two conditional credential ENV **names**. Both outer properties and capability-conditional closed copies carry the same definition. Unknown keys (including `nodeCaFile`/transport in runtime) still reject.

| Existing producer branch | Generated reference domain / admission |
|---|---|
| HTTPS with explicit auth-name pair | Normalized HTTPS origin/reference; both names required with producer regex `^[A-Z][A-Z0-9_]+$`. Optional worker CA. No credential values in this package. |
| HTTPS paired custom trust | Original `caFile` and `nodeCaFile` both truthy absolute/non-CR/LF/NUL; runtime emits worker `registryCaFile` only. Paired empty trust strings emit no CA. Authentic original trust receipt must establish paths/revisions and actual receiver applicability. |
| Explicit anonymous HTTP-lab | Normalized HTTP endpoint/reference only; name refs and CA forbidden. This source-supported domain is not arbitrarily excluded to simplify the schema. |

Actual `scripts/registry-client-config.mjs` owns this projection: `trust`24–26 pairs worker/node trust, `credentialNames`38–47 requires HTTPS names and forbids HTTP auth, `registryClientOrigin`92–95 validates public domain without resolving values, `registryClientConfig`98–104 emits optional CA/names. Origin/host equality, default-port normalization and exact equality of repeated active refs to the captured original receipt are semantic admission checks beyond JSON schema; reconstruct/check the captured original source using that pure origin predicate before productive eligibility. No schema-only acceptance of a mismatched host or ungranted path.

`registry-peer-reference-contract.json` supplies the complete admission/archive conditions. Keep the original root/owner/provider revision, immutable selected generation/role and registry receipt identity. Capture worker and Node trust references under their respective explicit original authorized roots, regular/no-follow physical resolution, ownership/size budget, content revision/digest and read-drift checks before effects. Absolute `..` is source-shape supported; normalized escape from the actual granted root is an admission failure, not an invented producer ban. Historical stored/archive source authority precedes current authority at submit/bootstrap/queue/start/cancel/evidence/result; drift or missing original capture rejects, never substitutes current CA/auth into stored A. Public fixtures do not establish physical capture or installed trust.

## Actual receiving boundaries — distinct trust domains

- `production-config-values.ts::scannerRegistry`139–166 maps HTTPS worker `registryCaFile` via `path.resolve(directory,...)` to `registryAccess.caFile`. `security-scan-runtime.ts`173 checks readable,228 forwards `--cacert`. This is genuine source behavior, not a new unused option. Authenticated positive receiving/constructor/command remains external: no credential values, CA reads, scanner constructor or invocation here.
- `registryClientConfig`'s Buildkit TOML consumes worker `caFile`; containerBuildOptions does not forward a new CA option. The node registry-client projection consumes **nodeCaFile** into `configs[host].tls.ca_file` (containerd/node registry client), not Node.js fetch trust.
- `RegistryHealthOptions` has only origin/username/password. `registryHealthConfiguration`120–136 forwards only these; `network-http-runtime.ts`245 uses standard fetch. Worker CA is **not** silently inserted into an invented NetworkHttp option, and containerd node trust is not evidence of Node.js trust. Custom-CA HTTPS health needs authentic existing applicable process/image trust delivery; absent that receipt, active health admission stops before effects while preserving the source-supported shape/archive. No such trust delivery is proved here.
- Actual anonymous HTTP scanner receiving returns `unsupportedHttpRegistry`154. Pinned scanner image invocation202 deliberately throws `SECURITY_SCAN_HTTP_LAB_UNSUPPORTED` for that registry instead of unsafe TLS relaxation. The future selected source-compatibility gate archives this explicit incompatibility before effect; HTTP remains valid for genuine supported consumers such as anonymous health/build transport. This is not an invented profile prohibition or a claim that all scanner operations/consumers support plaintext.

## Actual narrow pure checks / reproducibility

Repository cwd command:

```sh
node docs/review/evidence/config-acceptance/c0-completion-20261013/c3-buster-complete-profile-03/collect-definition-checks.mjs --output-dir docs/review/evidence/config-acceptance/c0-completion-20261013/c3-buster-complete-profile-03/final-run
```

**Final actual exit0;32 named controls;96 full owner profiles;91 Buster/generated pairs.** Raw final-run.stdout/final-run.stderr (empty), exact commands/exits and final-run/definition-checks-03.json retain Node v24.21.0 binary identity, Ajv8.20.0 entry identity, collector identity and169 recorded input entries. Recorded-input drift0. No new generic validator: the existing narrow02 collector is extended using strict Ajv/current source predicates and specific public reference oracles. A reviewer can supply its own output directory; no argument writes nothing beyond stdout.

The original24 controls remain: six full owners, full/root negatives, response/timer/capability domains, all91 pairs, TLS path references, inactive-source eligibility, all13 complete original component A/B couplings including dedicated threshold A, all64 full provider contrasts. Eight added controls cover:

1. Actual producer public-origin predicate for HTTPS names/custom paired CA; full repeated runtime peer/scanner/container schema accepts those public shapes.
2. Actual anonymous HTTP producer with empty supplied environment (no names/values), complete repeated runtime shape.
3. Producer negatives: absent HTTPS auth, half names, invalid names, unpaired/relative/unsafe trust, wrong transport, unknown key and HTTP auth/trust.
4. Full runtime negatives: unknown keys, missing/half HTTPS pair, relative CA, injected URL/path and HTTP auth/CA.
5. Task-specific public granted-root escape and source-host mismatch admission oracles. These are proposed shape guards, **not** physical no-follow capture execution; producer acceptance of an absolute outside-root path is retained separately.
6. Actual scanner pure HTTP unsupported marker, HTTPS absent-auth rejection, and custom-CA named-ref missing-credential rejection before constructor/I/O. The successful authenticated custom-CA branch is source-traced, not executed.
7. Actual anonymous HTTP health predicate/no unused CA option and mismatch rejection, no fetch/invoke.
8. Exact02 six-owner/root/projection conservation.

HTTPS expected runtime projection in the collector is explicitly assembled from public names/paths after actual producer origin validation; the credential-resolving HTTPS `registryClientConfig` call is **not** executed. Public expected shape validation is not a credential-generation receipt. Two failed strict runs and attempted collector/schema bytes are preserved: missing conditional property declarations, then stale duplicated conditional schemas. They were corrected without relaxing strict mode or assertions. The final run is the authoritative receipt; an interim successful run's unretained output is explicitly recorded as unused, not fabricated evidence. Old01's unauthenticated17 summary remains historical and is not retroactively credited.

## Original cases and dependency supersession

`future-case-joins.json` remains byte-for-byte02 lineage with original IDs/body hashes/requirements/results. `registry-reference-case-oracles.json` adds exact strengthening to56 affected original provider cases (containerBuild/securityScan/network registryHealth), retaining each body SHA and original delivery case IDs, all not-run. Real CA/credential/scanner/Buildkit/node trust/native effects and historical receipt replay remain required future oracles. Pure reference controls do not reclassify original runtime results.

`frozen-supersession.json` records exact02 root/schema/manifest/review identities and the03 field delta. Provider02's proposed root.v5 currently bases on02 root.v4. After fresh independent03 review, that proposal must explicitly replace its base generated-runtime-schema/reference-contract dependency with the frozen03 identities. Root.v4/settings bytes do not change; no automatic/transitive provider approval or competing author.

`preserved-identities.json`:30/30 proposal01 artifacts,51/51 proposal02 artifacts match original manifests; both review hashes captured. Original2,409 canonical rows and6,845 cases equal git a0d5588c4; root metadata intentionally not equated with historical whole-file hashes. package-manifest.json freezes this additive package except itself.

## Remaining stops

C3 policy/reference/activation reader changes are proposed, not current implementation. Genuine provider/grant/registry source revision/physical trust capture, credential resolution, scanner/Buildkit/node trust install, Node.js trust delivery, TLS listener, runtime/native quota/effect/lock/archive/Eval receipts remain unavailable external inputs or future phase contracts. No production/source/schema/test/canonical file changed; only this additive evidence package written. Full C0/C1–C6/native/implementation approval remains open pending independent material review and the original phase stops.
