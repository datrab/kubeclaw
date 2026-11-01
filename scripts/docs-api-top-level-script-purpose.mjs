import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {shellNativeNodeEntries} from './docs-shell-source-custody.mjs';

const authorityPath = 'scripts/docs-api-top-level-script-purpose-authority.json';
const authoritySha256 = 'f5ab471dfd592b972ab19db80ad60a37cb01d6ff1f87229d5614dc23d24d054f';
const currentPurposeInputBindings20261031 = Object.freeze([
  {
    "path": "docs/site/extend/lint.md",
    "sha256": "a1c0a7ba491dcb60690e38e50d813d477ce33894492a43629b10e12c60cbd53e",
    "historicalSha256": "8e84ad80f6b9fff4557073d77796f64e6374c170ad23d261c1a3ae6b0dac461e"
  },
  {
    "path": "scripts/plugin-registration-dependencies.mjs",
    "sha256": "7f473538623aedb9f0c49477c72c54b5eda5a3e20456074becfd7ef73cd5ccca",
    "historicalSha256": "0e5cc4599edcd642b3c7c6190be62b869d8f57aa5fc45d0acd9bd5a78e7e28b2"
  },
  {
    "path": "scripts/docs-publication.mjs",
    "sha256": "c96741df38af067044811d38e0c0513dd9512e383493d08e984cf62e538b1bd5",
    "historicalSha256": "2e44d7a367bfce370229a00af8b0352690983029f763020608e938ba8fd35943"
  }
].map(Object.freeze));
const hash = value => createHash('sha256').update(value).digest('hex');
const receipts = new WeakSet();
const selectedSources = Object.freeze([
  'scripts/lint-baseline-update.mjs', 'scripts/observability-retirement-plan.mjs',
  'scripts/recover-openclaw-audit-input.mjs', 'scripts/render-kubernetes-api-probe.mjs',
  'scripts/render-stateful-network-policies.mjs', 'scripts/updates/check-upstream-refresh.mjs',
  'scripts/updates/deployment-release.mjs', 'scripts/updates/materialize-release.mjs',
  'scripts/updates/refresh-versions.mjs', 'scripts/updates/release-images.mjs', 'scripts/versions.mjs',
  'scripts/generate-plugin-dependency-aggregate.mjs',
  'scripts/lib/docs-retained-configuration-formatters.mjs',
  'scripts/lib/docs-retained-source.mjs',
  "tests/verification/contracts/check-pipeline-manifest-lint-implementation.mts",
  "tests/verification/contracts/check-pipeline-manifest-lint-parity.mts",
  "tests/verification/contracts/support/manifest-lint-parity-fixture.mts",
  "tests/verification/contracts/check-junit-executed-required.mts",
  "tests/verification/contracts/check-pipeline-api-implementation.mts",
  "tests/verification/contracts/check-pipeline-committed-source-snapshot.mts",
  "tests/verification/contracts/check-pipeline-container-build-production.mts",
  "tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts",
  "tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts",
  "tests/verification/contracts/check-pipeline-kubernetes-fixture-live.mts",
  "tests/verification/contracts/check-pipeline-observability-durable-attempts.mts",
  "tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts",
  "tests/verification/contracts/check-pipeline-remote-plan-runtime.mts",
  "tests/verification/contracts/check-pipeline-remote-real-provider.mts",
  "tests/verification/contracts/check-pipeline-remote-runtime-config.mts",
  "tests/verification/contracts/check-pipeline-report-adapter-runtime.mts",
  "tests/verification/contracts/check-pipeline-size-budget-implementation.mts",
  "tests/verification/contracts/check-pipeline-size-budget-parity.mts",
  "tests/verification/contracts/check-pipeline-size-budget-production.mts",
  "tests/verification/contracts/check-pipeline-test-plan-runner.mts",
  "tests/verification/contracts/check-pipeline-test-provider-registry.mts",
  "tests/verification/contracts/check-pipeline-test-suite-resolver.mts",
  "tests/verification/contracts/check-pipeline-unit-parity-ledger.mjs",
  "tests/verification/contracts/check-pipeline-visual-legacy-comparison.mts",
  "tests/verification/contracts/check-pipeline-visual-remote-vertical.mts",
  "tests/verification/contracts/check-plugin-system-v2-boundaries.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase6.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase7.mjs",
  "tests/verification/contracts/check-project-compiler.mts",
  "tests/verification/contracts/check-runtime-bundle-isolation.mjs",
  "tests/verification/contracts/check-production-receipt-attestation.mjs",
  "tests/verification/contracts/project-legacy-import-cases.mts",
  "tests/verification/reliability/sdk-json-portable.test.mts",
  "tests/verification/reliability/source-identity-version.test.mjs",
  "tests/verification/reliability/effect-identity-version.test.mts",
  "tests/verification/reliability/project-source-fixture.mjs",
  "tests/verification/reliability/adapter-dependency-locale-fixture.mjs",
  "tests/verification/reliability/adapter-dependency-historical.mjs",
  "tests/verification/reliability/repair-identity-historical.mjs",
  "tests/verification/reliability/worker-deadline-fixture.mts",
  "tests/verification/reliability/fixtures/forge-runtime.mts",
  "scripts/tests/docs-cli-typed.test.mjs",
  "tests/verification/deployment/check-deployment-truth.mjs",

  "scripts/docs-publication-examples.mjs",
  "scripts/docs-publication-sdk-examples.mjs",
  "scripts/docs-schema-fields.mjs",
  "scripts/generate-buster-error-reference.mjs",
  "scripts/generate-buster-provider-reference.mjs",
  "scripts/lib/docs-event-reference.mjs",
  "tests/verification/e2e/nova-a11y-production-preflight.mts",
  "tests/verification/e2e/nova-e2e-production-preflight.mts",
  "tests/verification/e2e/nova-http-production-preflight.mts",
  "tests/verification/e2e/nova-kubernetes-fixture-production-preflight.mts",
  "tests/verification/e2e/nova-lighthouse-production-preflight.mts",
  "tests/verification/e2e/nova-security-production-preflight.mts",
  "tests/verification/e2e/nova-tailscale-production-preflight.mts",
  "tests/verification/e2e/nova-visual-production-preflight.mts",
  "tests/verification/e2e/run-real-pipeline-e2e.mjs",
  "tests/verification/e2e/run-real-pipeline-failure-matrix.mjs",
  "tests/verification/e2e/checkpoints.mjs",
  "tests/verification/e2e/failure-scenarios.mjs",
  "tests/verification/e2e/real-run-workspace.mjs",
  "tests/verification/e2e/manifest-lint-production.mts",
  "tests/verification/e2e/malformed-output-publisher.mjs",
  "tests/verification/e2e/bounded-output-capture.mjs",
  "tests/verification/historical-branch-acceptance/delivery-manifest-stage-boundary.test.mjs",
  "tests/verification/reliability/adapter-dependency-boundary.test.mjs",
  "tests/verification/reliability/admission-retirement.test.mjs",
  "tests/verification/reliability/blob-read-independent.test.mjs",
  "tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs",
  "tests/verification/reliability/discord-delivery-receipt.test.mts",
  "tests/verification/reliability/kubernetes-manifest-budget.test.mjs",
  "tests/verification/reliability/nova-dispatch-projection.test.mjs",
  "tests/verification/reliability/operator-request-projection.test.mjs",
  "tests/verification/reliability/report-evidence.test.mts",
  "tests/verification/reliability/review-cache-legacy-prefix.test.mjs",
  "tests/verification/reliability/review-report-locales.test.mjs",
  "scripts/tests/api-output-publication-native-custody.test.mjs",
  "skills/nova/plugins/review/scripts/generate-bundle-schema.mjs",
  "skills/prism/server/bootstrap-database.ts",
  "skills/prism/server/ingestion.ts",

]);
const documentaryFormatterSources = Object.freeze(["scripts/docs-publication-examples.mjs", "scripts/docs-publication-sdk-examples.mjs", "scripts/docs-schema-fields.mjs", "scripts/generate-buster-error-reference.mjs", "scripts/generate-buster-provider-reference.mjs", "scripts/lib/docs-event-reference.mjs"]);
const documentaryFormatterPurposes = Object.freeze({
  diagnostic: 'Exact complete-Source documentation validator/reference CLI diagnostic receiving purpose: original error stack/message or generator path/count status. Arbitrary diagnostic text remains UNKNOWN; no authenticity, API exclusion, validator success or native execution grant.',
  sdk: 'Exact independently SHA-256-selected complete canonical SDK codec example written as the input program for the reviewed Node child process. Genuine executable program input, not inert prose; original content digest, scratch checks, process capability guards and cleanup remain mandatory. No arbitrary program, execution success or API grant.',
  schema: 'Exact schema-field inventory JSON serialization to the fixed documentary drift index after schema/registration hashes and authority dispositions. Literal recursive properties pointers and digests, not reference resolution, runtime validation, activation or API grant.',
  event: 'Exact marker-absent event-reference page append transform at the sealed event-contract publication caller. Original page text and generated source-contract reference remain documentary bytes; not arbitrary payload truth, runtime delivery, filesystem permission or API exclusion.'
});
const standaloneVerificationSources = Object.freeze([
  "tests/verification/contracts/check-pipeline-manifest-lint-implementation.mts",
  "tests/verification/contracts/check-pipeline-manifest-lint-parity.mts",
  "tests/verification/contracts/support/manifest-lint-parity-fixture.mts",
  "tests/verification/contracts/check-junit-executed-required.mts",
  "tests/verification/contracts/check-pipeline-api-implementation.mts",
  "tests/verification/contracts/check-pipeline-committed-source-snapshot.mts",
  "tests/verification/contracts/check-pipeline-container-build-production.mts",
  "tests/verification/contracts/check-pipeline-kubernetes-fixture-cutover.mts",
  "tests/verification/contracts/check-pipeline-kubernetes-fixture-implementation.mts",
  "tests/verification/contracts/check-pipeline-kubernetes-fixture-live.mts",
  "tests/verification/contracts/check-pipeline-observability-durable-attempts.mts",
  "tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts",
  "tests/verification/contracts/check-pipeline-remote-plan-runtime.mts",
  "tests/verification/contracts/check-pipeline-remote-real-provider.mts",
  "tests/verification/contracts/check-pipeline-remote-runtime-config.mts",
  "tests/verification/contracts/check-pipeline-report-adapter-runtime.mts",
  "tests/verification/contracts/check-pipeline-size-budget-implementation.mts",
  "tests/verification/contracts/check-pipeline-size-budget-parity.mts",
  "tests/verification/contracts/check-pipeline-size-budget-production.mts",
  "tests/verification/contracts/check-pipeline-test-plan-runner.mts",
  "tests/verification/contracts/check-pipeline-test-provider-registry.mts",
  "tests/verification/contracts/check-pipeline-test-suite-resolver.mts",
  "tests/verification/contracts/check-pipeline-unit-parity-ledger.mjs",
  "tests/verification/contracts/check-pipeline-visual-legacy-comparison.mts",
  "tests/verification/contracts/check-pipeline-visual-remote-vertical.mts",
  "tests/verification/contracts/check-plugin-system-v2-boundaries.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase6.mjs",
  "tests/verification/contracts/check-plugin-system-v2-phase7.mjs",
  "tests/verification/contracts/check-project-compiler.mts",
  "tests/verification/contracts/check-runtime-bundle-isolation.mjs",
  "tests/verification/contracts/check-production-receipt-attestation.mjs",
  "tests/verification/contracts/project-legacy-import-cases.mts",
  "tests/verification/reliability/sdk-json-portable.test.mts",
  "tests/verification/reliability/source-identity-version.test.mjs",
  "tests/verification/reliability/effect-identity-version.test.mts",
  "tests/verification/reliability/project-source-fixture.mjs",
  "tests/verification/reliability/adapter-dependency-locale-fixture.mjs",
  "tests/verification/reliability/adapter-dependency-historical.mjs",
  "tests/verification/reliability/repair-identity-historical.mjs",
  "tests/verification/reliability/worker-deadline-fixture.mts",
  "tests/verification/reliability/fixtures/forge-runtime.mts",
  "scripts/tests/docs-cli-typed.test.mjs",
  "tests/verification/deployment/check-deployment-truth.mjs",
  "tests/verification/historical-branch-acceptance/delivery-manifest-stage-boundary.test.mjs",
  "tests/verification/reliability/adapter-dependency-boundary.test.mjs",
  "tests/verification/reliability/admission-retirement.test.mjs",
  "tests/verification/reliability/blob-read-independent.test.mjs",
  "tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs",
  "tests/verification/reliability/discord-delivery-receipt.test.mts",
  "tests/verification/reliability/kubernetes-manifest-budget.test.mjs",
  "tests/verification/reliability/nova-dispatch-projection.test.mjs",
  "tests/verification/reliability/operator-request-projection.test.mjs",
  "tests/verification/reliability/report-evidence.test.mts",
  "tests/verification/reliability/review-cache-legacy-prefix.test.mjs",
  "tests/verification/reliability/review-report-locales.test.mjs",
  "scripts/tests/api-output-publication-native-custody.test.mjs"
]);
const standaloneVerificationPurpose = "Exact Source-owned standalone verification-program, controlled child/fixture, or assertion-result receiving context at the sealed original output occurrence. Fixture/archive/schema/policy/image/key/log/result bytes remain raw UNKNOWN and actual API/SDK/process/native capabilities retain their independent guards. Not payload truth, a non-API/constructor exclusion, runtime safety, selected native execution/success, read-only proof or apply permission.";
const realPipelineReceivingSources = Object.freeze(["tests/verification/e2e/nova-a11y-production-preflight.mts", "tests/verification/e2e/nova-e2e-production-preflight.mts", "tests/verification/e2e/nova-http-production-preflight.mts", "tests/verification/e2e/nova-kubernetes-fixture-production-preflight.mts", "tests/verification/e2e/nova-lighthouse-production-preflight.mts", "tests/verification/e2e/nova-security-production-preflight.mts", "tests/verification/e2e/nova-tailscale-production-preflight.mts", "tests/verification/e2e/nova-visual-production-preflight.mts", "tests/verification/e2e/run-real-pipeline-e2e.mjs", "tests/verification/e2e/run-real-pipeline-failure-matrix.mjs", "tests/verification/e2e/checkpoints.mjs", "tests/verification/e2e/failure-scenarios.mjs", "tests/verification/e2e/real-run-workspace.mjs", "tests/verification/e2e/manifest-lint-production.mts", "tests/verification/e2e/malformed-output-publisher.mjs", "tests/verification/e2e/bounded-output-capture.mjs"]);
const realPipelineReceivingPurpose = "Exact Source-owned real-pipeline/preflight receiving context: scenario workspace/configuration/deployment or deliberate failure input, checkpoint rebase, report/status/usage, or raw child-log capture at the sealed original occurrence. These are genuine runtime-backed inputs/results, not inert prose or observed successful execution. Arbitrary bytes/values remain UNKNOWN; API/SDK/process/network/native capabilities retain independent guards. No payload truth, non-API/constructor exclusion, universal filesystem/log-bound/durability safety or invocation/apply grant.";
const declarationAndServerReceivingSources = Object.freeze(["skills/nova/plugins/review/scripts/generate-bundle-schema.mjs", "skills/prism/server/bootstrap-database.ts", "skills/prism/server/ingestion.ts"]);
const declarationAndServerReceivingPurposes = Object.freeze({
  "skills/nova/plugins/review/scripts/generate-bundle-schema.mjs:40": "Selected portable review-bundle/review-report schema declaration JSON serialized to the fixed additional schema outputs, or compared byte-for-byte under --check. Not arbitrary schema truth, runtime validation, non-API payload proof or successful generation.",
  "skills/prism/server/bootstrap-database.ts:15": "Original PostgreSQL bootstrap retry diagnostic on stderr. Error/code text remains UNKNOWN; actual database bootstrap, credentials and SQL effects retain independent guards and are not observed or authorized by this purpose.",
  "skills/prism/server/ingestion.ts:20": "Original Prism quarantine cleanup failure diagnostic arguments. Error data remains UNKNOWN; no cleanup success or general non-API claim.",
  "skills/prism/server/ingestion.ts:77": "Actual acquired raw BYTES stored under their SHA256 quarantine name with exclusive creation, and separately returned by the ingestion response. Not YAML normalization, payload truth, hostile-filesystem safety, arbitrary content non-API proof or API execution permission."
});
const descriptor = role => Object.fromEntries(['line', 'sink', 'expression', 'sinkContract', 'role'].map(key => [key, role[key] ?? null]));
const purposes = Object.freeze({

  "scripts/lib/docs-retained-configuration-formatters.mjs:11": "Exact Source/caller-bound documentary environment-purpose prose formatter. Supplied meaning/owner/boundary text remains raw documentary text; no independent truth, HTML safety, runtime configuration or API classification grant.",
  "scripts/lib/docs-retained-source.mjs:145": "Exact retained-language bundle JSON-plus-newline serializer at sealed construction callers. Arbitrary nested data remains UNKNOWN; not universal canonicalization, safe arbitrary getters/toJSON, current discovery or API admission.",
  "scripts/lib/docs-retained-source.mjs:166": "Exact staged600 retained-language bundle write from the sealed projection caller; physical root/canonical parent/regular target and strictly outside-checkout target checks retained. Genuinely writes outside checkout; no permission to invoke it, general external-write authority, durability or hostile-filesystem guarantee.",
  "scripts/lib/docs-retained-source.mjs:199": "Exact staged644 selected Markdown page write from sealed docs-generate retained branch after complete two/three-page destination validation. Writer alone has no path guard; a new caller or changed target branch fails this Source/caller seal. Not arbitrary path permission, read-only proof or durable transaction.",

  "scripts/generate-plugin-dependency-aggregate.mjs:21": "Exact native aggregate write/check occurrence: fresh extension discovery and ownership assertions precede the strict declaration report; raw native manifests and bounded schema-reference documents are serialized only to fixed docs/blueprint/generated/plugin-dependency-aggregate.json, or compared read-only to that same file. Nested schema/examples remain arbitrary raw data, not globally non-API or observed provider DATA. No API submission, schema-semantic validation, runtime role, credential or operational-owner grant.",
  'scripts/lint-baseline-update.mjs:74': 'selected local lint-baseline configuration rewrite after report/baseline digest, findings and approval-argument checks; not API submission',
  'scripts/lint-baseline-update.mjs:75': 'raw tool name and approved-fingerprint count status following the local lint-baseline write; unbounded text remains UNKNOWN',
  'scripts/observability-retirement-plan.mjs:138': 'fixed observability-retirement-plan envelope with retain-all blockers; nested inventory data, not a release/delete operation',
  'scripts/updates/check-upstream-refresh.mjs:20': 'typed versions.json input in an exclusively created temporary Git regression fixture; no permission to run the later network regression',
  'scripts/updates/deployment-release.mjs:178': 'full validated40hex selected code/image commit scalar after selected-release checks; not observed materialization or Helm success',
  'scripts/recover-openclaw-audit-input.mjs:70': 'exact sanitized JSONL archive bytes to exclusive recovery temporary descriptor then identity/hash-guarded rename to fixed audit raw archive; not API submission or successful doctor import/checkpoint',
  'scripts/updates/materialize-release.mjs:50': 'selected runtime/ops Helm-values projection to five finite releases/values role files; source-preserving write branch, not check success, rendered Kubernetes resources or deployment',
  'scripts/updates/refresh-versions.mjs:140': 'raw upstream verification progress before validation with arbitrary version text including LF; not API classification or permission to run upstream requests',
  'scripts/updates/refresh-versions.mjs:151': 'source-preserving versions.json staging BEFORE downstream versionOutputs and lock validation; not a fully validated update or mixed-member API output grant',
  'scripts/updates/refresh-versions.mjs:155': 'catch-path exact original versions.json bytes restored to the same file then original error rethrown; not atomic rollback of generated files, locks or network effects',
  'scripts/updates/release-images.mjs:29': 'fixed schemaVersion/commit/images/sourceRunId/sourceRunAttempt receipt file constructor for the two finite CLI families; not authenticated build identity',
  'scripts/render-stateful-network-policies.mjs:68': 'original API-capable YAML stream forwarded by deploy.sh to kubectl apply; the separate mandatory discoverTransformedApiOutputs path executes the original locked-chart renderer and retains every resource document. Not a non-API classification, arbitrary-profile closure or live apply claim',
});

