# Independent complete Plugin / Prism callout review

**NOT_READY: exactly three material findings.** Coherent full41-callout review completed before requesting author changes. This is a separate batch:40 additions plus one unchanged existing complete startup block; no compound27/58/41 verdict and no whole A91205 acceptance.

## F1 — package upgrades do not permit configuration drift

Plugin Runtime, compatibility-during-recovery new Claim: “Recovery keeps pinned bytes/configuration unless an exact authorized upgrade chain permits the change.” This incorrectly extends package-upgrade authority to runtime configuration.

`skills/nova/core/execution/engine-snapshots.ts:29–40` always compares stored `configuration` to current `runtime.configuration` at33 and throws `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH` before considering package upgrades. Its50–66 upgrade chain changes only package identity/version/digest. The surrounding chapter correctly describes configuration as retained facts and later explicitly lists the stored subset versus omitted settings.

Finite fix: **“Recovery requires the stored runtime configuration; exact authorized upgrade chains can permit changed package versions/digests only.”** Do not claim all platform fields are frozen; keep existing subset/omitted-setting limits.

## F2 — actual MarkdownIt splits the deployment callout

Prism Runtime, final deployment-constraints block at candidate1033: an **unquoted empty line** between the Agent/SPIFFE link and startup-doctor link ends the Source block. The following quote contains Contract/setting, Test, Revision and Limit, but no Source title. Actual production-equivalent top-level Source selection therefore sees Claim/Implementation only and omits those four fields plus the second quote's startup-doctor link from this Source preview.

Actual MarkdownIt result: Plugin21/21 complete; Prism19/20 complete, deployment block has only two fields. `plugin-prism-independent-structure.mjs/.json` preserves parser procedure/result. This is not a literal-label presence judgment. The author’s regex sees one text group, but Markdown structure is two blocks.

Finite fix: change that one empty line to `>` so the existing links and all six fields stay in one Source block; preserve source/prose/URLs and rerun the actual parser. The blank split was inherited, but the new field completion still needs to form one Reader callout.

## F3 — bridge does not expose model tools

Prism Runtime, bridge-and-tool-surface new Claim: “The private bridge forwards admitted work and exposes only two Prism mutation tools to the model.” This assigns tool registration to the bridge, contrary to the controlling sources and original chapter.

`skills/prism/server/agent-bridge.mjs:1–37` implements private HTTP dispatch forwarding, durable-job status and runner polling; it registers no model tool. `skills/prism/openclaw-plugin/index.mjs:22–80` separately registers the two tools inside the OpenClaw host, whose calls reach Control agent routes.

Finite fix: **“The private bridge forwards admitted work; the OpenClaw extension exposes two Prism mutation tools to the model.”** Keep the bridge, Gateway host plugin and Control state authority separate.

## Complete review / retained positives

Read all new fields and the complete original two-page context: package/discovery/digest/schema/trust/install/ownership/grant/provider/config/import/activation/lease/isolation/state/effect/removal/error/change/verification; Prism architecture/topology/configuration/session/trust/dispatch/agent/optional decisions/job uncertainty/approval/publication/Worker/readiness/limits/result/hydration/shutdown/replay/Studio/Ingestion/adapter/deployment and recovery.

Remaining38callouts have bounded Source/semantic Reader/Quality PASS, including the already complete startup callout that remains byte-exact. Original valid unchanged whole-topic source reviews are reused only for their actual mechanisms, not as all-source or live acceptance. Fresh controlling reads covered config-before-upgrade, activation integrity/import, Control configuration, Worker configuration/lifecycle, native reservation/result-before-hydration/evidence, HMAC replay checks, bridge and host tool ownership. No verified fourth material defect.

All other conditional limits remain accurate: manifests request rather than grant authority; schema/default resolution does not validate function behavior; import audit is not runtime isolation; external adapters are unsupported; Linux controls need deployment-host evidence; startup cleanup can hang and delay rollback while no partial set is published; normal shutdown has a separate timeout. Stored configuration is not redacted and omits named platform fields. Removal delegates authorization/drain/reference retirement to its caller.

Prism still separates model execution receipt from document transaction, approval from baseline publication, bootstrap from nonce-dependency readiness, actual request connection drain from child-tree proof, stored terminal result from evidence hydration, public-web acquisition implementation from disabled Control admission, and pure adapter mapping from archive/remote execution. No missing needs_nova transition, stored-role authorization limit or host/deployment proof was hidden or promoted.

Fresh complete test-text reads: registry328; internal-auth17; pipeline-adapter49; worker-readiness41; shutdown-boundaries79; studio-proxy18. Reuse prior complete unchanged agent-jobs113 read. Each new test description matches actual assertions and explicitly is not an execution receipt. The optional actual-PostgreSQL readiness case remains conditional/not asserted executed. The TCP-peer/pg shutdown fixture is not native engine execution. The original three broader verification definitions retain old descriptions; new field explicitly does not claim completed suites or deployment-kernel acceptance. No new complete494/297-line security/isolation review or execution is claimed.

## Exact independent checks

- Both baseline/candidate SHA256 values match; both baseline files equal2e89. Every byte outside existing Source groups and every original URL/order preserved. Plugin startup block exactly unchanged.
-71distinct full immutable git objects independently equal current complete physical bytes; all ranges in bounds. `plugin-prism-independent-bindings.json`.
-Actual installed MarkdownIt `html:true` token parse, same top-level Source selection as production previews; fields checked within each block’s inline text. Exit0, exposing F2. Initial root-package dependency resolution failed; corrected lookup uses already installed real reader package, no install.

No main/register writes, target module imports, product/test/service execution, generator or current DATA acquisition. MarkdownIt parses inert documentation only. Parent owns integrated language/Source/publication/fresh Reader checks. Exact41 per-box dispositions and final original candidate hashes are in `plugin-prism-callouts-independent-review.json`. Other corpus, whole A91205, acceptance counts, runtime/CI/hosting/release and compound batch acceptance remain outside scope.