// Whole Source/caller/receiver and canonical descriptors are checked afresh
// BEFORE the receiving inventories' caches and ordinary mutable role fallback.
// No product module is imported, invoked or fabricated by this qualification.
export function checkedTopLevelScriptPurposes(root, graph, classify, sources, nativePackageEntries) {
  if (!sources.some(source => selectedSources.includes(source))) return null;
  const fail = detail => assert.fail(`API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical checkout root');
  const read = relative => {
    const file = path.join(root, relative);
    if (!fs.existsSync(file) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail(`physical Source input ${relative}`);
    return fs.readFileSync(file);
  };
  const bytes = read(authorityPath);
  if (hash(bytes) !== authoritySha256) fail('immutable Source-purpose authority');
  const authority = JSON.parse(bytes);
  if (JSON.stringify(Object.keys(authority.sourcePins)) !== JSON.stringify(selectedSources)) fail('source roster');
  if (!selectedSources.every(source => sources.includes(source))) fail('missing selected source from native census');
  const approvedCurrentPaths = ["docs/site/extend/lint.md", "scripts/plugin-registration-dependencies.mjs", "scripts/docs-publication.mjs"];
  const bindings = currentPurposeInputBindings20261031;
  if (JSON.stringify(bindings.map(binding => binding?.path)) !== JSON.stringify(approvedCurrentPaths)) fail('current binding exact ordered roster');
  for (const binding of bindings) {
    if (!binding || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(['historicalSha256','path','sha256'])
      || !/^[a-f0-9]{64}$/u.test(binding.sha256) || !/^[a-f0-9]{64}$/u.test(binding.historicalSha256)) fail('current binding shape');
    const historical = authority.inputs.filter(input => input.path === binding.path);
    if (historical.length !== 1 || historical[0].sha256 !== binding.historicalSha256) fail('current binding historical identity');
  }
  const currentPurposeInputBindingDigest = hash(JSON.stringify(bindings));
  const facts = [];
  for (const input of authority.inputs) {
    const content = read(input.path);
    const binding = bindings.find(binding => binding.path === input.path);
    const expected = binding ? binding.sha256 : input.sha256;
    if (hash(content) !== expected) fail(`changed Source/caller/receiver/input ${input.path}`);
    facts.push({...input, sha256: expected});
  }
  for (const source of selectedSources) if (hash(read(source)) !== authority.sourcePins[source]) fail(`producer Source ${source}`);
  for (const relative of authority.absentPackageBoundaries) {
    try { fs.lstatSync(path.join(root, relative)); fail(`new package boundary ${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!graph || JSON.stringify(graph.edges.filter(edge => selectedSources.includes(edge.target))) !== JSON.stringify(authority.incomingEdges)
    || JSON.stringify(graph.publicEntries.filter(entry => selectedSources.includes(entry.canonicalSource))) !== JSON.stringify(authority.publicEntries)) fail('changed caller or aliased public entry');
  // These four raw UNKNOWN occurrences have a documentary purpose only under
  // this exact caller context. The unselected editorial projection stays
  // unselected: no docsReachable seed, module exclusion or execution grant.
  const editorial = authority.retainedEditorialContext;
  const retainedSources = ['scripts/lib/docs-retained-configuration-formatters.mjs', 'scripts/lib/docs-retained-source.mjs'];
  if (!editorial || JSON.stringify(editorial.sources) !== JSON.stringify(retainedSources)) fail('retained editorial source roster');
  const ancestors = new Set(retainedSources);
  let changed = true;
  while (changed) { const count = ancestors.size; for (const edge of graph.edges) if (ancestors.has(edge.target)) ancestors.add(edge.source); changed = ancestors.size !== count; }
  if (!Array.isArray(nativePackageEntries)) fail('native package entry acquisition required');
  const context = {
    sources: retainedSources, ancestors: [...ancestors].sort(),
    incomingEdges: graph.edges.filter(edge => ancestors.has(edge.target)),
    packageEntries: nativePackageEntries.filter(entry => ancestors.has(entry.source)),
    publicEntries: graph.publicEntries.filter(entry => ancestors.has(entry.canonicalSource) || ancestors.has(entry.source)),
    aliases: graph.aliases,
    unresolvedModuleOperations: graph.dynamicOperations.map(({source, expression, operation, hints}) => ({source, expression, operationSha256: hash(operation), hints})),
  };
  if (JSON.stringify(context) !== JSON.stringify(editorial)) fail('retained editorial caller/public/alias/dynamic context');
  // One sealed standalone assertion-family Source review; NOT a test-directory,
  // assert-import, filename or arbitrary runtime payload classifier.
  const standalone = authority.standaloneVerificationContext;
  if (!standalone || JSON.stringify(standalone.sources) !== JSON.stringify(standaloneVerificationSources)) fail('standalone assertion source roster');
  const standaloneContextSources = standalone.contextSources;
  if (!Array.isArray(standaloneContextSources) || standaloneContextSources.length !== 85
    || !standaloneContextSources.every(source => authority.inputs.some(input => input.path === source))) fail('standalone assertion complete sealed caller inputs');
  const rootPackage = JSON.parse(read('package.json'));
  if (nativePackageEntries.filter(entry => standaloneContextSources.includes(entry.source))
    .some(entry => rootPackage.scripts?.[entry.name] !== entry.command)) fail('standalone assertion actual maintained command');
  const standaloneActual = {
    sources: standaloneVerificationSources, contextSources: standaloneContextSources,
    incomingEdges: graph.edges.filter(edge => standaloneContextSources.includes(edge.target)),
    outgoingEdges: graph.edges.filter(edge => standaloneContextSources.includes(edge.source)),
    packageEntries: nativePackageEntries.filter(entry => standaloneContextSources.includes(entry.source)),
    publicEntries: graph.publicEntries.filter(entry => standaloneContextSources.includes(entry.canonicalSource) || standaloneContextSources.includes(entry.source)),
    aliases: graph.aliases,
    packageTargets: Object.fromEntries(['bin','main','exports'].map(key => [key,rootPackage[key] ?? null])),
    unresolvedModuleOperations: graph.dynamicOperations.filter(operation => standaloneContextSources.includes(operation.source))
      .map(operation => Object.fromEntries(['source','expression','operation','hints'].map(key => [key,operation[key] ?? null]))),
    slots: standalone.slots,
  };
  if (JSON.stringify(standaloneActual) !== JSON.stringify(standalone)) fail('standalone assertion native/caller/public/dynamic context');
  const documentary = authority.documentaryFormatterContext;
  if (!documentary || JSON.stringify(documentary.sources) !== JSON.stringify(documentaryFormatterSources)
    || !Array.isArray(documentary.contextSources) || documentary.contextSources.length !== 9
    || !documentary.contextSources.every(source => authority.inputs.some(input => input.path === source))) fail('documentary complete Source/caller roster');
  const documentarySources = documentary.contextSources;
  if (nativePackageEntries.filter(entry => documentarySources.includes(entry.source))
    .some(entry => rootPackage.scripts?.[entry.name] !== entry.command)) fail('documentary native package command');
  const documentaryActual = {
    sources: documentaryFormatterSources, contextSources: documentarySources,
    incomingEdges: graph.edges.filter(edge => documentarySources.includes(edge.target)),
    outgoingEdges: graph.edges.filter(edge => documentarySources.includes(edge.source)),
    packageEntries: nativePackageEntries.filter(entry => documentarySources.includes(entry.source)),
    publicEntries: graph.publicEntries.filter(entry => documentarySources.includes(entry.canonicalSource) || documentarySources.includes(entry.source)),
    aliases: graph.aliases,
    packageTargets: Object.fromEntries(['bin','main','exports'].map(key => [key,rootPackage[key] ?? null])),
    unresolvedModuleOperations: graph.dynamicOperations.filter(operation => documentarySources.includes(operation.source))
      .map(operation => Object.fromEntries(['source','expression','operation','hints'].map(key => [key,operation[key] ?? null]))),
  };
  if (JSON.stringify(documentaryActual) !== JSON.stringify(documentary)) fail('documentary native/caller/public/dynamic context');
  const pipeline = authority.realPipelineReceivingContext;
  if (!pipeline || JSON.stringify(pipeline.sources) !== JSON.stringify(realPipelineReceivingSources)
    || !Array.isArray(pipeline.contextSources) || pipeline.contextSources.length !== 23
    || !pipeline.contextSources.every(source => authority.inputs.some(input => input.path === source))) fail('real pipeline sealed Source context');
  const pipelineSources = pipeline.contextSources;
  if (nativePackageEntries.filter(entry => pipelineSources.includes(entry.source))
    .some(entry => rootPackage.scripts?.[entry.name] !== entry.command)) fail('real pipeline actual maintained command');
  const pipelineActual = {
    sources: realPipelineReceivingSources, contextSources: pipelineSources,
    incomingEdges: graph.edges.filter(edge => pipelineSources.includes(edge.target)),
    outgoingEdges: graph.edges.filter(edge => pipelineSources.includes(edge.source)),
    packageEntries: nativePackageEntries.filter(entry => pipelineSources.includes(entry.source)),
    publicEntries: graph.publicEntries.filter(entry => pipelineSources.includes(entry.canonicalSource) || pipelineSources.includes(entry.source)),
    aliases: graph.aliases,
    packageTargets: Object.fromEntries(['bin','main','exports'].map(key => [key,rootPackage[key] ?? null])),
    unresolvedModuleOperations: graph.dynamicOperations.filter(operation => pipelineSources.includes(operation.source))
      .map(operation => Object.fromEntries(['source','expression','operation','hints'].map(key => [key,operation[key] ?? null]))),
    slots: pipeline.slots,
  };
  if (JSON.stringify(pipelineActual) !== JSON.stringify(pipeline)) fail('real pipeline native/caller/public/dynamic context');
  const receiving = authority.declarationAndServerReceivingContext;
  if (!receiving || JSON.stringify(receiving.sources) !== JSON.stringify(declarationAndServerReceivingSources)
    || !Array.isArray(receiving.contextSources) || receiving.contextSources.length !== 3
    || !receiving.contextSources.every(source => authority.inputs.some(input => input.path === source))) fail('declaration/server sealed Source context');
  const receivingSources = receiving.contextSources;
  if (nativePackageEntries.filter(entry => receivingSources.includes(entry.source))
    .some(entry => rootPackage.scripts?.[entry.name] !== entry.command)) fail('declaration/server actual maintained command');
  const receivingActual = {
    sources: declarationAndServerReceivingSources, contextSources: receivingSources,
    incomingEdges: graph.edges.filter(edge => receivingSources.includes(edge.target)),
    outgoingEdges: graph.edges.filter(edge => receivingSources.includes(edge.source)),
    packageEntries: nativePackageEntries.filter(entry => receivingSources.includes(entry.source)),
    publicEntries: graph.publicEntries.filter(entry => receivingSources.includes(entry.canonicalSource) || receivingSources.includes(entry.source)),
    aliases: graph.aliases,
    packageTargets: Object.fromEntries(['bin','main','exports'].map(key => [key,rootPackage[key] ?? null])),
    unresolvedModuleOperations: graph.dynamicOperations.filter(operation => receivingSources.includes(operation.source))
      .map(operation => Object.fromEntries(['source','expression','operation','hints'].map(key => [key,operation[key] ?? null]))),
    workspacePackages: receiving.workspacePackages.map(({path: packagePath}) => {
      if (!authority.inputs.some(input => input.path === packagePath)) fail('unsealed workspace declaration');
      const declarations = JSON.parse(read(packagePath));
      return {path: packagePath, declarations: Object.fromEntries(['scripts','bin','main','exports'].map(key => [key,declarations[key] ?? null]))};
    }),
  };
  if (JSON.stringify(receivingActual) !== JSON.stringify(receiving)) fail('declaration/server caller/native/public/workspace/dynamic context');
  const actual = selectedSources.flatMap(source => classify(source).map(role => ({source, ...descriptor(role)})));
  if (JSON.stringify(actual) !== JSON.stringify(authority.descriptors)) fail('canonical native slot/role roster; registry relabel or missing/new slot');
  const receipt = Object.freeze({
    witnessDigest: authoritySha256, inputDigest: hash(JSON.stringify(facts)), currentPurposeInputBindingDigest,
    dependencies: Object.freeze([authorityPath, ...facts.map(input => input.path)]),
    descriptors: Object.freeze(authority.descriptors.map(Object.freeze)),
    standaloneVerificationSlots: Object.freeze(standalone.slots.map(slot => Object.freeze({...slot}))),
    realPipelineReceivingSlots: Object.freeze(pipeline.slots.map(slot => Object.freeze({...slot}))),
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
  });
  receipts.add(receipt);
  return receipt;
}

export function selectedTopLevelScriptPurpose(source, role, receipt) {
  if (!selectedSources.includes(source)) return null;
  if (standaloneVerificationSources.includes(source) && role.role !== 'unknown') return null;
  if (declarationAndServerReceivingSources.includes(source) && role.role !== 'unknown') return null;
  assert(receipt && receipts.has(receipt), 'API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: unacquired receipt');
  const expected = receipt.descriptors.find(item => item.source === source
    && JSON.stringify(descriptor(item)) === JSON.stringify(descriptor(role)));
  assert(expected && JSON.stringify(descriptor(expected)) === JSON.stringify(descriptor(role)),
    'API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: changed canonical slot or role');
  const documentaryPurpose = documentaryFormatterSources.includes(source) && role.role === 'unknown'
    ? source === 'scripts/docs-publication-sdk-examples.mjs' ? documentaryFormatterPurposes.sdk
      : source === 'scripts/docs-schema-fields.mjs' ? documentaryFormatterPurposes.schema
      : source === 'scripts/lib/docs-event-reference.mjs' ? documentaryFormatterPurposes.event
      : documentaryFormatterPurposes.diagnostic : null;
  const pipelinePurpose = realPipelineReceivingSources.includes(source) && role.role === 'unknown'
    && receipt.realPipelineReceivingSlots.some(slot => slot.source === source && slot.line === role.line && slot.sink === role.sink)
      ? realPipelineReceivingPurpose : null;
  const receivingPurpose = declarationAndServerReceivingSources.includes(source)
    ? declarationAndServerReceivingPurposes[`${source}:${role.line}`] : null;
  const purpose = receivingPurpose ?? pipelinePurpose ?? documentaryPurpose ?? (standaloneVerificationSources.includes(source)
    ? receipt.standaloneVerificationSlots.some(slot => slot.source === source && slot.line === role.line && slot.sink === role.sink)
      ? standaloneVerificationPurpose : null
    : purposes[`${source}:${role.line}`]);
  if (!purpose) return null; // Raw/API/mixed streams still need their own finite adapters.
  return Object.freeze({purpose, canonicalRawRole: role.role, witnessDigest: receipt.witnessDigest, inputDigest: receipt.inputDigest,
    currentPurposeInputBindingDigest: receipt.currentPurposeInputBindingDigest,
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
    limit: 'Source-owned output purpose only; runtime inputs/results unobserved; arbitrary embedded tool/status bytes are not globally non-API.'});
}

// Builtin NodeTest receiving-context purpose only; never payload truth or an
// execution/safety grant. Existing exact Source profiles remain independent.
//
// Genuine builtin verification receiving context, not payload truth or safe
// filesystem ownership. Closed lexical callers and exact write-node receipts
// never grant API execution or exemption to other output/capability sinks.
const nodeFixtureReceipts = new WeakMap();
export function checkedNodeTestFixturePurpose(root, source, bytes, roles, graph, nativePackageEntries) {
  if (!bytes.includes('node:test')) return null;
  // Acquisition failure is absence of THIS purpose, not acceptance/fallback.
  // The unchanged raw UNKNOWN assertion still fails any unsupported occurrence.
  const physical = relative => {
    if (!relative || path.isAbsolute(relative) || relative !== path.posix.normalize(relative)
      || relative.split('/').some(part => !part || part === '..' || part === '.')) return null;
    const file = path.join(root, relative);
    return fs.existsSync(file) && fs.realpathSync(file) === file && fs.lstatSync(file).isFile()
      ? fs.readFileSync(file, 'utf8') : null;
  };
  if (fs.realpathSync(root) !== root || physical(source) !== bytes) return null;
  if(!graph)return null;
  const ancestry=new Set([source]);
  for(let changed=true;changed;){changed=false;for(const edge of graph.edges)
    if(ancestry.has(edge.target)&&!ancestry.has(edge.source)){ancestry.add(edge.source);changed=true;}}
  const pkg=JSON.parse(physical('package.json')??'null');
  if(!pkg||!Array.isArray(nativePackageEntries))return null;
  const seeds=new Set();
  for(const ancestor of ancestry){
    if(physical(ancestor)===null||graph.aliases.some(alias=>JSON.stringify(alias).includes(ancestor))
      ||graph.publicEntries.some(entry=>entry.canonicalSource===ancestor&&entry.path!==ancestor)
      ||[pkg.bin,pkg.main,pkg.exports].some(value=>value&&JSON.stringify(value).includes(ancestor)))return null;
    const entries=nativePackageEntries.filter(entry=>entry.source===ancestor);
    for(const entry of entries){
      if(pkg.scripts?.[entry.name]!==entry.command)return null;
      const targeting=shellNativeNodeEntries(`package.json#${entry.name}`,entry.command)
        .filter(invocation=>invocation.start===entry.nativeCommandStart&&invocation.end===entry.nativeCommandEnd);
      if(!entry.nativeTest||targeting.length!==1||targeting.some(invocation=>!invocation.nativeTest
        ||invocation.words[0]?.value!=='node'||invocation.words.some(word=>word.expanded)))return null;
      seeds.add(ancestor);
    }
    // A new unselected/public product frontier must not inherit a test seed
    // merely because another ancestry branch is a real NodeTest importer.
    if(!entries.length&&!graph.edges.some(edge=>edge.target===ancestor))return null;
  }
  if(!seeds.size)return null;
  const reached=new Set(seeds);
  for(let changed=true;changed;){changed=false;for(const edge of graph.edges)
    if(ancestry.has(edge.source)&&ancestry.has(edge.target)&&reached.has(edge.source)&&!reached.has(edge.target)){
      reached.add(edge.target);changed=true;
    }}
  if([...ancestry].some(ancestor=>!reached.has(ancestor)))return null;

  const tree = ts.createSourceFile(source, bytes, ts.ScriptTarget.Latest, true, /\.[cm]?ts$/u.test(source)?ts.ScriptKind.TS:ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length) return null;
  // Use the maintained TS lexical binder, not identifier-text equivalence or a
  // new interpreter/dataflow evaluator. No imported module is loaded/evaluated.
  const options = {allowJs: true, noLib: true, noResolve: true, target: ts.ScriptTarget.Latest};
  const program = ts.createProgram([source], options, {
    getSourceFile: name => name === source ? tree : undefined,
    getDefaultLibFileName: () => '', writeFile() {}, getCurrentDirectory: () => root,
    getDirectories: () => [], fileExists: name => name === source,
    readFile: name => name === source ? bytes : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  });
  const checker = program.getTypeChecker();
  const identifier = node => !!node && ts.isIdentifier(node);
  const nodes = [];
  const visit = node => { nodes.push(node); ts.forEachChild(node, visit); };
  visit(tree);
  const sym = node => identifier(node) && ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
  const same = (node, declaration) => !!node && !!declaration && identifier(node)
    && !!sym(declaration) && sym(node) === sym(declaration);
  const refs = declaration => nodes.filter(node => identifier(node) && node !== declaration
    && same(node, declaration) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node));
  const enclosingFunction = node => {
    for (let parent = node.parent; parent; parent = parent.parent) if (ts.isFunctionLike(parent)) return parent;
    return null;
  };
  const isConst = declaration => !!declaration && ts.isVariableDeclaration(declaration)
    && ts.isVariableDeclarationList(declaration.parent)
    && !!(declaration.parent.flags & ts.NodeFlags.Const);
  // Native import identity, not identifier spelling, filename or payload shape.
  const origins=new Map();
  for(const statement of tree.statements){
    if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||statement.importClause?.isTypeOnly)continue;
    const specifier=statement.moduleSpecifier.text;
    const module=specifier==='node:test'?'test-module'
      :['node:fs','fs'].includes(specifier)?'fs'
      :['node:fs/promises','fs/promises'].includes(specifier)?'fs.promises':null;
    if(!module)continue;
    if(statement.importClause?.name)origins.set(sym(statement.importClause.name),module==='test-module'?'test':module);
    const bindings=statement.importClause?.namedBindings;
    if(bindings&&ts.isNamespaceImport(bindings))origins.set(sym(bindings.name),module);
    for(const element of bindings&&ts.isNamedImports(bindings)?bindings.elements:[]){
      if(element.isTypeOnly)continue;
      const name=(element.propertyName??element.name).text;
      origins.set(sym(element.name),module==='test-module'?name:module+'.'+name);
    }
  }
  const native=(node,seen=new Set())=>{
    if(!node||seen.has(node))return null;seen=new Set([...seen,node]);
    if(ts.isParenthesizedExpression(node))return native(node.expression,seen);
    if(identifier(node)){
      if(origins.has(sym(node)))return origins.get(sym(node));
      const declaration=sym(node)?.declarations?.find(ts.isVariableDeclaration);
      return isConst(declaration)&&identifier(declaration.name)?native(declaration.initializer,seen):null;
    }
    if(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)){
      const base=native(node.expression,seen),key=ts.isPropertyAccessExpression(node)?node.name.text
        :ts.isStringLiteral(node.argumentExpression)?node.argumentExpression.text:null;
      if(!base||key===null)return null;
      return base==='test-module'?key:base+'.'+key;
    }
    return null;
  };
  const hooks=new Set(['after']);
  const receivingKind=origin=>origin==='test'?'test':null;
  const writers=new Set(['fs.writeFileSync','fs.appendFileSync','fs.promises.writeFile']);
  const isWriter=node=>ts.isCallExpression(node)&&writers.has(native(node.expression))
    && !node.arguments.some(ts.isSpreadElement)
    && [2,3].includes(node.arguments.length);
  // Native namespace escapes/mutations cannot turn a same-spelled method into
  // a verified builtin. Unrelated readonly fs constants are not writer aliases.
  for(const node of nodes){
    const assignment=ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment
      &&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment?node.left
      :ts.isDeleteExpression(node)?node.expression
      :(ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node))
        &&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)?node.operand:null;
    if(assignment){
      const origin=native(assignment);
      if(origin&&(writers.has(origin)||receivingKind(origin)||['fs','fs.promises','test-module','test'].includes(origin)))return null;
      if(ts.isElementAccessExpression(assignment)&&!ts.isStringLiteral(assignment.argumentExpression)
        &&['fs','fs.promises','test-module','test'].includes(native(assignment.expression)))return null;
    }
    if(!identifier(node)||ts.isImportClause(node.parent)||ts.isImportSpecifier(node.parent)||ts.isNamespaceImport(node.parent))continue;
    const origin=native(node);
    if(!['fs','fs.promises','test-module','test'].includes(origin)&&!receivingKind(origin))continue;
    if((ts.isPropertyAccessExpression(node.parent)||ts.isElementAccessExpression(node.parent))&&node.parent.expression===node)continue;
    if(ts.isVariableDeclaration(node.parent)&&node.parent.name===node)continue;
    if(ts.isVariableDeclaration(node.parent)&&node.parent.initializer===node&&isConst(node.parent))continue;
    if(receivingKind(origin)&&ts.isCallExpression(node.parent)&&node.parent.expression===node)continue;
    return null;
  }
  const helperBinding=fn=>ts.isFunctionDeclaration(fn)?fn.name
    :ts.isVariableDeclaration(fn.parent)&&fn.parent.initializer===fn&&isConst(fn.parent)
      &&identifier(fn.parent.name)?fn.parent.name:null;
  const helpers=nodes.filter(node=>{
    if(ts.isFunctionDeclaration(node))return !!node.name&&!!node.body
      &&!node.modifiers?.some(modifier=>modifier.kind!==ts.SyntaxKind.AsyncKeyword);
    if(!(ts.isArrowFunction(node)||ts.isFunctionExpression(node)&&!node.name)||!helperBinding(node))return false;
    const statement=node.parent.parent.parent;
    return ts.isVariableStatement(statement)&&!statement.modifiers?.length;
  });
  const actualAwait=reference=>{
    let selected=reference.parent;
    while(ts.isParenthesizedExpression(selected.parent))selected=selected.parent;
    return ts.isAwaitExpression(selected.parent);
  };
  const directHelperUse=(reference,fn)=>ts.isCallExpression(reference.parent)&&reference.parent.expression===reference
    &&(!fn.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.AsyncKeyword)||actualAwait(reference));
  const closed=new Set(),callbacks=new Map(),registrations=new Map();
  const callbackLiteral=node=>(ts.isArrowFunction(node)||ts.isFunctionExpression(node))
    && (!node.name||!refs(node.name).length);
  const contextMethod=call=>{
    if(!ts.isPropertyAccessExpression(call.expression))return null;
    const owner=enclosingFunction(call),mode=callbacks.get(owner),parameter=owner?.parameters[0]?.name;
    // SuiteContext is NOT TestContext; do not manufacture .test/.after on it.
    if(mode!=='test'||!identifier(parameter)||!same(call.expression.expression,parameter))return null;
    const name=call.expression.name.text;
    return name==='test'?'test':hooks.has(name)?'hook':null;
  };
  const registration=call=>{
    const kind=receivingKind(native(call.expression))??contextMethod(call);
    if(!kind||call.arguments.some(ts.isSpreadElement))return null;
    const args=call.arguments;
    const index=kind==='hook'?0:args.length-1;
    if(kind==='hook'?![1,2].includes(args.length):![1,2,3].includes(args.length))return null;
    const callback=args[index];
    // Dynamic native names do not establish payload truth. Retain the existing
    // finite literal-options boundary; no new options evaluator is introduced.
    if(kind!=='hook'&&args.length===3&&(!ts.isObjectLiteralExpression(args[1])||args[1].properties.some(property=>
      !ts.isPropertyAssignment(property)||!(ts.isIdentifier(property.name)||ts.isStringLiteral(property.name))
      ||!(ts.isStringLiteral(property.initializer)||ts.isNumericLiteral(property.initializer)
        ||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(property.initializer.kind)))))return null;
    if(callbackLiteral(callback))return {callback,kind};
    if(identifier(callback)){
      const helper=helpers.find(fn=>same(callback,helperBinding(fn)));
      if(helper)return {callback:helper,kind,namedReference:callback};
    }
    return null;
  };
  // One monotone lexical-context closure: loop/conditional placement is not a
  // new entrypoint; registration inside an unclosed product function is not a seed.
  for(let changed=true;changed;){
    changed=false;
    for(const call of nodes.filter(ts.isCallExpression)){
      const owner=enclosingFunction(call);
      if(owner&&!closed.has(owner))continue;
      const selected=registration(call);if(!selected)continue;
      registrations.set(call,selected);
      if(selected.namedReference)continue;
      if(!closed.has(selected.callback)){closed.add(selected.callback);changed=true;}
      if(!callbacks.has(selected.callback)){callbacks.set(selected.callback,selected.kind);changed=true;}
    }
    for(const fn of helpers){
      if(closed.has(fn))continue;
      const references=refs(helperBinding(fn));if(!references.length)continue;
      const nativeUses=references.filter(reference=>{
        const call=reference.parent;return ts.isCallExpression(call)&&registrations.get(call)?.namedReference===reference;
      });
      if(!references.every(reference=>nativeUses.includes(reference)
        ||directHelperUse(reference,fn)&&closed.has(enclosingFunction(reference))))continue;
      closed.add(fn);changed=true;
      // Context parameters are proven native only when ALL uses are genuine
      // native registrations, not manual calls supplying an invented context.
      if(nativeUses.length===references.length){
        const kinds=new Set(nativeUses.map(reference=>registrations.get(reference.parent).kind));
        callbacks.set(fn,kinds.size===1?[...kinds][0]:'mixed');
      }
    }
  }
  if(!callbacks.size)return null;
  // A real context method must not be rebound, directly or through a computed key.
  for(const [fn]of callbacks){
    const parameter=fn.parameters[0]?.name;if(!identifier(parameter))continue;
    for(const node of nodes){
      const target=ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment
        &&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment?node.left:ts.isDeleteExpression(node)?node.expression
      :(ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node))
        &&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)?node.operand:null;
      if(target&&(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))&&same(target.expression,parameter))return null;
    }
  }
  const occurrences = [];
  for (const write of nodes.filter(node=>isWriter(node)&&closed.has(enclosingFunction(node)))) {
    const line = tree.getLineAndCharacterOfPosition(write.getStart(tree)).line + 1;
    if (nodes.filter(node=>isWriter(node)
      && tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1===line).length!==1) continue;
    const occurrenceRoles = roles.filter(role=>role.line===line&&role.sink==='fs.writeFileSync');
    if (!occurrenceRoles.length) continue;
    const literal = node => ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isNumericLiteral(node)
      || [ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind)
      || ts.isArrayLiteralExpression(node)&&node.elements.every(literal)
      || ts.isObjectLiteralExpression(node)&&node.properties.every(property=>ts.isPropertyAssignment(property)
        && (identifier(property.name)||ts.isStringLiteral(property.name))&&literal(property.initializer));
    const payload=write.arguments[1];
    const json=ts.isCallExpression(payload)&&payload.arguments.length===1&&ts.isPropertyAccessExpression(payload.expression)
      && payload.expression.name.text==='stringify'&&identifier(payload.expression.expression)
      && payload.expression.expression.text==='JSON'&&!sym(payload.expression.expression)
      && !nodes.some(node=>identifier(node)&&node.text==='JSON'&&node!==payload.expression.expression);
    occurrences.push({roles:new Map(occurrenceRoles.map(role=>[role,JSON.stringify(role)])),start:write.getStart(tree),end:write.end,
      payloadStart:payload.getStart(tree),payloadEnd:payload.end,closedLiteral:literal(payload)||json&&literal(payload.arguments[0])});
  }
  if (!occurrences.length) return null;
  const receipt=Object.freeze({purpose:'native-node-test-verification-file-write-context',targetOwnershipOrContainmentProven:false,runtimeApiGrant:false,applyGrant:false,rawRoleMutation:false});
  nodeFixtureReceipts.set(receipt,{source,bytes,occurrences});return receipt;
}

export function selectedNodeTestFixturePurpose(source,role,receipt,apiExclusion=false) {
  const proof=nodeFixtureReceipts.get(receipt);
  return !!proof&&proof.source===source&&proof.occurrences.some(occurrence=>occurrence.roles.has(role)
    && occurrence.roles.get(role)===JSON.stringify(role)&&(!apiExclusion||occurrence.closedLiteral));
}
export function selectedNodeTestFixtureNodePurpose(source,tree,node,receipt) {
  const proof=nodeFixtureReceipts.get(receipt);
  return !!proof&&proof.source===source&&tree.text===proof.bytes&&node.getSourceFile?.()===tree
    && proof.occurrences.some(occurrence=>occurrence.closedLiteral&&(node.getStart(tree)===occurrence.start&&node.end===occurrence.end
      || node.getStart(tree)>=occurrence.payloadStart&&node.end<=occurrence.payloadEnd));
}
