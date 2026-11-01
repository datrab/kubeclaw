import {checkedOriginalProbe39Output, selectedOriginalProbe39Output} from './docs-api-probe39-original-output.mjs';
import {checkedVersionsMapOutputs,selectedVersionsMapOutput} from './docs-api-versions-map-output.mjs';
import {checkedTopLevelScriptPurposes,selectedTopLevelScriptPurpose} from './docs-api-top-level-script-purpose.mjs';
import {assertDocumentationOwnerPurpose,assertDocumentationOwnerAncestry,documentationOwnerNativeEntryMatches,reviewedDocumentationOwnerPurposes,assertReaderArtifactExternalCiPurpose,addReaderArtifactExternalCiSeed,assertPublicationExampleChildPurpose,addPublicationExampleChildSeed} from './docs-documentation-owner-purpose-custody.mjs';
import {minimalPluginFixtureOutputCustody, minimalPluginFixtureOutputRole} from './docs-minimal-plugin-fixture-output-custody.mjs';
import {deploymentScalarOccurrenceCustody, selectedDeploymentScalarOccurrences} from './docs-deployment-scalar-occurrence-custody.mjs';
import {deploymentConfigOutputCustody, deploymentConfigOutputRole} from './docs-deployment-config-output-custody.mjs';
import {runtimeBundleCopyCustody, runtimeBundleCopyRole} from './docs-runtime-bundle-copy-custody.mjs';
import {deploymentNodeOutputOccurrences} from './docs-api-deployment-node-occurrences.mjs';
import {observerMaterializedSourceState, canonicalObserverDocumentationSource, resolveObserverDocumentationImport} from './docs-api-observer-materialized-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import ts from 'typescript';
import { shellHeredocCustody, shellCommandAcquisitions, shellNativeNodeEntries } from './docs-shell-source-custody.mjs';
import { documentationExecutableRoleRecipes, assertDocumentationExecutableRole, qualifiedRootNodeHarnessSources, expandReviewedNodePackageGlob, reviewedRootSelectedCompilerCapability, rootSelectedCompilerTarget, reviewedCliNativeCompilerCapability, cliNativeCompilerTarget, assertCliNativeCompilerGraphPurpose, reviewedCliTypedFixtureCapability, cliTypedFixtureCompilerTarget, assertCliTypedFixtureGraphPurpose, cliTypedFixtureAnalysisSeed, reviewedPublicationParserCapability, verifyPublicationParserProvenance, assertPublicationParserGraphPurpose, reviewedImporterResolutionOperation } from './docs-api-documentation-role-custody.mjs';
import { createSerializedOutputRoleClassifier, deriveNativeOperationFacts, nativeOperationFactDigest } from './docs-api-output-role-classification.mjs';
import { checkCatalogueInputSurface } from './lib/docs-catalogue-input-surface.mjs';

const isReviewedPracticalReaderGraphRoot=root=>root==='/home/node/.openclaw/workspace/tmp/pr13-gov-mnt-practical-reader-61c0a550'&&fs.realpathSync(root)===root;
const isSelectedCompilerCapability=value=>['root-selected-compiler-require','cli-native-static-compiler-require','cli-typed-fixture-compiler-require'].includes(value?.kind);
const installedCompilerTarget=(root,capability,recordDependency)=>capability.kind==='cli-typed-fixture-compiler-require'?cliTypedFixtureCompilerTarget(root,capability,recordDependency):capability.kind==='cli-native-static-compiler-require'?cliNativeCompilerTarget(root,capability,recordDependency):rootSelectedCompilerTarget(root,capability,recordDependency);
const isImporterResolutionMetadata=value=>value?.kind==='importer-relative-resolution-only-metadata';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const syntheticDigest = 'a'.repeat(64);
// Public product execution and extension roots. Tests/fixtures are synthetic;
// dependency/vendor trees are external authorities; docs are publication inputs.
// Experimental spikes are not supported deployment or extension entry points.
const producerRoots=['scripts','skills','ops','tools','bin','cmd','docker','packaging','plugins','contracts','my-values'];
const documentationGraphCache=new Map();
const documentationModuleSyntaxCache=new Map();
const documentationQualificationCache=new Map();
// Finite reviewed node:module admissions. The first three retain loader
// custody; the others are a builtin-name inventory, a source-text transform,
// and synchronization of already-denied builtin methods in the pinned audit.
// Neither runtime export enumeration nor registry refresh extends this domain.
const reviewedNodeModuleNamedImports=new Set(['createRequire','Module','default','builtinModules','stripTypeScriptTypes','syncBuiltinESMExports']);
// Reviewed input-authority recipes are Source trust anchors, separately from
// refreshable operation fingerprints. Each recipe binds the actual consumer
// class, complete primary source, and its caller/input guards. Extending this
// authority requires a Source-reviewed recipe change here, not a JSON digest
// refresh. These recipes never permit unsupported capability custody.
const reviewedDocumentationModuleInputRecipes = [
  {
    "source": "tests/verification/reliability/observability-replay.test.mjs",
    "semanticClass": "native-reliability-replay-selected-module-metadata",
    "recipeSha256": "7550b30dcf5b366526f48c9c535aaab2ef8a7bc43911b3c20e10bd2489c9125f"
  },
  {
    "source": "tests/verification/reliability/review-cache-legacy-prefix.test.mjs",
    "semanticClass": "native-reliability-replay-selected-module-metadata",
    "recipeSha256": "d30745ddc5c514ecef234839d2e5e06ca98a9c0d9228c479003ef9983bc78a5b"
  },
  {
    "source": "tests/verification/reliability/review-evidence-compiler-recovery.test.mjs",
    "semanticClass": "native-reliability-replay-selected-module-metadata",
    "recipeSha256": "ad5f1a28d10e57b1fa3338642da5ccedce5f6d969fe7b7620a17de46b7bbcbb0"
  },
  {
    "source": "tests/verification/reliability/review-report-compiler-recovery.test.mjs",
    "semanticClass": "native-reliability-replay-selected-module-metadata",
    "recipeSha256": "f4ba4fc8cff5e9ab365709d875220a89901dbe564418b97aada9e22f1ebdccdf"
  },
  {
    "source": "tests/verification/reliability/review-report-locale-child.mjs",
    "semanticClass": "native-reliability-replay-selected-module-metadata",
    "recipeSha256": "2a6bea6008709eec7c819d830305a529b229080de18320c039e9d412866edce6"
  },
  {
    "source": "tests/verification/reliability/runtime-dispatch-native-profile.test.mjs",
    "semanticClass": "native-reliability-replay-selected-module-metadata",
    "recipeSha256": "78a2e75044fd184db259118cbe65c2c0ece53c291b8ab75b94295bb6d296f80e"
  },
  {
    "source": "tests/verification/historical-branch-acceptance/delivery-manifest-v3-compiler-recovery-independent.test.mjs",
    "semanticClass": "historical-environment-root-module-input-metadata",
    "recipeSha256": "f36cb14611f10a3fdb585d0f1548f67e96b149ebd2cc9d3845b08a499eb59350"
  },
  {
    "source": "tests/verification/historical-branch-acceptance/delivery-manifest-v3-contract-independent.test.mjs",
    "semanticClass": "historical-environment-root-module-input-metadata",
    "recipeSha256": "28685a3ed378201c6b13ff7fdbaefd2e9954299ce257a025727536f432ad9c4c"
  },
  {
    "source": "tests/verification/historical-branch-acceptance/delivery-manifest-v3-summary-mode-independent.test.mjs",
    "semanticClass": "historical-environment-root-module-input-metadata",
    "recipeSha256": "69a681df3a09160adef746cebdf98ce8230b0090af7fb451ecec3bcbe06fc48b"
  },
  {
    "source": "tests/verification/historical-branch-acceptance/delivery-manifest-v2-reader-corpus-child.mjs",
    "semanticClass": "historical-environment-root-module-input-metadata",
    "recipeSha256": "5c2172b21621127ca4f7cb4b3b6da70a32802f9b113cd1ba084db8b11ed9b00f"
  },
  {
    "source": "tests/verification/contracts/check-project-compiler.mts",
    "semanticClass": "caller-bound-project-compiler-source-or-archive-metadata",
    "recipeSha256": "783d11a71f120fc26318970da81628cba0d6534fb948860465cc18bce3607415"
  },
  {
    "source": "tests/verification/contracts/project-legacy-import-cases.mts",
    "semanticClass": "caller-bound-project-compiler-source-or-archive-metadata",
    "recipeSha256": "bd80e9afb37760069808f05c75099d1d424d43678867c1b1138b2df2a2e33521"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-phase11.mts",
    "semanticClass": "fixed-repository-root-module-contract-check",
    "recipeSha256": "e577e854c0f05209b09ce954771885c16ca8f2e803fc111afaa6a1682178eb63"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-external-engine.mjs",
    "semanticClass": "fixed-repository-module-contract-check",
    "recipeSha256": "6448560d82d0706e3c21b1074c3d7180970908530530990bea31ea1adc7cf358"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-isolation.mjs",
    "semanticClass": "fixed-repository-module-contract-check",
    "recipeSha256": "a4026b94971cd17e756da03b8deb7cc55b03dd1619a531bea1d2a1065e92a9a4"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-capability-security.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "cd897b3ba6dc72cbedecf0097ed458cfffe86608e8c82843df05252e279c46c9"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-phase6.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "a4205e27aa41143e969bc3d92e5bfb1a3a4fab57489f12c0dc92475ad79455f3"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-phase7.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "d41ea2b34010e82fd77703e776bc1fe658a7c1f60913051007d1ef2583980067"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-capability-runtime.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "a5461ce4ebc1732191f50bf7331de78d2b9363664985d19c2e10d1d93d0a86b3"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-e2e.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "dbd2b70a4d52ce295d2dc38f8b47b6888badd08f6beb2561e0558a50a0dc27b8"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-import-safety.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "967c52601d6c0277b07022f9dc35fd2e8e13a8cbb834fc9aac9ab299677ff3af"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-installation.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "de136fa3410ec2cb6d8564f6c02219371675e2dbbf94e80e52aaac2a419c8a11"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-lifecycle.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "29b781463c51dda61f480458dd68d1073fcfb58f1c40fe92e806cfd99508be87"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-platform-config.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "3093980dc7a3fdc0651dc3620230680ff4f1ce482410ea69bfc73c281c9adcc7"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-registry.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "eae7faab4a6cb316e53cdd9a8f1691d249d418a6ae550bcf70da78315523f845"
  },
  {
    "source": "tests/verification/contracts/check-plugin-system-v2-boundaries.mjs",
    "semanticClass": "fixed-repository-core-contract-check",
    "recipeSha256": "c491f407e5f39b2c94d579d04376ec30dee58c17341b06fbff2920128a0a8688"
  },
  {
    "source": "tests/verification/contracts/check-pipeline-visual-legacy-comparison.mts",
    "semanticClass": "fixed-git-legacy-visual-temp-module",
    "recipeSha256": "d4df95c1dac61d3456fa97ab8e5850f0c3bf86e4f0add0af28a1505a25eccb9b"
  },
  {
    "source": "tests/verification/contracts/check-pipeline-remote-plan-runtime.mts",
    "semanticClass": "fixed-cwd-relative-remote-fault-probe-module",
    "recipeSha256": "05bd530a75bb7f37cda22b8d713f6f6f9883f4e07e66666c6f0066e232a8ba4b"
  },
  {
    "source": "tests/verification/contracts/check-pipeline-observability-legacy-cutover.mjs",
    "semanticClass": "fixed-url-pathname-durable-cutover-module",
    "recipeSha256": "024f5fa940bfeed59d8cb4a04c67f9ea2cdb460b55702274fc57072de313ff17"
  },
  {
    "source": "tests/verification/contracts/check-nova-journal-scale.mts",
    "semanticClass": "fixed-cwd-relative-journal-scale-module",
    "recipeSha256": "6d11209692249fa0a3ae172e818840ba76e011f785aa180e39a3294dcd131460"
  },
  {
    "source": "scripts/check-ap08-effectful-guide.mjs",
    "semanticClass": "fixed-repository-modules",
    "recipeSha256": "a86fb35689810c4e1568ecdfe45cfcd6e34220205bfbb18823e9664ee0f272df"
  },
  {
    "source": "scripts/check-ap08-minimal-plugin.mjs",
    "semanticClass": "fixed-repository-modules",
    "recipeSha256": "ab83a00ce984358968adf6cb37759466728cf3bc88c26940ca973849dfa73ec8"
  },
  {
    "source": "scripts/check-core-architecture-guides.mjs",
    "semanticClass": "fixed-repository-modules",
    "recipeSha256": "8e4e3fc6c40f7e453c30bdc2ef7dc087cc5a02c68bbd4d363f786d5828525c7c"
  },
  {
    "source": "scripts/check-platform-specialist-guides.mjs",
    "semanticClass": "finite-repository-modules",
    "recipeSha256": "d8abe8d8898172b7d78374c3cdbb3dbee99821aeb203a2eb68d88b69e6567672"
  },
  {
    "source": "scripts/docs-configuration-inventory.mjs",
    "semanticClass": "finite-documentation-runtime-semantics",
    "recipeSha256": "9e3563efd98bf3a3d5a37fb96547602355297a67d16e53b27542f4d9215b4226"
  },
  {
    "source": "scripts/docs-lint-policy-reference.mjs",
    "semanticClass": "finite-repository-modules",
    "recipeSha256": "ed02610b1b3c53927e50345b82e9e9bf082a3eca1894dda973b9bce3431c4fdf"
  },
  {
    "source": "scripts/updates/check-renovate.mjs",
    "semanticClass": "external-renovate-fixed-suffixes",
    "recipeSha256": "a0786f7115b03b8f844b137ec01be5d73a12c73740773c8fc771eb3ac101b3e9"
  },
  {
    "source": "skills/buster/engine/test-gates/provider-child.mjs",
    "semanticClass": "registered-package-protocol-module",
    "recipeSha256": "ec70a11fd98a46732dd43735c9a808becff2a08d3eaab9f85d63e45cdc699cec"
  },
  {
    "source": "skills/buster/engine/test-gates/report-adapter-child.mjs",
    "semanticClass": "registered-package-protocol-module",
    "recipeSha256": "7ec35db726b183051561c7669495df97b3471688dd096ab602919459cc124d87"
  },
  {
    "source": "skills/common/plugin-runtime/foundation/isolation/child.mjs",
    "semanticClass": "registered-package-protocol-module",
    "recipeSha256": "1363bc462cb721195d60d4795ddd4bae95ee05fe57f4dbf39461a4ab2ed13ca7"
  },
  {
    "source": "skills/common/plugin-runtime/foundation/registry/activation.ts",
    "semanticClass": "trusted-package-registration-module",
    "recipeSha256": "51b1ae22deae4eeba9d3117d7370bf75c62891ce092249b4da74ce5eefd4641d"
  },
  {
    "source": "skills/common/plugin-runtime/foundation/registry/import-audit-child.mjs",
    "semanticClass": "bounded-builtins-and-trusted-registration",
    "recipeSha256": "9a2f6a0acee7925512c0ed9cc9f244a82f52fa284fa19f98fee16a32015bd928"
  }
];
export function documentationModuleInputAuthority(root,boundary,graph) {
  const recipes=boundary.unresolvedModuleInputAuthorities??[],facts=[];
  for(const operation of graph.dynamicOperations) {
    assert(!operation.unqualifiedCapabilityTransfer,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${operation.source}; unsupported ${operation.capability} custody: ${operation.expression}`);
    const recipe=recipes.find(recipe=>recipe.source===operation.source);
    const anchor=reviewedDocumentationModuleInputRecipes.find(anchor=>anchor.source===operation.source&&anchor.semanticClass===recipe?.semanticClass);
    assert(anchor&&hash(JSON.stringify(recipe))===anchor.recipeSha256,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${operation.source}; unresolved operation has no reviewed semantic input authority: ${operation.expression}`);
    assert(recipe.operations.some(selected=>selected.expression===operation.expression&&selected.operationSha256===hash(operation.operation)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${operation.source}; operation is outside its semantic input recipe`);
    const inputs=[{path:recipe.source,sha256:recipe.sourceSha256},...recipe.authorityInputs];
    for(const input of inputs) {
      const file=path.join(root,input.path);
      assert(fs.existsSync(file)&&fs.realpathSync(file)===path.resolve(file)&&hash(fs.readFileSync(file))===input.sha256,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${operation.source}; input/caller authority changed: ${input.path}`);
      facts.push(input);
    }
    for(const selected of recipe.inputConstraints.modulePaths??[]) {
      const file=path.join(root,selected);
      assert(fs.existsSync(file),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${operation.source}; finite selected module missing: ${selected}`);
      const canonical=path.relative(root,fs.realpathSync(file)).replaceAll(path.sep,'/');
      assert(!(boundary.qualifications??[]).some(record=>record.source===canonical),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${operation.source}; selected module resolves to qualified metadata: ${selected}`);
      facts.push({path:selected,canonical,sha256:hash(fs.readFileSync(file))});
    }
  }
  for(const operation of graph.resolutionOnlyOperations??[]) {
    const metadata=operation.metadata,qualification=metadata.operationQualification;
    assert(metadata.kind==='importer-relative-resolution-only-metadata'
      &&qualification?.role==='resolution-only-source-location'
      &&qualification.terminalSha256===metadata.terminalSha256
      &&qualification.sourceSha256===metadata.sourceSha256
      &&qualification.runtimeAcquisitionAuthorized===false
      &&qualification.remainingEffectsQualified===false,
      `DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${operation.source}; invalid resolution-operation qualification`);
    facts.push({source:operation.source,sourceSha256:metadata.sourceSha256,
      owner:metadata.owner,terminalSha256:metadata.terminalSha256,qualification});
  }
  for(const record of graph.parserProvenance??[])facts.push(verifyPublicationParserProvenance(root,record));
  assertPublicationParserGraphPurpose(root,graph);
  for(const dependency of graph.installedFoundationDependencies??[]) {
    assert(['root-selected-compiler-require','cli-native-static-compiler-require','cli-typed-fixture-compiler-require'].includes(dependency.capabilityKind)&&dependency.runtimeAcquisitionAuthorized===false,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: installed foundation boundary`);
    const {operation,...recorded}=dependency;
    const capability={...recorded,kind:dependency.capabilityKind};
    const actual=installedCompilerTarget(root,capability,()=>{});
    assert.deepEqual(actual,recorded,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: installed foundation evidence changed`);
    facts.push(dependency);
  }
  return hash(JSON.stringify(facts));
}
function documentationEntryPoints(scripts,documentationOnly=true,root) {
  const entries=[];
  for(const [name,command]of Object.entries(scripts)) {
    if(documentationOnly&&!name.startsWith('docs:')&&!name.startsWith('verify:docs:'))continue;
    assert(typeof command==='string',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: package.json; ${name} command must be literal`);
    for(const acquisition of shellNativeNodeEntries(`package.json scripts.${name}`,command)){
      const {nativeTest,entryWords:targets}=acquisition;
      for(const word of targets){
        if(/[*?]/u.test(word.value)){for(const source of expandReviewedNodePackageGlob(root,{name,command,word,nativeTest}))entries.push({name,command,source});continue;}
        assert(!/[\$`]/u.test(word.value),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: package.json; ${name} unsupported dynamic Node entry: ${word.value}`);
        entries.push({name,command,source:path.posix.normalize(word.value)});
      }
    }
  }
  return entries.sort((a,b)=>a.name.localeCompare(b.name)||a.source.localeCompare(b.source));
}

// One admission domain covers roots, finite seeds and transferred local inputs.
// CommonJS falls back to its JS compiler for unregistered extensions; ESM
// does not. JSON is passive only on the actual canonical JSON loader branch.
const nodeExecutableSource=source=>/\.(?:[cm]?js|[cm]?ts)$/u.test(source);
function nodeModuleInputClass(source,kind) {
  const basename=path.posix.basename(source),extension=path.posix.extname(source);
  if(nodeExecutableSource(source))return 'executable';
  if(extension==='.json'&&(kind!=='require'&&kind!=='entry'||basename!=='.json'))return 'passive-json';
  assert(extension!=='.node',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unsupported native module input`);
  assert(kind==='require'||kind==='entry',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unsupported ${kind} executable input`);
  return 'commonjs-fallback';
}
// This source is an actual native test, not a guarded arbitrary-module loader.
// Its synthetic role binds the complete test, owning package command and
// declared test-input contract. Any drift or product reachability rejects.
const reviewedSyntheticNodeTests=[{
  source:'skills/prism/integration/corpus-pool.mts',sha256:'993e49c853527500253108753d94178855a6ef019203ac8dd1b012e50de6d8c7',
  package:'skills/prism/package.json',script:'test:corpus-pool',command:'node integration/corpus-pool.mts',
  authorityInputs:[{path:'skills/prism/package.json',sha256:'19457da92aed9c48e1bc81e082463bba0e406c662adeaff7699e0c674b45709c'},{path:'scripts/docs-runtime-consumer-contracts.mjs',sha256:'ede974a5e5ed1d6b0d2ec859501df18263f5f9576fcc4c6e0d2f17740558e94d'}]
},{
  source:'skills/prism/integration/engine-capture-retention.mts',sha256:'83e1cbdd48b997c5fd0d59f183bd6057d82e10df9ba25e2e7e7f4162a0eac74a',
  package:'skills/prism/package.json',script:'test:engine:native-retention',command:'node --expose-gc integration/engine-capture-retention.mts',
  authorityInputs:[{path:'skills/prism/package.json',sha256:'19457da92aed9c48e1bc81e082463bba0e406c662adeaff7699e0c674b45709c'}]
}];
function syntheticNodeTestSources(root,packageBytes) {
  const selected=new Set(),definition=JSON.parse(packageBytes);
  const publicTargets=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(publicTargets):[];
  for(const recipe of reviewedSyntheticNodeTests) {
    const file=path.join(root,recipe.source);if(!fs.existsSync(file)){const owningPackage=path.join(root,recipe.package);assert(!fs.existsSync(owningPackage)||hash(fs.readFileSync(owningPackage))!==recipe.authorityInputs.find(input=>input.path===recipe.package).sha256,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${recipe.source}; synthetic test Source missing`);continue;}
    for(const input of [{path:recipe.source,sha256:recipe.sha256},...recipe.authorityInputs]) {
      const authority=path.join(root,input.path);
      assert(fs.existsSync(authority)&&fs.realpathSync(authority)===path.resolve(authority)&&hash(fs.readFileSync(authority))===input.sha256,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${recipe.source}; synthetic test Source/caller authority changed: ${input.path}`);
    }
    assert(JSON.parse(fs.readFileSync(path.join(root,recipe.package),'utf8')).scripts?.[recipe.script]===recipe.command,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${recipe.source}; synthetic test command changed`);
    for(const command of Object.values(definition.scripts??{})) {
      assert(!command.includes(recipe.source),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${recipe.source}; new unreviewed package invocation of synthetic test`);
      for(const match of command.matchAll(/\bnode(?:\s+(?:--[A-Za-z0-9_=./:-]+|-[A-Za-z]+|--))*\s+['"]?((?:\.\/)?(?:[A-Za-z0-9_.-]+)\/[A-Za-z0-9_./-]+)/gu)){const entry=path.join(root,path.posix.normalize(match[1]));assert(!fs.existsSync(entry)||fs.realpathSync(entry)!==fs.realpathSync(file),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${recipe.source}; synthetic test has new canonical package invocation`);}
    }
    for(const target of [definition.bin,definition.main,definition.exports].flatMap(publicTargets)) {
      const absolute=path.resolve(root,target);
      assert(!fs.existsSync(absolute)||fs.realpathSync(absolute)!==fs.realpathSync(file),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${recipe.source}; synthetic test has package public reachability`);
    }
    selected.add(recipe.source);
  }
  for(const source of qualifiedRootNodeHarnessSources(root,definition,documentationEntryPoints(definition.scripts??{},false,root)))selected.add(source);
  return selected;
}

function explicitPackageEntryTargets(definition){
 const targets=[];const fail=detail=>assert.fail(`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: package.json; unsupported explicit package entry authority: ${detail}`);
 if(definition.main!==undefined){if(typeof definition.main!=='string')fail('main must be a literal file');targets.push(definition.main);}
 for(const [surface,value]of [['exports',definition.exports],['bin',definition.bin]]){
  if(value===undefined)continue;if(typeof value==='string'){targets.push(value);continue;}
  if(!value||typeof value!=='object'||Array.isArray(value))fail(surface);
  for(const [key,target]of Object.entries(value)){if(typeof target!=='string'||key.includes('*')||surface==='exports'&&!/^\.(?:\/[^*]+)?$/u.test(key))fail(`${surface} ${key}; conditional, alternative and wildcard selectors are outside the finite admission`);targets.push(target);}
 }
 return targets;
}

function nodeProductExecutableSources(root,packageBytes) {
  const syntheticTests=syntheticNodeTestSources(root,packageBytes),all=walkProductSources(root,producerRoots,()=>true),selected=new Set(all.filter(source=>nodeExecutableSource(source)&&!syntheticTests.has(source)));
  const definition=JSON.parse(packageBytes),invoked=[];
  invoked.push(...documentationEntryPoints(definition.scripts??{},false,root).map(entry=>entry.source));
  invoked.push(...explicitPackageEntryTargets(definition).map(source=>source.replace(/^\.\//u,'')));
  for(const source of invoked){assert(!path.isAbsolute(source)&&!source.split('/').includes('..')&&!source.includes('*')&&fs.existsSync(path.join(root,source)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: package.json; unsupported or missing explicit entry: ${source}`);if(!syntheticTests.has(source))selected.add(source);}
  for(const source of all)if(!syntheticTests.has(source)&&(invoked.includes(source)||/^#![^\n]*(?:\/|\s)node(?:\s|$)/u.test(fs.readFileSync(path.join(root,source),'utf8').split('\n',1)[0])))selected.add(source);
  return [...selected].sort();
}

function documentationModuleGraph(root,packageBytes,boundary={}) {
  assertReaderArtifactExternalCiPurpose(root); // fresh exact external caller proof before graph-cache lookup
  const observerState=observerMaterializedSourceState(root);
  const syntheticTests=syntheticNodeTestSources(root,packageBytes),rootSources=[...new Set(nodeProductExecutableSources(root,packageBytes).map(source=>canonicalObserverDocumentationSource(root,source)))],files=[],sourceClasses=new Map(),rootAliases=[],rootPaths=new Set(rootSources);
  function admit(source,kind) {
    assert(!syntheticTests.has(source),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; synthetic native test acquired by ${kind}`);
    const selected=nodeModuleInputClass(source,kind);
    if(selected==='passive-json'){const bytes=fs.readFileSync(path.join(root,source),'utf8');try{JSON.parse(bytes.replace(/^\uFEFF/u,''));}catch{assert.fail(`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; invalid passive JSON input`);}}
    sourceClasses.set(source,selected);return selected;
  }
  for(const source of rootSources){const canonical=path.relative(root,fs.realpathSync(path.join(root,source))).replaceAll(path.sep,'/');if(canonical!==source)rootAliases.push({source,target:canonical});assert(!canonical.startsWith('../')&&!canonical.split('/').some(part=>['node_modules','vendor','.git'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; root module escapes repository authority`);admit(canonical,'entry');if(!files.includes(canonical))files.push(canonical);}
  // These are actual finite loader inputs from reviewed recipes. Include their
  // module bytes and imports even when they live outside the execution roots.
  const finiteClosure=new Set(),seedAliases=[],seedPaths=new Set();
  const typedFixtureSeed=cliTypedFixtureAnalysisSeed(root,rootSources);
  if(typedFixtureSeed){admit(typedFixtureSeed,'analysis-only-fixture');seedPaths.add(typedFixtureSeed);finiteClosure.add(typedFixtureSeed);if(!files.includes(typedFixtureSeed))files.push(typedFixtureSeed);}
  for(const recipe of boundary.unresolvedModuleInputAuthorities??[])if(reviewedDocumentationModuleInputRecipes.some(anchor=>anchor.source===recipe.source&&anchor.semanticClass===recipe.semanticClass&&anchor.recipeSha256===hash(JSON.stringify(recipe))))for(const source of recipe.inputConstraints.modulePaths??[])if(fs.existsSync(path.join(root,source))) {
    const canonical=path.relative(root,fs.realpathSync(path.join(root,source))).replaceAll(path.sep,'/');
    assert(!canonical.startsWith('../')&&!path.isAbsolute(canonical)&&!canonical.split('/').some(part=>['node_modules','vendor','.git'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${recipe.source}; finite selected module escapes repository authority: ${source}`);
    // Node resolves a selected symlink before resolving its relative imports.
    // Keep the resolution path as a cache fact, but scan only canonical bytes
    // with the canonical identity. This also applies to already-root seeds.
    admit(canonical,'dynamic-import');seedPaths.add(source);finiteClosure.add(canonical);
    if(canonical!==source){seedAliases.push({source,target:canonical});const index=files.indexOf(source);if(index!==-1)files.splice(index,1);}
    if(!files.includes(canonical))files.push(canonical);
  }
  const inputs=files.map(source=>[source,fs.readFileSync(path.join(root,source))]);
  const directoryAliases=[];
  const excluded=new Set(['node_modules','vendor','.git','dist','test','tests','fixtures']);
  function inspectDirectory(source) {
    const absolute=path.join(root,source);if(!fs.existsSync(absolute))return;
    if(fs.lstatSync(absolute).isSymbolicLink()){if(fs.statSync(absolute).isDirectory())directoryAliases.push({source,target:path.relative(root,fs.realpathSync(absolute)).replaceAll(path.sep,'/'),directory:true});return;}
    if(fs.statSync(absolute).isDirectory())for(const entry of fs.readdirSync(absolute,{withFileTypes:true}))if(!excluded.has(entry.name)&&(entry.isDirectory()||entry.isSymbolicLink()))inspectDirectory(path.posix.join(source,entry.name));
  }
  producerRoots.forEach(inspectDirectory);directoryAliases.sort((a,b)=>a.source.localeCompare(b.source));
  // Public entry surfaces are distinct from the canonical file Node executes.
  // Parse/authorize canonical bytes once, but retain every admitted root path.
  const publicEntries=rootSources.map(source=>({path:source,canonicalSource:path.relative(root,fs.realpathSync(path.join(root,source))).replaceAll(path.sep,'/')}));
  for(const alias of directoryAliases)for(const entry of [...publicEntries])if(entry.canonicalSource.startsWith(alias.target+'/')) {
    const selected=path.posix.join(alias.source,entry.canonicalSource.slice(alias.target.length+1));
    if(nodeExecutableSource(selected)&&!publicEntries.some(entry=>entry.path===selected))publicEntries.push({path:selected,canonicalSource:entry.canonicalSource});
  }
  publicEntries.sort((a,b)=>a.path.localeCompare(b.path));
  function canonicalDependency(source) {
    const canonical=path.relative(root,fs.realpathSync(path.join(root,source))).replaceAll(path.sep,'/');
    assert(!canonical.startsWith('../')&&!path.isAbsolute(canonical)&&!canonical.split('/').some(part=>['node_modules','vendor','.git'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; cached module input escapes repository authority`);
    return canonical;
  }
  const dependencyFacts=paths=>[...paths].sort().map(source=>{const file=path.join(root,source);return fs.existsSync(file)?[source,canonicalDependency(source),fs.statSync(file).isDirectory()?'directory':hash(fs.readFileSync(file))]:[source,null];});
  function installedFoundationFacts(dependencies) {
    return dependencies.map(dependency=>{
      assert(dependency.inputClass==='source-owned-installed-compiler-foundation'&&dependency.kind==='installedFoundationDependency'&&['root-selected-compiler-require','cli-native-static-compiler-require','cli-typed-fixture-compiler-require'].includes(dependency.capabilityKind),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: unsupported installed foundation input class`);
      const {operation,...recorded}=dependency;
      const actual=installedCompilerTarget(root,{...recorded,kind:dependency.capabilityKind});
      assert.deepEqual(actual,recorded,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: cached installed foundation evidence changed`);
      return {...actual,operation};
    }).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const graphKey=(selected,dependencyPaths,installedFoundationDependencies=[])=>hash(JSON.stringify([observerState,hash(packageBytes),directoryAliases,publicEntries,dependencyFacts(seedPaths),dependencyFacts(rootPaths),selected.map(([source,bytes])=>[source,fs.realpathSync(path.join(root,source)),hash(bytes)]).sort((a,b)=>a[0].localeCompare(b[0])),dependencyFacts(dependencyPaths),installedFoundationFacts(installedFoundationDependencies)]));
  function reusableDocumentationGraph(cached,selected) {
    if(!cached)return null;
    const currentKey=graphKey(selected,cached.dependencyPaths,cached.installedFoundationDependencies??[]);
    if(cached.inputKey!==currentKey)return null;assertCliNativeCompilerGraphPurpose(root,cached);assertCliTypedFixtureGraphPurpose(root,cached);assertPublicationParserGraphPurpose(root,cached);return cached;
  }
  const cached=documentationGraphCache.get(root);
  // A cached closure must still bind every bridge's current bytes and canonical
  // path. On change, rebuild from primary inputs so removed edges cannot retain
  // stale consumers. ASTs are reused only for identical complete source bytes.
  const cacheInputs=[...inputs];
  if(cached)for(const source of cached.closureSources)if(!files.includes(source)&&fs.existsSync(path.join(root,source))){canonicalDependency(source);cacheInputs.push([source,fs.readFileSync(path.join(root,source))]);}
  const reusable=reusableDocumentationGraph(cached,cacheInputs);if(reusable)return reusable;
  const edges=[],parserProvenance=[],installedFoundationDependencies=[],installedFoundationDependencyPaths=new Set(),dynamicOperations=[],resolutionOnlyOperations=[],unresolvedLocalOperations=[],aliases=[...directoryAliases,...rootAliases,...seedAliases],dependencyPaths=new Set([...seedPaths,...rootPaths]);
  // The calling module's nearest package is the sole self-reference authority.
  // Missing intervening package files are cache inputs too: adding a boundary
  // must invalidate an already admitted closure.
  function packageScope(source) {
    let directory=path.posix.dirname(source);
    for(;;) {
      const selected=path.posix.join(directory,'package.json');dependencyPaths.add(selected);
      if(fs.existsSync(path.join(root,selected)))return {directory:directory==='.'?'':directory,definition:JSON.parse(fs.readFileSync(path.join(root,selected),'utf8'))};
      if(directory==='.')return {directory:'',definition:{}};
      directory=path.posix.dirname(directory);
    }
  }
  const isPackageSelfReference=(source,specifier)=>{const {definition}=packageScope(source);return typeof definition.name==='string'&&definition.name.length>0&&(specifier===definition.name||specifier.startsWith(definition.name+'/'));};
  function targetFor(source,specifier,kind,capability=null) {
    if(capability?.kind==='publication-example-parser-require'){
      assert(source===capability.source&&kind==='require'&&specifier==='markdown-it','DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: publication parser exact load');
      const record=verifyPublicationParserProvenance(root,capability,dependency=>dependencyPaths.add(dependency));if(!parserProvenance.some(r=>r.source===source))parserProvenance.push(record);
      return null; // Ordinary bare external import: no local graph edge or compiler grant.
    }
    if(isSelectedCompilerCapability(capability)) {
      assert(source===capability.source&&kind===capability.kind&&specifier==='typescript',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; root compiler specifier/call`);
      return installedCompilerTarget(root,capability,dependency=>installedFoundationDependencyPaths.add(dependency));
    }
    const observerTarget=resolveObserverDocumentationImport(root,source,specifier,kind,dependency=>dependencyPaths.add(dependency));
    if(observerTarget){admit(observerTarget,kind);if(!files.includes(observerTarget)){files.push(observerTarget);inputs.push([observerTarget,fs.readFileSync(path.join(root,observerTarget))]);}return observerTarget;}
    let packageDirectory=null,exactExport=false;
    if(specifier.startsWith('#')){const scope=packageScope(source),mapped=scope.definition.imports?.[specifier];if(typeof mapped==='string'){specifier=mapped;packageDirectory=scope.directory;}else return null;}
    if(isPackageSelfReference(source,specifier)) {
      const scope=packageScope(source),packageDefinition=scope.definition;
      const subpath=specifier===packageDefinition.name?'.':'./'+specifier.slice(packageDefinition.name.length+1),exports=packageDefinition.exports;
      const selected=typeof exports==='string'&&subpath==='.'?exports:exports&&typeof exports==='object'&&!Array.isArray(exports)&&Object.hasOwn(exports,subpath)?exports[subpath]:null;
      assert(typeof selected==='string'&&selected.startsWith('./')&&!selected.split('/').some(part=>['..','node_modules'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; own package self-reference has no finite exact export target: ${specifier}`);
      specifier=selected;packageDirectory=scope.directory;exactExport=true;
    }
    if(specifier.startsWith('file:')){try{specifier=decodeURIComponent(new URL(specifier).pathname);}catch{return null;}}
    if(path.isAbsolute(specifier)){if(!specifier.startsWith(path.resolve(root)+path.sep))return null;specifier='./'+path.relative(root,specifier).replaceAll(path.sep,'/');packageDirectory='';}
    if(!specifier.startsWith('.'))return null;
    let target=path.posix.normalize(path.posix.join(packageDirectory??path.posix.dirname(source),specifier));
    if(target.startsWith('../'))return null;
    const isFile=selected=>{dependencyPaths.add(selected);return fs.existsSync(path.join(root,selected))&&fs.statSync(path.join(root,selected)).isFile();};
    if(!isFile(target)) {
      if(kind==='require'&&!exactExport) {
        // Native CommonJS LOAD_AS_FILE: exact, .js, .json, .node. Never
        // substitute ESM/TypeScript siblings. Directory loading is outside
        // this finite admission; fail with the receiving source instead.
        const candidate=['.js','.json','.node'].map(extension=>target+extension).find(isFile);
        if(candidate)target=candidate;
        else {assert(!fs.existsSync(path.join(root,target))||!fs.statSync(path.join(root,target)).isDirectory(),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unsupported CommonJS directory input: ${specifier}`);return null;}
      } else return null;
    }
    dependencyPaths.add(target);
    const canonical=path.relative(root,fs.realpathSync(path.join(root,target))).replaceAll(path.sep,'/');
    if(canonical!==target)aliases.push({source:target,target:canonical});
    if(finiteClosure.has(source))assert(!canonical.startsWith('../')&&!canonical.split('/').some(part=>['node_modules','vendor','.git'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; finite local dependency escapes repository authority: ${target}`);
    assert(!canonical.startsWith('../')&&!canonical.split('/').some(part=>['node_modules','vendor','.git'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; local dependency escapes repository authority: ${target}`);
    admit(canonical,kind);
    if(finiteClosure.has(source))finiteClosure.add(canonical);
    // Every actual local transfer enters the same finite AST inventory, even
    // when its parent was an ordinary product root rather than a recipe seed.
    if(!files.includes(canonical)){files.push(canonical);inputs.push([canonical,fs.readFileSync(path.join(root,canonical))]);}
    return canonical;
  }
  for(const [source,bytes]of inputs) {
    assert(sourceClasses.has(source),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; missing module input admission`);
    if(sourceClasses.get(source)==='passive-json')continue;
    const canonical=path.relative(root,fs.realpathSync(path.join(root,source))).replaceAll(path.sep,'/');if(canonical!==source)aliases.push({source,target:canonical});
    const syntaxKey=hash(bytes),syntaxEntry=documentationModuleSyntaxCache.get(path.join(root,source));
    const tree=syntaxEntry?.key===syntaxKey?syntaxEntry.tree:ts.createSourceFile(source,bytes.toString(),ts.ScriptTarget.Latest,true,/\.[cm]?ts$/u.test(source)?ts.ScriptKind.TS:ts.ScriptKind.JS);
    assert(!tree.parseDiagnostics.length,`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; executable input syntax is outside the finite scanner`);
    documentationModuleSyntaxCache.set(path.join(root,source),{key:syntaxKey,tree});
    const declarations=new Map(),writes=[],importCapabilities=new Map(),moduleShadows=new Set();
    for(const statement of tree.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteralLike(statement.moduleSpecifier)&&['module','node:module'].includes(statement.moduleSpecifier.text)) {
      const clause=statement.importClause;if(clause?.name)importCapabilities.set(clause.name.text,'node-module');
      if(clause?.namedBindings&&ts.isNamespaceImport(clause.namedBindings))importCapabilities.set(clause.namedBindings.name.text,'node-module');
      for(const element of clause?.namedBindings?.elements??[]) {
        const selected=element.propertyName?.text??element.name.text;
        assert(reviewedNodeModuleNamedImports.has(selected),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unreviewed node:module named admission: ${selected}`);
        if(selected==='createRequire')importCapabilities.set(element.name.text,'create-require');
        if(selected==='Module'||selected==='default')importCapabilities.set(element.name.text,'node-module');
      }
    }
    const scopeOf=node=>{const functionScoped=ts.isVariableDeclaration(node)&&ts.isVariableDeclarationList(node.parent)&&!(node.parent.flags&ts.NodeFlags.BlockScoped);for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)||ts.isSourceFile(parent)||!functionScoped&&(ts.isBlock(parent)||ts.isForStatement(parent)||ts.isForOfStatement(parent)||ts.isForInStatement(parent)||ts.isCatchClause(parent)))return parent;return tree;};
    const intrinsicModuleVar=node=>ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='module'&&ts.isVariableDeclarationList(node.parent)&&!(node.parent.flags&ts.NodeFlags.BlockScoped)&&scopeOf(node)===tree;
    const bindsModule=name=>ts.isIdentifier(name)?name.text==='module':ts.isObjectBindingPattern(name)||ts.isArrayBindingPattern(name)?name.elements.some(element=>ts.isBindingElement(element)&&bindsModule(element.name)):false;
    function declarationsIn(node){
      if((ts.isVariableDeclaration(node)&&!node.initializer||ts.isParameter(node)||ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node))&&node.name&&bindsModule(node.name)&&!intrinsicModuleVar(node))moduleShadows.add(scopeOf(node));
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer){const choices=declarations.get(node.name.text)??[];choices.push({value:node.initializer,scope:scopeOf(node)});declarations.set(node.name.text,choices);}
      if(ts.isVariableDeclaration(node)&&ts.isObjectBindingPattern(node.name)&&node.initializer)for(const element of node.name.elements)if(ts.isIdentifier(element.name)){const property=element.dotDotDotToken?null:element.propertyName?ts.isIdentifier(element.propertyName)||ts.isStringLiteralLike(element.propertyName)?element.propertyName.text:ts.isComputedPropertyName(element.propertyName)?ts.isStringLiteralLike(element.propertyName.expression)?element.propertyName.expression.text:'createRequire':null:element.name.text;const choices=declarations.get(element.name.text)??[];choices.push({value:node.initializer,property,scope:scopeOf(node)});declarations.set(element.name.text,choices);}
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&ts.isIdentifier(node.left))writes.push(node);
      ts.forEachChild(node,declarationsIn);
    }declarationsIn(tree);
    function bindingFor(node){for(let parent=node.parent;parent;parent=parent.parent){const choices=(declarations.get(node.text)??[]).filter(choice=>choice.scope===parent);if(choices.length)return choices.filter(choice=>choice.value.end<node.pos).at(-1)??choices[0];}return null;}
    const moduleIsShadowed=node=>{for(let owner=node.parent;owner;owner=owner.parent)if(moduleShadows.has(owner))return true;return false;};
    const declarationFor=node=>bindingFor(node)?.value??null;
    const assignedValues=node=>writes.filter(write=>write.left.text===node.text&&declarationFor(write.left)===declarationFor(node)).map(write=>write.right);
    function literal(node,seen=new Set()) {
      if(!node||seen.has(node))return null;seen=new Set([...seen,node]);
      if(ts.isStringLiteralLike(node))return node.text;
      if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node))return literal(node.expression,seen);
      if(ts.isIdentifier(node))return assignedValues(node).length?null:literal(declarationFor(node),seen);
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.PlusToken){const left=literal(node.left,seen),right=literal(node.right,seen);return left!==null&&right!==null?left+right:null;}
      if(ts.isTemplateExpression(node)){let value=node.head.text;for(const span of node.templateSpans){const item=literal(span.expression,seen);if(item===null)return null;value+=item+span.literal.text;}return value;}
      return null;
    }
    function hints(node,seen=new Set()) {
      if(!node||seen.has(node))return [];seen.add(node);
      if(ts.isStringLiteralLike(node))return [node.text];
      if(ts.isIdentifier(node))return [...hints(declarationFor(node),seen),...assignedValues(node).flatMap(value=>hints(value,seen))];
      const result=[];ts.forEachChild(node,child=>{result.push(...hints(child,seen));});return result;
    }
    const propertyOf=node=>ts.isPropertyAccessExpression(node)?node.name.text:ts.isElementAccessExpression(node)?literal(node.argumentExpression):null;
    function loaderCapability(node,seen=new Set()) {
      if(!node||seen.has(node))return null;seen=new Set([...seen,node]);
      if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node))return loaderCapability(node.expression,seen);
      if(ts.isAwaitExpression(node)&&loaderCapability(node.expression,seen)==='node-module-promise')return 'node-module';
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&['module','node:module'].includes(literal(node.arguments[0])))return 'node-module-promise';
      if(ts.isIdentifier(node)) {
        const binding=bindingFor(node),initial=binding?intrinsicModuleVar(binding.value.parent)&&ts.isIdentifier(binding.value)&&binding.value.text==='module'?'commonjs-module':loaderCapability(binding.value,seen):importCapabilities.get(node.text)??(node.text==='require'?'require':node.text==='module'&&!moduleIsShadowed(node)?'commonjs-module':null);
        if(isSelectedCompilerCapability(initial)) {
          assert(!binding?.property&&node.text==='require'&&!assignedValues(node).length&&(binding.value.parent.name===node||ts.isCallExpression(node.parent)&&node.parent.expression===node),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; root compiler alias/projection/write`);
          return initial;
        }
        const projected=binding?.property?initial==='node-module'&&binding.property==='createRequire'?'create-require':initial==='commonjs-module'&&binding.property==='require'?'module-require':initial==='node-module'&&['default','Module'].includes(binding.property)?'node-module':null:initial;
        return projected??assignedValues(node).map(value=>loaderCapability(value,seen)).find(Boolean)??null;
      }
      if(propertyOf(node)==='require'&&loaderCapability(node.expression,seen)==='commonjs-module')return 'module-require';
      if(propertyOf(node)==='createRequire'&&loaderCapability(node.expression,seen)==='node-module')return 'create-require';
      if(['default','Module'].includes(propertyOf(node))&&loaderCapability(node.expression,seen)==='node-module')return 'node-module';
      if(['call','apply','bind'].includes(propertyOf(node))&&isSelectedCompilerCapability(loaderCapability(node.expression,seen)))assert.fail(`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; root compiler forwarding`);
      if(['call','apply','bind'].includes(propertyOf(node))&&['require','module-require'].includes(loaderCapability(node.expression,seen)))return 'require-forwarder';
      if(['call','apply','bind'].includes(propertyOf(node))&&loaderCapability(node.expression,seen)==='create-require')return 'create-require-forwarder';
      if(ts.isCallExpression(node)) {
        const forwarded=['call','apply','bind'].includes(propertyOf(node.expression));
        const capability=loaderCapability(forwarded?node.expression.expression:node.expression,seen);
        if(capability==='create-require'||capability==='create-require-forwarder') {
          // Only the exact native current-module URL establishes the same base
          // that targetFor uses. Do not discard a selected foreign filename,
          // alias, bound argument, or computed URL and resolve its loads here.
          const forwarding=propertyOf(node.expression);
          const base=forwarding==='call'?node.arguments[1]:forwarding==='apply'&&node.arguments[1]&&ts.isArrayLiteralExpression(node.arguments[1])&&!node.arguments[1].elements.some(ts.isSpreadElement)?node.arguments[1].elements[0]:node.arguments[0];
          if(forwarding!=='call'&&forwarding!=='apply'&&forwarding!=='bind'&&capability==='create-require'&&!(base&&ts.isPropertyAccessExpression(base)&&base.name.text==='url'&&ts.isMetaProperty(base.expression))) {
            if(source==='tests/verification/contracts/check-plugin-system-v2-boundaries.mjs')return reviewedImporterResolutionOperation(root,source,bytes,tree,node,dependency=>dependencyPaths.add(dependency));
            if(source==='scripts/lib/docs-publication-example-coverage.mjs'&&(fs.realpathSync(root)==='/home/node/.openclaw/workspace/kubeclaw-pr13-recovery'||isReviewedPracticalReaderGraphRoot(root)))return reviewedPublicationParserCapability(root,source,bytes,tree,node,dependency=>dependencyPaths.add(dependency));
            if(source==='scripts/docs-sdk-reference.mjs')return reviewedRootSelectedCompilerCapability(source,bytes,tree,node);
            if(source==='scripts/lib/cli/cli-native-driver.mjs')return reviewedCliNativeCompilerCapability(root,source,bytes,tree,node,dependency=>dependencyPaths.add(dependency));
            if(source==='scripts/lib/cli/typed-cli-ast.mjs'&&(fs.realpathSync(root)==='/home/node/.openclaw/workspace/kubeclaw-pr13-recovery'||isReviewedPracticalReaderGraphRoot(root)))return reviewedCliTypedFixtureCapability(root,source,bytes,tree,node,dependency=>dependencyPaths.add(dependency));
            // Unknown owners retain the ordinary factory-base rejection below;
            // they cannot enter another source's specialized provenance recipe.
          }
          assert(forwarding!=='bind'&&capability!=='create-require-forwarder'&&base&&ts.isPropertyAccessExpression(base)&&base.name.text==='url'&&ts.isMetaProperty(base.expression)&&base.expression.keywordToken===ts.SyntaxKind.ImportKeyword&&base.expression.name.text==='meta',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unsupported createRequire factory base: ${node.getText(tree)}; expected exact import.meta.url`);
          return 'require';
        }
        if(propertyOf(node.expression)==='bind')return capability==='module-require'?'require':capability;
        if(['require','module-require'].includes(capability)&&['module','node:module'].includes(literal(requireArgument(node))))return 'node-module';
      }
      return null;
    }
    function requireArgument(node) {
      const direct=loaderCapability(node.expression);
      if(direct?.kind==='publication-example-parser-require'){
        assert(ts.isCallExpression(node.expression)&&hash(node.expression.getText(tree))===direct.factorySha256&&hash(node.getText(tree))===direct.consumerSha256&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='markdown-it','DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: publication parser exact consumer');return node.arguments[0];
      }
      if(direct?.kind==='cli-typed-fixture-compiler-require'){
        assert(ts.isCallExpression(node.expression)&&hash(node.expression.getText(tree))===direct.factorySha256&&hash(node.getText(tree))===direct.consumerSha256&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='typescript',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; exact fixture compiler consumer`);return node.arguments[0];
      }
      if(isSelectedCompilerCapability(direct)) {
        assert(ts.isIdentifier(node.expression)&&node.expression.text==='require'&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='typescript',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; root compiler consumer`);
        return node.arguments[0];
      }
      const forwarding=propertyOf(node.expression);
      if(['call','apply','bind'].includes(forwarding)&&['require','module-require'].includes(loaderCapability(node.expression.expression))) {
        if(loaderCapability(node.expression.expression)==='module-require')assert(loaderCapability(node.arguments[0])==='commonjs-module',`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unsupported intrinsic module.require receiver: ${node.getText(tree)}`);
        if(forwarding==='apply')return node.arguments[1]&&ts.isArrayLiteralExpression(node.arguments[1])&&!node.arguments[1].elements.some(ts.isSpreadElement)?node.arguments[1].elements[0]??null:null;
        // A bound receiver with no module argument is not yet a load. Its later
        // invocation is a require capability; bound module arguments themselves
        // are transfers and must already invalidate documentation qualification.
        return node.arguments[1]??null;
      }
      if(loaderCapability(node.expression)==='require-forwarder')return null;
      if(loaderCapability(node.expression)==='module-require')return (ts.isPropertyAccessExpression(node.expression)||ts.isElementAccessExpression(node.expression))&&loaderCapability(node.expression.expression)==='commonjs-module'?node.arguments[0]??null:null;
      return loaderCapability(node.expression)==='require'?node.arguments[0]??null:undefined;
    }
    const syntaxHashForCompilerConsumer=(node,capability)=>hash(node.getText(tree))===capability.consumerSha256&&ts.isVariableDeclaration(node.parent)&&node.parent.name?.getText(tree)==='ts';
    function capabilityCustodyQualified(node,capability) {
      const parent=node.parent;if(!parent)return false;
      if(isImporterResolutionMetadata(capability))return ts.isCallExpression(node)&&ts.isPropertyAccessExpression(parent)&&parent.expression===node&&parent.name.text==='resolve'&&ts.isCallExpression(parent.parent)&&parent.parent.expression===parent&&hash(parent.parent.getText(tree))===capability.terminalSha256;
      if(capability?.kind==='publication-example-parser-require')return ts.isCallExpression(node)&&hash(node.getText(tree))===capability.factorySha256&&ts.isCallExpression(parent)&&parent.expression===node&&hash(parent.getText(tree))===capability.consumerSha256;
      if(capability?.kind==='cli-typed-fixture-compiler-require')return ts.isCallExpression(node)&&hash(node.getText(tree))===capability.factorySha256&&ts.isCallExpression(parent)&&parent.expression===node&&hash(parent.getText(tree))===capability.consumerSha256;
      if(isSelectedCompilerCapability(capability)) {
        if(ts.isVariableDeclaration(parent)&&parent.name===node)return ts.isIdentifier(node)&&node.text==='require';
        if(ts.isVariableDeclaration(parent)&&parent.initializer===node)return ts.isIdentifier(parent.name)&&parent.name.text==='require'&&ts.isCallExpression(node);
        return ts.isIdentifier(node)&&node.text==='require'&&ts.isCallExpression(parent)&&parent.expression===node&&syntaxHashForCompilerConsumer(parent,capability);
      }
      // Declaration names and import binding syntax do not read a capability.
      if((ts.isVariableDeclaration(parent)||ts.isBindingElement(parent))&&parent.name===node||ts.isBindingElement(parent)&&parent.propertyName===node)return true;
      if(ts.isImportClause(parent)||ts.isImportSpecifier(parent)||ts.isNamespaceImport(parent))return true;
      if((ts.isPropertySignature(parent)||ts.isMethodSignature(parent)||ts.isPropertyDeclaration(parent)||ts.isInterfaceDeclaration(parent)||ts.isTypeAliasDeclaration(parent))&&parent.name===node)return true;
      if((ts.isPropertyAccessExpression(parent)||ts.isPropertyAssignment(parent))&&parent.name===node)return true;
      if(ts.isVariableDeclaration(parent)&&parent.initializer===node) {
        // Admission must match declarationsIn's finite projection grammar.
        // Nested/array/defaulted bindings are custody escapes, never aliases
        // whose resulting identifiers can silently lose their capability.
        if(!ts.isIdentifier(parent.name)&&(!['node-module','commonjs-module'].includes(capability)||!ts.isObjectBindingPattern(parent.name)||parent.name.elements.some(element=>!ts.isIdentifier(element.name)||element.initializer||element.dotDotDotToken||!(capability==='commonjs-module'?new Set(['require']):reviewedNodeModuleNamedImports).has(element.propertyName?ts.isIdentifier(element.propertyName)||ts.isStringLiteralLike(element.propertyName)?element.propertyName.text:ts.isComputedPropertyName(element.propertyName)?literal(element.propertyName.expression):null:element.name.text))))return false;
        for(let owner=parent;owner;owner=owner.parent)if(ts.isVariableStatement(owner))return !owner.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword);
        return true;
      }
      if(ts.isBinaryExpression(parent)&&parent.right===node&&parent.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isIdentifier(parent.left))return true;
      if(ts.isBinaryExpression(parent)&&parent.left===node&&ts.isIdentifier(node)&&parent.operatorToken.kind===ts.SyntaxKind.EqualsToken)return true;
      if(ts.isParenthesizedExpression(parent)||ts.isAsExpression(parent)||ts.isNonNullExpression(parent))return true;
      if(capability==='node-module-promise')return ts.isAwaitExpression(parent);
      if(capability==='commonjs-module'&&ts.isCallExpression(parent)&&parent.arguments[0]===node
        && ['call','apply','bind'].includes(propertyOf(parent.expression))&&['require','module-require'].includes(loaderCapability(parent.expression.expression)))return true;
      // builtinModules is a string inventory, not a loader capability. Admit
      // only its literal projection; unknown/dynamic namespace reads still fail.
      if((ts.isPropertyAccessExpression(parent)||ts.isElementAccessExpression(parent))&&parent.expression===node)return capability==='node-module'&&propertyOf(parent)==='builtinModules'||capability==='commonjs-module'&&propertyOf(parent)==='exports'||loaderCapability(parent)!==null;
      if(ts.isCallExpression(parent)&&parent.expression===node)return ['require','module-require','require-forwarder','create-require','create-require-forwarder'].includes(capability);
      return false;
    }
    function visit(node) {
      if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&['module','node:module'].includes(literal(node.moduleSpecifier)))dynamicOperations.push({source,expression:node.getText(tree),operation:node.getText(tree),hints:[],unqualifiedCapabilityTransfer:true,capability:'node-module-export'});
      const capability=loaderCapability(node);
      if(isImporterResolutionMetadata(capability)) {
        const qualification=capability.operationQualification;
        if(qualification?.role==='resolution-only-source-location'
          &&qualification.terminalSha256===capability.terminalSha256
          &&qualification.sourceSha256===capability.sourceSha256
          &&qualification.runtimeAcquisitionAuthorized===false
          &&qualification.remainingEffectsQualified===false) {
          resolutionOnlyOperations.push({source,expression:node.parent.parent.getText(tree),metadata:capability});
        } else dynamicOperations.push({source,expression:node.parent.parent.getText(tree),operation:node.parent.parent.getText(tree),hints:[],unqualifiedCapabilityTransfer:true,capability:'importer-relative-resolution-effects-unqualified',resolutionOnlyMetadata:capability});
      }
      if(capability&&!capabilityCustodyQualified(node,capability))dynamicOperations.push({source,expression:node.getText(tree),operation:node.parent?.getText(tree)??node.getText(tree),hints:[],unqualifiedCapabilityTransfer:true,capability});
      let argument,kind;
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier){argument=node.moduleSpecifier;kind=ts.isImportDeclaration(node)?'import':'re-export';}
      if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)){argument=node.moduleReference.expression;kind='import-equals';assert(!['module','node:module'].includes(literal(argument)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unsupported node:module import-assignment admission`);}
      if(ts.isCallExpression(node)) {
        const requireInput=requireArgument(node);
        if(node.expression.kind===ts.SyntaxKind.ImportKeyword){argument=node.arguments[0];kind='dynamic-import';}
        else if(requireInput!==undefined&&!(propertyOf(node.expression)==='bind'&&requireInput===null)){argument=requireInput;kind=isSelectedCompilerCapability(loaderCapability(node.expression))?loaderCapability(node.expression).kind:'require';}
        else if(!(propertyOf(node.expression)==='bind'&&requireInput===null)&&node.arguments.some(argument=>isSelectedCompilerCapability(loaderCapability(argument))||['commonjs-module','node-module','create-require','create-require-forwarder','require','module-require','require-forwarder'].includes(loaderCapability(argument)))){argument=null;kind='require-capability-escape';}
      }
      if(kind) {
        const specifier=literal(argument),target=specifier===null?null:targetFor(source,specifier,kind,ts.isCallExpression(node)?loaderCapability(node.expression):null);
        if(target?.kind==='installedFoundationDependency')installedFoundationDependencies.push({...target,source,operation:node.getText(tree)});
        else if(target)edges.push({source,target,kind,operation:node.getText(tree)});
        else if(specifier===null||specifier.startsWith('#')||specifier.startsWith('.')||specifier.startsWith('file:')||path.isAbsolute(specifier)||isPackageSelfReference(source,specifier)) {
          let owner=node;for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionDeclaration(parent))owner=parent;
          dynamicOperations.push({source,expression:node.getText(tree),operation:owner.getText(tree),hints:hints(argument)});
        } else if(specifier.startsWith('.')||specifier.startsWith('file:')||path.isAbsolute(specifier)||isPackageSelfReference(source,specifier)) {
          // This source may enter the finite closure through an edge discovered
          // later. Retain its unresolved local edge rather than losing it when
          // it was initially scanned as an ordinary root.
          unresolvedLocalOperations.push({source,expression:node.getText(tree),operation:node.getText(tree),hints:hints(argument)});
        }
      }
      ts.forEachChild(node,visit);
    }
    visit(tree);
    // A selected module may reach a source already scanned as a product root.
    // Propagate its existing edges too, to complete the same local closure.
    let expanded=true;
    while(expanded){expanded=false;for(const edge of edges)if(finiteClosure.has(edge.source)&&!finiteClosure.has(edge.target)) {
      assert(!edge.target.startsWith('../')&&!edge.target.split('/').some(part=>['node_modules','vendor','.git'].includes(part)),`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${edge.source}; finite dependency escapes repository authority`);
      finiteClosure.add(edge.target);expanded=true;
      if(!files.includes(edge.target)){files.push(edge.target);inputs.push([edge.target,fs.readFileSync(path.join(root,edge.target))]);}
    }}
  }
  dynamicOperations.push(...unresolvedLocalOperations.filter(operation=>finiteClosure.has(operation.source)));
  const graph={inputKey:graphKey(inputs,dependencyPaths,installedFoundationDependencies),edges,parserProvenance,installedFoundationDependencies,installedFoundationDependencyPaths:[...installedFoundationDependencyPaths].sort(),dynamicOperations,resolutionOnlyOperations,aliases,publicEntries,closureSources:[...files],executableSources:files.filter(source=>sourceClasses.get(source)!=='passive-json'),dependencyPaths:[...dependencyPaths]};assertCliNativeCompilerGraphPurpose(root,graph);assertCliTypedFixtureGraphPurpose(root,graph);assertPublicationParserGraphPurpose(root,graph);documentationGraphCache.set(root,graph);return graph;
}
const documentationEdgeOrder=(a,b)=>a.source.localeCompare(b.source)||a.target.localeCompare(b.target)||a.kind.localeCompare(b.kind)||a.operation.localeCompare(b.operation);
// A mutable registry records reviewed facts; it cannot authorize a new output
// capability by refreshing its own digest and operation recipe. These selected
// static Source roles require an independently reviewed code change to rebind.
const staticReceiverSourceAuthorities={
  'scripts/docs-kubernetes-pv-selected-receiver-contracts.mjs':'02d9af8019e1300767aa0ca507607004aa6ee6e107fb455da3579af46e551f51',
};
// Exact existing executable consumer roles whose purpose is not discovered by
// the root-only docs-helper traversal. This is analysis routing, never entry or
// runtime acquisition authority. The Source-locator has no selected root-package
// command or selected importing ancestor; direct CI invocation is outside that
// selected entry graph and is separately reviewed.
const reviewedDocumentationPurposeRoutes=Object.freeze({
 'scripts/docs-reader/check-source-links.mjs':'uninvoked-primary-source-locator-analysis/v1',
 'scripts/docs-reader/renderer.mjs':'positive-publication-reader-renderer/v1',
 'scripts/docs-sdk-reference.mjs':'sdk-source-reference-consumer/v1',
 'scripts/docs-reader/serve.mjs':'manual-reader-preview-with-external-ci-fixtures/v1',
});
function assertDocumentationToolQualifications(root,boundary,packageBytes) {
  const qualificationRecords=boundary.qualifications??[],routes=boundary.purposeRoutes??[],records=[...qualificationRecords,...routes],required=[...new Set([...(boundary.qualificationRequiredSources??[]),...Object.keys(staticReceiverSourceAuthorities).filter(source=>(boundary.sources??[]).includes(source)||records.some(record=>record.source===source))])];
  for(const source of required)assert(records.some(record=>record.source===source),`DOCUMENTATION_TOOL_QUALIFICATION_MISSING: ${source}`);
  for(const [source,recipe]of Object.entries(documentationExecutableRoleRecipes))if(recipe.qualificationKind==='reviewed-documentation-consumer/v1'&&(boundary.sources??[]).includes(source))assert(qualificationRecords.some(record=>record.source===source&&record.kind===recipe.qualificationKind),`DOCUMENTATION_TOOL_QUALIFICATION_MISSING: ${source}`);
  for(const [source,kind]of Object.entries(reviewedDocumentationPurposeRoutes))if((boundary.sources??[]).includes(source))assert(routes.some(record=>record.source===source&&record.kind===kind),`DOCUMENTATION_TOOL_PURPOSE_ROUTE_MISSING: ${source}`);
  // Public executable transfers exist independently of metadata exemptions.
  // Build their complete canonical closure even in an ordinary checkout, and
  // reject unresolved loader custody instead of silently losing its outputs.
  if(!records.length){const graph=documentationModuleGraph(root,packageBytes,boundary);documentationModuleInputAuthority(root,boundary,graph);return;}
  for(const record of records)assert(fs.existsSync(path.join(root,record.source))&&hash(fs.readFileSync(path.join(root,record.source)))===record.sha256,`DOCUMENTATION_TOOL_QUALIFICATION_SOURCE_DRIFT: ${record.source}; renewed source review is required`);
  const graph=documentationModuleGraph(root,packageBytes,boundary),entries=documentationEntryPoints(JSON.parse(packageBytes).scripts??{},true,root);
  const inputAuthorityKey=documentationModuleInputAuthority(root,boundary,graph);
  // Purpose data and role receipts are separate from module-graph inputs.
  // Reacquire them even when the graph/registry qualification is warm.
  for(const record of records)if(record.kind!=='static-receiver-descriptions/v1'){assertDocumentationOwnerPurpose(root,record.source);assertDocumentationExecutableRole(root,record.source);}
  const qualificationKey=hash(JSON.stringify([graph.inputKey,inputAuthorityKey,boundary]));if(documentationQualificationCache.get(root)===qualificationKey)return;
  const docsReachable=new Set(entries.map(entry=>entry.source));
  addReaderArtifactExternalCiSeed(assertReaderArtifactExternalCiPurpose(root),graph,docsReachable);
  addPublicationExampleChildSeed(assertPublicationExampleChildPurpose(root),graph,docsReachable);
  let changed=true;
  while(changed){changed=false;for(const edge of graph.edges)if(docsReachable.has(edge.source)&&!docsReachable.has(edge.target)){docsReachable.add(edge.target);changed=true;}}
  for(const record of records) {
    const source=record.source,file=path.join(root,source);
    const purposeRoute=routes.includes(record),consumerRecipe=documentationExecutableRoleRecipes[source];
    assert(boundary.sources.includes(source)&&fs.existsSync(file),`DOCUMENTATION_TOOL_QUALIFICATION_SOURCE_DRIFT: ${source}`);
    const bytes=fs.readFileSync(file);
    if(purposeRoute){
      assert(reviewedDocumentationPurposeRoutes[source]===record.kind&&consumerRecipe?.role==='documentation-consumer',`DOCUMENTATION_TOOL_PURPOSE_ROUTE_UNQUALIFIED: ${source}`);
      assertDocumentationExecutableRole(root,source);
    }else if(record.kind==='reviewed-documentation-consumer/v1'){
      assert(consumerRecipe?.qualificationKind===record.kind&&consumerRecipe.sourceSha256===hash(bytes),`DOCUMENTATION_TOOL_PURPOSE_SOURCE_DRIFT: ${source}`);
      assertDocumentationExecutableRole(root,source);
    }else{
      assert(record.kind==='static-receiver-descriptions/v1',`DOCUMENTATION_TOOL_QUALIFICATION_SOURCE_DRIFT: ${source}`);
      assert(staticReceiverSourceAuthorities[source]===hash(bytes),`DOCUMENTATION_TOOL_STATIC_SOURCE_ROLE_UNQUALIFIED: ${source}; registry refresh cannot authorize changed static Source behavior`);
    }
    assert.equal(hash(bytes),record.sha256,`DOCUMENTATION_TOOL_QUALIFICATION_SOURCE_DRIFT: ${source}; renewed source review is required`);
    assert.deepEqual(producerAdapterOperationRecipe(source,bytes.toString()),record.operationRecipe,`DOCUMENTATION_TOOL_QUALIFICATION_OPERATION_DRIFT: ${source}; a digest refresh does not qualify a changed operation`);
    const ancestors=new Set([source]);changed=true;
    while(changed){changed=false;for(const edge of graph.edges)if(ancestors.has(edge.target)&&!ancestors.has(edge.source)){ancestors.add(edge.source);changed=true;}}
    for(const alias of graph.aliases)assert(![...ancestors].some(ancestor=>ancestor===alias.target||alias.directory&&ancestor.startsWith(alias.target+'/'))||ancestors.has(alias.source),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; symlink ${alias.source}`);
    if(purposeRoute&&(record.kind==='uninvoked-primary-source-locator-analysis/v1'||source==='scripts/docs-reader/serve.mjs'&&record.kind==='manual-reader-preview-with-external-ci-fixtures/v1')){
      // No selected root-package command or selected importing ancestor. This
      // does not claim global non-invocation: the locator has direct CI use;
      // the exact preview has documented manual/CI-fixture callers bound by
      // fresh Source-owned purpose inputs before either cache. No fake entry.
      // A newly selected import or root-package entry requires Source review.
      assert(ancestors.size===1&&!entries.some(entry=>entry.source===source),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; selected root-package/module-graph consumer added`);
    }else if(reviewedDocumentationOwnerPurposes[source]){assertDocumentationOwnerAncestry(root,source,ancestors,docsReachable,documentationEntryPoints(JSON.parse(packageBytes).scripts??{},false,root));}else for(const consumer of ancestors)assert(docsReachable.has(consumer),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; ${consumer}`);
    for(const entry of documentationEntryPoints(JSON.parse(packageBytes).scripts??{},false,root))if(!entry.name.startsWith('docs:')&&!entry.name.startsWith('verify:docs:'))assert(!ancestors.has(entry.source)||source===entry.source&&documentationOwnerNativeEntryMatches(source,entry),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; package invocation ${entry.name}`);
    const packageDefinition=JSON.parse(packageBytes);
    function publicTargets(value){return typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(publicTargets):[];}
    for(const target of [...publicTargets(packageDefinition.bin),...publicTargets(packageDefinition.exports),...publicTargets(packageDefinition.main)]) {
      const selected=path.posix.normalize(target.replace(/^\.\//u,'')),absolute=path.join(root,selected);
      const canonical=fs.existsSync(absolute)?path.relative(root,fs.realpathSync(absolute)).replaceAll(path.sep,'/'):selected;
      assert(!ancestors.has(canonical),`DOCUMENTATION_TOOL_PUBLIC_CONSUMER_UNQUALIFIED: ${source}; package public target ${target}`);
    }
    const actualEdges=graph.edges.filter(edge=>ancestors.has(edge.target)).sort(documentationEdgeOrder);
    assert.deepEqual(actualEdges,[...record.graphEdges].sort(documentationEdgeOrder),`DOCUMENTATION_TOOL_QUALIFICATION_GRAPH_DRIFT: ${source}; reviewed dependency transfers changed`);
    const actualEntries=entries.filter(entry=>ancestors.has(entry.source));
    assert.deepEqual(actualEntries,record.documentationEntries,`DOCUMENTATION_TOOL_QUALIFICATION_GRAPH_DRIFT: ${source}; documentation invocation authority changed`);
    const selectedStem=path.posix.basename(source).replace(/\.[^.]+$/u,'');
    const relevantDynamics=graph.dynamicOperations.filter(operation=>ancestors.has(operation.source)||operation.hints.some(hint=>{const basename=path.posix.basename(hint);return basename&&selectedStem.startsWith(basename.replace(/\.[^.]+$/u,''));}));
    assert.deepEqual(relevantDynamics,record.dynamicGraphOperations??[],`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unresolved dependency operation or caller changed`);
    // A new runtime-selected loader can reach this source without mentioning its
    // name. Freeze the full unresolved-loader inventory, including operation
    // custody, rather than granting an exclusion based on literal hints alone.
    const unresolvedOperations=graph.dynamicOperations.map(({source,expression,operation,hints})=>({source,expression,operationSha256:hash(operation),hints}));
    assert.deepEqual(unresolvedOperations,record.unresolvedModuleOperations??[],`DOCUMENTATION_TOOL_GRAPH_UNQUALIFIED: ${source}; unresolved module consumer inventory changed`);
  }
  documentationQualificationCache.set(root,qualificationKey);
}
function nodeOutputExecutableSources(root) {
  const packageFile=path.join(root,'package.json'),packageBytes=fs.existsSync(packageFile)?fs.readFileSync(packageFile):Buffer.from('{}');
  const registry=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  const boundary=fs.existsSync(registry)?JSON.parse(fs.readFileSync(registry,'utf8')).documentationToolBoundary??{}:{};
  return documentationModuleGraph(root,packageBytes,boundary).executableSources;
}
// Read-only analysis metadata, not an admission receipt or execution authority.
// Keep cache objects private: callers receive frozen copied graph surfaces.
export function discoverScriptInputGraph(root) {
  nodeOutputExecutableSources(root);
  const graph=documentationGraphCache.get(root);
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  return freeze(JSON.parse(JSON.stringify({closureSources:graph.closureSources,edges:graph.edges,publicEntries:graph.publicEntries})));
}
// Unaccepted analysis DATA only. This is not a role, module, output or native
// execution receipt. Preserve the original graph/entry acquisition and guards;
// the actual owner still independently checks every qualification record.
export function discoverScriptInputAcquisition(root) {
  const packageFile=path.join(root,'package.json');
  const packageBytes=fs.existsSync(packageFile)?fs.readFileSync(packageFile):Buffer.from('{}');
  const registryFile=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  const registryBytes=fs.existsSync(registryFile)?fs.readFileSync(registryFile):Buffer.from('{}');
  const boundary=JSON.parse(registryBytes).documentationToolBoundary??{};
  const graph=documentationModuleGraph(root,packageBytes,boundary);
  const scripts=JSON.parse(packageBytes).scripts??{};
  const value={
    protocol:'docs-script-input-acquisition-data-v1',status:'UNACCEPTED_DATA',
    packageSha256:hash(packageBytes),registrySha256:hash(registryBytes),
    inputKey:graph.inputKey,closureSources:graph.closureSources,
    executableSources:graph.executableSources,
    edges:graph.edges,aliases:graph.aliases,publicEntries:graph.publicEntries,
    dynamicOperations:graph.dynamicOperations,
    resolutionOnlyOperations:graph.resolutionOnlyOperations,
    dependencyPaths:graph.dependencyPaths,
    parserProvenance:graph.parserProvenance,
    installedFoundationDependencies:graph.installedFoundationDependencies,
    installedFoundationDependencyPaths:graph.installedFoundationDependencyPaths,
    documentationEntries:documentationEntryPoints(scripts,true,root),
    packageEntries:documentationEntryPoints(scripts,false,root),
  };
  const freeze=item=>{if(item&&typeof item==='object'){Object.values(item).forEach(freeze);Object.freeze(item);}return item;};
  return freeze(JSON.parse(JSON.stringify(value)));
}
function publicNodeSourceContexts(root,source,context) {
  const graph=documentationGraphCache.get(root),contexts=[context];
  for(const entry of graph?.publicEntries??[])if(entry.path!==entry.canonicalSource) {
    const reachable=new Set([entry.canonicalSource]);let changed=true;
    while(changed){changed=false;for(const edge of graph.edges)if(reachable.has(edge.source)&&!reachable.has(edge.target)){reachable.add(edge.target);changed=true;}}
    if(reachable.has(source))contexts.push({...context,path:entry.path,canonicalSource:source,
      entrySource:entry.canonicalSource,entrySourceDigest:hash(fs.readFileSync(path.join(root,entry.canonicalSource)))});
  }
  return contexts;
}
function documentationToolSources(root) {
  const file=path.join(root,'package.json');
  const packageBytes=fs.existsSync(file)?fs.readFileSync(file):Buffer.from('{}');const scripts=JSON.parse(packageBytes).scripts??{};const result=new Set();const queue=[];const registryFile=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const boundary=fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')).documentationToolBoundary??{}:{};const qualifiedBoundary=new Set(boundary.sources??[]);
  assertDocumentationToolQualifications(root,boundary,packageBytes);
  for(const entry of documentationEntryPoints(scripts,true,root))queue.push(entry.source);
  while(queue.length){const source=queue.pop();if(result.has(source)||!qualifiedBoundary.has(source)||!fs.existsSync(path.join(root,source)))continue;result.add(source);const bytes=fs.readFileSync(path.join(root,source),'utf8');for(const helper of bytes.matchAll(/new URL\('\.\/(docs-[A-Za-z0-9_-]+\.(?:py|go))',import\.meta\.url\)/gu)){const target=path.posix.join(path.dirname(source),helper[1]);if(qualifiedBoundary.has(target))result.add(target);}for(const match of bytes.matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/gu)){const target=path.posix.normalize(path.posix.join(path.dirname(source),match[2]));if(/^scripts\/docs-[^/]+\.mjs$/u.test(target))queue.push(target);}}
  for(const record of boundary.qualifications??[])result.add(record.source);
  for(const record of boundary.purposeRoutes??[])result.add(record.source);
  for(const source of [...result].reverse())assertDocumentationExecutableRole(root,source,new Set((boundary.qualifications??[]).filter(record=>record.kind==='static-receiver-descriptions/v1').map(record=>record.source)));
  return result;
}
// Two exact existing MNT004 protocols, not source/module exemptions.
// Imported-state observations retain UNKNOWN and no dependency/effect authority.
const reviewedCliStaticAstProtocols = Object.freeze({
  "root": "/home/node/.openclaw/workspace/kubeclaw-pr13-recovery",
  "producerDirectory": "scripts/lib/cli",
  "fixedInputs": [
    {
      "path": "scripts/lib/cli/cli-native-driver.mjs",
      "sha256": "ea2104b5a7ec4dfdee7b5c48a4ef21d330ca2100c82b6b3407019b4ac4df5f5a"
    },
    {
      "path": "scripts/docs-inventory.mjs",
      "sha256": "14b898112d48b29fb6ae66f1a455d48db565e67b36e18503cc05f2c37ffd799c"
    },
    {
      "path": "scripts/lib/cli/typed-cli-ast.mjs",
      "sha256": "d4ad0857158d5676472568b3032a200109015854b90238eecdc5c01702794299"
    },
    {
      "path": "scripts/lib/cli/cli-semantic-composition.mjs",
      "sha256": "54a091b9556b14f677b588d77175511a054e255280cf7643d6bbcfdcd9fc7a1d"
    },
    {
      "path": "scripts/lib/cli/cli-source-model.mjs",
      "sha256": "8bb0840f8cdb58ef4be04ebdc194aab2b2cb9b1c7250b333bc5b43d47f983792"
    },
    {
      "path": "package.json",
      "sha256": "0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef"
    },
    {
      "path": "package-lock.json",
      "sha256": "9a75a764e3a27a2163736ec097e99b305a05d9ec2748cb7e38a19b8f88d7fafe"
    },
    {
      "path": "versions.json",
      "sha256": "04281d9b2addd93073bd548293ea9ba6e1d88c2a18fff0f34cbdbc14ca7fe2c1"
    },
    {
      "path": "scripts/docs-api-python-output-adapter.py",
      "sha256": "48ca523a3385bc1c9a1e166b1f2aa41c7d47d3d2ecd16da92f39da8ac65b2c2b"
    },
    {
      "path": "scripts/docs-api-python-ast-v1.py",
      "sha256": "8ad32b060c582612b70824705a8199d8c57a0305dc45692068da307aa55e4c53"
    },
    {
      "path": "scripts/docs-api-go-output-role-adapter.go",
      "sha256": "a519b565ac0f821489d9c31743f3febefd065ba3e95e767909a7e9caeef792d4"
    },
    {
      "path": "scripts/lib/cli/python_cli_ast.py",
      "sha256": "5c76a87bb3c9725086daa28e8a06cf2849e4107f1d2c035b5fd8a202f8a4b2a3"
    },
    {
      "path": "scripts/lib/cli/go_cli_ast.go",
      "sha256": "ef7c1ced42aeb627626e7fdb39c47b306cf8d69f1be79fa0f8572ad494b3e948"
    }
  ],
  "profiles": {
    "python": {
      "source": "scripts/lib/cli/python_cli_ast.py",
      "sourceSha256": "5c76a87bb3c9725086daa28e8a06cf2849e4107f1d2c035b5fd8a202f8a4b2a3",
      "completeObservedDescriptors": [
        {
          "line": 304,
          "function": "main",
          "expression": "json.dump({'sources': [extract_source(x) for x in request['sources']]}, sys.stdout, ensure_ascii=False)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "247893f64135cb00244c779335d93030acf4bb7cb4abaf802d1b1145762b2833",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": null,
          "sourcePath": null
        },
        {
          "line": 3,
          "function": "<module>",
          "expression": "import ast",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 4,
          "function": "<module>",
          "expression": "import copy",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 47,
          "function": "<module>",
          "expression": "import sysconfig",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 29,
          "function": "qualify_argparse_stdlib_source",
          "expression": "getattr(classes.get(cls), 'body', [])",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "b738d63291aa60969909c014af6dcff2f686d3d56299345d44542e6345bf6fc5",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 291,
          "function": "statements",
          "expression": "getattr(node, field, None)",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "2bb69afdc9f7e12c910cbcd5604c0051a6f8b8b71d424ea7c269618c6adc3b23",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 77,
          "function": "site",
          "expression": "type(ancestor).__name__",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "85340726c670cc99f51541cc295f6fc1e407cd89248c66d6d780b3433fbb66f7",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 77,
          "function": "site",
          "expression": "type(ancestor).__name__",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "85340726c670cc99f51541cc295f6fc1e407cd89248c66d6d780b3433fbb66f7",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        }
      ],
      "serializerDescriptors": [
        {
          "line": 304,
          "function": "main",
          "expression": "json.dump({'sources': [extract_source(x) for x in request['sources']]}, sys.stdout, ensure_ascii=False)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "247893f64135cb00244c779335d93030acf4bb7cb4abaf802d1b1145762b2833",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": null,
          "sourcePath": null
        }
      ],
      "unqualifiedStateObservations": [
        {
          "line": 3,
          "function": "<module>",
          "expression": "import ast",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 4,
          "function": "<module>",
          "expression": "import copy",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 47,
          "function": "<module>",
          "expression": "import sysconfig",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 29,
          "function": "qualify_argparse_stdlib_source",
          "expression": "getattr(classes.get(cls), 'body', [])",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "b738d63291aa60969909c014af6dcff2f686d3d56299345d44542e6345bf6fc5",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 291,
          "function": "statements",
          "expression": "getattr(node, field, None)",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "2bb69afdc9f7e12c910cbcd5604c0051a6f8b8b71d424ea7c269618c6adc3b23",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 77,
          "function": "site",
          "expression": "type(ancestor).__name__",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "85340726c670cc99f51541cc295f6fc1e407cd89248c66d6d780b3433fbb66f7",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        },
        {
          "line": 77,
          "function": "site",
          "expression": "type(ancestor).__name__",
          "role": "unknown",
          "gap": "imported-capability-state-unqualified",
          "operationSha256": "85340726c670cc99f51541cc295f6fc1e407cd89248c66d6d780b3433fbb66f7",
          "dependencyFactsDigest": null,
          "authorityQualified": null,
          "serializationProtocol": "docs-python-ast-v1",
          "sourceIdentity": "scripts/lib/cli/python_cli_ast.py",
          "sourcePath": null
        }
      ]
    },
    "go": {
      "source": "scripts/lib/cli/go_cli_ast.go",
      "sourceSha256": "ef7c1ced42aeb627626e7fdb39c47b306cf8d69f1be79fa0f8572ad494b3e948",
      "completeObservedDescriptors": [
        {
          "line": 367,
          "function": "main",
          "expression": "fmt.Fprintln(os.Stderr, err)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        },
        {
          "line": 376,
          "function": "main",
          "expression": "json.NewEncoder(os.Stdout).Encode(out)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        },
        {
          "line": 376,
          "function": "main",
          "expression": "json.NewEncoder(os.Stdout)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        },
        {
          "line": 377,
          "function": "main",
          "expression": "fmt.Fprintln(os.Stderr, err)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        }
      ],
      "serializerDescriptors": [
        {
          "line": 367,
          "function": "main",
          "expression": "fmt.Fprintln(os.Stderr, err)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        },
        {
          "line": 376,
          "function": "main",
          "expression": "json.NewEncoder(os.Stdout).Encode(out)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        },
        {
          "line": 376,
          "function": "main",
          "expression": "json.NewEncoder(os.Stdout)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        },
        {
          "line": 377,
          "function": "main",
          "expression": "fmt.Fprintln(os.Stderr, err)",
          "role": "unknown",
          "gap": null,
          "operationSha256": "74059d50d4e1a0c404cea63259a647c43e83f649e7e096919632ab15cbc5515c",
          "dependencyFactsDigest": "8d0958b87330d488732a45f4d8da80f87ca59e92b05879a836a43df8b8fcafb7",
          "authorityQualified": true,
          "serializationProtocol": null,
          "sourceIdentity": null,
          "sourcePath": "scripts/lib/cli/go_cli_ast.go"
        }
      ],
      "unqualifiedStateObservations": []
    }
  }
});
function cliStaticAstDescriptor(root, output) {
 const dependencies=output.dependencies?.map(fact=>({...fact,path:path.relative(root,fact.path)}));
 return {line:output.line,function:output.function,expression:output.expression,role:output.role,gap:output.gap??null,
  operationSha256:hash(output.operation??''),dependencyFactsDigest:dependencies?hash(JSON.stringify(dependencies)):null,
  authorityQualified:output.authorityQualified??null,serializationProtocol:output.serializationProtocol??null,
  sourceIdentity:output.sourceIdentity&&path.isAbsolute(output.sourceIdentity)&&path.join(root,path.relative(root,output.sourceIdentity))===output.sourceIdentity?path.relative(root,output.sourceIdentity):output.sourceIdentity??null,
  sourcePath:output.path&&path.join(root,path.relative(root,output.path))===output.path?path.relative(root,output.path):output.path??null};
}
function assertCliStaticAstSourcePurpose(root, source) {
 const r=reviewedCliStaticAstProtocols,p=Object.values(r.profiles).find(p=>p.source===source);
 assert(p,'CLI_STATIC_AST_PROTOCOL_UNQUALIFIED: source');
 assert((root===r.root||(root==='/home/node/.openclaw/workspace/tmp/pr13-gov-mnt-practical-reader-61c0a550'&&fs.realpathSync(root)===root))&&process.cwd()===root&&fs.realpathSync(root)===root,'CLI_STATIC_AST_PROTOCOL_UNQUALIFIED: canonical root/cwd');
 for(const input of r.fixedInputs){const file=path.join(root,input.path);assert(fs.existsSync(file)&&fs.realpathSync(file)===file&&fs.lstatSync(file).isFile()&&hash(fs.readFileSync(file))===input.sha256,'CLI_STATIC_AST_PROTOCOL_UNQUALIFIED: bound input '+input.path);}
 const graph=documentationGraphCache.get(root);
 assert(graph?.installedFoundationDependencies?.some(d=>d.capabilityKind==='cli-native-static-compiler-require'),'CLI_STATIC_AST_PROTOCOL_UNQUALIFIED: existing injected compiler/caller route');
 assertCliNativeCompilerGraphPurpose(root,graph);
 return p;
}
function assertCliStaticAstOutputVector(root, source, outputs) {
 const p=assertCliStaticAstSourcePurpose(root,source);
 assert.deepEqual(outputs.map(output=>cliStaticAstDescriptor(root,output)),p.completeObservedDescriptors,'CLI_STATIC_AST_PROTOCOL_UNQUALIFIED: complete raw descriptor vector');
 return p;
}
function assertNativeSerializationRoles(root,source,bytes,language) {
  const authority=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  const contracts=fs.existsSync(authority)?JSON.parse(fs.readFileSync(authority,'utf8')).nativeLanguageSerializationContracts??[]:[];
  const nativeOutputs=contracts.filter(record=>record.source===source&&record.language===language).flatMap(record=>record.outputs??[]);
  if(language==='Python'){
    const parsed=spawnSync('python3',[new URL('./docs-api-python-output-adapter.py',import.meta.url).pathname,path.join(root,source),'--classify'],{encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(parsed.status,0,`API_PRODUCT_PYTHON_SERIALIZATION_PARSE_FAILED: ${source}: ${parsed.stderr}`);
    const outputs=JSON.parse(parsed.stdout);
    const cliProtocol=source==='scripts/lib/cli/python_cli_ast.py'?assertCliStaticAstOutputVector(root,source,outputs):null;
    // These are retained diagnostic observations, never serializer contracts.
    const cliUnqualifiedState=output=>cliProtocol&&output.role==='unknown'
      &&output.gap==='imported-capability-state-unqualified'
      &&cliProtocol.unqualifiedStateObservations.some(expected=>JSON.stringify(expected)===JSON.stringify(cliStaticAstDescriptor(root,output)));
    assert(outputs.every(output=>output.serializationProtocol==='docs-python-ast-v1'),`API_PRODUCT_PYTHON_SERIALIZATION_PROTOCOL_UNQUALIFIED: ${source}`);
    let bootstrapAudit;
    if(source==='ops/pod/bootstrap.py'){
      const audited=spawnSync('python3',[new URL('./docs-api-python-output-adapter.py',import.meta.url).pathname,path.join(root,source),'--audit'],{encoding:'utf8',env:{PATH:process.env.PATH}});
      assert.equal(audited.status,0,`API_PRODUCT_PYTHON_PUBLIC_OUTPUT_AUDIT_FAILED: ${source}: ${audited.stderr}`);
      bootstrapAudit=JSON.parse(audited.stdout);
      assert(bootstrapAudit.serializationProtocol==='docs-python-ast-v1'&&bootstrapAudit.kind==='bootstrap-public-output-audit'&&bootstrapAudit.qualified===true&&bootstrapAudit.entryPoints?.discover===true&&bootstrapAudit.entryPoints?.secrets===true&&Array.isArray(bootstrapAudit.dependencies)&&bootstrapAudit.dependencies.length&&bootstrapAudit.dependencies.every(fact=>fact.qualified===true&&fact.symbol&&fact.operation&&/^[a-f0-9]{64}$/u.test(fact.sha256))&&JSON.stringify(bootstrapAudit.outputs)===JSON.stringify(outputs),`API_PRODUCT_PYTHON_PUBLIC_OUTPUT_FLOW_UNQUALIFIED: ${source}`);
    }
    const auditedBootstrap=output=>{
      if(!bootstrapAudit)return false;
      const flow=output.bootstrapFlow;
      return flow?.qualified===true&&flow.producerLine>0&&flow.consumerLine>0&&typeof flow.expression==='string'&&flow.expression&&((flow.kind==='config-info'&&flow.selectedEntryPoint==='discover'&&output.role==='non-api')||(flow.kind==='credential-submission'&&flow.selectedEntryPoint==='secrets'&&output.role==='api')||(flow.kind==='credential-diagnostic'&&flow.selectedEntryPoint==='secrets'&&output.role==='non-api'))&&Array.isArray(flow.dependencies)&&flow.dependencies.length&&flow.dependencies.every(fact=>fact.qualified===true&&bootstrapAudit.dependencies.some(selected=>JSON.stringify(selected)===JSON.stringify(fact)));
    };
    assert(outputs.every(output=>bootstrapAudit?auditedBootstrap(output):(cliUnqualifiedState(output)||output.role==='non-api'||output.role==='api-patch'&&output.patchReceiver?.apiVersion&&output.patchReceiver?.kind&&output.patchReceiver?.resource&&output.patchReceiver?.name&&output.patchReceiver.patchType==='json'&&Array.isArray(output.patchOperations)||nativeOutputConsumerMatches(cliProtocol?{...output,cliStaticAstOwner:source}:output,nativeOutputs,root))),`API_PRODUCT_PYTHON_SERIALIZED_OUTPUT_ROLE_UNQUALIFIED: ${source}`);
    return outputs;
  }
}
export function assertNativeProductResponseSchemaAuthority(root) {
 // The complete selected owned CRD bounds inherited pruning, receiver and
 // item-root controls. productReceipt returns the unprojected API-read map.
 // The original structural object item lists its root properties without
 // apiVersion/kind, preserve-unknown, embedded-resource or additionalProperties
 // controls at that root. The complete bytes also bind ancestors, status
 // subresource, required/nullable decisions and the actual Helm receiver.
 // Exact equality is a conservative maintenance limit,
 // never live API validation or blanket upstream authority.
   const source='charts/kubeclaw/templates/buster-namespace-lease-crd.yaml';
   const file=path.join(root,source);
   assert(fs.existsSync(file)&&hash(fs.readFileSync(file))==='5dff68d75c46476c582e8bb5d677b758574ecd1a2a0676363ef11eb188cb83f8',`API_PRODUCT_GO_HTTP_RESPONSE_SCHEMA_AUTHORITY_UNQUALIFIED: ${source}: $.status.demoProduct.decisions.items`);

}
// Complete Source-owned preflight body and exact sink grammar, not an approval
// of live bytes or effects. Its only JSON projection has four fixed non-resource
// keys; other selected outputs are labelled human diagnostics or the unchanged
// kubectl server-dry-run summary. Registry refresh cannot admit another producer.
const reviewedRuntimeAdoptionDiagnostics = {
  "source": "scripts/check-runtime-adoption-live.py",
  "sha256": "8dea018e325c287f30446c6926858b75db82a728e06a41b0a5fa07542c848741",
  "outputs": [
    {
      "function": "<module>",
      "expressionSha256": "ebf1f970ae48d4605199237752595cce5f036ae7d7904f8048eaec84fcc62020",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "95b99fe720a83d70995bb7e1d955b1be344f5f1b8c9645cbf33e1b88c7c011d3",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "dry_run_diagnostics",
      "expressionSha256": "30278aa5d7b0ab31c901046d309bb92b86d54c82011be174f02e7b0deb760c41",
      "operationSha256": "022ed2d2ab3cd81c50336e88778053609b9bc37902c5892babc4329482ab34ab"
    },
    {
      "function": "<module>",
      "expressionSha256": "4e321d19443bff11015322f0af5aa01812310c73958be3c88a077aae14d5573c",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "0a1660f82e45986bb591af0264c5f9e2024e16b2bbf34a232ddc524e3e1c17ab",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "21281cefec7b9e607ab9c685d37e62ac13f2c4eabe770a966e3325b3dc22af83",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "aeaf5658c01e2d5dbff8e8b4788296ba0d0229465d8a8632b958063fd11c73a4",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "ddb7e34918009f6fe1a75d084d1dc19c7e3a1c4e596b8e2700ae15e0be21286e",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "8734405e6aee00ccaaf6a79aaba04431b5c88fdc68053e3dc085fd61409ce56d",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    },
    {
      "function": "<module>",
      "expressionSha256": "a9cb9f2eee05848aa19471ad15ed6cf46cef43411a18d45004259369479d4cd7",
      "operationSha256": "0624f05bd46b7df122396734b267fa8460750f6b81bcc092703ee7918a3ac4d5"
    }
  ]
};
// Source AST receipts, fixed probe diagnostics and JSON-RPC transport are
// distinct from resource-object construction. Exact complete source plus each
// selected operation remains bound; external runtime effects are not approved.
const reviewedAuxiliaryPythonConsumers = {
  "scripts/lib/cli/python_cli_ast.py": {
  "source": "scripts/lib/cli/python_cli_ast.py",
  "inputClass": "private-static-cli-ast-fact-protocol",
  "sha256": "5c76a87bb3c9725086daa28e8a06cf2849e4107f1d2c035b5fd8a202f8a4b2a3",
  "cliStaticAstProtocol": true,
  "outputs": [
    {
      "function": "main",
      "expressionSha256": "fe19673755eb9bce54319a6c1b662a38b40773c49b819ae4ab80cb90b58bccbb",
      "operationSha256": "247893f64135cb00244c779335d93030acf4bb7cb4abaf802d1b1145762b2833"
    }
  ]
},
  "scripts/docs-api-python-ast-v1.py": {
    "source": "scripts/docs-api-python-ast-v1.py",
    "inputClass": "finite-source-ast-receipt-protocol",
    "sha256": "8ad32b060c582612b70824705a8199d8c57a0305dc45692068da307aa55e4c53",
    "outputs": [
      {
        "function": "<module>",
        "expressionSha256": "1f8873ef2fb305c140185941734989e5a3eebc7931f75774bcd5b2bfab1265f0",
        "operationSha256": "c9ddac17d51805f05d996fb786518c1ae434a3f774b6a420881d7b29f238fdbc"
      },
      {
        "function": "<module>",
        "expressionSha256": "5d85f92d48bf31908af966b99f2bfddc80c49fa6949eb540a05f2deab5c7ef7c",
        "operationSha256": "c9ddac17d51805f05d996fb786518c1ae434a3f774b6a420881d7b29f238fdbc"
      },
      {
        "function": "<module>",
        "expressionSha256": "7e2b36d7ff4507ef86d0c699f545ffe596952685e8abbad9cb744f1f2d669372",
        "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      },
      {
        "function": "documentation_custody",
        "expressionSha256": "4e5a0ffecb92abe78d13d782248912e51eb5f4b3023f0cfe6e9edbaf7b979b3c",
        "operationSha256": "2920a84132b5d1ff4f96f847c3d36ee94150dc7c250c18cd68d5b09e9b92f090"
      },
      {
        "function": "emit",
        "expressionSha256": "f0d6dc549d5beadbcfa81551a553b9209a3780827339e06ddfc632c902057c17",
        "operationSha256": "687afaa6831c5a134d23182941e24ebaf833ece5d7fd29a389e253fbb7877bc0"
      },
      {
        "function": "emit",
        "expressionSha256": "9d0ccc67e84d7ab645f03cb5f6427cce53cc77511b5ff2bf9a042128f0ccfc3a",
        "operationSha256": "687afaa6831c5a134d23182941e24ebaf833ece5d7fd29a389e253fbb7877bc0"
      },
      {
        "function": "emit",
        "expressionSha256": "f0d6dc549d5beadbcfa81551a553b9209a3780827339e06ddfc632c902057c17",
        "operationSha256": "687afaa6831c5a134d23182941e24ebaf833ece5d7fd29a389e253fbb7877bc0"
      },
      {
        "function": "emit",
        "expressionSha256": "8038d5ee324845049e26ed58609a16ecdd34ce380abf586cc799ac3147d85e03",
        "operationSha256": "687afaa6831c5a134d23182941e24ebaf833ece5d7fd29a389e253fbb7877bc0"
      }
    ]
  },
  "scripts/verify-cilium-policies.py": {
    "source": "scripts/verify-cilium-policies.py",
    "inputClass": "existing-source-bound-policy-probe-diagnostics",
    "sha256": "7ea64cab58c312f8de2bcca8c804641f7e6ae117779ae6ca8ae1e30b0be67b22",
    "outputs": [
      {
        "function": "verify",
        "expressionSha256": "1293efbeff774fa9268538162b9443046da6af213f15140eb68a39abc4e89840",
        "operationSha256": "d636ae331dc576d96e6b2f2691b6191da14460458acbbfde42c3cde6c3c607bb"
      },
      {
        "function": "verify",
        "expressionSha256": "4f8d7616ffa320fd0353155c607a7e6ac494aac801bae476d5e6c11eebaceef6",
        "operationSha256": "d636ae331dc576d96e6b2f2691b6191da14460458acbbfde42c3cde6c3c607bb"
      },
      {
        "function": "<module>",
        "expressionSha256": "1ba25a0ad00c4511b591046805e6342b82d740583998a6e7a79a83be33fa67bf",
        "operationSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    ]
  },
  "ops/pod/verify.py": {
    "source": "ops/pod/verify.py",
    "inputClass": "loopback-mcp-jsonrpc-envelope",
    "sha256": "8ab65fbcaf4fa7c381a3811eb594e7092d1a7d652934aa2e52205921910d2d71",
    "outputs": [
      {
        "function": "call",
        "expressionSha256": "95de4f5f4403075e67200656351228ffec8511b0ba57d16736cea660c6aff103",
        "operationSha256": "64e486f993d95b4770a01421c17bdbcd07156f0deacf0e5fb02b68fdb2e5bf66"
      }
    ]
  }
};
export function runtimeAdoptionManifestInputAuthority(root,source,bytes) {
 const recipe=reviewedRuntimeAdoptionDiagnostics,file=path.join(root,source);
 if(source!==recipe.source||hash(bytes)!==recipe.sha256||!fs.existsSync(file)
   ||fs.realpathSync(file)!==path.resolve(file)||hash(fs.readFileSync(file))!==recipe.sha256)return null;
 // This program consumes a caller-selected exported manifest; it never
 // constructs that manifest. Do not invent current repository API objects
 // from externally selected receipt/resource bytes or execute this live check.
 return Object.freeze({source,inputClass:'external-exported-manifest-server-dry-run-consumer',
  receiptSelector:'Path(__file__).resolve().parent.parent / sys.argv[1] / bundle.receipt',
  manifestSelector:"root / group['path'] / resources.yaml; groups come from the selected receipt",
  request:'kubectl [--context KUBE_CONTEXT] apply --dry-run=server -f selectedManifest',
  limits:'Absolute paths, traversal, symlinks and mutable receipt/manifest bytes are not confined or attested by this script; server dry-run does not certify absence of external admission effects.',
  metadataOnly:true,runtimeExecutionAuthorized:false,runtimeInputBytesQualified:false,
  selectedManifestIsRepositorySource:false});
}
export function nativeOutputConsumerMatches(output,contracts,root) {
 // Digests only invalidate reviewed facts. A role also requires the actual
 // operation to satisfy its consumer grammar; a generic diagnostic label does
 // not authorize a new root, writer, HTTP client or output argument.
 if(output.transportBodyQualified===false||output.authorityQualified===false)return false;
 function nativeHttpResponseRecipe(){
  // These are selected, inspected router/response constructor declarations,
  // not a source-module exemption. The routers return the ready envelope,
  // product-subjects envelope, or the persisted decision receipt. A refreshed
  // registry digest cannot authorize a replacement constructor or new route.
  if(output.function==='productHandler')assertNativeProductResponseSchemaAuthority(root);
  const routers={productHandler:'e6207009937c85a6c20f24b4c4325afec71d8674fcfd37a442f4ff89cb6f7905',readinessHandler:'fc9bb294ed751512a810cde45e4e329da27e0f4a5dc637a69dffe59d6b71d73e'};
  const constructors={commitProduct:'9db306489982efa4fcb213ee4caa1bfef05175192f077394afa91ba94bc7785d',productReceipt:'093407fbd5fa71a9de7898572aea6a12558779a0782c8c8fcd9cea0502716a3e',productRecords:'53b4c7b8218adbf86e8812eccc803314c5376925c7ab51e6afcf26a2bb3ff1bd',productSubject:'d6ae13944edccd2862149794296a5f0424f9fc69d6863c4e34da06dfcf687da1'};
  if(output.function==='readinessHandler')constructors.readyResponse='c337ca7727f6328352cf424c29e619f67b6d009806a7789de10a7048b4bd04c1';
  return routers[output.function]===hash(output.operation)&&Object.entries(constructors).every(([symbol,sha256])=>output.dependencies?.some(fact=>fact.symbol===symbol&&fact.sha256===sha256));
 }
 function nativeTransportRecipe(kind,operation) {
  // These closed transfer recipes preserve the selected body through JSON
  // encoding and request construction. Incoming bodies are qualified by the
  // AST adapter separately. Adding a replacement body/request invalidates this
  // grammar even if every registry digest is refreshed.
  const payload=`func requestPayload(body interface{}) (io.Reader, error) {
   if body == nil { return nil, nil }
   data, err := json.Marshal(body)
   if err != nil { return nil, err }
   return bytes.NewReader(data), nil
  }`;
  const request=`func (c *controller) kube(ctx context.Context, method string, path string, body interface{}, contentType string, out interface{}) error {
   payload, err := requestPayload(body)
   if err != nil { return err }
   req, err := http.NewRequestWithContext(ctx, method, c.apiURL+kubePath(path), payload)
   if err != nil { return err }
   token, err := os.ReadFile(c.tokenPath)
   if err != nil { return fmt.Errorf("read Kubernetes ServiceAccount token: %w", err) }
   credential := strings.TrimSpace(string(token))
   if credential == "" { return errors.New("Kubernetes ServiceAccount token is empty") }
   req.Header.Set("Authorization", "Bearer "+credential)
   req.Header.Set("Accept", "application/json")
   if body != nil { req.Header.Set("Content-Type", contentType) }
   resp, err := c.httpClient.Do(req)
   if err != nil { return err }
   defer resp.Body.Close()
   responseBody, err := io.ReadAll(resp.Body)
   if err != nil { return err }
   if err := kubeResponseError(resp.StatusCode, responseBody); err != nil { return err }
   if out == nil || len(responseBody) == 0 { return nil }
   return json.Unmarshal(responseBody, out)
  }`;
  const compact=value=>value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\s+|;/gu,token=>/^["'`]/u.test(token)?token:'');
  return compact(operation)===compact(kind==='go-kubernetes-payload'?payload:request);
 }
 function semanticConsumer(consumer){
  const expression=output.expression,operation=output.operation??'';
  const resultName=operation.match(new RegExp(`\\b([A-Za-z_][A-Za-z0-9_]*)\\s*,[^\\n]*:?=\\s*${expression.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}`,'u'))?.[1];
  const external=/\b(?:os\.Args|os\.Getenv|os\.Stdin|sys\.argv|input\(|eval\(|exec\()/u.test(expression);
  if(external)return false;
  switch(consumer.kind){
   case 'python-source-owned-auxiliary-protocol':{
    const recipe=reviewedAuxiliaryPythonConsumers[consumer.source];if(!recipe)return false;
    if(recipe.cliStaticAstProtocol){if(output.gap||output.cliStaticAstOwner!==recipe.source)return false;assertCliStaticAstSourcePurpose(root,recipe.source);}
    const file=path.join(root,recipe.source);
    return output.role==='unknown'&&fs.existsSync(file)&&fs.realpathSync(file)===path.resolve(file)
      &&hash(fs.readFileSync(file))===recipe.sha256
      &&recipe.outputs.some(selected=>selected.function===output.function
        &&selected.expressionSha256===hash(output.expression)&&selected.operationSha256===hash(operation));
   }
   case 'python-runtime-adoption-diagnostic':{
    const recipe=reviewedRuntimeAdoptionDiagnostics,file=path.join(root,recipe.source);
    return output.role==='unknown'&&consumer.source===recipe.source&&fs.existsSync(file)
      &&fs.realpathSync(file)===path.resolve(file)&&hash(fs.readFileSync(file))===recipe.sha256
      &&recipe.outputs.some(selected=>selected.function===output.function
        &&selected.expressionSha256===hash(output.expression)&&selected.operationSha256===hash(operation));
   }
   case 'go-cli-static-ast-protocol':{
    if(consumer.source!=='scripts/lib/cli/go_cli_ast.go'||output.role!=='unknown'||output.authorityQualified!==true)return false;
    const profile=assertCliStaticAstSourcePurpose(root,consumer.source);
    return profile.completeObservedDescriptors.some(expected=>JSON.stringify(expected)===JSON.stringify(cliStaticAstDescriptor(root,output)));
   }
   case 'go-error-stderr':return output.diagnosticQualified===true&&output.authorityQualified===true&&/^fmt\.Fprintln\(os\.Stderr, err(?:\.Error\(\))?\)$/u.test(expression)&&/if (?:[^\n]+;\s*)?err != nil\s*\{/u.test(operation)&&consumer.errorOrigins?.some(origin=>operation.includes(origin))&&/os\.Exit\(1\)/u.test(operation);
   case 'go-digest':return /^json\.Marshal\(/u.test(expression)&&/sha256\.Sum256\(/u.test(operation)&&resultName&&new RegExp(`(?:Sum256|Transform)\\(${resultName}\\)`, 'u').test(operation);
   case 'go-equality':return /^json\.Marshal\(/u.test(expression)&&resultName&&(new RegExp(`bytes\\.Equal\\([^)]*\\b${resultName}\\b`, 'u').test(operation)||new RegExp(`string\\(${resultName}\\)\\s*(?:==|!=)|(?:==|!=)\\s*string\\(${resultName}\\)`, 'u').test(operation));
   case 'go-byte-limit':return /^json\.Marshal\(/u.test(expression)&&resultName&&new RegExp(`len\\(${resultName}\\)`, 'u').test(operation);
   case 'go-roundtrip':return /^json\.Marshal\(/u.test(expression)&&resultName&&new RegExp(`json\\.Unmarshal\\(${resultName},`, 'u').test(operation);
   case 'go-canonical-codec':return /^json\.Marshal\(/u.test(expression)&&resultName&&new RegExp(`jsoncanonicalizer\\.Transform\\(${resultName}\\)`, 'u').test(operation);
   case 'go-retention-parser':return expression==='json.Marshal(value)'&&/state\["schemaVersion"\] != "demo-readiness.v2"/u.test(operation)&&/return parseDemoRetention\(raw\)/u.test(operation);
   case 'go-rbac-projection':return expression==='json.Marshal(value)'&&/"kind": resource\["kind"\], "namespace": metadata\["namespace"\], "name": metadata\["name"\]/u.test(operation)&&/\[\]string\{"roleRef", "subjects", "rules", "aggregationRule"\}/u.test(operation)&&/return string\(encoded\)/u.test(operation);
   case 'go-log-envelope':{
    const closedLog=`func logJSON(level string, message string, detail interface{}) {
      record := map[string]interface{}{ "ts": time.Now().UTC().Format(time.RFC3339Nano), "level": level, "component": "buster-namespace-controller", "message": message, }
      if detail != nil { record["detail"] = detail }
      data, err := json.Marshal(record)
      if err != nil { fmt.Println(\`{"level":"error","component":"buster-namespace-controller","message":"failed to marshal log"}\`); return }
      fmt.Println(string(data))
    }`;
    return operation.replace(/\s+/gu,'').replaceAll(';','')===closedLog.replace(/\s+/gu,'').replaceAll(';','')&&['json.Marshal(record)','fmt.Println(string(data))','fmt.Println(`{"level":"error","component":"buster-namespace-controller","message":"failed to marshal log"}`)'].includes(expression);
   }
   case 'go-kubernetes-payload':return output.transportBodyQualified===true&&expression==='json.Marshal(body)'&&nativeTransportRecipe(consumer.kind,operation);
   case 'go-kubernetes-request':return output.transportBodyQualified===true&&expression==='c.httpClient.Do(req)'&&nativeTransportRecipe(consumer.kind,operation);
   case 'go-native-http-response':return /^json\.NewEncoder\(w\)(?:\.Encode\(result\))?$/u.test(expression)&&nativeHttpResponseRecipe()&&/w.Header\(\).Set\("Content-Type", "application\/json"\)/u.test(operation)&&/authenticate(?:Transport|Ready)\(/u.test(operation)&&/\/v1\/demo-(?:ready|product)/u.test(operation);
   case 'python-native-state':return output.nativeStateQualified===true&&(output.operation.match(/Name\(id='data', ctx=Store\(\)\)/gu)??[]).length===1&&!/attr='(?:update|setdefault|clear|pop|popitem)'/u.test(output.operation)&&!output.capabilityEscapes&&output.callerArguments?.length&&output.callerArguments.every(call=>call.positionalRoles.every(role=>role==='non-api')&&call.expandedKeys.every(keys=>keys!==null)&&!([...call.keywordNames.filter(Boolean),...call.expandedKeys.flat()].includes('apiVersion')&&[...call.keywordNames.filter(Boolean),...call.expandedKeys.flat()].includes('kind')))&&/^(?:temp.write_text\(json.dumps\(data\) \+ '\\n'\)|json.dumps\(data\))$/u.test(expression)&&operation.includes("Constant(value='phase')")&&operation.includes("Constant(value='observedAt')")&&operation.includes("Constant(value='pairingVerified')")&&operation.includes("Call(func=Attribute(value=Name(id='time', ctx=Load()), attr='time'");
   case 'python-process-exit-diagnostic':return expression==="print(f'Codex app-server failed to become ready (exit {child.poll()}).', flush=True)"&&operation.includes("Call(func=Attribute(value=Name(id='child', ctx=Load()), attr='poll'")&&operation.includes("attr='Popen'");
   case 'python-systemd-unit':return output.systemdUnitFlow?.sourcePath==='/etc/systemd/system/k3s.service'&&(expression==="(backup / 'original.service').write_text(original)"?output.systemdUnitFlow.transform==='original':expression==='staged.write_text(corrected)'&&output.systemdUnitFlow.transform==='repair'&&output.systemdUnitFlow.helperDigest==='5509c7dbc386819dacddc95719508e034aa53c583c1d8e80cb9da99d1d9faf43')&&operation.includes("Constant(value='systemd-analyze')")&&operation.includes("Constant(value='verify')")&&operation.includes("Constant(value='install')");
   default:return false;
  }
 }
 const dependencyFacts=output.dependencies?.map(fact=>({...fact,path:path.relative(root,fact.path)}));
 return contracts.some(contract=>contract.expression===output.expression&&contract.function===output.function&&contract.operationDigest===hash(output.operation)&&(!dependencyFacts||contract.dependencyFactsDigest===hash(JSON.stringify(dependencyFacts)))&&contract.consumer?.source&&contract.consumer?.purpose&&contract.consumer?.evidence?.length&&contract.consumer.evidence.every(expression=>output.operation.includes(expression))&&semanticConsumer(contract.consumer));
}
const syntheticImage = `example.invalid/discovery@sha256:${syntheticDigest}`;
export function producerAdapterOperationRecipe(source,bytes) {
  if(source.endsWith('.sh')){
    const parsed=spawnSync('python3',['-c',"import json,shlex,sys; lexer=shlex.shlex(sys.stdin.read(),posix=True,punctuation_chars=True); lexer.whitespace_split=True; print(json.dumps(list(lexer)))"],{input:bytes,encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(parsed.status,0,`API_PRODUCT_ADAPTER_OPERATION_PARSE_FAILED: ${source}: ${parsed.stderr}`);return {language:'Shell',tokens:JSON.parse(parsed.stdout)};
  }
  if(source.endsWith('.py')){
    const parsed=spawnSync('python3',[new URL('./docs-api-python-ast-v1.py',import.meta.url).pathname,'--stdin',source],{input:bytes,encoding:'utf8',env:{PATH:process.env.PATH}});
    assert.equal(parsed.status,0,`API_PRODUCT_ADAPTER_OPERATION_PARSE_FAILED: ${source}: ${parsed.stderr}`);return {language:'Python',protocol:'docs-python-ast-v1',ast:JSON.parse(parsed.stdout)};
  }
  const tree=ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true);assert(!tree.parseDiagnostics.length,`API_PRODUCT_ADAPTER_OPERATION_PARSE_FAILED: ${source}`);
  return {language:'TypeScript',statements:tree.statements.map(node=>({kind:ts.SyntaxKind[node.kind],syntax:node.getText(tree)}))};
}
export function assertProducerAdapterAuthority(root,sources) {
  if(!sources.length)return;
  const file=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  assert(fs.existsSync(file),'API_PRODUCT_ADAPTER_AUTHORITY_MISSING: documentation output adapter maintainers must classify the original operation before rendering');
  const authority=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(authority.version,1,'API_PRODUCT_ADAPTER_AUTHORITY_INVALID');
  for(const source of sources) {
    const record=authority.sources?.[source];
    assert(record?.sha256&&record.operation,`API_PRODUCT_ADAPTER_OPERATION_UNCLASSIFIED: ${source}; ${authority.owner}`);
    const actualInvocations=fs.readFileSync(path.join(root,source),'utf8').replace(/\\\n/gu,' ').split('\n').map(line=>line.trim()).filter(line=>['helm ',"'helm'",'render-','continuousDocuments','bootstrapDocuments','infrastructure','charts/'].some(token=>line.includes(token))&&!line.startsWith('//')&&!line.startsWith('#'));
    assert.deepEqual(actualInvocations,record.invocations,`API_PRODUCT_ADAPTER_INVOCATION_DRIFT: ${source}; current source invocation differs from the qualified adapter`);
    assert(record.operationRecipe,`API_PRODUCT_ADAPTER_RECIPE_MISSING: ${source}`);
    assert.deepEqual(producerAdapterOperationRecipe(source,fs.readFileSync(path.join(root,source),'utf8')),record.operationRecipe,`API_PRODUCT_ADAPTER_RECIPE_DRIFT: ${source}; actual structured operation differs from the adapter recipe`);
    assert.equal(hash(fs.readFileSync(path.join(root,source))),record.operationDigest,`API_PRODUCT_ADAPTER_OPERATION_DRIFT: ${source}; an operation review and recipe binding are required`);
    assert.equal(hash(fs.readFileSync(path.join(root,source))),record.sha256,`API_PRODUCT_ADAPTER_AUTHORITY_DRIFT: ${source}; ${authority.owner}; ${authority.closureCondition}`);
  }
}
export function walkProductSources(root, directories, accept) {
  const result = [];
  const excluded = new Set(['node_modules', 'vendor', '.git', 'dist', 'test', 'tests', 'fixtures']);
  const visited=new Set();
  function visit(relative) {
    if (!fs.existsSync(path.join(root, relative))) return;
    const real=fs.realpathSync(path.join(root,relative));assert(real===fs.realpathSync(root)||real.startsWith(fs.realpathSync(root)+path.sep),`API_PRODUCT_PUBLIC_SYMLINK_OUTSIDE_ROOT: ${relative}`);if(visited.has(real))return;visited.add(real);
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      if (excluded.has(entry.name)) continue;
      const next = `${relative}/${entry.name}`;
      if(entry.isSymbolicLink()){const absolute=path.join(root,next);assert(fs.existsSync(absolute),`API_PRODUCT_PUBLIC_SYMLINK_DANGLING: ${next}`);const real=fs.realpathSync(absolute);assert(real.startsWith(fs.realpathSync(root)+path.sep),`API_PRODUCT_PUBLIC_SYMLINK_OUTSIDE_ROOT: ${next}`);if(fs.statSync(absolute).isDirectory())visit(next);else if(fs.statSync(absolute).isFile()&&accept(next))result.push(next);}else if (entry.isDirectory()) visit(next);
      else if (entry.isFile() && accept(next)) result.push(next);
    }
  }
  directories.forEach(visit);
  return result;
}
const merge = (base, override) => {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) result[key] = value && typeof value === 'object' && !Array.isArray(value)
    ? merge(result[key] && typeof result[key] === 'object' ? result[key] : {}, value) : value;
  return result;
};

// These are render inputs, never deployment credentials or claims that these
// synthetic identities exist. The producers and ordinary checked-in overrides
// are discovered from source; profile data exercises supported optional routes.
function profiles(root, chart) {
  const read = source => {
    const documents=YAML.parseAllDocuments(fs.readFileSync(path.join(root,source),'utf8'));
    assert(documents.every(document=>!document.errors.length), `API_PRODUCT_YAML_INVALID: ${source}`);
    return documents.length===1 ? documents[0].toJS() : null;
  };
  const defaultValues = read(`${chart}/values.yaml`);
  const name = chart.split('/').at(-1);
  let baseline = {};
  if (name === 'gitops') baseline = { repository: 'https://example.invalid/discovery.git', revision: syntheticDigest.slice(0,40), project:'discovery', rootName:'discovery',
    groups:[{name:'discovery',wave:2,path:'gitops/platform/litellm',namespace:'default',helmReleases:['litellm']}], destinations:['default'],
    clusterResourceWhitelist:[{group:'',kind:'Namespace'}], namespaceResourceWhitelist:[{group:'*',kind:'*'}] };
  if (name === 'prism') baseline = { ...read(`${chart}/ci-values.yaml`), worker: merge(read(`${chart}/ci-values.yaml`).worker, {native:{namespace:'default'}}) };
  if (name === 'ops-pod') baseline = {codexImage:syntheticImage,mcpImage:syntheticImage,networkPolicy:{apiServerCIDRs:['192.0.2.1/32']}};
  const registryBinding={runtimeInfrastructure:{registry:{endpoint:'https://registry.example.invalid',transport:'https',authSecretName:'discovery-registry'}}};
  const result = [{id:'default',inputs:[],values:baseline}];
  const overlays = walkProductSources(root, ['examples','my-values','releases/values'], file=>/\.ya?ml$/u.test(file));
  for (const source of overlays) {
    const values = read(source);
    if (!values || values.apiVersion || values.kind) continue;
    const applicable = name === 'kubeclaw' ? typeof values.agentRole === 'string'
      : name === 'prism' ? /(?:^|\/)prism(?:-values)?\.yaml$/u.test(source)
        : name === 'ops-pod' ? /(?:^|\/)ops\.yaml$/u.test(source) : false;
    if (applicable) result.push({id:source,inputs:[source],values:merge(merge(values,baseline),values.extraContainers?.some(container=>container.name==='buster-v2-runtime')?registryBinding:{})});
  }
  if (name === 'kubeclaw') {
    const buster = fs.existsSync(path.join(root,'my-values/buster-values.yaml')) ? read('my-values/buster-values.yaml') : {agentRole:'buster'};
    result.push({id:'optional-agent-output',inputs:[],values:merge(baseline,{runAsRoot:false,serviceAccount:{create:true},workerTrust:{spiffe:{enabled:true}},
      customSkills:{'discovery.js':'export {}'},imagePullSecrets:[{name:'discovery'}],podAnnotations:{'example.invalid/discovery':'true'},
      nodeSelector:{'example.invalid/discovery':'true'},tolerations:[{key:'discovery',operator:'Exists',effect:'NoSchedule'}],
      extraEnv:[{name:'DISCOVERY',value:'true'}],extraContainers:[{name:'discovery',image:syntheticImage,resources:{requests:{cpu:'10m',memory:'16Mi'}}}],
      extraVolumes:[{name:'discovery',emptyDir:{}}],extraVolumeMounts:[{name:'discovery',mountPath:'/discovery'}],
      service:{type:'NodePort',nodePort:31001,bridgeNodePort:31002,extraPorts:[{name:'discovery',port:8080,targetPort:8080,nodePort:31003}]},
      persistence:{config:{storageClass:'discovery'},workspace:{storageClass:'discovery'}},auth:{token:'discovery'},litellm:{apiKey:'discovery'},discord:{enabled:true,token:'discovery'}})});
    result.push({id:'broker-output',inputs:fs.existsSync(path.join(root,'my-values/buster-values.yaml'))?['my-values/buster-values.yaml']:[],values:merge(merge(buster,registryBinding),{
      agentRole:'buster',serviceAccount:{create:true},busterRuntimePersistence:{enabled:true,storageClass:'discovery'},busterNamespaceBroker:{enabled:true,leaseClient:{enabled:true,verificationRead:{enabled:true}},
        controller:{allowedSourceSecrets:['discovery'],readiness:{enabled:true,audience:'discovery',producerNamespace:'default',producerServiceAccount:'discovery',tlsSecretName:'discovery'},
          productDecisions:{enabled:true,audience:'discovery',producerNamespace:'default',producerServiceAccount:'discovery',issuer:'discovery',verifyKey:Buffer.alloc(32).toString('base64'),allowedActors:['discovery']}}}})});
    result.push({id:'ephemeral-storage-and-ca',inputs:[],values:merge(baseline,{persistence:{config:{enabled:false},workspace:{enabled:false}},runtimeInfrastructure:{registry:{caSecretName:'discovery'}},service:{extraPorts:[{name:'discovery',port:8080,targetPort:8080,nodePort:31003}]}})});
    result.push({id:'nova-ready-client',inputs:[],values:merge(baseline,{agentRole:'nova',serviceAccount:{create:true},busterNamespaceBroker:{readyClient:{enabled:true,endpoint:'https://controller.example.invalid:8443',audience:'discovery',caSecretName:'discovery'}}})});
    result.push({id:'archviewer-output',inputs:[],values:merge(baseline,{archviewer:{enabled:true,existingSecret:'discovery'}})});
    result.push({id:'archviewer-kubernetes-output',inputs:[],values:merge(baseline,{archviewer:{enabled:true,existingSecret:'discovery',networkPolicyProvider:'kubernetes'}})});
    const broker=result.find(profile=>profile.id==='broker-output');
    result.push({id:'broker-registry-ca-and-mirror',inputs:broker.inputs,values:merge(broker.values,{runtimeInfrastructure:{registry:{caSecretName:'discovery-registry-ca',nodeCaFile:'/etc/discovery-registry-ca.crt'},dockerHubMirror:{endpoint:'https://mirror.example.invalid',transport:'https',caSecretName:'discovery-mirror-ca',nodeCaFile:'/etc/discovery-mirror-ca.crt'}}})});
  }
  if (name === 'ops-pod') {
    result.push({id:'optional-ops-output',inputs:[],values:merge(baseline,{githubSecret:'discovery',tailscale:{enabled:true},networkPolicy:{cilium:true},persistence:{storageClass:'discovery'}})});
    result.push({id:'ops-no-exec',inputs:[],values:merge(baseline,{rbac:{execNamespaces:[]},networkPolicy:{enabled:false}})});
  }
  if (name === 'prism') {
    result.push({id:'optional-prism-output',inputs:[],values:merge(baseline,{workerTrust:{spiffe:{enabled:true}},ingestion:{enabled:true,resources:{requests:{cpu:'100m',memory:'128Mi'},limits:{cpu:'1',memory:'1Gi'}}},
      postgresql:{storageClass:'discovery'},artifactStorage:{storageClass:'discovery'},control:{pipelinePreferenceSubject:'user-0123456789abcdef01234567',productDecisions:{enabled:true,issuer:'prism:discovery',operators:['user-0123456789abcdef01234567'],origin:'https://studio.example.invalid',authorityRevision:'discovery',
        signingSecretName:'discovery',signingSecretKey:'private-key.pem',controllerUrl:'https://controller.example.invalid:8443',controllerNamespace:'default',controllerRelease:'discovery',controllerCaSecretName:'discovery',controllerCaSecretKey:'ca.crt',tokenAudience:'discovery',tokenExpirationSeconds:600}}})});
    result.push({id:'external-postgresql-output',inputs:[],values:merge(baseline,{postgresql:{enabled:false},tailscale:{enabled:false}})});
  }
  // Every ordinary boolean option is also exercised independently. Invalid
  // combinations fail rendering; they are not silently classified as unused.
  function booleans(value, parts=[]) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    for (const [key,item] of Object.entries(value)) {
      if (typeof item === 'boolean') {
        // Feature profiles above supply the required companion credentials and
        // bindings. Bare flag toggles cannot be treated as supported renders.
        if (key !== 'enabled') {
          let override = !item;
          for (const part of [...parts,key].reverse()) override = {[part]:override};
          result.push({id:`boolean:${[...parts,key].join('.')}`,inputs:[],values:merge(baseline,override)});
        }
      } else booleans(item,[...parts,key]);
    }
  }
  booleans(defaultValues);
  return result;
}

// Require a render witness for every source branch that can emit API YAML.
// Validation-only branches are not output alternatives. The temporary copy is
// instrumented; authored sources and published output receive no markers.
function instrumentChart(root, chart, target) {
  fs.cpSync(path.join(root,chart),target,{recursive:true});
  const obligations=[];
  for(const source of walkProductSources(root,[`${chart}/templates`],file=>/\.(?:ya?ml|tpl)$/u.test(file))) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    const actions=[...bytes.matchAll(/\{\{-?([\s\S]*?)-?\}\}/gu)].map(match=>({start:match.index,end:match.index+match[0].length,expression:match[1].trim()}));
    const stack=[];const branches=[];
    for(const action of actions) {
      const command=/^(if|with|range|else|end|define)\b/u.exec(action.expression)?.[1];
      if(['if','with','range','define'].includes(command)) { const branch={action,start:action.end}; stack.push(branch); branches.push(branch); }
      else if(command==='else' && stack.length) { stack.at(-1).end=action.start; const branch={action,start:action.end}; stack[stack.length-1]=branch;branches.push(branch); }
      else if(command==='end' && stack.length) stack.pop().end=action.start;
    }
    const blockIntervals=[];let scalar=null;let offset=0;
    for(const line of bytes.split('\n')) {
      const literal=line.replace(/\{\{.*?\}\}/gu,'');
      if(literal.trim()&&!literal.trimStart().startsWith('#')) {
        const indent=literal.match(/^ */u)[0].length;
        if(scalar!==null&&indent<=scalar.indent) {blockIntervals.push([scalar.start,offset]);scalar=null;}
        if(/:\s*[|>][-+0-9]*\s*$/u.test(literal))scalar={start:offset+line.length,indent};
      }
      offset+=line.length+1;
    }
    if(scalar!==null)blockIntervals.push([scalar.start,bytes.length]);
    const insertions=[];
    for(const branch of branches) {
      if(branch.action.expression.startsWith('define '))continue;
      if(blockIntervals.some(([start,end])=>branch.action.start>=start&&branch.action.start<end))continue;
      assert(branch.end!==undefined,`API_PRODUCT_HELM_CONTROL_UNBALANCED: ${source}`);
      const body=bytes.slice(branch.start,branch.end).replace(/\{\{[\s\S]*?\}\}/gu,'');
      // YAML keys, sequence maps and serialized values are public output.
      // A script inside a YAML block may also contain colons; requiring its
      // witness is conservative and cannot hide a real API branch.
      const branchBody=bytes.slice(branch.start,branch.end);
      const mutatesSerializedValue=/\b(?:set|append|concat|merge|mergeOverwrite)\b/u.test(branchBody);
      if(!/(?:^|\n)\s*(?:-\s*)?(?:[A-Za-z_][A-Za-z0-9_.\/-]*|"[^"\n]+")\s*:/u.test(body)
        && !/\btoYaml\b/u.test(branchBody)&&!mutatesSerializedValue) continue;
      const id=hash(`${source}:${branch.action.start}`).slice(0,16);
      obligations.push({id,path:source,line:bytes.slice(0,branch.action.start).split('\n').length,condition:branch.action.expression});
      const literalLines=body.split('\n').filter(line=>line.trim()&&!line.trimStart().startsWith('#'));
      const indent=Math.min(...literalLines.map(line=>line.match(/^ */u)[0].length),0x7fffffff);
      const rootAlias=bytes.slice(0,branch.action.start).match(/\{\{-?\s*(\$[A-Za-z_][A-Za-z0-9_]*)\s*:=\s*\.root\s*-?\}\}/u)?.[1];
      if(mutatesSerializedValue&&source.endsWith('.tpl')) {
        assert(rootAlias,`API_PRODUCT_HELM_HELPER_ROOT_UNRESOLVED: ${source}:${branch.action.start}`);
        insertions.push({at:branch.action.end,text:`{{- $_docs := set ${rootAlias}.Values "__docsOutputBranchWitnesses" (set (${rootAlias}.Values.__docsOutputBranchWitnesses | default dict) "${id}" true) -}}`});
      } else insertions.push({at:branch.action.end,text:`{{ printf "# docs-output-branch:${id}" | nindent ${indent===0x7fffffff?0:indent} }}\n`});
    }
    let instrumented=bytes;
    for(const insertion of insertions.sort((a,b)=>b.at-a.at)) instrumented=instrumented.slice(0,insertion.at)+insertion.text+instrumented.slice(insertion.at);
    fs.writeFileSync(path.join(target,path.relative(chart,source)),instrumented);
  }
  // Collect helper witnesses after each root template renders. Helper output
  // can be parsed with fromYaml; comments in that intermediate text disappear.
  // The shared root values retain only private instrumentation markers.
  for(const source of walkProductSources(root,[`${chart}/templates`],file=>/\.ya?ml$/u.test(file))) {
    fs.appendFileSync(path.join(target,path.relative(chart,source)),'\n{{ range $id, $_ := .Values.__docsOutputBranchWitnesses }}{{ printf "# docs-output-branch:%s" $id | nindent 0 }}{{ end }}\n');
  }
  return obligations;
}

const cache = new Map();
function rejectedProfileContracts(root) {
  const file=path.join(root,'scripts/docs-api-rejected-output-profiles.json');
  if(!fs.existsSync(file))return [];
  const registry=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(registry.version,1,'API_PRODUCT_REJECTED_PROFILE_REGISTRY_INVALID');
  assert(Array.isArray(registry.profiles),'API_PRODUCT_REJECTED_PROFILE_REGISTRY_INVALID');
  const identities=new Set();
  for(const contract of registry.profiles) {
    const identity=`${contract.chart}:${contract.profile}`;
    assert(!identities.has(identity),`API_PRODUCT_REJECTED_PROFILE_DUPLICATE: ${identity}`);identities.add(identity);
    for(const field of ['expectedError','canonicalProcedure','owner','safeStop','preparationCriterion','discoveryInputDigest'])assert(typeof contract[field]==='string'&&contract[field].trim(),`API_PRODUCT_REJECTED_PROFILE_CONTRACT_INCOMPLETE: ${identity}:${field}`);
    const [procedure,anchor]=contract.canonicalProcedure.split('#');
    assert(procedure.startsWith('docs/site/')&&!procedure.split('/').includes('..')&&fs.existsSync(path.join(root,procedure)),`API_PRODUCT_REJECTED_PROFILE_PROCEDURE_MISSING: ${identity}`);
    const headings=[...fs.readFileSync(path.join(root,procedure),'utf8').matchAll(/^#{1,6}\s+(.+)$/gmu)].map(match=>match[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu,'').trim().replace(/ +/gu,'-'));
    assert(anchor&&headings.includes(anchor),`API_PRODUCT_REJECTED_PROFILE_PROCEDURE_ANCHOR_MISSING: ${identity}`);
    const actualChart=Object.fromEntries(walkProductSources(root,[contract.chart],()=>true).map(source=>[source,hash(fs.readFileSync(path.join(root,source)))]));
    assert.deepEqual(actualChart,contract.chartSourceDigests,`API_PRODUCT_REJECTED_PROFILE_CHART_DRIFT: ${identity}`);
    for(const [input,digest]of Object.entries(contract.inputSourceDigests??{}))assert.equal(hash(fs.readFileSync(path.join(root,input))),digest,`API_PRODUCT_REJECTED_PROFILE_INPUT_DRIFT: ${identity}:${input}`);
  }
  return registry.profiles;
}
export function discoverRejectedApiOutputProfiles(root) {
  discoverHelmApiOutputs(root);
  return [...cache.values()].find(entry=>entry.root===path.resolve(root)&&!entry.schemaAuthorityOnly)?.rejections??[];
}
export function discoverHelmApiOutputs(root, { allowRejectedInputs = false } = {}) {
  return discoverHelmOutputs(root,{allowRejectedInputs,schemaAuthorityOnly:false});
}
// Schema extraction has a separate, explicit task: chart-owned definitions in
// source-controlled constructor profiles. It never certifies example acceptance.
export function discoverHelmSchemaApiOutputs(root) {
  return discoverHelmOutputs(root,{allowRejectedInputs:false,schemaAuthorityOnly:true}).filter(output=>output.value.kind==='CustomResourceDefinition');
}
function discoverHelmOutputs(root, {allowRejectedInputs,schemaAuthorityOnly}) {
  const sources = walkProductSources(root,['charts','examples','my-values','releases/values'],()=>true);
  const chartFiles=sources.filter(source=>/\/Chart\.yaml$/u.test(source)&&source.split('/').length===3);
  for(const template of sources.filter(source=>/^charts\/[^/]+\/templates\/.*\.(?:ya?ml|tpl)$/u.test(source))) {
    assert(chartFiles.includes(`${template.split('/').slice(0,2).join('/')}/Chart.yaml`),`API_PRODUCT_HELM_TEMPLATE_WITHOUT_CHART_AUTHORITY: ${template}`);
  }
  const dependencyDigest = hash(sources.map(source=>`${source}\0${hash(fs.readFileSync(path.join(root,source)))}`).join('\n'));
  const rejectedContracts=schemaAuthorityOnly?[]:rejectedProfileContracts(root);
  const key = `${path.resolve(root)}:${dependencyDigest}:${schemaAuthorityOnly?'schema-authority':'product-output'}:${hash(JSON.stringify(rejectedContracts))}`;
  if (cache.has(key)) { const cached=cache.get(key); assert(allowRejectedInputs || !cached.failures.length, `API_PRODUCT_HELM_RENDER_FAILED: ${cached.failures.join("; ")}`); return cached.outputs; }
  const result=[];
  const failures=[];
  const rejections=[];
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'docs-api-output-'));
  try {
    for (const chartFile of chartFiles) {
      const chart=path.dirname(chartFile);
      const chartCopy=path.join(temporary,path.basename(chart));
      let obligations=[];
      if(schemaAuthorityOnly) {
        fs.cpSync(path.join(root,chart),chartCopy,{recursive:true});
        for(const template of walkProductSources(root,[`${chart}/templates`],file=>/\.ya?ml$/u.test(file))) {
          if(!/^kind:\s*CustomResourceDefinition\s*$/mu.test(fs.readFileSync(path.join(root,template),'utf8')))fs.rmSync(path.join(chartCopy,path.relative(chart,template)));
        }
      } else obligations=instrumentChart(root,chart,chartCopy);
      const witnessed=new Set();
      for(const profile of profiles(root,chart)) {
        const rejected=rejectedContracts.find(contract=>contract.chart===chart&&contract.profile===profile.id);
        if(rejected) {
          assert.deepEqual(Object.keys(rejected.inputSourceDigests).sort(),profile.inputs.slice().sort(),`API_PRODUCT_REJECTED_PROFILE_INPUT_SET_DRIFT: ${profile.id}`);
          assert.equal(hash(YAML.stringify(profile.values)),rejected.discoveryInputDigest,`API_PRODUCT_REJECTED_PROFILE_DERIVED_INPUT_DRIFT: ${profile.id}`);
        }
        const input=path.join(temporary,'values.yaml');fs.writeFileSync(input,YAML.stringify(profile.values));
        const rendered=spawnSync('helm',['template','discovery',chartCopy,'--namespace','default','--kube-version','1.35.0','--include-crds','-f',input],{encoding:'utf8',maxBuffer:64*1024*1024});
        if (rendered.status !== 0) {
          if(rejected) {
            const command=['template','discovery',path.join(root,chart),'--namespace','default','--kube-version','1.35.0','--include-crds','-f',input];
            const observed=spawnSync('helm',command,{encoding:'utf8',maxBuffer:64*1024*1024});
            assert.notEqual(observed.status,0,`API_PRODUCT_REJECTED_PROFILE_UNEXPECTED_SUCCESS: ${profile.id}`);
            assert.equal(observed.stdout,'',`API_PRODUCT_REJECTED_PROFILE_PARTIAL_OUTPUT: ${profile.id}`);
            assert.equal(observed.stderr.trim(),rejected.expectedError,`API_PRODUCT_REJECTED_PROFILE_ERROR_DRIFT: ${profile.id}`);
            rejections.push({...rejected,observedExitCode:observed.status,observedOutputBytes:Buffer.byteLength(observed.stdout),observedError:observed.stderr.trim(),discoveryInvocation:['helm','template','discovery',chart,'--namespace','default','--kube-version','1.35.0','--include-crds','--values','<source-bound illustrative profile>']});
          } else failures.push(`${chart} ${profile.id}: ${rendered.stderr.trim()}`);
          continue;
        }
        assert(!rejected,`API_PRODUCT_REJECTED_PROFILE_UNEXPECTED_SUCCESS: ${profile.id}`);
        for(const marker of rendered.stdout.matchAll(/# docs-output-branch:([a-f0-9]{16})/gu))witnessed.add(marker[1]);
        const authoritative=spawnSync('helm',['template','discovery',schemaAuthorityOnly?chartCopy:path.join(root,chart),'--namespace','default','--kube-version','1.35.0','--include-crds','-f',input],{encoding:'utf8',maxBuffer:64*1024*1024});
        assert.equal(authoritative.status,0,`API_PRODUCT_HELM_AUTHORITATIVE_RENDER_FAILED: ${chart} ${profile.id}: ${authoritative.stderr}`);
        const clean=authoritative.stdout;
        const chunks=clean.split(/(?:^|\n)---\s*\n/u).filter(chunk=>chunk.trim());
        chunks.forEach((chunk,index)=>{
          const document=YAML.parseDocument(chunk);
          assert.equal(document.errors.length,0,`API_PRODUCT_HELM_YAML_INVALID: ${chart} ${profile.id}#${index}`);
          const value=document.toJS();if(!value?.kind||!value?.apiVersion)return;
          const outputSource=/# Source: [^/]+\/(.+)/u.exec(chunk)?.[1];
          assert(outputSource,`API_PRODUCT_HELM_SOURCE_MISSING: ${chart} ${profile.id}#${index}`);
          const source=`${chart}/${outputSource}`;
          result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,sourceDigest:hash(fs.readFileSync(path.join(root,source))),
            producer:'helm',profile:profile.id,dependencyDigest,outputDigest:hash(chunk),inputDigest:hash(YAML.stringify(profile.values)),inputs:profile.inputs}});
        });
      }
      const missing=obligations.filter(branch=>!witnessed.has(branch.id));
      if(!schemaAuthorityOnly&&missing.length) failures.push(`API_PRODUCT_HELM_BRANCH_UNDISCOVERED: ${JSON.stringify(missing)}`);
    }
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
  for(const rejected of rejectedContracts)assert(rejections.some(entry=>entry.chart===rejected.chart&&entry.profile===rejected.profile),`API_PRODUCT_REJECTED_PROFILE_MISSING: ${rejected.profile}`);
  cache.clear();cache.set(key,{root:path.resolve(root),schemaAuthorityOnly,outputs:result,failures,rejections});
  assert(allowRejectedInputs || !failures.length, `API_PRODUCT_HELM_RENDER_FAILED: ${failures.join("; ")}`);
  return result;
}

// Source-shape analysis never executes scripts/controllers or contacts a
// cluster. Constructors are discovered from AST identity properties, not a
// filename list. Every source position and every changed byte remain bound.
const scriptOutputCache=new Map();
const qualifiedReleaseRendererOutputs=new WeakSet();
// The bare renderer slot is API-capable, not a scalar or a generic non-API
// grant. Reuse the original, source-checked Ops renderer/forwarding adapter;
// do not substitute a guessed Helm object or waive the selected-release check.
export function checkedReleaseRendererOutputs(root, topLevelPurposes) {
  const source='scripts/updates/deployment-release.mjs';
  if(!fs.existsSync(path.join(root,source)))return null;
  const fail=detail=>assert.fail(`API_PRODUCT_RELEASE_RENDERER_OUTPUT_UNQUALIFIED: ${detail}`);
  const expected=topLevelPurposes?.descriptors.find(role=>role.source===source&&role.line===195);
  if(!expected)fail('missing sealed renderer slot');
  selectedTopLevelScriptPurpose(source,expected,topLevelPurposes); // authenticates the private receipt and exact raw roster
  if(expected.role!=='unknown'||expected.sink!=='process.stdout.write')fail('canonical raw role');
  const caller='scripts/deploy-ops-pod.sh',bytes=fs.readFileSync(path.join(root,caller),'utf8');
  const sinks=shellRawOutputSinks(caller,bytes).filter(sink=>sink.line===30&&sink.command==='cat');
  if(sinks.length!==1)fail('original forwarding receiver');
  const proof=shellReleaseFileProof(root,caller,bytes,sinks[0]);
  if(!proof||proof.role!=='api'||!proof.outputs.length
    ||proof.outputs.some(output=>output.context.forwardedProducer?.path!==source))fail('original complete Ops output');
  const dependencies=[caller,...Object.keys(proof.dependencies)];
  const inputDigest=hash(JSON.stringify([topLevelPurposes.inputDigest,proof.sourceDigest,proof.dependencies,
    proof.outputs.map(output=>[output.context.profile,output.context.inputDigest,output.context.outputDigest])]));
  const outputs=proof.outputs.map(({value,context})=>({value,context:{...context,
    path:source,line:195,sourceDigest:hash(fs.readFileSync(path.join(root,source))),
    producer:'node-original-release-forwarding',inputs:dependencies,inputDigest,
    forwardedProducer:{...context.forwardedProducer,forwardingCaller:caller,forwardingLine:30},
    runtimeExecutionAuthorized:false,apiApplyAuthorized:false,
    executionLimit:'Original finite Ops renderer profiles with explicit offline discovery, not live discovery/apply or runtime-family success. Canonical renderer stdout remains UNKNOWN; supported runtime configuration failures are not bypassed.'}}));
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const receipt=freeze({source,expected,dependencies,inputDigest,outputs});
  qualifiedReleaseRendererOutputs.add(receipt);return receipt;
}
function selectedReleaseRendererOutput(source,role,receipt) {
  if(source!=='scripts/updates/deployment-release.mjs'||role.line!==195)return false;
  assert(receipt&&qualifiedReleaseRendererOutputs.has(receipt),'API_PRODUCT_RELEASE_RENDERER_OUTPUT_UNQUALIFIED: unacquired receipt');
  const descriptor=value=>Object.fromEntries(['line','sink','expression','sinkContract','role'].map(key=>[key,value[key]??null]));
  assert.deepEqual(descriptor(role),descriptor(receipt.expected),'API_PRODUCT_RELEASE_RENDERER_OUTPUT_UNQUALIFIED: changed canonical slot');
  return true;
}
// This selected diagnostic recipe includes its complete error-collection
// authority. Sink facts alone cannot bind new values added to the error list.
// A mutable line/digest refresh cannot authorize a changed producer or output.
const reviewedDiagnosticOutputSources={
  'scripts/check-site-reader-boundary.mjs':'8621bd96590bae1dbdb973ddee07be8fccf27cc66f6be0acb9d13dc71438e5c5',
};
// A finite original --check observation binds this API producer to its exact
// checked artifacts. Inventory only reads the witness; it never executes the
// producer. Changing mutable metadata cannot extend this Source-owned profile.
const reviewedArgocdArtifactProfile=Object.freeze({
  "source": "scripts/argocd-self-management.mjs",
  "sourceSha256": "79330ccdc6c86a6a3187e538f3a11fb2ab13e97d24e7b9681b1b2a52d2fe7b26",
  "authority": "scripts/docs-api-argocd-checked-artifact-authority.json",
  "authoritySha256": "ebabd27fea509b6f1a094ffe06cdae4c73379911792bd97f44af90802b8ff6ec",
  "nodeIdentity": {
    "path": "/usr/local/bin/node",
    "version": "v24.22.1",
    "sha256": "e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb"
  },
  "historicalObservationSha256": "7b4d2b0526fe7d035bd81ee45ecd2c359f861312771e0b6d9beacaf60a7935ca",
  "currentControlKeys": [
    "changed-byte-refused:scripts/argocd-self-management.mjs",
    "changed-byte-refused:scripts/platform-services.mjs",
    "changed-byte-refused:versions.json",
    "changed-byte-refused:gitops/platform/bootstrap/argocd.yaml",
    "changed-byte-refused:package.json",
    "changed-byte-refused:node_modules/js-yaml/dist/js-yaml.mjs",
    "changed-byte-refused:node_modules/js-yaml/package.json",
    "changed-loader-package-boundary-refused:",
    "ambient-loader-environment-refused:NODE_OPTIONS",
    "ambient-loader-environment-refused:NODE_PATH",
    "write-denied:",
    "child-denied:",
    "worker-denied:",
    "outside-read-denied:"
  ]
});
export function checkedArgocdArtifactOutputs(root,source,sourceBytes) {
  const profile=reviewedArgocdArtifactProfile;
  if(source!==profile.source||hash(sourceBytes)!==profile.sourceSha256)return null;
  const fail=detail=>assert.fail(`API_PRODUCT_CHECKED_ARTIFACT_UNQUALIFIED: ${source}; ${detail}; revalidate the original read-only check and review its Source-owned witness`);
  if(!path.isAbsolute(root)||fs.realpathSync(root)!==root)fail('canonical checkout root');
  const read=file=>{
    if(typeof file!=='string'||path.isAbsolute(file)||file.split('/').some(part=>!part||part==='.'||part==='..')||file.includes('\\'))fail('relative input path');
    const absolute=path.join(root,file);
    if(!fs.existsSync(absolute)||fs.realpathSync(absolute)!==absolute||!fs.lstatSync(absolute).isFile())fail(`physical input ${file}`);
    return fs.readFileSync(absolute);
  };
  const authorityBytes=read(profile.authority);
  if(hash(authorityBytes)!==profile.authoritySha256)fail('immutable witness digest');
  const authority=JSON.parse(authorityBytes);
  const observation=authority.currentReadOnlyObservation20261031;
  if(authority.schemaVersion!=='original-generator-checked-artifacts.v1'||authority.profile!=='original-read-only-check-no-ambient-loaders'
    ||authority.source!==source||authority.sourceSha256!==profile.sourceSha256||!observation
    ||hash(JSON.stringify(authority.observation))!==profile.historicalObservationSha256)fail('explicit current producer observation/history');
  if(JSON.stringify(observation.node)!==JSON.stringify(profile.nodeIdentity))fail('current qualified Node identity');
  const argv=observation.argv,privateRoot=Array.isArray(argv)&&typeof argv[2]==='string'?path.dirname(path.dirname(argv[2])):null;
  if(!privateRoot||!path.isAbsolute(privateRoot)||path.normalize(privateRoot)!==privateRoot
    ||JSON.stringify(argv)!==JSON.stringify(['--permission','--allow-fs-read='+privateRoot,path.join(privateRoot,source),'--check']))fail('exact private read-only check argv');
  if(JSON.stringify(observation.environment)!==JSON.stringify({PATH:'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',TZ:'UTC'})
    ||observation.loaderResolution!==pathToFileURL(path.join(privateRoot,'node_modules/js-yaml/dist/js-yaml.mjs')).href
    ||observation.jsYamlVersion!=='4.3.1')fail('scrubbed environment/locked ESM loader');
  if(observation.originalCheck?.exit!==0||observation.originalCheck.stdout!==''||observation.originalCheck.stderr!==''
    ||observation.allCopiesByteIdentical!==true||observation.allFilesUnchangedAfterCheck!==true||observation.privateTreesRemoved!==true)fail('current successful nonmutating check');
  if(observation.inputsAndCheckedOutputs?.length!==35||observation.outputs?.length!==21
    ||JSON.stringify(observation.inputsAndCheckedOutputs.map(f=>f.path))!==JSON.stringify(authority.observation.inputsAndCheckedOutputs.map(f=>f.path))
    ||JSON.stringify(observation.outputs)!==JSON.stringify(authority.observation.outputs))fail('exact current input/output roster');
  if(!Array.isArray(observation.controls)||observation.controls.some(c=>c.pass!==true)
    ||JSON.stringify(observation.controls.map(c=>c.name+':'+(c.path??c.key??'')))!==JSON.stringify(profile.currentControlKeys)
    ||['write-denied','child-denied','worker-denied','outside-read-denied'].some(name=>!observation.controls.some(c=>c.name===name&&c.exit===1&&c.errorCode==='ERR_ACCESS_DENIED'))
    ||observation.freshMaintainedOutputParse?.outputs!==21||observation.freshMaintainedOutputParse.allCurrentParsedApiIdentitiesExact!==true)fail('current named controls/fresh parsed identities');
  for(const file of authority.absentPackageBoundaries){
    try{fs.lstatSync(path.join(root,file));fail(`new package boundary ${file}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const buffers=new Map();
  for(const fact of observation.inputsAndCheckedOutputs){
    const bytes=read(fact.path);
    if(hash(bytes)!==fact.sha256)fail(`changed input or checked artifact ${fact.path}`);
    buffers.set(fact.path,bytes);
  }
  if(!buffers.get(source)?.equals(Buffer.from(sourceBytes)))fail('selected source snapshot');
  const dependencies=[profile.authority,...buffers.keys()];
  const inputDigest=hash(authorityBytes);
  const outputs=observation.outputs.map((record,index)=>{
    const bytes=buffers.get(record.path);
    if(!bytes||hash(bytes)!==record.outputSha256)fail(`output identity ${record.path}`);
    const value=YAML.parse(bytes.toString('utf8'));
    if(value?.apiVersion!==record.apiVersion||value?.kind!==record.kind||value?.metadata?.name!==record.name||hash(JSON.stringify(value))!==record.valueSha256)fail(`parsed API identity ${record.path}`);
    return {value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,
      sourceDigest:profile.sourceSha256,producer:'node-original-checked-artifact',profile:authority.profile,
      sourceLine:authority.descriptor.line,artifactPath:record.path,artifactDigest:record.outputSha256,
      inputs:dependencies,inputDigest,outputDigest:hash(JSON.stringify(value)),
      executionLimit:'Original isolated read-only --check observation only; no producer execution by inventory, normal generation, cluster apply or general helper-mode qualification.'}};
  });
  return {outputs,dependencies,descriptor:authority.descriptor,witnessDigest:inputDigest};
}
export function assertCheckedArtifactEntryContext(graph,source) {
  assert(graph&&!graph.edges.some(edge=>edge.target===source&&edge.source!==source)
    &&!graph.publicEntries.some(entry=>entry.path!==entry.canonicalSource&&entry.canonicalSource===source),
  `API_PRODUCT_CHECKED_ARTIFACT_CALLER_UNQUALIFIED: ${source}; imported or aliased entry needs its own caller qualification`);
}
function checkedArtifactRole(role,witness) {
  if(!witness||role.role!=='unknown')return role;
  const descriptor=witness.descriptor;
  assert(role.line===descriptor.line&&role.sink===descriptor.sink&&hash(role.expression)===descriptor.expressionSha256,
    'API_PRODUCT_CHECKED_ARTIFACT_DESCRIPTOR_UNQUALIFIED');
  return {...role,role:'api-adapted',basis:'Source-owned-original-check-to-exact-API-artifacts',
    checkedArtifactWitnessDigest:witness.witnessDigest,
    dependencies:[...new Set([...role.dependencies,...witness.dependencies])]};
}
function assertReviewedDiagnosticOutputSources(root) {
  const registry=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');
  if(!fs.existsSync(registry))return;
  const contracts=JSON.parse(fs.readFileSync(registry,'utf8')).nonApiOutputContracts??[];
  for(const [source,sha256]of Object.entries(reviewedDiagnosticOutputSources))if(contracts.some(contract=>contract.source===source)) {
    const file=path.join(root,source);
    if(!fs.existsSync(file))continue;
    assert(fs.realpathSync(file)===path.resolve(file)&&hash(fs.readFileSync(file))===sha256,`API_PRODUCT_DIAGNOSTIC_SOURCE_ROLE_UNQUALIFIED: ${source}; changed error/input/output authority requires renewed Source review`);
  }
}
// These finite original local observations qualify output purposes, not
// execution authority. The immutable witness binds original product modules,
// inputs, member identities and callers; mutable role-registry refreshes cannot
// enlarge it. Inventory never imports or invokes those product modules.
const reviewedGitOpsProfile = Object.freeze({
  authority: 'scripts/docs-api-gitops-output-profile-authority.json',
  authoritySha256: '1f5316ad9c99959473cb938a79c44b8bee01f8a5399a95d2df36fcd9a17d17ca',
  // Current source binding only; the sealed observations remain historical.
  currentPackageBinding20261031: Object.freeze({"path":"package.json","sha256":"0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef","bytes":54287,"historicalSha256":"4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3","historicalBytes":53756}),
  activationSource: 'scripts/gitops-continuous.mjs',
  activationSha256: 'f2b35d956ffaa40dc9644f7f3c22c3d7e6f34747e890f1c139de8211cd2e3734',
});
const qualifiedGitOpsProfiles = new WeakSet();
export function checkedGitOpsOutputProfiles(root, graph) {
  const profile = reviewedGitOpsProfile;
  const authorityFile = path.join(root, profile.authority);
  if (!fs.existsSync(authorityFile)) {
    const source = path.join(root, profile.activationSource);
    if (!fs.existsSync(source) || hash(fs.readFileSync(source)) !== profile.activationSha256) return null;
  }
  const fail = detail => assert.fail(`API_PRODUCT_GITOPS_OUTPUT_PROFILE_UNQUALIFIED: ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical checkout root');
  const read = file => {
    if (typeof file !== 'string' || !file || file.includes('\\') || path.posix.isAbsolute(file)
      || path.posix.normalize(file) !== file || file.split('/').some(part => part === '..' || part === '.')) fail('relative input path');
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) fail(`physical input ${file}`);
    return fs.readFileSync(absolute);
  };
  const bytes = read(profile.authority);
  if (hash(bytes) !== profile.authoritySha256) fail('immutable witness digest');
  const authority = JSON.parse(bytes), buffers = new Map();
  const binding = profile.currentPackageBinding20261031;
  if (!binding || binding.path !== 'package.json'
    || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(['bytes','historicalBytes','historicalSha256','path','sha256'])) fail('explicit package-only current binding');
  const historicalPackage = authority.inputs.filter(fact => fact.path === 'package.json');
  if (historicalPackage.length !== 1 || historicalPackage[0].sha256 !== binding.historicalSha256
    || historicalPackage[0].bytes !== binding.historicalBytes) fail('historical package input identity');
  const currentPackageBindingDigest = hash(JSON.stringify(binding));
  for (const fact of authority.inputs) {
    const content = read(fact.path);
    const expected = fact.path === 'package.json' ? binding : fact;
    if (hash(content) !== expected.sha256 || content.length !== expected.bytes) fail(`changed input ${fact.path}`);
    buffers.set(fact.path, content);
  }
  for (const [source, digest] of Object.entries(authority.sourcePins)) {
    if (!buffers.has(source) || hash(buffers.get(source)) !== digest) fail(`producer source ${source}`);
  }
  for (const file of authority.absentPackageBoundaries) {
    try { fs.lstatSync(path.join(root, file)); fail(`new package boundary ${file}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const members = relative => {
    const absolute = path.join(root, relative);
    if (fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isDirectory()) fail(`physical directory ${relative}`);
    return fs.readdirSync(absolute).sort().flatMap(name => {
      const file = relative + '/' + name, entry = fs.lstatSync(path.join(root, file));
      if (entry.isSymbolicLink()) fail(`aliased member ${file}`);
      if (entry.isDirectory()) return members(file);
      if (!entry.isFile()) fail(`nonregular member ${file}`);
      return [file];
    }).sort();
  };
  for (const roster of authority.directoryRosters) {
    if (JSON.stringify(members(roster.directory)) !== JSON.stringify(roster.files)) fail(`member roster ${roster.directory}`);
  }
  const sources = Object.keys(authority.sourcePins);
  if (!graph || JSON.stringify(graph.edges.filter(edge => sources.includes(edge.target))) !== JSON.stringify(authority.incomingEdges)
    || JSON.stringify(graph.publicEntries.filter(entry => sources.includes(entry.canonicalSource))) !== JSON.stringify(authority.publicEntries)) fail('imported or aliased entry context');
  const dependencies = [profile.authority, ...buffers.keys()], outputs = [], outputMembers = [];
  for (const observation of authority.profiles) {
    let documentOrdinal = 0;
    if (observation.exitCode !== 0) fail('original observation exit');
    for (const stream of observation.streams) {
      if (stream.payload.encoding !== 'utf8' || hash(stream.payload.bytes) !== stream.payload.sha256) fail('recorded output bytes');
      if (stream.destination !== 'stdout' && (!buffers.has(stream.destination)
        || !buffers.get(stream.destination).equals(Buffer.from(stream.payload.bytes)))) fail(`output/current input equality ${stream.destination}`);
      outputMembers.push({profile: observation.id, source: observation.source, destination: stream.destination,
        role: stream.role, sha256: stream.payload.sha256});
      const documents = YAML.parseAllDocuments(stream.payload.bytes);
      if (documents.some(document => document.errors.length)) fail(`output YAML ${stream.destination}`);
      documents.forEach(document => {
        const value = document.toJS();
        if (stream.role !== 'api') {
          if (!value || typeof value !== 'object' || Array.isArray(value) || value.apiVersion || value.kind) fail(`non-API member substitution ${stream.destination}`);
          if (stream.role === 'selection-metadata' && (JSON.stringify(Object.keys(value)) !== '["directory"]'
            || value.directory !== JSON.parse(buffers.get('gitops/production/selection.json')).directory)) fail('selection metadata');
          return;
        }
        if (value?.apiVersion !== 'argoproj.io/v1alpha1' || !['Application', 'AppProject'].includes(value.kind)
          || !value.metadata?.name) fail(`API member identity ${stream.destination}`);
        outputs.push({value, context: {apiVersion: value.apiVersion, kind: value.kind, path: observation.source,
          document: documentOrdinal++, sourceDigest: authority.sourcePins[observation.source], producer: 'node-original-finite-output-profile',
          profile: observation.id, observationRevision: authority.sourceRevision,
          ...(observation.fixtureCommits ? {observationFixtureCommits: observation.fixtureCommits} : {}),
          publicOutput: stream.destination, inputs: dependencies, inputDigest: profile.authoritySha256,
          currentPackageBindingDigest, observationsHistorical: true,
          outputDigest: hash(JSON.stringify(value)), outputBytesDigest: stream.payload.sha256,
          executionLimit: 'Sealed historical output snapshot only, not a renewed current Git/history/loader/environment or original-command-success claim. Finite original bootstrap/check and isolated read-only planner observations; no inventory execution, apply, preflight, live ownership/adoption, healthy rollback or unobserved caller/configuration profile.'}});
      });
    }
  }
  const result = Object.freeze({sources: Object.freeze(sources), dependencies: Object.freeze(dependencies),
    outputs: Object.freeze(outputs), outputMembers: Object.freeze(outputMembers.map(Object.freeze)),
    descriptors: Object.freeze(authority.descriptors.map(Object.freeze)), witnessDigest: profile.authoritySha256,
    currentPackageBinding: binding, currentPackageBindingDigest, observationsHistorical: true});
  qualifiedGitOpsProfiles.add(result);
  return result;
}
export function gitOpsOutputProfileRole(source, role, witness) {
  if (!witness || !witness.sources.includes(source) || role.role !== 'unknown') return role;
  assert(qualifiedGitOpsProfiles.has(witness), 'API_PRODUCT_GITOPS_OUTPUT_PROFILE_UNQUALIFIED: unacquired witness');
  const descriptor = witness.descriptors.find(item => item.source === source && item.line === role.line && item.sink === role.sink);
  if (!descriptor) return role;
  const nativeDescriptor = Object.fromEntries(['line', 'sink', 'expression', 'sinkContract'].map(key => [key, role[key] ?? null]));
  assert.equal(hash(JSON.stringify(nativeDescriptor)), descriptor.classifierDescriptorSha256,
    'API_PRODUCT_GITOPS_OUTPUT_PROFILE_UNQUALIFIED: native descriptor');
  return {...role, role: descriptor.role, basis: descriptor.purpose,
    gitOpsWitnessDigest: witness.witnessDigest,
    qualifiedOutputMembers: descriptor.role === 'api-adapted' ? witness.outputMembers.filter(member => member.source === source) : [],
    executionAuthority: false,
    dependencies: [...new Set([...role.dependencies, ...witness.dependencies])]};
}

// Historical path/metadata observations are not global non-API stdout grants.
// A TMPDIR containing document delimiters can itself contain an API document.
// Only the two exact reviewed slots may traverse the private inventory path;
// the public classifier stays UNKNOWN and the native six-profile API adapter
// remains the sole infrastructure API producer.
const reviewedInfrastructureProfile = Object.freeze({
  authority: 'scripts/docs-api-infrastructure-output-profile-authority.json',
  authoritySha256: '70708daefa080386068281c154cddb581ee9fc76cfe3b5fa817bfb2a417d6fbe',
  sources: Object.freeze(['scripts/infrastructure-chart.mjs', 'scripts/infrastructure-release.mjs']),
  // Separate current package binding; all nine observations remain historical.
  currentPackageBinding20261031: Object.freeze({"path":"package.json","sha256":"0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef","bytes":54287,"historicalSha256":"4ab1e90c2259aeb96acfdc877e5a9eed330f605abff46d7eca85faded0f020c3","historicalBytes":53756}),
  activationSource: 'scripts/infrastructure-chart.mjs',
  activationSha256: '6a136a40cced70d63de028e635bd5b9e4fb30f1a632cd725175385faf9c57e25',
});
const qualifiedInfrastructureProfiles = new WeakSet();
export function checkedInfrastructureOutputProfiles(root, graph) {
  const profile = reviewedInfrastructureProfile;
  const authorityFile = path.join(root, profile.authority);
  if (!fs.existsSync(authorityFile)) {
    const source = path.join(root, profile.activationSource);
    if (!fs.existsSync(source) || hash(fs.readFileSync(source)) !== profile.activationSha256) return null;
  }
  const fail = detail => assert.fail(`API_PRODUCT_INFRASTRUCTURE_OUTPUT_PROFILE_UNQUALIFIED: ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical checkout root');
  const read = file => {
    if (typeof file !== 'string' || !file || file.includes('\\') || path.posix.isAbsolute(file)
      || path.posix.normalize(file) !== file || file.split('/').some(part => part === '..' || part === '.')) fail('relative input path');
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) fail(`physical input ${file}`);
    return fs.readFileSync(absolute);
  };
  const bytes = read(profile.authority);
  if (hash(bytes) !== profile.authoritySha256) fail('immutable witness digest');
  const authority = JSON.parse(bytes), buffers = new Map();
  const binding = profile.currentPackageBinding20261031;
  if (!binding || binding.path !== 'package.json'
    || JSON.stringify(Object.keys(binding).sort()) !== JSON.stringify(['bytes','historicalBytes','historicalSha256','path','sha256'])) fail('explicit package-only current binding');
  const historicalPackage = authority.inputs.filter(fact => fact.path === 'package.json');
  if (historicalPackage.length !== 1 || historicalPackage[0].sha256 !== binding.historicalSha256
    || historicalPackage[0].bytes !== binding.historicalBytes) fail('historical package input identity');
  const currentPackageBindingDigest = hash(JSON.stringify(binding));
  for (const fact of authority.inputs) {
    const content = read(fact.path);
    const expected = fact.path === 'package.json' ? binding : fact;
    if (hash(content) !== expected.sha256 || content.length !== expected.bytes) fail(`changed input ${fact.path}`);
    buffers.set(fact.path, content);
  }
  for (const [source, digest] of Object.entries(authority.sourcePins)) {
    if (!buffers.has(source) || hash(buffers.get(source)) !== digest) fail(`producer source ${source}`);
  }
  for (const file of authority.absentPackageBoundaries) {
    try { fs.lstatSync(path.join(root, file)); fail(`new package boundary ${file}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const operation = authority.callerOperation;
  const tree = ts.createSourceFile(operation.source, read(operation.source).toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === operation.function);
  if (tree.parseDiagnostics.length || functions.length !== 1 || hash(functions[0].getText(tree)) !== operation.syntaxSha256) fail('original native adapter operation');
  const targets = authority.publicEntries.map(entry => entry.canonicalSource);
  if (!graph || JSON.stringify(graph.edges.filter(edge => targets.includes(edge.target))) !== JSON.stringify(authority.selectedIncomingEdges)
    || JSON.stringify(graph.publicEntries.filter(entry => targets.includes(entry.canonicalSource))) !== JSON.stringify(authority.publicEntries)) fail('imported or aliased entry context');
  // These three imports are outside the selected graph, but their complete
  // owning test source is a physical input; none is a product CLI receipt.
  for (const edge of authority.knownNonRuntimeTestImports) {
    if (!buffers.get(edge.source)?.toString('utf8').includes(edge.operation)) fail('known owning test import');
  }
  const lock = JSON.parse(buffers.get('versions.json')).infrastructureCharts;
  if (JSON.stringify(authority.profiles.map(item => item.id)) !== JSON.stringify(authority.profileOrder)
    || authority.profiles.length !== 9 || authority.descriptors.length !== 2
    || authority.canonicalRawRole !== 'unknown' || authority.runtimeExecutionAuthorized !== false
    || authority.apiApplyAuthorized !== false) fail('finite member roster');
  for (const observation of authority.profiles) {
    const archive = authority.archives.find(item => item.sha256 === lock[observation.name]?.sha256);
    if (!archive || hash(buffers.get(archive.path)) !== observation.archiveSha256
      || observation.exitCode !== 0 || observation.stderr !== '' || hash(observation.stdout) !== observation.stdoutSha256) fail('original observation identity');
    if (observation.mode === 'verify') {
      const value = JSON.parse(observation.stdout);
      if (JSON.stringify(value) !== JSON.stringify(observation.verifiedReceipt)
        || value.sha256 !== observation.archiveSha256 || value.name !== lock[observation.name].name
        || value.version !== lock[observation.name].version) fail('verification metadata');
    } else if (!['stage', 'prepare-release'].includes(observation.mode)
      || observation.stdout !== observation.historicalArchivePath + '\n') fail('historical complete filename');
  }
  const receipt = Object.freeze({witnessDigest: profile.authoritySha256,
    currentPackageBinding: binding, currentPackageBindingDigest, observationsHistorical: true,
    descriptors: Object.freeze(authority.descriptors.map(Object.freeze)),
    dependencies: Object.freeze([profile.authority, operation.source, ...buffers.keys()]),
    executionAuthority: false});
  qualifiedInfrastructureProfiles.add(receipt);
  return receipt;
}
export function selectedInfrastructureOutputProfile(source, role, witness) {
  if (!reviewedInfrastructureProfile.sources.includes(source)) return false;
  assert(witness && qualifiedInfrastructureProfiles.has(witness), 'API_PRODUCT_INFRASTRUCTURE_OUTPUT_PROFILE_UNQUALIFIED: unacquired witness');
  assert.equal(role.role, 'unknown', 'API_PRODUCT_INFRASTRUCTURE_OUTPUT_PROFILE_UNQUALIFIED: canonical raw role must remain unknown');
  const descriptor = witness.descriptors.find(item => item.source === source && item.line === role.line && item.sink === role.sink);
  assert(descriptor, 'API_PRODUCT_INFRASTRUCTURE_OUTPUT_PROFILE_UNQUALIFIED: unexpected sealed-source slot');
  const nativeDescriptor = Object.fromEntries(['line', 'sink', 'expression', 'sinkContract'].map(key => [key, role[key] ?? null]));
  assert.equal(hash(JSON.stringify(nativeDescriptor)), descriptor.classifierDescriptorSha256,
    'API_PRODUCT_INFRASTRUCTURE_OUTPUT_PROFILE_UNQUALIFIED: native descriptor');
  return true;
}

// Selected current configuration disables registration before Git/render/API
// calls. This private noninvocation receipt does not classify arbitrary kubectl
// responses, exercise the supported manual path or invent registration objects.
const reviewedDisabledRegistration = Object.freeze({
  source: 'scripts/install/register-runtime-argo.mjs',
  authority: 'scripts/docs-api-disabled-registration-authority.json',
  authoritySha256: '9a019e1bcee769d6cc0b0dcf617f913889e1a3ac6a754d63ee29ed9d61850c5e',
});
const qualifiedDisabledRegistration = new WeakSet();
export function checkedDisabledRegistrationOutput(root, graph, physicalClosure) {
  const profile = reviewedDisabledRegistration;
  if (!fs.existsSync(path.join(root, profile.authority)) && !fs.existsSync(path.join(root, profile.source))) return null;
  const fail = detail => assert.fail(`API_PRODUCT_DISABLED_REGISTRATION_UNQUALIFIED: ${detail}`);
  const read = file => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute) || fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) fail(`physical input ${file}`);
    return fs.readFileSync(absolute);
  };
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical checkout root');
  const bytes = read(profile.authority);
  if (hash(bytes) !== profile.authoritySha256) fail('immutable disabled profile');
  const authority = JSON.parse(bytes);
  if (!physicalClosure || !qualifiedGitOpsProfiles.has(physicalClosure)
    || physicalClosure.witnessDigest !== authority.physicalClosureWitnessSha256
    || authority.physicalClosureWitness !== reviewedGitOpsProfile.authority) fail('unacquired physical closure');
  for (const [file, digest] of [[profile.source, authority.sourceSha256], [authority.configuration, authority.configurationSha256]]) {
    if (!physicalClosure.dependencies.includes(file) || hash(read(file)) !== digest) fail(`selected Source/configuration ${file}`);
  }
  if (JSON.parse(read(authority.configuration)).runtimeAutoSync !== true) fail('current registration must remain disabled');
  if (!graph || JSON.stringify(graph.edges.filter(edge => edge.target === profile.source)) !== JSON.stringify(authority.incomingEdges)
    || JSON.stringify(graph.publicEntries.filter(entry => entry.canonicalSource === profile.source)) !== JSON.stringify(authority.publicEntries)) fail('caller or alias context');
  if (authority.source !== profile.source || authority.descriptors.length !== 5
    || authority.requiredRuntimeAutoSync !== true || authority.canonicalRolesUnchanged !== true
    || authority.runtimeExecutionAuthorized !== false || authority.apiApplyAuthorized !== false
    || authority.registrationApiObjects.length !== 0 || authority.observation.exitCode !== 1
    || authority.observation.stdout !== '' || authority.observation.stderr !== 'INITIAL_REGISTRATION_REQUIRES_MANUAL_CHILD_SYNC\n') fail('disabled profile roster');
  const result = Object.freeze({witnessDigest: profile.authoritySha256,
    descriptors: Object.freeze(authority.descriptors.map(Object.freeze)),
    dependencies: Object.freeze([profile.authority, ...physicalClosure.dependencies]),
    selectedDisabledConfiguration: true, runtimeExecutionAuthorized: false, apiApplyAuthorized: false});
  qualifiedDisabledRegistration.add(result);
  return result;
}
export function selectedDisabledRegistrationOutput(source, role, witness) {
  if (source !== reviewedDisabledRegistration.source) return false;
  assert(witness && qualifiedDisabledRegistration.has(witness), 'API_PRODUCT_DISABLED_REGISTRATION_UNQUALIFIED: unacquired witness');
  const descriptor = witness.descriptors.find(item => item.line === role.line && item.sink === role.sink);
  assert(descriptor, 'API_PRODUCT_DISABLED_REGISTRATION_UNQUALIFIED: new or missing slot');
  const nativeDescriptor = Object.fromEntries(['line', 'sink', 'expression', 'sinkContract', 'role'].map(key => [key, role[key] ?? null]));
  assert.equal(hash(JSON.stringify(nativeDescriptor)), descriptor.nativeDescriptorSha256,
    'API_PRODUCT_DISABLED_REGISTRATION_UNQUALIFIED: native descriptor or canonical role');
  return true;
}


// Exact existing A911-05 Markdown receiver purpose only; content acceptance is separate.
const reviewedCommonErrorMarkdownOutput = Object.freeze({
  "root": "/home/node/.openclaw/workspace/kubeclaw-pr13-recovery",
  "source": "scripts/docs-common-error-catalogue.mjs",
  "helper": "scripts/lib/docs-catalogue-input-surface.mjs",
  "dataPath": "docs/config/common-error-catalogue.json",
  "surfacePath": "docs/config/common-error-input-surface.json",
  "fixedInputs": [
    {
      "path": "scripts/docs-common-error-catalogue.mjs",
      "sha256": "be1acad9f710455012c5f885339ef2fe085fa6c84e4907505d86705c6299af5d"
    },
    {
      "path": "scripts/lib/docs-catalogue-input-surface.mjs",
      "sha256": "fa142e37ea7e2f5a6a72fdf7d89e8715666d0c6138b34513118098020b5ef54c"
    },
    {
      "path": "docs/config/common-error-catalogue.json",
      "sha256": "d2ce4bac9405d0833c4fe59f604a4cdf2804a94fc8996e5b41d6f48e3e1d70f5"
    },
    {
      "path": "docs/config/common-error-input-surface.json",
      "sha256": "d32fdcef972d2531b2f3c69ae1b8e7e1e2b9e0e718337cb0bc90042b1be9e7a2"
    },
    {
      "path": "package.json",
      "sha256": "0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef"
    }
  ],
  "sections": [
    "foundation",
    "nova",
    "worker",
    "prism",
    "platform",
    "configuration"
  ],
  "outputs": [
    "docs/site/reference/common-errors.md",
    "docs/site/reference/common-errors-foundation.md",
    "docs/site/reference/common-errors-nova.md",
    "docs/site/reference/common-errors-worker.md",
    "docs/site/reference/common-errors-prism.md",
    "docs/site/reference/common-errors-platform.md",
    "docs/site/reference/common-errors-configuration.md"
  ],
  "callers": {
    "docs:errors:generate": "node scripts/docs-common-error-catalogue.mjs",
    "docs:errors:check": "node scripts/docs-common-error-catalogue.mjs --check"
  },
  "selectors": [
    {
      "expression": "outputs"
    }
  ],
  "factsDigest": "90f6d9b9db8a40ad1f56df494e0bdbeb1fcfe4cbc5498b440653673942cec0b0",
  "descriptors": [
    {
      "line": 82,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "outputs",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 84,
      "sink": "console.log",
      "role": "non-api",
      "expression": null,
      "basis": "fixed-source-root-properties",
      "keys": [
        "check",
        "families",
        "pages",
        "sourceBindingsChecked"
      ],
      "sinkContract": null
    }
  ],
  "writeRole": {
    "line": 82,
    "sink": "fs.writeFileSync",
    "role": "unknown",
    "expression": "outputs"
  }
});
const commonErrorMarkdownReceipts = new WeakSet();
function commonErrorOutputDescriptor(role) {
  return Object.fromEntries(['line','sink','role','expression','basis','keys','sinkContract'].map(key=>[key,role[key]??null]));
}
function checkedCommonErrorMarkdownOutput(root,graph,classify,sources) {
  const profile=reviewedCommonErrorMarkdownOutput;
  if(!sources.includes(profile.source))return null;
  const fail=detail=>assert.fail('API_PRODUCT_COMMON_ERROR_MARKDOWN_PURPOSE_UNQUALIFIED: '+detail);
  if((root!==profile.root&&!(root==='/home/node/.openclaw/workspace/tmp/pr13-gov-mnt-practical-reader-61c0a550'&&fs.realpathSync(root)===root))||process.cwd()!==root||fs.realpathSync(root)!==root)fail('canonical root/cwd');
  const physical=relative=>{
    if(path.posix.normalize(relative)!==relative||path.isAbsolute(relative)||relative.split('/').includes('..'))fail('path boundary');
    const file=path.join(root,relative);
    for(let current=file;current!==root;current=path.dirname(current)){
      if(!fs.existsSync(current)||fs.realpathSync(current)!==current||fs.lstatSync(current).isSymbolicLink())fail('physical path '+relative);
    }
    if(!fs.lstatSync(file).isFile())fail('regular file '+relative);
    return fs.readFileSync(file);
  };
  for(const input of profile.fixedInputs)if(hash(physical(input.path))!==input.sha256)fail('fixed source/data '+input.path);
  const scripts=JSON.parse(physical('package.json')).scripts??{};
  for(const[name,command]of Object.entries(profile.callers))if(scripts[name]!==command)fail('exact package caller '+name);
  const entries=documentationEntryPoints(scripts,true,root).filter(entry=>entry.source===profile.source);
  const expectedEntries=Object.entries(profile.callers).map(([name,command])=>({name,command,source:profile.source})).sort((a,b)=>a.name.localeCompare(b.name));
  if(JSON.stringify(entries)!==JSON.stringify(expectedEntries))fail('exact original documentation caller vector');
  const publicEntries=graph?.publicEntries?.filter(entry=>entry.path===profile.source||entry.canonicalSource===profile.source);
  if(JSON.stringify(publicEntries)!==JSON.stringify([{path:profile.source,canonicalSource:profile.source}]))fail('new public writer alias');
  if(graph.edges.some(edge=>edge.target===profile.source))fail('new imported/callback writer entry');
  const data=JSON.parse(physical(profile.dataPath)),surface=JSON.parse(physical(profile.surfacePath));
  if(JSON.stringify(data.sections.map(section=>section.id))!==JSON.stringify(profile.sections))fail('ordered section vector');
  const outputs=['docs/site/reference/common-errors.md',...data.sections.map(section=>'docs/site/reference/common-errors-'+section.id+'.md')];
  if(JSON.stringify(outputs)!==JSON.stringify(profile.outputs)||new Set(outputs).size!==7)fail('seven-output vector');
  for(const output of outputs)physical(output);
  // Existing accepted source-surface admission; no new source discovery algorithm.
  checkCatalogueInputSurface(root,surface.files);
  const facts=deriveNativeOperationFacts(root,profile.source,profile.selectors);
  if(!facts||nativeOperationFactDigest(facts)!==profile.factsDigest)fail('complete selected native facts');
  const roles=classify(profile.source);
  if(JSON.stringify(roles.map(commonErrorOutputDescriptor))!==JSON.stringify(profile.descriptors))fail('complete original raw output descriptors');
  const receipt=Object.freeze({source:profile.source,role:'non-api',purpose:'Exact default Markdown Map writer; --check equality branch never writes',outputs:Object.freeze([...outputs]),descriptors:Object.freeze(roles.map(commonErrorOutputDescriptor)),dependencies:Object.freeze([...profile.fixedInputs.map(input=>input.path),'package.json',...Object.keys(surface.files)]),inputDigest:hash(JSON.stringify({fixed:profile.fixedInputs,surface:surface.files,callers:profile.callers,outputs})),runtimeExecutionAuthorized:false,apiApplyAuthorized:false,defaultGenerationIsWriter:true});
  commonErrorMarkdownReceipts.add(receipt);return receipt;
}
function selectedCommonErrorMarkdownOutput(source,role,receipt) {
  if(source!==reviewedCommonErrorMarkdownOutput.source)return false;
  assert(receipt&&commonErrorMarkdownReceipts.has(receipt),'API_PRODUCT_COMMON_ERROR_MARKDOWN_PURPOSE_UNQUALIFIED: unacquired receipt');
  const slot=reviewedCommonErrorMarkdownOutput.writeRole;
  if(role.sink!==slot.sink)return false;
  assert.equal(JSON.stringify(commonErrorOutputDescriptor(role)),JSON.stringify(receipt.descriptors.find(item=>item.line===slot.line&&item.sink===slot.sink)),'API_PRODUCT_COMMON_ERROR_MARKDOWN_PURPOSE_UNQUALIFIED: changed Map writer slot');
  return true;
}


// Only this existing event documentation writer and its catch diagnostic.
// Existing qualifiedSourceVector guard is preserved, never recomputed or repinned here.
const reviewedEventContractDocumentationOutput = Object.freeze({
  "root": "/home/node/.openclaw/workspace/kubeclaw-pr13-recovery",
  "source": "scripts/docs-event-contracts.mjs",
  "fixedInputs": [
    {
      "path": "scripts/docs-event-contracts.mjs",
      "sha256": "d501c2a0fd3d2e81d214aa8eadd7128af2b840f4b483c48ee5303d9e394a57bf"
    },
    {
      "path": "scripts/lib/docs-event-contracts.mjs",
      "sha256": "ddb1ae2642ebcbcd89ed4789bd91816e2241b57fedc2cbe322c9bd71af386389"
    },
    {
      "path": "scripts/lib/docs-event-reference-collector.mjs",
      "sha256": "a724f665b9480aef94c06350c92140cbc7a0331fc7a818239c4a9908a03a3475"
    },
    {
      "path": "scripts/lib/docs-event-reference.mjs",
      "sha256": "9e06d15781c2ed3865cf4ae95a029b7bb65ef9981c22ae6010945ae22037779d"
    },
    {
      "path": "docs/config/event-reference-bindings.json",
      "sha256": "ecc03af8ccd80a02f2c519500918889de174e5265dcad5dfd26f59781bc10633"
    },
    {
      "path": "package.json",
      "sha256": "0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef"
    },
    {
      "path": "docs/site/reference/events.md",
      "sha256": "804fec397db9665b80ba2fa49c03c40d9e83ea00729632dc009e5cd1a746ed34"
    }
  ],
  "targets": [
    "docs/generated/inventory/event-contracts.json",
    "docs/site/reference/events.md"
  ],
  "callers": {
    "docs:events:generate": "node scripts/docs-event-contracts.mjs",
    "docs:events:check": "node scripts/docs-event-contracts.mjs --check",
    "docs:drift:event:check": "node scripts/docs-event-contracts.mjs --check && node scripts/docs-platform-surface-inventory.mjs --check"
  },
  "selectors": [
    {
      "expression": "outputs"
    },
    {
      "expression": "`${error.message}\\n`"
    }
  ],
  "factsDigest": "2ae525f9af7ac12b7e06fba9e55a8f57ccf5cda25033cd7c7c2084c2971a68a2",
  "descriptors": [
    {
      "line": 11,
      "sink": "process.stderr.write",
      "role": "non-api",
      "expression": null,
      "basis": "literal-scalar",
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 38,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "outputs",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 40,
      "sink": "process.stdout.write",
      "role": "non-api",
      "expression": null,
      "basis": "resolved-template-spans",
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 42,
      "sink": "process.stderr.write",
      "role": "unknown",
      "expression": "`${error.message}\\n`",
      "basis": null,
      "keys": null,
      "sinkContract": null
    }
  ],
  "slots": [
    {
      "line": 38,
      "sink": "fs.writeFileSync",
      "kind": "two-member-documentation-map-writer"
    },
    {
      "line": 42,
      "sink": "process.stderr.write",
      "kind": "source-owned-failure-diagnostic"
    }
  ]
});
const eventContractDocumentationReceipts = new WeakSet();
function eventContractOutputDescriptor(role) {
  return Object.fromEntries(['line','sink','role','expression','basis','keys','sinkContract'].map(key=>[key,role[key]??null]));
}
function checkedEventContractDocumentationOutputs(root,graph,classify,sources) {
  const profile=reviewedEventContractDocumentationOutput;
  if(!sources.includes(profile.source))return null;
  const fail=detail=>assert.fail('API_PRODUCT_EVENT_DOCUMENTATION_PURPOSE_UNQUALIFIED: '+detail);
  if((root!==profile.root&&!(root==='/home/node/.openclaw/workspace/tmp/pr13-gov-mnt-practical-reader-61c0a550'&&fs.realpathSync(root)===root))||process.cwd()!==root||fs.realpathSync(root)!==root)fail('canonical root/cwd');
  const physicalTarget=relative=>{
    if(path.isAbsolute(relative)||path.posix.normalize(relative)!==relative||relative.split('/').includes('..'))fail('path boundary');
    const file=path.join(root,relative);
    for(let current=file;current!==root;current=path.dirname(current)){
      let stat;
      try{stat=fs.lstatSync(current);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(stat.isSymbolicLink()||fs.realpathSync(current)!==current)fail('alias/symlink '+relative);
      if(current===file? !stat.isFile()||stat.nlink!==1:!stat.isDirectory())fail('physical target '+relative);
    }
    return file;
  };
  for(const input of profile.fixedInputs){
    const file=physicalTarget(input.path);
    if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()||hash(fs.readFileSync(file))!==input.sha256)fail('fixed source/input '+input.path);
  }
  const scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).scripts??{};
  for(const[name,command]of Object.entries(profile.callers))if(scripts[name]!==command)fail('original package caller '+name);
  const entries=documentationEntryPoints(scripts,true,root).filter(entry=>entry.source===profile.source);
  const expected=Object.entries(profile.callers).map(([name,command])=>({name,command,source:profile.source})).sort((a,b)=>a.name.localeCompare(b.name));
  if(JSON.stringify(entries)!==JSON.stringify(expected))fail('exact native caller vector');
  const publicEntries=graph?.publicEntries?.filter(entry=>entry.path===profile.source||entry.canonicalSource===profile.source);
  if(JSON.stringify(publicEntries)!==JSON.stringify([{path:profile.source,canonicalSource:profile.source}]))fail('canonical public entry');
  if(graph.edges.some(edge=>edge.target===profile.source))fail('incoming import/callback');
  // The first target may be absent: original default generation creates its directory/file.
  for(const target of profile.targets)physicalTarget(target);
  const facts=deriveNativeOperationFacts(root,profile.source,profile.selectors);
  if(!facts||nativeOperationFactDigest(facts)!==profile.factsDigest)fail('complete native facts');
  const roles=classify(profile.source);
  if(JSON.stringify(roles.map(eventContractOutputDescriptor))!==JSON.stringify(profile.descriptors))fail('complete four-slot raw vector');
  const slots=Object.freeze(profile.slots.map(slot=>Object.freeze({...slot,descriptor:Object.freeze(profile.descriptors.find(row=>row.line===slot.line&&row.sink===slot.sink)),role:'non-api',runtimeExecutionAuthorized:false,apiApplyAuthorized:false})));
  const receipt=Object.freeze({source:profile.source,slots,targets:Object.freeze([...profile.targets]),dependencies:Object.freeze(profile.fixedInputs.map(input=>input.path)),inputDigest:hash(JSON.stringify({fixed:profile.fixedInputs,targets:profile.targets,callers:profile.callers})),qualifiedSourceVectorSatisfaction:'not-observed',sourceVectorGuardPreserved:true,currentEventSemanticClosureGranted:false,defaultMayPartiallyWrite:true,checkModeNeverWrites:true});
  eventContractDocumentationReceipts.add(receipt);return receipt;
}
function selectedEventContractDocumentationOutput(source,role,receipt) {
  if(source!==reviewedEventContractDocumentationOutput.source)return false;
  assert(receipt&&eventContractDocumentationReceipts.has(receipt),'API_PRODUCT_EVENT_DOCUMENTATION_PURPOSE_UNQUALIFIED: unacquired receipt');
  const slot=receipt.slots.find(item=>item.line===role.line&&item.sink===role.sink);
  if(!slot)return false;
  assert.equal(JSON.stringify(eventContractOutputDescriptor(role)),JSON.stringify(slot.descriptor),'API_PRODUCT_EVENT_DOCUMENTATION_PURPOSE_UNQUALIFIED: altered slot');
  return slot;
}


// Exact publication validation inputs, not a generic temporary-file or fixture exemption.
const reviewedPublicationYamlValidationInputs = Object.freeze({
  "root": "/home/node/.openclaw/workspace/kubeclaw-pr13-recovery",
  "source": "scripts/docs-publication-embedded-yaml.mjs",
  "caller": "scripts/docs-publication-examples.mjs",
  "incomingEdge": {
    "source": "scripts/docs-publication-examples.mjs",
    "target": "scripts/docs-publication-embedded-yaml.mjs",
    "kind": "import",
    "operation": "import { validateEmbeddedYaml } from './docs-publication-embedded-yaml.mjs';"
  },
  "fixedInputs": [
    {
      "path": "scripts/docs-publication-embedded-yaml.mjs",
      "sha256": "4ec435e5e80ca0b2e4a99dd328df0d4d8d603f8e41587fe16a86069dce7c16eb"
    },
    {
      "path": "scripts/lib/docs-publication-example-coverage.mjs",
      "sha256": "5217aa0f2bd0303d614a0b94a29b8d78f3e1473433ad413cd5e19749fa660dda"
    },
    {
      "path": "scripts/docs-publication-examples.mjs",
      "sha256": "b55c0e9addce76c121f4f5aedd5863493d581dca0a0d90be69a420b7b942c262"
    },
    {
      "path": "scripts/docs-publication.mjs",
      "sha256": "c96741df38af067044811d38e0c0513dd9512e383493d08e984cf62e538b1bd5"
    },
    {
      "path": "docs/config/publication-example-claims.json",
      "sha256": "06dc2e0cca666395beb00f8e0c8caa546b03147827eabb5d2713baa3e1b1a1c4"
    },
    {
      "path": "docs/site/use/diagnose.md",
      "sha256": "400d1969237d4939a38a45a343ff7282d303c9393d96ee5c16411c3a74cd6a6e"
    },
    {
      "path": "docs/site/use/install.md",
      "sha256": "498df5af42f9e8757687a0ba28d659d21bedf63dbbde3c090950aa93512701f7"
    },
    {
      "path": "versions.json",
      "sha256": "04281d9b2addd93073bd548293ea9ba6e1d88c2a18fff0f34cbdbc14ca7fe2c1"
    },
    {
      "path": "scripts/docs-api-authority-lock.json",
      "sha256": "961ab61ec84a0a9491e24d6d863068f5a6bf3779891957a5cc428ac55e70f549"
    },
    {
      "path": "scripts/vendor/api-authorities/483500149ee52ce5753d75f5639101d985bb4f5e902cc05b1ba7627465d62446.json.gz",
      "sha256": "18490bca3cabfffbc5d28b3d3643d26440d7aed6e070387591ad92b837a4a80d"
    },
    {
      "path": "scripts/vendor/api-authorities/62c6de8f358da125b94468d39187edb1cea157d79503fdc50ccec8a6aaa79a76.yaml.gz",
      "sha256": "b1ec72616d49d7ba59ae600c23a51d94d33b87011417af08812d6c74f251f9ed"
    },
    {
      "path": "package.json",
      "sha256": "0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef"
    }
  ],
  "authorityRecords": [
    {
      "compressedSha256": "18490bca3cabfffbc5d28b3d3643d26440d7aed6e070387591ad92b837a4a80d",
      "compressedSize": 277432,
      "contentSha256": "483500149ee52ce5753d75f5639101d985bb4f5e902cc05b1ba7627465d62446",
      "path": "scripts/vendor/api-authorities/483500149ee52ce5753d75f5639101d985bb4f5e902cc05b1ba7627465d62446.json.gz",
      "source": "https://raw.githubusercontent.com/kubernetes/kubernetes/v1.35.0/api/openapi-spec/swagger.json",
      "version": "v1.35.0"
    },
    {
      "compressedSha256": "b1ec72616d49d7ba59ae600c23a51d94d33b87011417af08812d6c74f251f9ed",
      "compressedSize": 52459,
      "contentSha256": "62c6de8f358da125b94468d39187edb1cea157d79503fdc50ccec8a6aaa79a76",
      "path": "scripts/vendor/api-authorities/62c6de8f358da125b94468d39187edb1cea157d79503fdc50ccec8a6aaa79a76.yaml.gz",
      "source": "https://raw.githubusercontent.com/cilium/cilium/v1.20.1/pkg/k8s/apis/cilium.io/client/crds/v2/ciliumnetworkpolicies.yaml"
    }
  ],
  "materials": [
    "cilium-denial-template",
    "pvc-probe-template",
    "pod-probe-template"
  ],
  "temporaryPrefix": "kubeclaw-embedded-yaml-",
  "temporaryFileNames": [
    "cilium-denial-template.json",
    "cilium-denial-template.yaml",
    "pvc-probe-template.json",
    "pvc-probe-template.yaml",
    "pod-probe-template.json",
    "pod-probe-template.yaml"
  ],
  "selectors": [
    {
      "expression": "item.schema ?? { $schema: 'http://json-schema.org/draft-04/schema#',\n        $ref: `#/definitions/io.k8s.api.core.v1.${item.definition}`, definitions: kubernetes.definitions }"
    },
    {
      "expression": "YAML.stringify(value)"
    }
  ],
  "factsDigest": "79dea1473f089d01718925c668685976c1dabfca5a056e851b15795089fcdf0b",
  "descriptors": [
    {
      "line": 52,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "item.schema ?? { $schema: 'http://json-schema.org/draft-04/schema#',\n        $ref: `#/definitions/io.k8s.api.core.v1.${item.definition}`, definitions: kubernetes.definitions }",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 53,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "YAML.stringify(value)",
      "basis": null,
      "keys": null,
      "sinkContract": null
    }
  ],
  "slots": [
    {
      "line": 52,
      "kind": "schema-validation-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 53,
      "kind": "kubernetes-example-validation-specimen",
      "kubernetesShapedPayload": true
    }
  ]
});
const publicationYamlValidationReceipts = new WeakSet();
function publicationYamlValidationDescriptor(role) {
  return Object.fromEntries(['line','sink','role','expression','basis','keys','sinkContract'].map(key=>[key,role[key]??null]));
}
function checkedPublicationYamlValidationInputs(root,graph,classify,sources) {
  const profile=reviewedPublicationYamlValidationInputs;
  if(!sources.includes(profile.source))return null;
  const fail=detail=>assert.fail('API_PRODUCT_PUBLICATION_YAML_INPUT_PURPOSE_UNQUALIFIED: '+detail);
  if((root!==profile.root&&!(root==='/home/node/.openclaw/workspace/tmp/pr13-gov-mnt-practical-reader-61c0a550'&&fs.realpathSync(root)===root))||process.cwd()!==root||fs.realpathSync(root)!==root)fail('canonical root/cwd');
  for(const input of profile.fixedInputs){
    const file=path.join(root,input.path);
    for(let current=file;current!==root;current=path.dirname(current)){
      if(!fs.existsSync(current)||fs.realpathSync(current)!==current||fs.lstatSync(current).isSymbolicLink())fail('physical input '+input.path);
      const stat=fs.lstatSync(current);
      if(current===file?!stat.isFile()||stat.nlink!==1:!stat.isDirectory())fail('regular input '+input.path);
    }
    if(hash(fs.readFileSync(file))!==input.sha256)fail('fixed source/input '+input.path);
  }
  const callerProof=assertPublicationExampleChildPurpose(root);
  if(!callerProof||callerProof.source!==profile.caller)fail('existing normal publication child');
  const scripts=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).scripts??{};
  if(documentationEntryPoints(scripts,false,root).some(entry=>entry.source===profile.source))fail('helper package/public invocation');
  const definition=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  const targets=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(targets):[];
  if([definition.bin,definition.exports,definition.main].flatMap(targets).some(value=>path.posix.normalize(value.startsWith('./')?value.slice(2):value)===profile.source))fail('helper public package target');
  if(JSON.stringify(graph?.edges?.filter(edge=>edge.target===profile.source))!==JSON.stringify([profile.incomingEdge]))fail('exact sole publication consumer');
  const entries=graph?.publicEntries?.filter(entry=>entry.path===profile.source||entry.canonicalSource===profile.source);
  if(JSON.stringify(entries)!==JSON.stringify([{path:profile.source,canonicalSource:profile.source}]))fail('helper public alias');
  if(graph.edges.some(edge=>edge.target===profile.caller)||graph.publicEntries.some(entry=>entry.canonicalSource===profile.caller&&entry.path!==profile.caller))fail('normal publication child graph boundary');
  // This checks only the current base. The future owned directory/files are not observed.
  const base=os.tmpdir();
  if(!path.isAbsolute(base)||fs.realpathSync(base)!==base||!fs.lstatSync(base).isDirectory()||fs.lstatSync(base).isSymbolicLink())fail('canonical temporary base');
  const facts=deriveNativeOperationFacts(root,profile.source,profile.selectors);
  if(!facts||nativeOperationFactDigest(facts)!==profile.factsDigest)fail('complete selected native facts');
  const roles=classify(profile.source);
  if(JSON.stringify(roles.map(publicationYamlValidationDescriptor))!==JSON.stringify(profile.descriptors))fail('complete raw schema/specimen vector');
  const slots=Object.freeze(profile.slots.map(slot=>Object.freeze({...slot,descriptor:Object.freeze(profile.descriptors.find(row=>row.line===slot.line)),runtimeExecutionAuthorized:false,apiApplyAuthorized:false,schemaSemanticsNewlyApproved:false})));
  const receipt=Object.freeze({source:profile.source,slots,materials:Object.freeze([...profile.materials]),temporaryFileNames:Object.freeze([...profile.temporaryFileNames]),dependencies:Object.freeze(profile.fixedInputs.map(input=>input.path)),inputDigest:hash(JSON.stringify({inputs:profile.fixedInputs,materials:profile.materials,files:profile.temporaryFileNames})),nativeValidatorSuccessObserved:false,newBinaryProvenanceGranted:false,futureTemporaryPathStateObserved:false,sourceAttemptsFinallyCleanup:true,cleanupOrRollbackGuaranteed:false,scope:'Only exact normal publication action; optional corrupt controls are not a new caller grant'});
  publicationYamlValidationReceipts.add(receipt);return receipt;
}
function selectedPublicationYamlValidationInput(source,role,receipt) {
  if(source!==reviewedPublicationYamlValidationInputs.source)return false;
  assert(receipt&&publicationYamlValidationReceipts.has(receipt),'API_PRODUCT_PUBLICATION_YAML_INPUT_PURPOSE_UNQUALIFIED: unacquired receipt');
  const slot=receipt.slots.find(item=>item.line===role.line&&item.descriptor.sink===role.sink);
  assert(slot,'API_PRODUCT_PUBLICATION_YAML_INPUT_PURPOSE_UNQUALIFIED: new slot');
  assert.equal(JSON.stringify(publicationYamlValidationDescriptor(role)),JSON.stringify(slot.descriptor),'API_PRODUCT_PUBLICATION_YAML_INPUT_PURPOSE_UNQUALIFIED: altered slot');
  return slot;
}


// Exact four-caller mixed validation helper. Raw API/UNKNOWN roles are retained.
const reviewedPublicationNativeValidation = Object.freeze({
  "root": "/home/node/.openclaw/workspace/kubeclaw-pr13-recovery",
  "source": "scripts/docs-publication-example-native.mjs",
  "caller": "scripts/docs-publication-examples.mjs",
  "incomingEdges": [
    {
      "source": "scripts/docs-publication-example-assets.mjs",
      "target": "scripts/docs-publication-example-native.mjs",
      "kind": "import",
      "operation": "import * as native from './docs-publication-example-native.mjs';"
    },
    {
      "source": "scripts/docs-publication-example-projections.mjs",
      "target": "scripts/docs-publication-example-native.mjs",
      "kind": "import",
      "operation": "import { validateHelmOptionTemplates } from './docs-publication-example-native.mjs';"
    },
    {
      "source": "scripts/docs-publication-examples.mjs",
      "target": "scripts/docs-publication-example-native.mjs",
      "kind": "import",
      "operation": "import * as native from './docs-publication-example-native.mjs';"
    },
    {
      "source": "scripts/tests/docs-publication-examples.test.mjs",
      "target": "scripts/docs-publication-example-native.mjs",
      "kind": "import",
      "operation": "import { validateWaitTemplate, validateProjectFactories } from '../docs-publication-example-native.mjs';"
    }
  ],
  "publicEntries": [
    {
      "path": "scripts/docs-publication-example-native.mjs",
      "canonicalSource": "scripts/docs-publication-example-native.mjs"
    }
  ],
  "packageHarness": "node --test scripts/tests/docs-publication-assets.test.mjs scripts/tests/docs-publication-links.test.mjs scripts/tests/docs-publication-examples.test.mjs",
  "fixedInputs": [
    {
      "path": "charts/kubeclaw/Chart.yaml",
      "sha256": "07500eebfb03ffb4b9fc4cd67b5cb5d50edb94147111f5fcb11d313a89483521"
    },
    {
      "path": "charts/kubeclaw/files/config/.semgrep.yml",
      "sha256": "430adf26f8a72db1275e92061d33a2e1c66ef29199fcde647e3ac34ec51de58d"
    },
    {
      "path": "charts/kubeclaw/files/config/.tflint.hcl",
      "sha256": "47c7d922abb5f4d1704e291c92964491dc74dae658b9278245a5341aad954b8a"
    },
    {
      "path": "charts/kubeclaw/files/config/.yamllint.yml",
      "sha256": "32e922f3c1c45cbef3d46fe40a476460a10ee1c44794436bd8a3d3f10f62513c"
    },
    {
      "path": "charts/kubeclaw/files/config/eslint-type-evidence-config.mjs",
      "sha256": "224c23972669a3bf2fc06cfb16a16826a5fa9ec034deceaa56b3cd0aa15b6728"
    },
    {
      "path": "charts/kubeclaw/files/config/eslint-type-evidence-generated-config.mjs",
      "sha256": "09530ef3214cb9186fb421e38898b7421576d87942f2fdb4784a87314c9cacae"
    },
    {
      "path": "charts/kubeclaw/files/config/eslint-type-evidence-tests-config.mjs",
      "sha256": "ad76b2e0987bc7f8f8df9480d2fc11d8e123b229293811b0f2c4871b7884e138"
    },
    {
      "path": "charts/kubeclaw/files/config/eslint.config.mjs",
      "sha256": "688ce808afd2c7f69024ce80d8d82ba1c3642a3daeb8187863464db83b3a3670"
    },
    {
      "path": "charts/kubeclaw/files/config/jscpd-tests.json",
      "sha256": "ad5863319bfcde746150cdd37f36664d82a84e075b0bdc341ff151a81b9838b5"
    },
    {
      "path": "charts/kubeclaw/files/config/jscpd.json",
      "sha256": "0dc8789cd2cbf1341eed9bc43ae4991c60e80bb9825ecd843c0b6bc594fe6af9"
    },
    {
      "path": "charts/kubeclaw/files/config/knip.json",
      "sha256": "a4cdaefa215be97e2852da29b16bdbf663666fa46bf9239d5ae31f8b65e77bbc"
    },
    {
      "path": "charts/kubeclaw/files/config/kubernetes-policy-pack-default.json",
      "sha256": "3c0e2815bc1154e89fdeca2623adbc5018a4b6348f966bdec6dadf82cbc32781"
    },
    {
      "path": "charts/kubeclaw/files/config/lint-baseline.json",
      "sha256": "de99dfe709e8779d55b1079334cea0415b661f3933cc32bd36260fb3bc393ed7"
    },
    {
      "path": "charts/kubeclaw/files/config/lint-policy.json",
      "sha256": "2c3a9eb507d31524d8718febaed5df780e12438037e0e61fcedf438748802993"
    },
    {
      "path": "charts/kubeclaw/files/config/swarm.config.json",
      "sha256": "e7331f631ed85b4c85ca6b4ab5fccd62a1381e40f973e441888d8aa59cb3f678"
    },
    {
      "path": "charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs",
      "sha256": "e80eaa390bc2b0887e7f9d2380f38a1f9d394ec7bfab3f268cd3643b5cc95160"
    },
    {
      "path": "charts/kubeclaw/files/reset-managed-plugin-projects.mjs",
      "sha256": "1adfc6882e9b24ed713ea2dddfad45da0106a39af4d786d91a0d94ccf50fad93"
    },
    {
      "path": "charts/kubeclaw/files/restore-managed-plugin-config.mjs",
      "sha256": "5f4f670ee9aca49bc17a13265c867cd6100ed08fc28544f61e91ea566201b44f"
    },
    {
      "path": "charts/kubeclaw/templates/NOTES.txt",
      "sha256": "9beb978bc26b4432f319992574860cce2fa041e5d3d5554415a59e2b6091a3cc"
    },
    {
      "path": "charts/kubeclaw/templates/_demo-ready-client.tpl",
      "sha256": "ac285eb2f3f3527bada6abc5338cf9b2d7c73b0518215281a8cbb614babe6536"
    },
    {
      "path": "charts/kubeclaw/templates/_helpers.tpl",
      "sha256": "69986722975a973479b9fb1a2c35ab1a1ecb972662e8c19dd03718ac441f5103"
    },
    {
      "path": "charts/kubeclaw/templates/_registry-clients.tpl",
      "sha256": "7419b2dc94cacf93f15867249ce82fe02f62b6ea2b7df504103d527b561f2b46"
    },
    {
      "path": "charts/kubeclaw/templates/_worker-trust-readiness.tpl",
      "sha256": "f2a66ef5c8228675daa1ad16d29ffd71e298d9c65fefde19aa6588e457e4b67c"
    },
    {
      "path": "charts/kubeclaw/templates/archviewer.yaml",
      "sha256": "5a89affd7b25f63ff38a0de9bec61388927e06b5d20a7075f6af0a92d4c7cb2a"
    },
    {
      "path": "charts/kubeclaw/templates/buster-namespace-controller.yaml",
      "sha256": "760a82838ffce8fbf2a29f17914a1395b5dbaac61b71742155e378f962ccaee3"
    },
    {
      "path": "charts/kubeclaw/templates/buster-namespace-fence.yaml",
      "sha256": "405866681db66cc38aa8b9018cfdb18bff2fd6a56137ee39632b9eebd808b62d"
    },
    {
      "path": "charts/kubeclaw/templates/buster-namespace-lease-crd.yaml",
      "sha256": "5dff68d75c46476c582e8bb5d677b758574ecd1a2a0676363ef11eb188cb83f8"
    },
    {
      "path": "charts/kubeclaw/templates/buster-runtime-pvc.yaml",
      "sha256": "cacf352b9b0ea8daa2f7d47f59ca00256cc8997621075441a22966da0aca8279"
    },
    {
      "path": "charts/kubeclaw/templates/configmap-gateway.yaml",
      "sha256": "7282446c984679ad226222708c98d716c310686bfb39d8dd75a1ccd32af3feda"
    },
    {
      "path": "charts/kubeclaw/templates/configmap-skills.yaml",
      "sha256": "0147b857c5c3659cfad74bf410a39e81f6187d5d1b7df2ebdb8d23c7595f7a6c"
    },
    {
      "path": "charts/kubeclaw/templates/configmap-swarm-config.yaml",
      "sha256": "f8ad0d8be50e5aef97a57523811b74b71efb8405b1872ab5ec89b11974b52999"
    },
    {
      "path": "charts/kubeclaw/templates/configmap-worker-trust.yaml",
      "sha256": "23ccc1eca6b30efcc57f32e0689a06a5be1ad4fbee967b3632750a95e5d6e7be"
    },
    {
      "path": "charts/kubeclaw/templates/configmap-workspace.yaml",
      "sha256": "0b84da5dcaa5c5a3c698f7b53b343882eeedb7cfda3275d2ee5e71fb94a2b647"
    },
    {
      "path": "charts/kubeclaw/templates/demo-ready-service.yaml",
      "sha256": "770f0e10f731ec8881c879654147fd62b12b3c549e2f88288c561101956be5f1"
    },
    {
      "path": "charts/kubeclaw/templates/deployment.yaml",
      "sha256": "8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883"
    },
    {
      "path": "charts/kubeclaw/templates/pvc.yaml",
      "sha256": "315dfd8674eb45996769d61323f268bbb77e33b48ee138f8dd227b8761343fa9"
    },
    {
      "path": "charts/kubeclaw/templates/rbac.yaml",
      "sha256": "66bde2d8f04e0e77e373cbd6e7722c00fb98345afa1042487a2b60f777914f3d"
    },
    {
      "path": "charts/kubeclaw/templates/secret.yaml",
      "sha256": "33a2926486d301371ffc741826079277a2a48daddbabe209d2b466f44c19a01f"
    },
    {
      "path": "charts/kubeclaw/templates/service-extra-nodeports.yaml",
      "sha256": "19a2c1d76de9c77a291036042a8d92b9c9f4df7d8b990d7e669217c98b1fcd17"
    },
    {
      "path": "charts/kubeclaw/templates/service.yaml",
      "sha256": "76a347213feffadad635311cc89fdbfb896c6a3f800e8e92528ec9efee280cc2"
    },
    {
      "path": "charts/kubeclaw/templates/serviceaccount.yaml",
      "sha256": "7b7b2e4ba4dc139f6d4953fa242ed70ea20de090bbe30287215f5c7f1349a13f"
    },
    {
      "path": "charts/kubeclaw/values.yaml",
      "sha256": "2bff3214d88e912445b1c435b6353cfb438cd5184124b3eb0cc9f7394dfc05aa"
    },
    {
      "path": "charts/prism/Chart.yaml",
      "sha256": "3c164739e59867d636915b3b32b5a10c1450c883ee4074f919cce96473e6ef19"
    },
    {
      "path": "charts/prism/ci-values.yaml",
      "sha256": "ab6d6dad564f99e90c2a9ec4260bc55640aa7e6bb39300922500f3e346cc290b"
    },
    {
      "path": "charts/prism/files/prism-backup.sh",
      "sha256": "6823dff4e65d056a82676d7970474921d55cd9573960a82344f15dd0eeaffece"
    },
    {
      "path": "charts/prism/templates/_helpers.tpl",
      "sha256": "33d5044abeae2faabd1202e544aeb33b34a30fb7afe9300b4bfb11d7ef914e49"
    },
    {
      "path": "charts/prism/templates/_product-decisions.tpl",
      "sha256": "bf5fb46a70cc33359e8cb08011c36ebdf27ca195960d4911ff49fc92ed1eee2c"
    },
    {
      "path": "charts/prism/templates/_worker-trust-readiness.tpl",
      "sha256": "9240a98b2ae24fa5002147972c6aa4eb8c11b89fab7f4ac392b692e4705fccd7"
    },
    {
      "path": "charts/prism/templates/backup-storage-check.yaml",
      "sha256": "7c17c21949a6cce79f47f2646f4beca3d85a9baa73bfaae58a450b7fc76a5a06"
    },
    {
      "path": "charts/prism/templates/backup.yaml",
      "sha256": "8b22353f1a790233a269e462ee52fd72d8fc1faec73885f7fbe5ffddf0e7a406"
    },
    {
      "path": "charts/prism/templates/configmap-worker-trust.yaml",
      "sha256": "61d7e98c21c7f9ae69fc7a5bbeec145fff6c8c85123763cb8cdd8fb562c1ebd6"
    },
    {
      "path": "charts/prism/templates/ingestion.yaml",
      "sha256": "73f19bc39066d2f6f0944846c2784c193a4d1e59202ed737d3a6c6ff8ec77f98"
    },
    {
      "path": "charts/prism/templates/jobs.yaml",
      "sha256": "ed074c7d460591a458e2bfe3967e93ea4632588f460500d2e7965d68324140da"
    },
    {
      "path": "charts/prism/templates/networkpolicy.yaml",
      "sha256": "45aa5b3b5de8b05f698c104633c9411bc91a55818361cbf13f479200e65dc208"
    },
    {
      "path": "charts/prism/templates/postgresql.yaml",
      "sha256": "e81248bfa623695e0e79f36ddf347ad75a1d7bc449a4250287a96a80e17742c1"
    },
    {
      "path": "charts/prism/templates/product-decisions-networkpolicy.yaml",
      "sha256": "1a0764020a197daa59c240b2292e3317bedd9695817a2a48c819dcb344e88c7c"
    },
    {
      "path": "charts/prism/templates/serviceaccounts.yaml",
      "sha256": "314f1d925e667fc98e5000486599431ea2ce7e189f420576378264c10e0f02be"
    },
    {
      "path": "charts/prism/templates/services.yaml",
      "sha256": "c09a05501eca8a1876e44c1d70898fb5dd6770210e777353d6eff0ee9cd9ae1b"
    },
    {
      "path": "charts/prism/templates/workloads.yaml",
      "sha256": "9bb2865f5d232b2cc5fac39259c8957e573decc891d2c9b25d7554da01148739"
    },
    {
      "path": "charts/prism/values.schema.json",
      "sha256": "8fecbef39b64b952a273b004e49106fb50e51d2fdfdad3f62a0b0892b2bb348f"
    },
    {
      "path": "charts/prism/values.yaml",
      "sha256": "add69f96f117b8faed83b42133b7804eacca58ef850ef7428ea039842028d298"
    },
    {
      "path": "contracts/delivery-manifest/v3/package.json",
      "sha256": "9aca27855f2ebe49f7bdebc16b1e19f40d9f9d3d0c8bdd48f21b1bd26f34887f"
    },
    {
      "path": "contracts/delivery-manifest/v3/src/index.ts",
      "sha256": "5293ab3d5813e814487011bd80cad516bc3d1f5faec1181c86675505fa8ba294"
    },
    {
      "path": "contracts/pipeline-observability/v1/package.json",
      "sha256": "54a92a1b6802019a8654ee4224a12abaad3fcc580f4b01d6baaaec91ba7c687a"
    },
    {
      "path": "contracts/pipeline-observability/v1/src/canonical-json.ts",
      "sha256": "378c3ba35ca88e40527e3912dfc0f897e6d5cbdc1dfd40b3a825fbf1241e9177"
    },
    {
      "path": "contracts/pipeline-observability/v1/src/index.ts",
      "sha256": "f4f928c9b1b8c1345c829a44b89d05f847b057051aff05ce6d8cd8b98ed897c2"
    },
    {
      "path": "contracts/pipeline-observability/v1/src/types.ts",
      "sha256": "667337c76a94709fa5b4b817adfd112859397924e163fc5bca3bacf50c5287f9"
    },
    {
      "path": "contracts/pipeline-observability/v1/src/validation.ts",
      "sha256": "7901db9ca3d9253e1edfb9b816034334b1d4f763fca197b64e6249f86bfc5977"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/a11y-config.json",
      "sha256": "6b8c6b88291f1dd613c663aa73fb71f134d7107c92ee064255e2fb052ddf0eb5"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/api-flow-config.json",
      "sha256": "3a2a4e5fc4196347ef30b70285ed229d30f907ef59eb17a60467d6f3b5c97750"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/api-suite.json",
      "sha256": "7bffd67986e5973678980b0f84373324812a88bc6c8c94a2c84bdfd00ce03d89"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/browser-profiles.json",
      "sha256": "bc337e46e47306272fca7e6d52756df642da78740d45bce36e01498565e6598a"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json",
      "sha256": "48a622ea73abb998a1752fd00f3f13714c2d5c85765959e8f451b6eecd486bf1"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/e2e-playwright.json",
      "sha256": "8692f1b6c9fcbe969d0548d4de48bbf9f51091ded062b64907f36ef2e9230f7e"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/e2e-result-cypress.json",
      "sha256": "a3599bfedf2e0a7dbd33b00f85a3699cac7b89ef9b20e2652471cecfabf2c601"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/http.json",
      "sha256": "a7ea2b9f2eafa3e7f070c57596fc79429496fd41a929891f8fa6d205532edd9f"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/kubernetes-fixture.json",
      "sha256": "f122b79d53496ed965bee7cdd01bdd4fc0346a58cc3b029b8b9cfd64ba0d98d1"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/lighthouse-performance-config.json",
      "sha256": "a261bee932439f80f320c094caecc281390ed95dc4c1f8d6bda50c251597969a"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/lighthouse-settings.json",
      "sha256": "9f6737c9e8976aa9fbbbd7e0e47112d70508822b400e41e70b2f3f6e348d1c27"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/openapi-config.json",
      "sha256": "29f2c83c1916747bdfd989f487a5a8801f01092d67e98080ac38a390e704370c"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/security-config.json",
      "sha256": "0e5eb051681889239aa8bbb1b06b694acb7bcdd53f5f65650a19d9dc1d425eef"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/size-budget-growth.json",
      "sha256": "2d3d71aaa043d66dd375cf38b4ea06029a91170e0c3f27a70f4d1407c3909ef0"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/size-budget-tar.json",
      "sha256": "fe92786c69a485688c90385ba42ac6c77e13f1102033f360b59eb2e67d668bc1"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/tailscale-exposure.json",
      "sha256": "fe19207f0984964c058a8c05198010b9dedcf143eba841830dde633dc84713de"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/unit-suite-blocking.json",
      "sha256": "6c405f044793d7cae65f7da556ee45d0c799e2acc392970055f28cf3becd7166"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/unit-suite-with-coverage.json",
      "sha256": "df5f0185869e59d7579f842712f9be843b1f79201b8686a1d81214f4c124401c"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/visual-baselines.json",
      "sha256": "2dd9d80a8cde2b086dd974f3e13570b8c46dff4165553a97791a595e3c248326"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples/visual-config.json",
      "sha256": "09af4ca2ab315a354a2c3aff3f18169f8103326eaf2c8a1b7a1a37676a8776b3"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/package.json",
      "sha256": "234fe885078a92ec896b1f32675a20c3bbbe427cfdb1e3fd684932cc6291d48f"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/schemas/browser-profiles.v1.schema.json",
      "sha256": "64403da87f9401086dddcaee5ce7ab499fe07170e1d7eae005a485422a866a39"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json",
      "sha256": "fec4bcd487eb09590dee3c6d6228d6088963c5476747c8731db4d3a53a114637"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/schemas/lighthouse-settings.v1.schema.json",
      "sha256": "2cf38765e6ec83870f92204613330a0cce235d0925c8b3e6995950f972d93c96"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json",
      "sha256": "e97aedc52818a5f89f2fc88090b99e7b7339966603f686b64c69459270a655df"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/schemas/visual-baselines.v2.schema.json",
      "sha256": "6e3b24ecebee45556a69a26b04e24503ce2ba75ddc5ddf35878defc89c9a65e4"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/coverage-expectation.ts",
      "sha256": "5eda774f82255ff6f370296498cba229de7b2bbd057d7872c1731f105cbc6c04"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/coverage-result.ts",
      "sha256": "654b5a308de7de6e07eae48f8061ff826d746e2f577b77494788ceab08ce6052"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/coverage.ts",
      "sha256": "bd5a20ccbefab393453dc9072ceb72343ee40741776909007d3a084578b0855d"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/digest.ts",
      "sha256": "ee29d0b95e09ae305b9b79d1f289514100c08b4badbd427057cdfeed2fdfa762"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/gate-decision.ts",
      "sha256": "3b2351f0da524a6063897d52e2df02d3f58322b363b8d22f8e7bb8c2c225ef24"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/index.ts",
      "sha256": "d07da1c8e237c2f5b110221d03c4b6fbabb1cddd564a7b71cde1133a6bd86224"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/remote.ts",
      "sha256": "7f02db208c0728dabdcf51604e149f97b018666019e51b8e2853338e9f7bf9b8"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/types.ts",
      "sha256": "704d87007fce75e3f6d8eafd73273478de08c0bf6b1d0ee753f3da31b9fc010c"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/src/validation.ts",
      "sha256": "0932fe19bc79f5dba2a63842cf7892ac6ae0ea6885ed2efb36ac4f2e70b4b69a"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/a11y.v1.json",
      "sha256": "282abd3758498ac1906207fee2ef7c7174a5c3593ed045cfb8820faa0db32cd1"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/api.v1.json",
      "sha256": "6fe84be884aa1ef55e53f911ae26ff3b961fe9556f05a879e0e692c29b9e07aa"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/container-build.v1.json",
      "sha256": "24b15b4c1ad52bac14fefdc050675dfeeb52e1d8f3533809b15bc7ff4d35c87e"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/e2e.v1.json",
      "sha256": "733ec045c8c33512522e71a38c1ac5e180c01d554b4d993461ba3564fe2599c4"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/http.v1.json",
      "sha256": "46d5c420cdaf6f0506a1be5877cbebd10c72fe4e965a0ee1170f50d95dcb2959"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/kubernetes-fixture.v1.json",
      "sha256": "e7525aa2cb4464a83fd1a2f4844192c6d1feedc3b50ec102bf4f76bd03d3d320"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/perf.v1.json",
      "sha256": "8f7c2eedf5aed38f3655b1551dc3698d718f020c66107b0b6b129b914bb6b985"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/security.v1.json",
      "sha256": "c80ba0003edd39789a185293a4e49722314f233f78608c836bec9b01fc3d9177"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/size-budget.v1.json",
      "sha256": "fda75b7935aa53f1994e27bcfd300a526fe77dbeea36d063282245f7564843f2"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/tailscale-exposure.v1.json",
      "sha256": "84620d85f16f8efded52fc8fb5cd37de76ef4f33763afe7ad7898f49e6e5fd34"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/unit.v1.json",
      "sha256": "f89c12bee9794dccd0779621911ee96fc2cbb1398d5bb3e699a34e9cfaa27af7"
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites/visual.v1.json",
      "sha256": "8e2489f267882c482c45830a6e0f876d07f4043ae33a6433ad85518d625a3bdf"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/package.json",
      "sha256": "40d234e5ba169853c0c1ca4dcab3590373163c6b7189461157ff569a7aa42df5"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/digest.ts",
      "sha256": "10c61ec122ca6e65c7deef2c059a19ad70627cf65bdf1eb65f0ac2539457d780"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/index.ts",
      "sha256": "013609ae51e836644640820de878378c0cbc797d6c299f06d926925790676c72"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/resource-types-v2.ts",
      "sha256": "e75e058344978e1a94856c05caf03cfcff92ccb67e6fefe5c91249d4bc3e5fc8"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/resource-types-v3.ts",
      "sha256": "37133709e46db3c537178b2ce4ec0666317e9b461360f25b4c349e71f5adab36"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/resource-validation-v2.ts",
      "sha256": "9c75271a9830c86faa484acaaa52e042d03a56c53b027d4aeae5f8531d06e54e"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/resource-validation-v3.ts",
      "sha256": "00332a01a4674616f0859a83d704771b497d0c0d4220629a35b9a7414f924784"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/trust.ts",
      "sha256": "c650fdbe7f43b422f36d050df291d2a00fdd4bc694a1dae5d6236b4814743cd5"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/types.ts",
      "sha256": "399e42c696f561fbea8f38305252f873179f1b71115f7eacd961f7b5f899ec43"
    },
    {
      "path": "contracts/pipeline-worker-core/v1/src/validation.ts",
      "sha256": "a4caf6147b58a5a68e49ed02bbe6ed75ce7f84f8d5baca4243b3519aecaa3147"
    },
    {
      "path": "contracts/prism/v1/package.json",
      "sha256": "88ab4aa94f1fa8d02e55d36d790361ad06247e0058ab87b878ea316af3f3cf1f"
    },
    {
      "path": "contracts/prism/v1/schemas/prism-v1.schema.json",
      "sha256": "7e8e248ffbc3753ee462d8e4f1d8de98499c02df94f07f0bcfc28367886bf99b"
    },
    {
      "path": "contracts/prism/v1/src/baseline-archive.ts",
      "sha256": "7017d8472863ec34449a725300f5c92707aa3dce13371f5e982621cce9b25237"
    },
    {
      "path": "contracts/prism/v1/src/complexity.ts",
      "sha256": "041bfa7037f86afaf6f9667bc90a07db4fe088924dcb3e7ef650841dfd1c60df"
    },
    {
      "path": "contracts/prism/v1/src/document-semantics.ts",
      "sha256": "0a467d617890be691aaff6eb114b4acbb5de4efca55a5888879b7518a7f4cef2"
    },
    {
      "path": "contracts/prism/v1/src/index.ts",
      "sha256": "441cbe7b6ad9c471c3d8144de958497377d3785cff53904ac45943cfaf4a7c18"
    },
    {
      "path": "contracts/prism/v1/src/node-catalog.ts",
      "sha256": "6c005e8a54eb395677727023fe8bb659c223cd252baac6d1e628112172127104"
    },
    {
      "path": "contracts/prism/v1/src/validators.generated.mjs",
      "sha256": "26e790a95b065b5b77538f501863a09a90f2ccd67e1c76cf617c8fff2dc09f41"
    },
    {
      "path": "docs/config/documentation-tree-classification.json",
      "sha256": "9d27fc45da52788e58abc43b2f024d24e81970ee1c0aca8a4b9c5237618342bd"
    },
    {
      "path": "docs/config/publication-example-claims.json",
      "sha256": "06dc2e0cca666395beb00f8e0c8caa546b03147827eabb5d2713baa3e1b1a1c4"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/package.json",
      "sha256": "858afd76f0e8f9d21fac54b22cb409b5c11effd93b5530c91eb40bc4b9907a39"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/plugin.json",
      "sha256": "ffcd1ea2b759081d86a9812ea05b37a347ce13bd1a68a2640bf1e0a29146bd73"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/schemas/config.schema.json",
      "sha256": "ecb4659a0d13372817eb167c4af7a0eaba08e1b8f3ccf496dbb6fa287cc992ad"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/schemas/input.schema.json",
      "sha256": "39dcacb7784aaf29e76304fb161c03c4d050a4abff4f080b4bd39f604ee486c4"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/schemas/result.schema.json",
      "sha256": "1b312c6f2a9601239a47a3ad6ebc7d3ff67c5e377b1b2a905e743298e9d35859"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/src/stage.js",
      "sha256": "c57349a102e2a549c270e3a9062460fce887ab642f330a9b78980611272322e0"
    },
    {
      "path": "docs/site/extend/examples/minimal-stage/tests/stage.test.mjs",
      "sha256": "075a2ade71a516359dc13ed2bda42afb4360e12e532f06f2bec6d872beb4e80f"
    },
    {
      "path": "docs/site/extend/examples/observer-lifecycle/journey.mjs",
      "sha256": "be2ca59fb8bd6f2571ba2a27ee176241ef76436dac5d1ae07cd73354134e2d06"
    },
    {
      "path": "docs/site/extend/examples/observer-lifecycle/plugin/package.json",
      "sha256": "19024f350c83619ca208e044bea042455517084566e099270ac9a0e0a2b50dd9"
    },
    {
      "path": "docs/site/extend/examples/observer-lifecycle/plugin/plugin.json",
      "sha256": "42c68ce5ae6ec703393d16617e5ec3884f2e7a0453891e9e8924eb065ee0425a"
    },
    {
      "path": "docs/site/extend/examples/observer-lifecycle/plugin/schemas/checkpoint.schema.json",
      "sha256": "8076bdee81e673be6e14805339f1f28a3d2cf294c0d56254463a74fabb031008"
    },
    {
      "path": "docs/site/extend/examples/observer-lifecycle/plugin/schemas/config.schema.json",
      "sha256": "2630fff1d6be622bfc3ab96f4f9a3960d0e5afdaae53528416ca13b6b19b1b3a"
    },
    {
      "path": "docs/site/extend/examples/observer-lifecycle/plugin/src/observer.js",
      "sha256": "886992a473fc3a1d0401d16fd6a5b1ed214976e5a46297e5e644508b06069041"
    },
    {
      "path": "docs/site/extend/examples/platform-change-nova-lifecycle.json",
      "sha256": "86f9a38e7f7fd6b1ad71fb5d4df6d226f483607054f27cb2caee9dd13f582253"
    },
    {
      "path": "docs/site/extend/first-plugin.md",
      "sha256": "31ce4e5bb6f05d51eff25bae63c2052e72540f8adafec46efc03c1bae697652b"
    },
    {
      "path": "docs/site/reference/buster-runtime-configuration.md",
      "sha256": "630e5513c5b3f13c736368b311b3c8b23f3dc0bcb4f215e81cff072c82116a5d"
    },
    {
      "path": "docs/site/reference/capabilities.md",
      "sha256": "bda8980cbbd060a24f1b0e7c26cd5a5ff7aee5683c9c81dbdced48a849ba7d3d"
    },
    {
      "path": "docs/site/reference/configuration-precedence.md",
      "sha256": "507a6da536dc050dbc64eb2d39528af33bd64255a5586be20cf0346c1d6dfa04"
    },
    {
      "path": "docs/site/reference/documentation-route-registry.json",
      "sha256": "7e5e283c02677c552eda930da2e65baa2fb4076182f8b48b607876fff10fc8f7"
    },
    {
      "path": "docs/site/reference/generated-documentation-map.json",
      "sha256": "56247158b9487a01194334a0824704ee2ce4ca005e8f50d6e49eb0e72324ccd4"
    },
    {
      "path": "docs/site/reference/helm-values.md",
      "sha256": "2b353ec62d140afddf3d8caaa0610fd70d7104cb79915678dbc1aedd7a0b19db"
    },
    {
      "path": "docs/site/reference/host-and-prism-configuration.md",
      "sha256": "f4cb0d8a77902249345dc75804a7d54d4b7b56106d4287c0ea62637f8b5198b6"
    },
    {
      "path": "docs/site/reference/nova-project.md",
      "sha256": "217d91583f26d89ec054c810dd101181a6d5e43fce48cf255e7b7dc776c7154e"
    },
    {
      "path": "docs/site/reference/pipeline-definition.md",
      "sha256": "2883069bd568fb73f47d6524680eae63a03494a5b52f0afced88a4d7674383da"
    },
    {
      "path": "docs/site/reference/pipeline-json.md",
      "sha256": "e4bbbcde519911fb512acd60b1b4d3945b480b0cc9b8312d757faa96361ea128"
    },
    {
      "path": "docs/site/reference/pipeline-platform.md",
      "sha256": "53a81b42c1dfbde0f0d0a0a8c61eaabfa36975325e8b1c5cd10653541d0909de"
    },
    {
      "path": "docs/site/reference/project-pipeline-publication.md",
      "sha256": "28c71320dc54ca369b91d8135d61a109bdf8c4c8f7fd06e20b8cb95ffd7898f9"
    },
    {
      "path": "docs/site/use/operate.md",
      "sha256": "eceeb467c5a78e3d587955cff2a795d059700339483efe38040a70628e374483"
    },
    {
      "path": "docs/site/use/prism-studio.md",
      "sha256": "0fe8346293c9e20e88e102b03cf2ac9792973416d10c940d7e957ac22e970066"
    },
    {
      "path": "docs/site/use/workflows/README.md",
      "sha256": "91a14e8418f2bfc0f7d3242deb77a2387448ff8598ea1db8cc1dcb32dd3ed946"
    },
    {
      "path": "docs/site/use/workflows/examples/buster-fixture-matrix-report.pipeline.json",
      "sha256": "d86e5c8143d03af2c41db295f9f763e4038ffd7a1c89a2a66790337c1874e2e5"
    },
    {
      "path": "docs/site/use/workflows/examples/compiled-project-input.mjs",
      "sha256": "5e6248abc70806f463293b14193a402a24f6168ab12344762d993d0a99f202da"
    },
    {
      "path": "docs/site/use/workflows/examples/compiled-project-verification.mjs",
      "sha256": "3341ba042e0e8bb42a4554c41bee38ab5986ae39afded23c74bd01ac9bbf3ed2"
    },
    {
      "path": "docs/site/use/workflows/examples/compiled-project.mjs",
      "sha256": "a25552b997a071342fb6e2003ab2ee8b3e9cd963cbc63ce11edb38a5aa075240"
    },
    {
      "path": "docs/site/use/workflows/examples/first-project.mjs",
      "sha256": "a6c7965165ad093a109c1c5210802914c1382585dd315afea8ddec79c4e08442"
    },
    {
      "path": "docs/site/use/workflows/examples/local-core.mjs",
      "sha256": "3e54567536d0b13090f2ea37f1b04b4fad725415767c70e24533419eba985744"
    },
    {
      "path": "docs/site/use/workflows/examples/minimal-compiled-redis.mjs",
      "sha256": "5bc2998072d885410553a0094dc8a9260948f65573d8cf67e9ce44aa9117fdc0"
    },
    {
      "path": "docs/site/use/workflows/examples/minimal-project.mjs",
      "sha256": "0851cc47a9376444c6ed0634cb079257a7edff0d5d8b08b2419ba22e66b95107"
    },
    {
      "path": "docs/site/use/workflows/examples/minimal-redis-inspection.mjs",
      "sha256": "1a53d19b148eb69b5ac72c1cd21668faa228cbd0837aa89ea88f8992693d354a"
    },
    {
      "path": "docs/site/use/workflows/examples/minimal-redis-verification.mjs",
      "sha256": "4dc9eb32db87ae0097e7a0031d4657086841df6ef32bf4c4a36ec7cccf366917"
    },
    {
      "path": "docs/site/use/workflows/examples/minimal.pipeline.json",
      "sha256": "d2429199edfbbe3acba58876ac5fc64e930822cfa79edc26dabd7262155c127b"
    },
    {
      "path": "docs/site/use/workflows/examples/prism-studio-flow.json",
      "sha256": "ea096d2c1fe260eb2d568f6f018c36de64f435cad0d93fad0525cc09250735c1"
    },
    {
      "path": "docs/site/use/workflows/examples/quality-validation.mjs",
      "sha256": "ab862a8a86d40810994bafea3a8669cbc5969e0f40f51887e28754b7507b8503"
    },
    {
      "path": "docs/site/use/workflows/examples/repair-retry.mjs",
      "sha256": "bd7def69bea092fe006ada1efc331b5c049c97c0768bf0ece7d4aedca9c0d18f"
    },
    {
      "path": "docs/site/use/workflows/examples/request-trace-redis-unavailable.json",
      "sha256": "9ea32431ccb8979cb625a6c487fd39e348a49e2fe3bd332a647cdc3a9c89e239"
    },
    {
      "path": "docs/site/use/workflows/examples/request-trace-success.json",
      "sha256": "e2f92f057f5e2c7d1f8bd9d8c9faebdf826d1f818bf0c44405a9d0efe5b07ed7"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect.pipeline.json",
      "sha256": "d2ae14634ed7061e257a50cf52ff4d5830a18993955a71da599864448bb0ab14"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/journey.mjs",
      "sha256": "7f88cdabc73ecae8bccb21e3523b7be09819158b926eda43c1fa848725e2cc9c"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/plugin/package.json",
      "sha256": "291d1d1d5b1e40cb92b21c09b2c0dfc3f0ae0efedd3db9ec20562a03b5164c73"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/plugin/plugin.json",
      "sha256": "00bf39ebd3b1851dce0e6af8363ea68635fde22340135dd42a49356cd418b409"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/plugin/schemas/config.json",
      "sha256": "2656294ca60aa23acaa3e6e1b688fa8b754196e6636657eb146a559936511803"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/plugin/schemas/input.json",
      "sha256": "2656294ca60aa23acaa3e6e1b688fa8b754196e6636657eb146a559936511803"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/plugin/schemas/result.json",
      "sha256": "b065f652df71a853fdc26e2edd957ce5bf9b5de3634b91a19a9fc7608bac102c"
    },
    {
      "path": "docs/site/use/workflows/examples/uncertain-effect/plugin/src/stage.js",
      "sha256": "9f03161a68b3f82d7e51ab84315dc1385db2a78e877e8084f08a506d50dfeed3"
    },
    {
      "path": "docs/site/use/workflows/quality-validation.md",
      "sha256": "d88b9747a74d76342c24b25022f1fe0c856df72e3dfc24187a2805c8ff8c97f9"
    },
    {
      "path": "docs/site/use/workflows/uncertain-effect.md",
      "sha256": "eb4ea2c0d09968315b58cf313ca0cc55344ca79b6cfd5e2406c48a45bd223ec6"
    },
    {
      "path": "docs/site/use/workflows/wait-resume.md",
      "sha256": "1b89a8bb14787210a9dfdb390c1be232c917e5b5724b843898436d9c9269677c"
    },
    {
      "path": "docs/site/use/workflows/wait-resume/approval.pipeline.json",
      "sha256": "c1532f9bec42468e078856298a4ff697b7691c81d6fd728f9a53fde897f64adb"
    },
    {
      "path": "docs/site/use/workflows/wait-resume/platform.template.json",
      "sha256": "8d9f160964ea4c3ff5c924c3c4c36291f5a6bfa969807721f5a8383578a5b1ef"
    },
    {
      "path": "docs/site/use/workflows/wait-resume/signal.template.json",
      "sha256": "bb56a824887fc969186e48babe5744a5050fb143099a19e065b00cfbe7c19567"
    },
    {
      "path": "package.json",
      "sha256": "0a8f76c0a868d5b85467081f4c635421995b1792791b0acec05f80be9e93c4ef"
    },
    {
      "path": "scripts/docs-publication-example-assets.mjs",
      "sha256": "439ab9b09fa0a5e2caddfa1e885124cc224f1523aa388e97a3c08d331909b7fc"
    },
    {
      "path": "scripts/docs-publication-example-native.mjs",
      "sha256": "4b10931357712db448ec49609ea510c274d7a596fe5569e40e6a123453d57ba3"
    },
    {
      "path": "scripts/docs-publication-example-projections.mjs",
      "sha256": "35e335eb3b478af86fedfae12c180a722cd2993cf9b1fbc9f6d028c8f09aee71"
    },
    {
      "path": "scripts/docs-publication-examples.mjs",
      "sha256": "b55c0e9addce76c121f4f5aedd5863493d581dca0a0d90be69a420b7b942c262"
    },
    {
      "path": "scripts/docs-publication-instruction-syntax.mjs",
      "sha256": "a67002bba4e7a2759534dd206d558a79d96136162cb1abab4d77d9a6a74e5881"
    },
    {
      "path": "scripts/docs-publication.mjs",
      "sha256": "c96741df38af067044811d38e0c0513dd9512e383493d08e984cf62e538b1bd5"
    },
    {
      "path": "scripts/lib/docs-publication-assets.mjs",
      "sha256": "c0f3bcd5f40e03df8355681a2aa9298af5b465f5ac69f3d6460ab868446680e0"
    },
    {
      "path": "scripts/lib/docs-publication-example-coverage.mjs",
      "sha256": "5217aa0f2bd0303d614a0b94a29b8d78f3e1473433ad413cd5e19749fa660dda"
    },
    {
      "path": "scripts/tests/docs-publication-examples.test.mjs",
      "sha256": "6fc070c113689b96fa1e7ef672b139fa6ab066143c7fd7bcaafc6b34e0fdfb87"
    },
    {
      "path": "skills/buster/engine/test-gates/artifacts.ts",
      "sha256": "4eedb9892218a3b0ee8a9b14d22c8e37b29c454333adbdf4cbae1772f44e5179"
    },
    {
      "path": "skills/buster/engine/test-gates/browser-axe-runtime.ts",
      "sha256": "7370bdf54556875b996cc0ac4c4219a8c9ddc11d25dfb72875f41806e82482c8"
    },
    {
      "path": "skills/buster/engine/test-gates/browser-lighthouse-runtime.ts",
      "sha256": "a7af35a6b7df314129cf9150c3d44d2017c2bf47b9e529ef1ff6962129966b75"
    },
    {
      "path": "skills/buster/engine/test-gates/browser-playwright-runtime.ts",
      "sha256": "20e32c52051339237e14cf1bed0da9c690ece23297bec9bb77a628e8df211917"
    },
    {
      "path": "skills/buster/engine/test-gates/browser-visual-runtime.ts",
      "sha256": "197b89c97cf756a90cbf2effd3485391f8cdbe494829ef6c668e527f0f695382"
    },
    {
      "path": "skills/buster/engine/test-gates/buildkit-readiness.ts",
      "sha256": "7f50b4c1c6c1e661319dd2f9ba1afecf27dd19a26c06ac51ef52abc0d97703f3"
    },
    {
      "path": "skills/buster/engine/test-gates/composite-capability-runtime.ts",
      "sha256": "fbd71da7e0fe2e53801e60e36c3c13636b4fcb5be0e43503ef66571820b0810f"
    },
    {
      "path": "skills/buster/engine/test-gates/container-build-runtime.ts",
      "sha256": "9316f1e642640c768f268aa7f236f075e9290516543ded5148869914e91f907e"
    },
    {
      "path": "skills/buster/engine/test-gates/dependency-process.ts",
      "sha256": "c1f305fd3281328e1cd5714b1366cb946907e2a96af2bf6c3f629c2ab4ed354b"
    },
    {
      "path": "skills/buster/engine/test-gates/direct-command-runtime.ts",
      "sha256": "eaacae3a6c4b3110039b7134378b8eb114dc8cb2161c4bc593c405c967afa006"
    },
    {
      "path": "skills/buster/engine/test-gates/exposure-generation.ts",
      "sha256": "cbaed4e6debf9e225c0c5aab51ecc8383bed69ff3b5dc4f7fe7c18a0ee02a360"
    },
    {
      "path": "skills/buster/engine/test-gates/exposure-handoff.ts",
      "sha256": "4e725c913e11f5eb11a4444c9a96373e423c06b2da33287e5269fbe1401b9e83"
    },
    {
      "path": "skills/buster/engine/test-gates/fixture-authority.ts",
      "sha256": "b3fac0a68c4cab2d3c1abfabf10b38848cc6917512a6684e80a030656ee0a1f5"
    },
    {
      "path": "skills/buster/engine/test-gates/generated-demo-credentials.ts",
      "sha256": "0df7b344a3ccb3c27322a0381ca8f2cf891feca22140c9a5e1899fa520ae10da"
    },
    {
      "path": "skills/buster/engine/test-gates/kubernetes-fixture-runtime.ts",
      "sha256": "b9f8bee4d6ed977daf39be3dd91ba8e8323e5b625ff630b53ed1aa923a989833"
    },
    {
      "path": "skills/buster/engine/test-gates/kubernetes-manifest.ts",
      "sha256": "42f3533feab2fcf98a60e4fe570d9980c6d008785d65df6e73e15e3f2f54dc85"
    },
    {
      "path": "skills/buster/engine/test-gates/kubernetes-runtime-security.ts",
      "sha256": "01da0c323776cc8f9f4778d9ed2afb198133b79f7f2afbfa0850f657dda357b0"
    },
    {
      "path": "skills/buster/engine/test-gates/network-http-runtime.ts",
      "sha256": "b0dfbf0ba6ef2333572754d5a3f0510b8b5c825e47e208e519c2d4a90f99168d"
    },
    {
      "path": "skills/buster/engine/test-gates/process-input-lifecycle.ts",
      "sha256": "b45b50d0cfd2ae6a0aa091ba1e1edcb936b868490ae2a579f3ac561d24f8394e"
    },
    {
      "path": "skills/buster/engine/test-gates/process-input.ts",
      "sha256": "3b34b84511ab198baf9d982799149288565c63f42d1ffc5a83256e4bf6209620"
    },
    {
      "path": "skills/buster/engine/test-gates/production.ts",
      "sha256": "79c47d55e525f5ebb5e7e05a9c52e18514f9e464401c51e7def38dcec7f646a3"
    },
    {
      "path": "skills/buster/engine/test-gates/provider-capabilities.ts",
      "sha256": "b7dc5260ba57dd177fcb2e1e40f85f39554bf261f3e99388a6d91d17d24879b1"
    },
    {
      "path": "skills/buster/engine/test-gates/provider-loader.ts",
      "sha256": "8453535b799916c74d2f036ca09a5bc973f600eb402ade0da57f93ab24ab6c85"
    },
    {
      "path": "skills/buster/engine/test-gates/registry-health-access.ts",
      "sha256": "34f7cab5f360c415f5817ad0d5a0fcc76835c6046018d3779f185b2ad33c3f8c"
    },
    {
      "path": "skills/buster/engine/test-gates/remote-plan-compaction.ts",
      "sha256": "e74b3fe2e8dca0157d22c6bd1b50f5cc69df91ec29eedbdbaef86d4ff05a42de"
    },
    {
      "path": "skills/buster/engine/test-gates/remote-plan-http.ts",
      "sha256": "21b63692a2049718b49bcbdec03033642fc25d4e6206fa0330c753615ca036ff"
    },
    {
      "path": "skills/buster/engine/test-gates/remote-plan-runtime.ts",
      "sha256": "dae94180e4c734b9fbd853329c9fa8b8dcf6e90fa71fee96255123384e45ea8c"
    },
    {
      "path": "skills/buster/engine/test-gates/remote-plan-service.ts",
      "sha256": "3be9e75c8619da96c22bfaabd7fbab548bc07085787d092a83ba1f20130434f9"
    },
    {
      "path": "skills/buster/engine/test-gates/report-adapter-runtime.ts",
      "sha256": "0675902bcfebf7842d10eade9965c1b49d21e2083acaa9a7b7e6f03c248e24a9"
    },
    {
      "path": "skills/buster/engine/test-gates/report-finalizer.ts",
      "sha256": "8cc0ff2562fd8b530c2a2e1b32b13aaccdec1a2ea9f398df0e7cd350b2cb9b7e"
    },
    {
      "path": "skills/buster/engine/test-gates/runner.ts",
      "sha256": "d6695dc52cd1919a88f7feed8051a543bdd9cee260b95afb829cbcee6f254919"
    },
    {
      "path": "skills/buster/engine/test-gates/security-scan-runtime.ts",
      "sha256": "087b2f1a242b0d8ad1025011ec5a6e9cc82b17652eb7775370a2e57208d9c0e9"
    },
    {
      "path": "skills/buster/engine/test-gates/tailscale-exposure-runtime.ts",
      "sha256": "0144b279f77977b7285231852e32ceacbc70c7598121c24fa8be6f96acd52c9d"
    },
    {
      "path": "skills/buster/engine/test-gates/terminal-workspace.ts",
      "sha256": "ede9e4ffd51edd40de683eade25ba313b5b2395d6a7bbcf5ce50e583f7940c59"
    },
    {
      "path": "skills/buster/engine/test-gates/trivy-database.ts",
      "sha256": "240997c417ef7ab27716b482c7b698abed6249c8c8b6f303f9264875347224cf"
    },
    {
      "path": "skills/buster/plugins/README.buster.md",
      "sha256": "d297201a9a272223f25e2e94c8357fb28cd0cc764ce082e5e18bfd2e21eb945a"
    },
    {
      "path": "skills/buster/plugins/api-flow/README.md",
      "sha256": "fdb4520d8d9a12e25a79787a5f2dd219a5bbc98d95ef0c22c204ee82d668a55e"
    },
    {
      "path": "skills/buster/plugins/api-flow/package.json",
      "sha256": "445b9e460b6bff419d952b72f5a0fa1edf0c9676aeebda22c7d10808a0c7c3be"
    },
    {
      "path": "skills/buster/plugins/api-flow/plugin.json",
      "sha256": "d6c8f75a90ab142a4273893cd0e0bcf12a1d377432a42eb8f65127c177bbe536"
    },
    {
      "path": "skills/buster/plugins/api-flow/schemas/config.schema.json",
      "sha256": "8f22f22a553bc7d12daca18756c1394596e0f953de909ad4569aef77119e9ebc"
    },
    {
      "path": "skills/buster/plugins/api-flow/schemas/flow.schema.json",
      "sha256": "b4b30b26fbc0719f8438cb422124a1898691dd3b05af47d010d786b1400d76aa"
    },
    {
      "path": "skills/buster/plugins/api-flow/src/provider.js",
      "sha256": "eac6cd1ba2bf5ddf2e5d73369015286ce4f528870008fe782c130dd8aa4dcb4b"
    },
    {
      "path": "skills/buster/plugins/api-flow/tests/live-function.test.ts",
      "sha256": "ebb550bcd20b7177e483b073601a6d55dcf4ff2916ce63a5c3b226b766072650"
    },
    {
      "path": "skills/buster/plugins/api-flow/tests/remediation.test.ts",
      "sha256": "78bc3bd731052a460fe70a118ba4868ab848715f1be46cedeba59116db79b280"
    },
    {
      "path": "skills/buster/plugins/api-flow/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/axe/README.md",
      "sha256": "1ab2a74127ab6340c77b01a9dcca756486c4b9a9ecec19e03e88bab05cb44a6a"
    },
    {
      "path": "skills/buster/plugins/axe/package.json",
      "sha256": "327f3ef9454c30b8ad08063077c3e54c9d4d7bab92c567cdc0ce19fac90c0e6a"
    },
    {
      "path": "skills/buster/plugins/axe/plugin.json",
      "sha256": "178f07330165f84e5f6ac7be7876b74318eb939c97d5a560f5289d313fbbd0d7"
    },
    {
      "path": "skills/buster/plugins/axe/schemas/config.schema.json",
      "sha256": "c3c0c64faf7194753f51dc73e40cf59d465889ae0bdbee691a8acba0b1f6cd6d"
    },
    {
      "path": "skills/buster/plugins/axe/src/provider.js",
      "sha256": "3943f787c2d7fc1f2215268c043135f0a6d6425fd6e09b26d48bb2171e87c472"
    },
    {
      "path": "skills/buster/plugins/axe/tests/live-function.test.ts",
      "sha256": "162a6c598cdd19f4add0d723a0f5081baa319a2e91ddcd93922e501876188376"
    },
    {
      "path": "skills/buster/plugins/axe/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/container-build/README.md",
      "sha256": "9f717d5483450ff8aa9e01f95694bbe54165b6ee18f0014ece1fa6de77a892d3"
    },
    {
      "path": "skills/buster/plugins/container-build/package.json",
      "sha256": "41ce5c62fe46dae75e978b0527c0df92e5a4229afaa08a97e6132b6697c60198"
    },
    {
      "path": "skills/buster/plugins/container-build/plugin.json",
      "sha256": "6a43c756b8707be3a5efb3851ed8869a17e376658a30503bf9d51697a7e9c011"
    },
    {
      "path": "skills/buster/plugins/container-build/schemas/config.schema.json",
      "sha256": "2ee424bde723532cea47009ad63b3d59ae422cd60ac8a3ba375396abb1f6dae9"
    },
    {
      "path": "skills/buster/plugins/container-build/src/provider.js",
      "sha256": "1204d07c75942e9def8b703748bf97510e933b2cfb33b85f84c485d42b89c847"
    },
    {
      "path": "skills/buster/plugins/container-build/tests/deadline.test.mts",
      "sha256": "954aeb0a42c50f5fb10c9dacf5a693ee591c0792aff608cee712b7c2300a8a7e"
    },
    {
      "path": "skills/buster/plugins/container-build/tests/live-function.test.ts",
      "sha256": "af27438a323433963b4cea1f89debd7b44efc0e093c6b09238f5d947d6b9b31f"
    },
    {
      "path": "skills/buster/plugins/container-build/tsconfig.json",
      "sha256": "5eb88565fa82210b6087aa1a49848ff556f1a1ff1db0d8aa840c6811afd56526"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/README.md",
      "sha256": "2a8f2e52e59f5ee7be788636a86a36a0fa37306d65fc273caacf84494e47c217"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/package.json",
      "sha256": "e71eed1e45b7b06141991a11a5388bd4f1d5d1fcf16ec3b1c264a1ab1e46ec44"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/plugin.json",
      "sha256": "0f0ae38312005bf70de5b8da45dd96122be24614b05079b2ed410248e9166067"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/schemas/config.schema.json",
      "sha256": "72fc0422bb8f35b01b44405d217a3a1a4d62c4f875ddbe3bce1ddb814126025f"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/src/provider.js",
      "sha256": "3e76c0b48e6728a195de48f8c7325e517e0681e8e0e169e7adb129bd0752430b"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/tests/live-function.test.ts",
      "sha256": "9a94bc174399e298b53d980665fdd0f2052d1bb9120f79c1ec327887d9b63ae1"
    },
    {
      "path": "skills/buster/plugins/coverage-budget/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/README.md",
      "sha256": "3230e842192813df317830d44228dae9836152ce7bddde9e65c2c4a7a9a37631"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/package.json",
      "sha256": "5a84a7836083284bf650f603fe2927226e6d7656ffade1d9fcae9a028daeb25d"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/plugin.json",
      "sha256": "a7dc11d0cd73886181c787be579552ed8f26eba3a4b364e87361ca6eff0db194"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json",
      "sha256": "5e0d5ea09c2070375cc558bca0f21484646c98b0de18023438cc29b830ad642e"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/src/protocol.js",
      "sha256": "ad6e68ed8182ef787d8a77d612bf1b1c5faf6e1beb86cf06e02f61bc588fe35b"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/src/provider.js",
      "sha256": "21e239a33d59c5849d8b9acef7ac0d6eba70b5652f885a430eefd82063f07c30"
    },
    {
      "path": "skills/buster/plugins/demo-auth-smoke/tsconfig.json",
      "sha256": "e12d6baaab845a1c094cf7ba25bd8970b15c7d70c39df733d1c0f4a16afb0d39"
    },
    {
      "path": "skills/buster/plugins/direct-command/README.md",
      "sha256": "6e1ec48fd7d145c7ab3cc9aff1c48c46c99a6ca07745a96535fa4d5bb4d3f4f9"
    },
    {
      "path": "skills/buster/plugins/direct-command/package.json",
      "sha256": "716cc8390d5e277df7c1b73cd02c32660f97940ac1c4f243c6585817ea000b9e"
    },
    {
      "path": "skills/buster/plugins/direct-command/plugin.json",
      "sha256": "649466714d77ce1afe3a753f48e1a77481aa757fb46a325f3ea05c0c3ed2835a"
    },
    {
      "path": "skills/buster/plugins/direct-command/schemas/config.schema.json",
      "sha256": "8ea9a179b44f3bdcdeb0c9f251caf62757c3bf6a93724c993e3b51f23dc35ef8"
    },
    {
      "path": "skills/buster/plugins/direct-command/src/provider.js",
      "sha256": "825182b963d34c1414fd779b5c523d00cc354fb38d6e8669cc68aa0b40261667"
    },
    {
      "path": "skills/buster/plugins/direct-command/tests/live-function.test.ts",
      "sha256": "afff58d4690e877f8c99f3bc4edb27b0e2afbcde5731da34a49436cfc52d8689"
    },
    {
      "path": "skills/buster/plugins/direct-command/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/http/README.md",
      "sha256": "d1e5043fc7de143d939eac59d9472ccd230fbe54e745ceb628b820d7bd759105"
    },
    {
      "path": "skills/buster/plugins/http/package.json",
      "sha256": "446771fd3e7d99eda5000f892e3ebf58bf2c604979243819d0537e97548e718c"
    },
    {
      "path": "skills/buster/plugins/http/plugin.json",
      "sha256": "be8c584b93172cc05d88c547f43d351dd00a0570475bad0c2a6bfbebc6792453"
    },
    {
      "path": "skills/buster/plugins/http/schemas/config.schema.json",
      "sha256": "56553d307bebc7cc556ba66d35efeec08ba3d9825197df4b7cb0848db8b15e3f"
    },
    {
      "path": "skills/buster/plugins/http/src/provider.js",
      "sha256": "180a9af85671f8f27b3a4042adb7b21dc00a78d0d298bccf78d2403a74a99186"
    },
    {
      "path": "skills/buster/plugins/http/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/README.md",
      "sha256": "012b7603d9ff50ed2299576c94031c9c69d7359bf05a40bc3811f9e3adfe5cdf"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/package.json",
      "sha256": "e26791d42a992c8ed0262d177f2fe0301b0c3baba808a75281bcaa0b0f0b96af"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/plugin.json",
      "sha256": "9787400a76dea54fbfe31a6371c1724f60fdacb7fc544fa33c0c454132e92b77"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/src/adapter.js",
      "sha256": "dceb8492b6f03b31c9c57190cdff836e4d6917b33ab49480fe8001c02e247736"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs",
      "sha256": "7eb05515a38bce0beabffb8a0a931c3a56d8f3ff7f9f0038f5a7e2e5a8d81edf"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts",
      "sha256": "14d1030b8a9d68828865ef1d84d8999daff41b8241bcb27c04d540135f826ea3"
    },
    {
      "path": "skills/buster/plugins/junit-report-adapter/tsconfig.json",
      "sha256": "3994ccda4ebd201e7b93a2fa111aafbac4ce780513732428f62c5b4769c104b4"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/README.md",
      "sha256": "30cbdad838949b74272a02f1712169a5c1ec4856015ab024ece60ad2cce10e37"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/package.json",
      "sha256": "debc7dcd104cd84691e588d7d3cc40ae9363d6d9cf02f082c410cd262afcd64a"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/plugin.json",
      "sha256": "9c658fd6807beea11340609d22483ffac429a5e9184e74233a145774ec92feea"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json",
      "sha256": "b5bd127d9f7167d5cbb2c576f40ef6881fef16f12552a955e70576c7c730b443"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/src/provider.js",
      "sha256": "4af5c60de7d010bc6956e81429ee10cbbca38fcf25636c348e0ef4fbb0f2d50e"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts",
      "sha256": "59f85c44388dd5e8ae8659a88b4f6edd8585bd5afc0a154d52f9cbe21406c6eb"
    },
    {
      "path": "skills/buster/plugins/kubernetes-fixture/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/lighthouse/README.md",
      "sha256": "747d7478d270fb9b8c2c9103ff0f10783627d4a619ce0206afd675c7eaca9bca"
    },
    {
      "path": "skills/buster/plugins/lighthouse/package.json",
      "sha256": "12149f172e9fede4aacd1bc838b8ded0b49280df47e62a4dedf421154d412d99"
    },
    {
      "path": "skills/buster/plugins/lighthouse/plugin.json",
      "sha256": "3c7fa93d06001f1b627aab1f161e90d19124028172b347ce7a64ccb369d2aaf1"
    },
    {
      "path": "skills/buster/plugins/lighthouse/schemas/config.schema.json",
      "sha256": "4aa52aca72efc6b1921838626717543b915dbe8c454223408a88ac89f739b958"
    },
    {
      "path": "skills/buster/plugins/lighthouse/src/provider.js",
      "sha256": "8858c30f362574414d16d8dcd99b963382b79e3195a670145c2e67d63dfa85a5"
    },
    {
      "path": "skills/buster/plugins/lighthouse/tests/live-function.test.ts",
      "sha256": "7b6404af53e7442b1d716d2ddb559ecbe294c5a09886f2e41295169ff20d5e93"
    },
    {
      "path": "skills/buster/plugins/lighthouse/tsconfig.json",
      "sha256": "7ea156239ab42e02f03ca507403f02f79f8147e862f5a95ad88c08cf65994a79"
    },
    {
      "path": "skills/buster/plugins/openapi/README.md",
      "sha256": "afc989c4127027ad0f66ec95dea04953020f688b231427a77dff0714c9b1159a"
    },
    {
      "path": "skills/buster/plugins/openapi/package.json",
      "sha256": "81a46bbcf2e779ac724874adb3d18a6b86768a5abab6c9c0ef4913019a8bc3b3"
    },
    {
      "path": "skills/buster/plugins/openapi/plugin.json",
      "sha256": "ea64826e4be0b75620a11de0d375abb6ef0361492488adaa5c3b839e49fbf3af"
    },
    {
      "path": "skills/buster/plugins/openapi/schemas/config.schema.json",
      "sha256": "7f52e048a57a7527c47c02f6018af113cdb60a8e63cc446f1b9017f425bdab29"
    },
    {
      "path": "skills/buster/plugins/openapi/src/provider.js",
      "sha256": "cabeb560867f9dc802a7e936c0efc1fb6f900f211b5563414b6016c780f48cca"
    },
    {
      "path": "skills/buster/plugins/openapi/src/schema-support.js",
      "sha256": "05e27ae54dfd00cb9f1344eb171699a6e4fa87801f5c5f8ff97be18910377e4b"
    },
    {
      "path": "skills/buster/plugins/openapi/tests/live-function.test.ts",
      "sha256": "9caf53c6a77db03bb58a798c3bfc9fd6dd8e73f2bc91333a148dfa57ff081a33"
    },
    {
      "path": "skills/buster/plugins/openapi/tests/remediation.test.ts",
      "sha256": "0c157e593df364b8837168f42e3a6eb6a3aa2ac8c8ec0d8766fb41071ae5fbbd"
    },
    {
      "path": "skills/buster/plugins/openapi/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/playwright/README.md",
      "sha256": "9b370d17fcf2a99824fe1506b703790bf149b26a73008a0f4fe628ce79b4e346"
    },
    {
      "path": "skills/buster/plugins/playwright/package.json",
      "sha256": "cde18f5dffba2e429f1f8e9cca99a23a72c1e7b75fad9b77cc5ef1a5e333cf6e"
    },
    {
      "path": "skills/buster/plugins/playwright/plugin.json",
      "sha256": "897cbd8bfbd302d7ed00d01340f18578fe9d3778c45bba95c6eff1c8951cf1c9"
    },
    {
      "path": "skills/buster/plugins/playwright/schemas/config.schema.json",
      "sha256": "82f37247278e500d4a9e5d0c210fe135766a9417b64b9b595cc92385377cc977"
    },
    {
      "path": "skills/buster/plugins/playwright/src/provider.js",
      "sha256": "7a380ecfc9dd2b42751ecd451222779f606f82668274cdc66e7b9136f1f988e8"
    },
    {
      "path": "skills/buster/plugins/playwright/tests/fixture/playwright.config.ts",
      "sha256": "7c55fb6ed9bc55a2bd9df23aa752fda7be2090bf14ac92dca4ffe0647458ce42"
    },
    {
      "path": "skills/buster/plugins/playwright/tests/fixture/specs/home.spec.ts",
      "sha256": "8c82f2af60c14339036326de17304c698fe6f7c4d1e336ffae9881dc93ddd2f0"
    },
    {
      "path": "skills/buster/plugins/playwright/tests/live-function.test.ts",
      "sha256": "e1ad40bfd668ed5a6b3aad21397d09b1b96f5d3d8ad378c818b287e25777b52a"
    },
    {
      "path": "skills/buster/plugins/playwright/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/security-providers/README.md",
      "sha256": "97f0db9adda62d1b15cfa518816547b15ad66b1c38f35010c75d6d5797f5cd20"
    },
    {
      "path": "skills/buster/plugins/security-providers/package.json",
      "sha256": "16c52f7be8292eb52291e14b8aec97fd9ebcedd421f52647df5dc5cd876b7f10"
    },
    {
      "path": "skills/buster/plugins/security-providers/plugin.json",
      "sha256": "14d1e66e0ee7a0063964555222332d7345bf172bfc8186f9a12fdca7d2c9d510"
    },
    {
      "path": "skills/buster/plugins/security-providers/schemas/dependency.schema.json",
      "sha256": "e28b92a94df642a3527df914c9406a215684fb099bf98ded536d1e5743873ee4"
    },
    {
      "path": "skills/buster/plugins/security-providers/schemas/headers.schema.json",
      "sha256": "d85b934ca0577f4ca2ac170efbe9157e7ccb46a1bae36cca3e36843f336e0191"
    },
    {
      "path": "skills/buster/plugins/security-providers/schemas/image.schema.json",
      "sha256": "1215ea1d598f31ebe569812962c66b1a75f506fd1d63eeecee5ec523beb1b9ca"
    },
    {
      "path": "skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json",
      "sha256": "8dece95ab9c5062a62269a6dc85528017fe7b65f71433b612058a52b7e4ff6ea"
    },
    {
      "path": "skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json",
      "sha256": "8dece95ab9c5062a62269a6dc85528017fe7b65f71433b612058a52b7e4ff6ea"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/common.js",
      "sha256": "74fd765615fdee3f5876cfffa0b7baca6405b57fc3830e39dd56293fdc8d04b3"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/database-evidence.js",
      "sha256": "2aa34c8cfe07618191408a280ca7e9b36169056f33cf441e233cae6bba4dad57"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/dependency.js",
      "sha256": "e44c6d32e9609c914493108ecbbe14de459d0eb57f917cdbe95c9ff81836af55"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/headers.js",
      "sha256": "7799951ab8165572b3779b0a97306e33597115069de51400f7476df03ac2b7e7"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/image.js",
      "sha256": "7e54a7a0140628c26d2e81572ef8959fb0816cd5cd9cb663759c4b175bc71588"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/kubernetes-policy.js",
      "sha256": "aac3c6388e4238df46b5cc9b59f62b6fd0df4192061d29ff5be6625f26f392fd"
    },
    {
      "path": "skills/buster/plugins/security-providers/src/kubernetes-runtime.js",
      "sha256": "0694947eb3fcfb8637ad8a80be41e7b9985fae79df1b348a5279b9c6959203c5"
    },
    {
      "path": "skills/buster/plugins/security-providers/tests/database-freshness.test.mts",
      "sha256": "e37ea6086143c335c70c0fcc5ea7839b4e149a012fd6efbc22dd374c1af958c7"
    },
    {
      "path": "skills/buster/plugins/security-providers/tests/live-function.test.ts",
      "sha256": "0581bde77436534084542396ff836e417532c9fffa314af56d52f8b094248162"
    },
    {
      "path": "skills/buster/plugins/security-providers/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/size-budget/README.md",
      "sha256": "9cab80aae3f14c2c1dac300c3875ffa561dda4e64bdec0bfcec530e1e1ceb7a4"
    },
    {
      "path": "skills/buster/plugins/size-budget/package.json",
      "sha256": "381c7472b565616bf9d29567a726c3de521a873917ed71d4c920014ae92eb269"
    },
    {
      "path": "skills/buster/plugins/size-budget/plugin.json",
      "sha256": "5f9a11dad63edf557454124ae8a71a6382ddac5212dbeaf064e86019fe28a737"
    },
    {
      "path": "skills/buster/plugins/size-budget/schemas/config.schema.json",
      "sha256": "e20a56b4cb1bba2d69355a3da142db17bb9d254d8276b86809c8b32994dbd894"
    },
    {
      "path": "skills/buster/plugins/size-budget/src/provider.js",
      "sha256": "844fe21d0451386ecbbea5aca7be66fb643e12089b0e7cf1b22b4ba3fc91a3ce"
    },
    {
      "path": "skills/buster/plugins/size-budget/tests/live-function.test.ts",
      "sha256": "0db789a82964e2676582e0bee7afd31e046d6f4b6e9604ccaf63474f78207408"
    },
    {
      "path": "skills/buster/plugins/size-budget/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/README.md",
      "sha256": "7fcb51b8fb8d22dddab78d9e5aa09abe37f547aa8385e0e9d22cfcfcf88db4df"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/package.json",
      "sha256": "3918395fcd44dfcba85323354798768a11c9d4219e4284769579f02913d84f9d"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/plugin.json",
      "sha256": "c61695a3a068a240a335949e27287829fa8183b465bd648662525da67fc9648b"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/schemas/config.schema.json",
      "sha256": "0ffe60c3f3b2ab2fa054a239892663c20bb59621b9e5fdbf05541d862a986ccd"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/src/provider.js",
      "sha256": "7e8f092bf66aac62bcd7ffd01b80710ccdd97c87f1ceec126139ba23d08ca1f0"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts",
      "sha256": "3e2524bee3df8bec94f757d87e03122395280c0fc7a80d42776669430f142c56"
    },
    {
      "path": "skills/buster/plugins/tailscale-exposure/tsconfig.json",
      "sha256": "a8cbf09fc2b6d9f3b362a769e869aeff9cfc8fe43cd06b366076f0e45ae9b792"
    },
    {
      "path": "skills/buster/plugins/visual/README.md",
      "sha256": "96654f60f76342f316b001db5e94b9a730938bed691808f729f3ce970cc95ac4"
    },
    {
      "path": "skills/buster/plugins/visual/package.json",
      "sha256": "790b09a88f930ce966cb8001f6e911f1809e9fe0ed4ec83413ca112179ff713a"
    },
    {
      "path": "skills/buster/plugins/visual/plugin.json",
      "sha256": "3f637455f6577136024318784f35e724a04abfe43e24406f31e37ded4f6f5a90"
    },
    {
      "path": "skills/buster/plugins/visual/schemas/config.schema.json",
      "sha256": "b7804886b708d164ddade0d54585337e508ba0a869756d39f1eb561db28ea7da"
    },
    {
      "path": "skills/buster/plugins/visual/src/browser-identity.js",
      "sha256": "44ab23cb793d764710dae28b0a3a4c340ae57aeeb6e36dc7bfae192c05c265d3"
    },
    {
      "path": "skills/buster/plugins/visual/src/provider.js",
      "sha256": "1a321386019f583561a20297bf8ad1ff57599aac2e906ed1f48bada2f08419b1"
    },
    {
      "path": "skills/buster/plugins/visual/tests/browser-identity.test.mjs",
      "sha256": "84249a40bd69166a6c052e8654fb3b384201c536a818713768e55806e0fea6a3"
    },
    {
      "path": "skills/buster/plugins/visual/tests/live-function.test.ts",
      "sha256": "c8dfbac810f6b1be0db10368b203eb5731f9ebdb6ab2afde87171748cd4f7109"
    },
    {
      "path": "skills/buster/plugins/visual/tsconfig.json",
      "sha256": "7ea156239ab42e02f03ca507403f02f79f8147e862f5a95ad88c08cf65994a79"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/config/platform.ts",
      "sha256": "4bce96fe0b9556266c7586aa7803f6ff790dfd7f74e4952ddc5ebd25f9ebc7e8"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/config/published-pair.ts",
      "sha256": "c0c4fc08ae422962f201b4ec9f134ec03f8e3354c85316cb92657db18aafa27a"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/isolation/cgroup.ts",
      "sha256": "054104fb7041d0712721b94da5985a0f93540c0457bfe06ce601ce985a450737"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/isolation/memory-limit.ts",
      "sha256": "2ee1b41fa611fcecd63b69e0d21c899644982e37fc4eac897f86e8b9bed09165"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/isolation/protocol.ts",
      "sha256": "48563d1740ff46022fc85132706e20c9a418bc185891704fca08b417df42e820"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/isolation/runner.ts",
      "sha256": "36c9c5e668f4599f46524f5599898037bdb0600d4fdca7527985ef809af7587b"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/isolation/session.ts",
      "sha256": "79bc9adc0cacb9fe00e27a567142377db46af92049abb685d5b2a61f6ba4cc7c"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/admission-retirement.ts",
      "sha256": "11172dcc4e8704ab48da4a0ec9c36c889b52672e201f9a5c729fda551e5b8b1a"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/attempt-projection.ts",
      "sha256": "4e7e1217ec7142f3e414c7c93f3b187e77b74768901da310118db939b2bb4523"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/attempt-replay.ts",
      "sha256": "f0d7de829604fdb1650abf10f6b0fa5c65db018a579f6fd43367e7ac98befd91"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/durable-attempts.ts",
      "sha256": "4c0fe1e20bafcddcb21997eb56de19dfcb1ceedeaf0df134c1c19b48781da750"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/durable-blob-read.ts",
      "sha256": "5b736d337407890d27b547bc07bd514d378478589d4f56092ca9e5742fe2d285"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/durable-delivery.ts",
      "sha256": "5624aa2b5f980a373ab30fdf012dee1346418ac3b2537244475f2a496d3766a0"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/durable-records.ts",
      "sha256": "c9a0c42b8cdd3a2f188ec38a3cab5270d0f032444801626ea2c6860e534582dd"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/hash-journal.ts",
      "sha256": "b00c2271bb662055d7250ca193f842d1e6346edf22dfa713b33df1b637ce957a"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/record-retirement.ts",
      "sha256": "00a081bdccc917067eeabea36d6438615aada22c637e4d7f42e3852285647681"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/observability/replay-validation.ts",
      "sha256": "8e11ae8d57a44f7a0947ee9f81a794630eab3c5cbdfcde38673ba1e41e62cbbc"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/package.json",
      "sha256": "d2639c87351035eb4ed0d34569934d18151b4024ec81a7604680ad3a6ae71ae2"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/processes/linux-process-group.ts",
      "sha256": "4dd81ccecacfc3b71848d2cca20c4e83e31f14223d4320ba30c83c4650592388"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/activation.ts",
      "sha256": "2d1ba3633fd9ba8549488f953a21909fdebd7d70c056fad1c688316d2ca8ee67"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/build.ts",
      "sha256": "c65248d6d4dc09dcfe762e9cddd6dd27d5864cbdab7cc421d87256e712873867"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/capabilities.ts",
      "sha256": "eeebd66fcb6a813fdad60188261e14d530c5d09f6c61f9972bc0428ecff151b6"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts",
      "sha256": "147fae4d867752edcb4cb1bf9966ed62372e77a5e90402a9f8fac9a8ab170fa0"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/configuration.ts",
      "sha256": "94f711ce386148d0aa3e114512afb3fcf8b69ef41c14b7e5215d17881fe66a2f"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/digest.ts",
      "sha256": "000539ceae6719b16ac795ef1cfb90877aa44e81c26b4335c17f85912b4076e4"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/discovery.ts",
      "sha256": "1f2742573de8a2f37067238bc53edcb4b031e881f04da94519687c79eb758a87"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/errors.ts",
      "sha256": "148025829782ddac5d15ea25736b4ec7a3faefcfabdce152809baf8ed807ce25"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/frozen-map.ts",
      "sha256": "b4d3f268b79917e962959420a6b7a9a598086ac5d3d87cfb5bc0f8ee2a7583f7"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/frozen-set.ts",
      "sha256": "94b7eb7f0ba2bd7ddb23d0e0dceb701395a5c2aa17bc67a14d8f53d0e9dce753"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/import-audit.ts",
      "sha256": "764ca496cd9bf406a26eed400777d61b239c6130fdf3b94204c4006d132458f3"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/schema.ts",
      "sha256": "eb665b9db83e0d0d1bd15fbe5c6f916f479bf8a9c049de6d90b2d6f9f59cc557"
    },
    {
      "path": "skills/common/plugin-runtime/foundation/registry/types.ts",
      "sha256": "6667bd4389377d33ba41c2c7166f3488c40f0cad1fc0e7c067fb37a6f2eca291"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/package.json",
      "sha256": "e1f4ad759281d02de47f86d066cc372192ae919f8034b167f20fe09b38488770"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/artifact-json.ts",
      "sha256": "1185d6f1b3423a280c298815b41b66b1a3d2fc521ccb83889eaa764e4b37b743"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/generated/contracts.ts",
      "sha256": "8ade81b1f64c78b4cf2198f7ae7dc0c726fb4cec3ffa553986310d353dbc71c1"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/index.ts",
      "sha256": "464a94399315ad25f40511b8d1ee93c76b3535a82cd90fbde06bf0a58aa0cc9a"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/review-cache-profile.ts",
      "sha256": "27db2d023371d14446fb971fdbe216e3a4ce6bb9f0b8ca296e94ba805575e44f"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/review-subject.ts",
      "sha256": "da9b32a8da9d0d53fc11b79685ef3ff8cddd2f2b299f846fc2072224c6dc7719"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts",
      "sha256": "a2b18a4fd9655b88fc4e13d785a1671849779c90bd2ed7dc02c5735c609e6113"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/runtime-dispatch-profile.ts",
      "sha256": "13f61a984922b7fa815e084b6a5a20238fd0da67aed5959bdc8b061a8e3173fb"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/runtime-workspace.ts",
      "sha256": "b5e40fc049bbf3467267a14ca38a7996b866cc089ff4ef555d701c63faa326e9"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/runtime.ts",
      "sha256": "d4f0ee5d8960b4ff619bf5d45064b069a39f75b978cf831837de08cb5900d6e4"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/source-approval.ts",
      "sha256": "fbe79e4cec0cffeb4b1038aac2d168a7b329296a6f180c24960e2c659c61c3c4"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/source-preflight.ts",
      "sha256": "af3e4601e9d8d4f3ec8e3757f347d430b9a2f923fb22da3c4e7df09159e4fa82"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/source-revision.ts",
      "sha256": "d7ee56bc4fb2197e1198909226be3dc09358fbf4552972973f0ffa2d48bf484a"
    },
    {
      "path": "skills/common/plugin-runtime/sdk/src/values.ts",
      "sha256": "b91ec914fb8ce1eaccc40751f9693689694e455389eb8742d7f275fdeb24571f"
    },
    {
      "path": "skills/common/plugins/command-runner/package.json",
      "sha256": "10c4fa83d2434f83f2334c0fb779f1e08e950c632b51ec06492f86d1f7721bc2"
    },
    {
      "path": "skills/common/plugins/command-runner/src/cgroup.ts",
      "sha256": "163b671691e314418a9c2c28a1b7bdbfe84e04e5162409e98607ff29d64f36da"
    },
    {
      "path": "skills/common/plugins/command-runner/src/execution.ts",
      "sha256": "b08ca224ab8b6a6276c002152cc54814f236d2dcda84a7faebb2b4463fce2ee0"
    },
    {
      "path": "skills/common/plugins/command-runner/src/process-facts.ts",
      "sha256": "d6220a90dc0cf14612e1e693c5ac708f3783d9d0d10fc6d451f052259a95742a"
    },
    {
      "path": "skills/common/plugins/command-runner/src/process-group.ts",
      "sha256": "b58ed6ee068546fa44561a7875aee21633e02a4148dedb0104b15c441b8a3002"
    },
    {
      "path": "skills/common/plugins/command-runner/src/runner.ts",
      "sha256": "3cf07ec2c39b3caa50419c48ce49119d37491abb83398d637d400f06ebf5e2ad"
    },
    {
      "path": "skills/common/plugins/command-runner/src/types.ts",
      "sha256": "b6c616b30b31e0eab97685c9698674579cfac2762b43657536f08eb5ea70e3e7"
    },
    {
      "path": "skills/common/plugins/operator-messaging/src/receiver.ts",
      "sha256": "3701e839cc513812a790a4a794ebdd2dc71bf56ab1def0854250c38494cf3ab1"
    },
    {
      "path": "skills/nova/core/effects/contracts.ts",
      "sha256": "2214fa4a761a7e2b427df8b7578c76373377d27a021176e13a14e05e5ef606d3"
    },
    {
      "path": "skills/nova/core/effects/coordinator.ts",
      "sha256": "e0a3408e2102507c5b8b0ffdc6833e2901afdf41c5bc1ef7fa22e98d7506ac89"
    },
    {
      "path": "skills/nova/core/effects/dependency-identity.ts",
      "sha256": "13d0c12129bdd1bdc6eb5d8a4d103752bf266e459fcb20a672ee3c42fdfc2f81"
    },
    {
      "path": "skills/nova/core/effects/dependency-journal.ts",
      "sha256": "dc0e567a573b822afb54353b04a4b58cd93fad1b155067d1173957ae6a5035a3"
    },
    {
      "path": "skills/nova/core/effects/durable-invocation.ts",
      "sha256": "6856d2c2761cb9c8e974d0f8683e0083571ed91b25740832921d32341e70d3f2"
    },
    {
      "path": "skills/nova/core/effects/identity.ts",
      "sha256": "8d3e2f32b4fdb98f6159c989b41fe926fd5b518791b4b02246d633dff847bcb9"
    },
    {
      "path": "skills/nova/core/effects/journal.ts",
      "sha256": "1ab8839b77c51008973975a324d675af129e8aa45152ae0fde97c954d5af3b95"
    },
    {
      "path": "skills/nova/core/effects/locks.ts",
      "sha256": "7ca675286800ee88314919f7c0d524c7b5cde99928b9e93c8036e566ecc4b793"
    },
    {
      "path": "skills/nova/core/effects/memory-locks.ts",
      "sha256": "4e7a78b0c8ac9242c9ce5333e7c3fcc620cc4f174b4a9018509da3f3931e5797"
    },
    {
      "path": "skills/nova/core/effects/resource-acquisition.ts",
      "sha256": "d48a8c272050b230d9d83b9b8254df158454b6c0e7fb0eab950d0e89ff4cfb1c"
    },
    {
      "path": "skills/nova/core/execution/adapter-invocation-phase.ts",
      "sha256": "eaae9f5fd571a476b1b7ddbec709f1389c95e71189143ea23a87faa52847ae5f"
    },
    {
      "path": "skills/nova/core/execution/adapter-startup.ts",
      "sha256": "9bb8a0c27dfa199756cbe16a6898e7fb4d3a43c6ca59af144026bbb135a44619"
    },
    {
      "path": "skills/nova/core/execution/adapter-support.ts",
      "sha256": "2eb72fdc7d7731b105807495697647b049c00c39e84b695db29a219a2ac1156d"
    },
    {
      "path": "skills/nova/core/execution/adapters.ts",
      "sha256": "293011e7313155b08f33bbef4ce0e910d00c7feef88fd6c585b040bb2cadbc24"
    },
    {
      "path": "skills/nova/core/execution/artifact-checkpoints.ts",
      "sha256": "77272b94fa7a2c5c4968753fff902ff3ac88deb5f3ef2da4c87580fae5bc78f7"
    },
    {
      "path": "skills/nova/core/execution/authorization.ts",
      "sha256": "3f04309435d4fe3eebe5a73bac5247b0d3c981ffd4a9580e52974cf46cf3942d"
    },
    {
      "path": "skills/nova/core/execution/context.ts",
      "sha256": "3f61fc7b2e18d6c36bf9eaff5173a06d31dd06d14a07b05c6d8be7320098a288"
    },
    {
      "path": "skills/nova/core/execution/effect-recovery.ts",
      "sha256": "06ee56bce5fedf57518e39858b700278c33b81d4edb2177587007f392b0ce186"
    },
    {
      "path": "skills/nova/core/execution/engine-runtime.ts",
      "sha256": "de279faaeffc78713d3b3049d43a2efb9add45e4ad05a89c0f4efde1dbe120ec"
    },
    {
      "path": "skills/nova/core/execution/engine-snapshots.ts",
      "sha256": "50dfe92e656875658b7604f30012f8493564729473f6ddd65b64960ecf9946fd"
    },
    {
      "path": "skills/nova/core/execution/graph-build.ts",
      "sha256": "75ce0387330d8acc6d7217aa8539a41c7796fcfd1522c079c8585c55e765adc6"
    },
    {
      "path": "skills/nova/core/execution/graph-repair-budget.ts",
      "sha256": "f5cd06815a0d7d631276b256fd80bcbd57e018f68326909d69b424f2e08a284e"
    },
    {
      "path": "skills/nova/core/execution/graph.ts",
      "sha256": "680077697180d4ef2df70e823391eaef710d49fb721338663f8f73d65973b2af"
    },
    {
      "path": "skills/nova/core/execution/lease.ts",
      "sha256": "1f2164d57fdfb15dd5d67f04398f1cc42366a11c862083a30eba7de1ac03e13b"
    },
    {
      "path": "skills/nova/core/execution/pipeline-loop.ts",
      "sha256": "129a77125e5d88a118b9d3cefb06d1bedf734924cabd32be607063a33d985530"
    },
    {
      "path": "skills/nova/core/execution/run-decisions.ts",
      "sha256": "a509f00aa74367e90d396f338db55acff2610075ac0063d14fa8bec4ba9d1171"
    },
    {
      "path": "skills/nova/core/execution/runner.ts",
      "sha256": "9a34098cd68460f42e220ada2f3e7bef37fcc9eb5fdd351db2cd1585fe6a5cc6"
    },
    {
      "path": "skills/nova/core/execution/stage-executor.ts",
      "sha256": "4c846993c679c9ce663f7dda0e8de78fd26101e83948dd17211e62f83ea2eafb"
    },
    {
      "path": "skills/nova/core/lifecycle/reducer.ts",
      "sha256": "13982ba82b9b619f5df89dc0b9932c7802f0b78968e450263ab302726d4f552d"
    },
    {
      "path": "skills/nova/core/lifecycle/remediation.ts",
      "sha256": "49c26f15b12f2281bf86a10c5b21669f7e8ab423c5d0f7ce317ce546e1254535"
    },
    {
      "path": "skills/nova/core/lifecycle/repair-budget.ts",
      "sha256": "6bd3d5f44d67edf626ce45301a716d5a6ea06d1f0f870b47d6f071b7930872d4"
    },
    {
      "path": "skills/nova/core/lifecycle/repair-projection.ts",
      "sha256": "9721b421a4fa07f9da5c33915fe1ea3ea1b0daa9e8f299ca49547d89ece22c24"
    },
    {
      "path": "skills/nova/core/lifecycle/wait-request.ts",
      "sha256": "0e9f41bd8e4a5ceb6e43d53e713e3fbbdacca2540ff31134d0409745252419de"
    },
    {
      "path": "skills/nova/core/state/file-mutex.ts",
      "sha256": "d6d347d6b615796ff761c0c608ed6a4d9f4f834bea92ddd2870d2312b5d04c7c"
    },
    {
      "path": "skills/nova/core/state/journal.ts",
      "sha256": "25be25a991c93c0e523178e3c45e2f7fb15ecad6e1a03566fca241d6b27f40bf"
    },
    {
      "path": "skills/nova/core/state/json-value.ts",
      "sha256": "c99b7a8c16e3c8c6860e7e469d9feb454448fab311f8d5f7bbf6dd690e59a58b"
    },
    {
      "path": "skills/nova/core/telemetry/observer-delivery.ts",
      "sha256": "d80f67ca85cafee41eb41d228be7a8d3aff820b556ccf21efa6f0a9845afd1fc"
    },
    {
      "path": "skills/nova/core/telemetry/observer-recovery.ts",
      "sha256": "9d97600debff727243d62fbad6c4a4616b056a4e4afb1098e1e19bbaa5f3edcb"
    },
    {
      "path": "skills/nova/core/telemetry/observers.ts",
      "sha256": "b46b9a70b190bf8541d96188221a63acc1e9c03ff6204a9e94b37c944306aafd"
    },
    {
      "path": "skills/nova/core/test-gates/pipeline.ts",
      "sha256": "8e17514a8b9699f2f921f07b6f450b3c4357903ec4726f72099644d1703cd2ed"
    },
    {
      "path": "skills/nova/core/test-gates/resolver.ts",
      "sha256": "56eab5e577fe39e157a2117ad4fddd96d5282d4ff5a8270a3677ee0361a385c3"
    },
    {
      "path": "skills/nova/core/test-gates/types.ts",
      "sha256": "560f3edc4024f8c65d6857f90df837454f6554be9cc3c29c6d09b320af4f28a2"
    },
    {
      "path": "skills/nova/plugins/human-approval/src/approval.ts",
      "sha256": "5798d5bddb20d62a320114387f3f8df4275b83972f1cb41d9e4a823e92fee99d"
    },
    {
      "path": "skills/nova/plugins/preflight-contract/src/declarations.ts",
      "sha256": "deb342dd39f6612567e5d67fc708a02a0db42ae9ff20027bb448a594c7cee309"
    },
    {
      "path": "skills/nova/plugins/prism-design/src/architecture.ts",
      "sha256": "bb4fab2431b51d68a787fefdaec95649678e86ede9961bc2fb1ad168b7eed10f"
    },
    {
      "path": "skills/nova/plugins/prism-design/src/archive.ts",
      "sha256": "8875fcaa4c6efafa2f231c8e3fcc522dcd1ae1f23850a4d8941a89358726383e"
    },
    {
      "path": "skills/nova/plugins/prism-design/src/stage.ts",
      "sha256": "20bee389c4868070dc7450d366b85745c2f26acb88e8d526463c3cb5a599db88"
    },
    {
      "path": "skills/nova/project/compiler.ts",
      "sha256": "9d8ccdb3a1ccc56c58c1ec510aed54473f7db6d4135d28b2e265bbf90d7f1ef5"
    },
    {
      "path": "skills/nova/project/coverage.ts",
      "sha256": "6ad22387d588ec783ddfd12a45d1aea735785f3a065254d0fc00b1820ee01f2b"
    },
    {
      "path": "skills/nova/project/delivery-manifest.ts",
      "sha256": "4c518954177f1801f3ba15ea27b60218ec8eef62b974df5be85bae23d34776b1"
    },
    {
      "path": "skills/nova/project/demo.ts",
      "sha256": "fa1aeed1f47f817fde79905a97b565191be5e4279b83ee8752c36f45531aa566"
    },
    {
      "path": "skills/nova/project/review-semantics.ts",
      "sha256": "6eaef989be2bdd8b262bd07fde598c739eaab5c9e8e28e63e089bac5f348baf8"
    },
    {
      "path": "skills/nova/project/source.ts",
      "sha256": "f652f5bda01a9a39ea7015ddbf12867ff81f989b0fbe2e0cadcff1a4b4ae2cd0"
    },
    {
      "path": "skills/prism/studio/dev-fixture.ts",
      "sha256": "4f0fca3d14d924eb2844660aa80ec8f70d8ece82585f181ea2ccd7b792e6a9d4"
    },
    {
      "path": "skills/worker/core/package.json",
      "sha256": "115273bab79eb997cff67343773f542c33924227ef9e172c742a807843fe34ac"
    },
    {
      "path": "skills/worker/core/src/index.ts",
      "sha256": "2e17c3e33d5c47c2c7e8f4a03c8eda3120dfd123e7c0145e5685741efe28c00e"
    },
    {
      "path": "skills/worker/core/worker/attempt-executor.ts",
      "sha256": "2ae7f5897a79042c601d58da5af682baba0e416e0c4ab302108386e3b619db42"
    },
    {
      "path": "skills/worker/core/worker/digest.ts",
      "sha256": "d8c005287076f3ca2a6e84daf386c17ff77858ba5dc22cfebd3b9063d48ef402"
    },
    {
      "path": "skills/worker/core/worker/local-runtime.ts",
      "sha256": "02876cafd08f35c84b67d3c8972e45167074c226c928c53a81b190bd67071435"
    },
    {
      "path": "skills/worker/core/worker/log-decoder.ts",
      "sha256": "7f777b5cd5f9544c6eb2f5933613d8d8379633742edf45cd235428805e7dea88"
    },
    {
      "path": "skills/worker/core/worker/native-attempt-executor.ts",
      "sha256": "bddc68aa370648c86e7b7301f4f31a083504217dd89bac7694c36c344a8e23a3"
    },
    {
      "path": "skills/worker/core/worker/native-attempt-journal.ts",
      "sha256": "9115ef644c440d5024745149613f63b971ba444ac54147b750f405e1ac2167e4"
    },
    {
      "path": "skills/worker/core/worker/native-attempt-recovery.ts",
      "sha256": "fc55712ec3a5237e0131969d4aa190fcf994541525521210e8598ec63c950769"
    },
    {
      "path": "skills/worker/core/worker/native-control-channel.ts",
      "sha256": "253ecc17f153e13e6e00aad3f842565ad17a01e85cac15db910d9b4b2ea9edc8"
    },
    {
      "path": "skills/worker/core/worker/native-journal-state.ts",
      "sha256": "caca74b468a134faf29da1f74d0a69443f495e63fbbf8fb39692ff9de0ba8111"
    },
    {
      "path": "skills/worker/core/worker/native-node-identity.ts",
      "sha256": "6ea78a96f82fa25ad27b26a2a48911e1e7a625fe9c0b25db76af39f49f2394f3"
    },
    {
      "path": "skills/worker/core/worker/native-output-spool.ts",
      "sha256": "da9b2bdd9f5b8f9418e98a451eb3275aadec117a9ee7ca733566e571870898c7"
    },
    {
      "path": "skills/worker/core/worker/native-pool-policy.ts",
      "sha256": "3b64878629a5ee897e8dd71ae6b592bc1c89df36677fc2860f8d7f4bb4227307"
    },
    {
      "path": "skills/worker/core/worker/native-process-cancellation.ts",
      "sha256": "1a3295c2220b82b3c06047151df0a6ca4e126f747f5eaabb57ddb5a753cd1bf5"
    },
    {
      "path": "skills/worker/core/worker/native-process-control.ts",
      "sha256": "3cfd56d48a2f70fb80072692a133fb0c8490bd94ec79d5270b771dd2e2717d2e"
    },
    {
      "path": "skills/worker/core/worker/native-process-launches.ts",
      "sha256": "4b4ea9b64584e43f2f791d97872430f0d2dcf917d5ada11c0a8bb2ecd4456155"
    },
    {
      "path": "skills/worker/core/worker/native-process-output.ts",
      "sha256": "5f7a4e1cdd9424fefe249775886a34019da38f7a76c486b38005c5d727f14350"
    },
    {
      "path": "skills/worker/core/worker/native-resource-accounting.ts",
      "sha256": "c92b1246dd5b924b71147314257063eba2478838abe4ddcb3a9453a2e9abe448"
    },
    {
      "path": "skills/worker/core/worker/native-resource-observation.ts",
      "sha256": "903fe22c2b9c51c908111361bb0423819a32ce1a4bf99b49b08cb39f490b976c"
    },
    {
      "path": "skills/worker/core/worker/native-resource-pool.ts",
      "sha256": "2a002b796bae216210186f258d32f5dd267ec10a4940f4d0fc2f12ea72bd93ee"
    },
    {
      "path": "skills/worker/core/worker/native-resource-scope.ts",
      "sha256": "2aa1a46145ff77451e85796c1ce13ade3c4eaf7beba5063cabf0acb081190d4c"
    },
    {
      "path": "skills/worker/core/worker/native-result.ts",
      "sha256": "11c8074a973fec8f764e64668e29c7d4907a5b9e605b6bad04cbfa0454d318bd"
    },
    {
      "path": "skills/worker/core/worker/native-runtime-identity.ts",
      "sha256": "4bb8600bf48477411e75148e6edbd0dae345809316d60a3d3cd4b8ad6f8a057e"
    },
    {
      "path": "skills/worker/core/worker/native-supervisor-authority.ts",
      "sha256": "2a710c00d935777144fc2055e435f1610bc66a01976a002047de751862e18650"
    },
    {
      "path": "skills/worker/core/worker/native-worker-ownership.ts",
      "sha256": "e297616eae31d0c14a0e319c18f1c64090bd39e42603bb661c0ea096c4dc8bfd"
    },
    {
      "path": "skills/worker/core/worker/native-worker-process.ts",
      "sha256": "d43bc3ce05976d77579dbc624cae8be1d3209732b023124e3eb6f0a8fd9860da"
    },
    {
      "path": "skills/worker/core/worker/ownership-state.ts",
      "sha256": "fb56676102eadf6a00d3a138cacab4ff945ba5974ba78786c3840ba18faed05a"
    },
    {
      "path": "skills/worker/core/worker/ownership-store.ts",
      "sha256": "d784b4196a6103a0ad1e1eaa086640d89ea3205db74be0b0d569045183d20b79"
    },
    {
      "path": "skills/worker/core/worker/phase-deadline.ts",
      "sha256": "13ead2817f0277f8bb7a45b09f42df228bc62e8a0d43e26eabbcbc4f2365e456"
    },
    {
      "path": "skills/worker/core/worker/resource-accounting.ts",
      "sha256": "eaed91f776bfdbf1daac4faa7b2e56848b5f1b1f83d2737622048cd4426837ef"
    },
    {
      "path": "skills/worker/core/worker/resource-reservations.ts",
      "sha256": "781ba82f68942a44ba3c40652adffb76d8ceb369c279909dc826fbc361fd63e9"
    },
    {
      "path": "skills/worker/core/worker/resource-result-fields.ts",
      "sha256": "d109f3aedf33fca9a84eab376d96ae714ea4134af5cfebf7c495cb7db89e218f"
    },
    {
      "path": "skills/worker/core/worker/trust.ts",
      "sha256": "722f48ca75fb8546dbc4f4c9cc8eab8e31dfdfeafec7ea7aab587045e78b23fe"
    },
    {
      "path": "tests/verification/e2e/support/optional-absence.ts",
      "sha256": "09944ef955b43f0d1bd2e33ceed7d1655c1fc0bff100fc9c7e8053651b84a7d4"
    },
    {
      "path": "tests/verification/e2e/support/platform-config.ts",
      "sha256": "e05530e73fe5ea3a853defe8db219af79aa56d86a14a56eb5170bc214a5f8ba6"
    }
  ],
  "directoryRosters": [
    {
      "path": "charts/kubeclaw",
      "files": [
        "charts/kubeclaw/Chart.yaml",
        "charts/kubeclaw/files/config/.semgrep.yml",
        "charts/kubeclaw/files/config/.tflint.hcl",
        "charts/kubeclaw/files/config/.yamllint.yml",
        "charts/kubeclaw/files/config/eslint-type-evidence-config.mjs",
        "charts/kubeclaw/files/config/eslint-type-evidence-generated-config.mjs",
        "charts/kubeclaw/files/config/eslint-type-evidence-tests-config.mjs",
        "charts/kubeclaw/files/config/eslint.config.mjs",
        "charts/kubeclaw/files/config/jscpd-tests.json",
        "charts/kubeclaw/files/config/jscpd.json",
        "charts/kubeclaw/files/config/knip.json",
        "charts/kubeclaw/files/config/kubernetes-policy-pack-default.json",
        "charts/kubeclaw/files/config/lint-baseline.json",
        "charts/kubeclaw/files/config/lint-policy.json",
        "charts/kubeclaw/files/config/swarm.config.json",
        "charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs",
        "charts/kubeclaw/files/reset-managed-plugin-projects.mjs",
        "charts/kubeclaw/files/restore-managed-plugin-config.mjs",
        "charts/kubeclaw/templates/NOTES.txt",
        "charts/kubeclaw/templates/_demo-ready-client.tpl",
        "charts/kubeclaw/templates/_helpers.tpl",
        "charts/kubeclaw/templates/_registry-clients.tpl",
        "charts/kubeclaw/templates/_worker-trust-readiness.tpl",
        "charts/kubeclaw/templates/archviewer.yaml",
        "charts/kubeclaw/templates/buster-namespace-controller.yaml",
        "charts/kubeclaw/templates/buster-namespace-fence.yaml",
        "charts/kubeclaw/templates/buster-namespace-lease-crd.yaml",
        "charts/kubeclaw/templates/buster-runtime-pvc.yaml",
        "charts/kubeclaw/templates/configmap-gateway.yaml",
        "charts/kubeclaw/templates/configmap-skills.yaml",
        "charts/kubeclaw/templates/configmap-swarm-config.yaml",
        "charts/kubeclaw/templates/configmap-worker-trust.yaml",
        "charts/kubeclaw/templates/configmap-workspace.yaml",
        "charts/kubeclaw/templates/demo-ready-service.yaml",
        "charts/kubeclaw/templates/deployment.yaml",
        "charts/kubeclaw/templates/pvc.yaml",
        "charts/kubeclaw/templates/rbac.yaml",
        "charts/kubeclaw/templates/secret.yaml",
        "charts/kubeclaw/templates/service-extra-nodeports.yaml",
        "charts/kubeclaw/templates/service.yaml",
        "charts/kubeclaw/templates/serviceaccount.yaml",
        "charts/kubeclaw/values.yaml"
      ]
    },
    {
      "path": "charts/prism",
      "files": [
        "charts/prism/Chart.yaml",
        "charts/prism/ci-values.yaml",
        "charts/prism/files/prism-backup.sh",
        "charts/prism/templates/_helpers.tpl",
        "charts/prism/templates/_product-decisions.tpl",
        "charts/prism/templates/_worker-trust-readiness.tpl",
        "charts/prism/templates/backup-storage-check.yaml",
        "charts/prism/templates/backup.yaml",
        "charts/prism/templates/configmap-worker-trust.yaml",
        "charts/prism/templates/ingestion.yaml",
        "charts/prism/templates/jobs.yaml",
        "charts/prism/templates/networkpolicy.yaml",
        "charts/prism/templates/postgresql.yaml",
        "charts/prism/templates/product-decisions-networkpolicy.yaml",
        "charts/prism/templates/serviceaccounts.yaml",
        "charts/prism/templates/services.yaml",
        "charts/prism/templates/workloads.yaml",
        "charts/prism/values.schema.json",
        "charts/prism/values.yaml"
      ]
    },
    {
      "path": "contracts/pipeline-test-gate/v1/examples",
      "files": [
        "contracts/pipeline-test-gate/v1/examples/a11y-config.json",
        "contracts/pipeline-test-gate/v1/examples/api-flow-config.json",
        "contracts/pipeline-test-gate/v1/examples/api-suite.json",
        "contracts/pipeline-test-gate/v1/examples/browser-profiles.json",
        "contracts/pipeline-test-gate/v1/examples/container-build-dockerfile.json",
        "contracts/pipeline-test-gate/v1/examples/e2e-playwright.json",
        "contracts/pipeline-test-gate/v1/examples/e2e-result-cypress.json",
        "contracts/pipeline-test-gate/v1/examples/http.json",
        "contracts/pipeline-test-gate/v1/examples/kubernetes-fixture.json",
        "contracts/pipeline-test-gate/v1/examples/lighthouse-performance-config.json",
        "contracts/pipeline-test-gate/v1/examples/lighthouse-settings.json",
        "contracts/pipeline-test-gate/v1/examples/openapi-config.json",
        "contracts/pipeline-test-gate/v1/examples/security-config.json",
        "contracts/pipeline-test-gate/v1/examples/size-budget-growth.json",
        "contracts/pipeline-test-gate/v1/examples/size-budget-tar.json",
        "contracts/pipeline-test-gate/v1/examples/tailscale-exposure.json",
        "contracts/pipeline-test-gate/v1/examples/unit-suite-blocking.json",
        "contracts/pipeline-test-gate/v1/examples/unit-suite-with-coverage.json",
        "contracts/pipeline-test-gate/v1/examples/visual-baselines.json",
        "contracts/pipeline-test-gate/v1/examples/visual-config.json"
      ]
    },
    {
      "path": "contracts/pipeline-test-gate/v1/schemas",
      "files": [
        "contracts/pipeline-test-gate/v1/schemas/browser-profiles.v1.schema.json",
        "contracts/pipeline-test-gate/v1/schemas/e2e-result.v1.schema.json",
        "contracts/pipeline-test-gate/v1/schemas/lighthouse-settings.v1.schema.json",
        "contracts/pipeline-test-gate/v1/schemas/pipeline-test-gate.v1.schema.json",
        "contracts/pipeline-test-gate/v1/schemas/visual-baselines.v2.schema.json"
      ]
    },
    {
      "path": "contracts/pipeline-test-gate/v1/suites",
      "files": [
        "contracts/pipeline-test-gate/v1/suites/a11y.v1.json",
        "contracts/pipeline-test-gate/v1/suites/api.v1.json",
        "contracts/pipeline-test-gate/v1/suites/container-build.v1.json",
        "contracts/pipeline-test-gate/v1/suites/e2e.v1.json",
        "contracts/pipeline-test-gate/v1/suites/http.v1.json",
        "contracts/pipeline-test-gate/v1/suites/kubernetes-fixture.v1.json",
        "contracts/pipeline-test-gate/v1/suites/perf.v1.json",
        "contracts/pipeline-test-gate/v1/suites/security.v1.json",
        "contracts/pipeline-test-gate/v1/suites/size-budget.v1.json",
        "contracts/pipeline-test-gate/v1/suites/tailscale-exposure.v1.json",
        "contracts/pipeline-test-gate/v1/suites/unit.v1.json",
        "contracts/pipeline-test-gate/v1/suites/visual.v1.json"
      ]
    },
    {
      "path": "skills/buster/plugins",
      "files": [
        "skills/buster/plugins/README.buster.md",
        "skills/buster/plugins/api-flow/README.md",
        "skills/buster/plugins/api-flow/package.json",
        "skills/buster/plugins/api-flow/plugin.json",
        "skills/buster/plugins/api-flow/schemas/config.schema.json",
        "skills/buster/plugins/api-flow/schemas/flow.schema.json",
        "skills/buster/plugins/api-flow/src/provider.js",
        "skills/buster/plugins/api-flow/tests/live-function.test.ts",
        "skills/buster/plugins/api-flow/tests/remediation.test.ts",
        "skills/buster/plugins/api-flow/tsconfig.json",
        "skills/buster/plugins/axe/README.md",
        "skills/buster/plugins/axe/package.json",
        "skills/buster/plugins/axe/plugin.json",
        "skills/buster/plugins/axe/schemas/config.schema.json",
        "skills/buster/plugins/axe/src/provider.js",
        "skills/buster/plugins/axe/tests/live-function.test.ts",
        "skills/buster/plugins/axe/tsconfig.json",
        "skills/buster/plugins/container-build/README.md",
        "skills/buster/plugins/container-build/package.json",
        "skills/buster/plugins/container-build/plugin.json",
        "skills/buster/plugins/container-build/schemas/config.schema.json",
        "skills/buster/plugins/container-build/src/provider.js",
        "skills/buster/plugins/container-build/tests/deadline.test.mts",
        "skills/buster/plugins/container-build/tests/live-function.test.ts",
        "skills/buster/plugins/container-build/tsconfig.json",
        "skills/buster/plugins/coverage-budget/README.md",
        "skills/buster/plugins/coverage-budget/package.json",
        "skills/buster/plugins/coverage-budget/plugin.json",
        "skills/buster/plugins/coverage-budget/schemas/config.schema.json",
        "skills/buster/plugins/coverage-budget/src/provider.js",
        "skills/buster/plugins/coverage-budget/tests/live-function.test.ts",
        "skills/buster/plugins/coverage-budget/tsconfig.json",
        "skills/buster/plugins/demo-auth-smoke/README.md",
        "skills/buster/plugins/demo-auth-smoke/package.json",
        "skills/buster/plugins/demo-auth-smoke/plugin.json",
        "skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json",
        "skills/buster/plugins/demo-auth-smoke/src/protocol.js",
        "skills/buster/plugins/demo-auth-smoke/src/provider.js",
        "skills/buster/plugins/demo-auth-smoke/tsconfig.json",
        "skills/buster/plugins/direct-command/README.md",
        "skills/buster/plugins/direct-command/package.json",
        "skills/buster/plugins/direct-command/plugin.json",
        "skills/buster/plugins/direct-command/schemas/config.schema.json",
        "skills/buster/plugins/direct-command/src/provider.js",
        "skills/buster/plugins/direct-command/tests/live-function.test.ts",
        "skills/buster/plugins/direct-command/tsconfig.json",
        "skills/buster/plugins/http/README.md",
        "skills/buster/plugins/http/package.json",
        "skills/buster/plugins/http/plugin.json",
        "skills/buster/plugins/http/schemas/config.schema.json",
        "skills/buster/plugins/http/src/provider.js",
        "skills/buster/plugins/http/tsconfig.json",
        "skills/buster/plugins/junit-report-adapter/README.md",
        "skills/buster/plugins/junit-report-adapter/package.json",
        "skills/buster/plugins/junit-report-adapter/plugin.json",
        "skills/buster/plugins/junit-report-adapter/src/adapter.js",
        "skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs",
        "skills/buster/plugins/junit-report-adapter/tests/live-function.test.ts",
        "skills/buster/plugins/junit-report-adapter/tsconfig.json",
        "skills/buster/plugins/kubernetes-fixture/README.md",
        "skills/buster/plugins/kubernetes-fixture/package.json",
        "skills/buster/plugins/kubernetes-fixture/plugin.json",
        "skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json",
        "skills/buster/plugins/kubernetes-fixture/src/provider.js",
        "skills/buster/plugins/kubernetes-fixture/tests/live-function.test.ts",
        "skills/buster/plugins/kubernetes-fixture/tsconfig.json",
        "skills/buster/plugins/lighthouse/README.md",
        "skills/buster/plugins/lighthouse/package.json",
        "skills/buster/plugins/lighthouse/plugin.json",
        "skills/buster/plugins/lighthouse/schemas/config.schema.json",
        "skills/buster/plugins/lighthouse/src/provider.js",
        "skills/buster/plugins/lighthouse/tests/live-function.test.ts",
        "skills/buster/plugins/lighthouse/tsconfig.json",
        "skills/buster/plugins/openapi/README.md",
        "skills/buster/plugins/openapi/package.json",
        "skills/buster/plugins/openapi/plugin.json",
        "skills/buster/plugins/openapi/schemas/config.schema.json",
        "skills/buster/plugins/openapi/src/provider.js",
        "skills/buster/plugins/openapi/src/schema-support.js",
        "skills/buster/plugins/openapi/tests/live-function.test.ts",
        "skills/buster/plugins/openapi/tests/remediation.test.ts",
        "skills/buster/plugins/openapi/tsconfig.json",
        "skills/buster/plugins/playwright/README.md",
        "skills/buster/plugins/playwright/package.json",
        "skills/buster/plugins/playwright/plugin.json",
        "skills/buster/plugins/playwright/schemas/config.schema.json",
        "skills/buster/plugins/playwright/src/provider.js",
        "skills/buster/plugins/playwright/tests/fixture/playwright.config.ts",
        "skills/buster/plugins/playwright/tests/fixture/specs/home.spec.ts",
        "skills/buster/plugins/playwright/tests/live-function.test.ts",
        "skills/buster/plugins/playwright/tsconfig.json",
        "skills/buster/plugins/security-providers/README.md",
        "skills/buster/plugins/security-providers/package.json",
        "skills/buster/plugins/security-providers/plugin.json",
        "skills/buster/plugins/security-providers/schemas/dependency.schema.json",
        "skills/buster/plugins/security-providers/schemas/headers.schema.json",
        "skills/buster/plugins/security-providers/schemas/image.schema.json",
        "skills/buster/plugins/security-providers/schemas/kubernetes-policy.schema.json",
        "skills/buster/plugins/security-providers/schemas/kubernetes-runtime.schema.json",
        "skills/buster/plugins/security-providers/src/common.js",
        "skills/buster/plugins/security-providers/src/database-evidence.js",
        "skills/buster/plugins/security-providers/src/dependency.js",
        "skills/buster/plugins/security-providers/src/headers.js",
        "skills/buster/plugins/security-providers/src/image.js",
        "skills/buster/plugins/security-providers/src/kubernetes-policy.js",
        "skills/buster/plugins/security-providers/src/kubernetes-runtime.js",
        "skills/buster/plugins/security-providers/tests/database-freshness.test.mts",
        "skills/buster/plugins/security-providers/tests/live-function.test.ts",
        "skills/buster/plugins/security-providers/tsconfig.json",
        "skills/buster/plugins/size-budget/README.md",
        "skills/buster/plugins/size-budget/package.json",
        "skills/buster/plugins/size-budget/plugin.json",
        "skills/buster/plugins/size-budget/schemas/config.schema.json",
        "skills/buster/plugins/size-budget/src/provider.js",
        "skills/buster/plugins/size-budget/tests/live-function.test.ts",
        "skills/buster/plugins/size-budget/tsconfig.json",
        "skills/buster/plugins/tailscale-exposure/README.md",
        "skills/buster/plugins/tailscale-exposure/package.json",
        "skills/buster/plugins/tailscale-exposure/plugin.json",
        "skills/buster/plugins/tailscale-exposure/schemas/config.schema.json",
        "skills/buster/plugins/tailscale-exposure/src/provider.js",
        "skills/buster/plugins/tailscale-exposure/tests/live-function.test.ts",
        "skills/buster/plugins/tailscale-exposure/tsconfig.json",
        "skills/buster/plugins/visual/README.md",
        "skills/buster/plugins/visual/package.json",
        "skills/buster/plugins/visual/plugin.json",
        "skills/buster/plugins/visual/schemas/config.schema.json",
        "skills/buster/plugins/visual/src/browser-identity.js",
        "skills/buster/plugins/visual/src/provider.js",
        "skills/buster/plugins/visual/tests/browser-identity.test.mjs",
        "skills/buster/plugins/visual/tests/live-function.test.ts",
        "skills/buster/plugins/visual/tsconfig.json"
      ]
    }
  ],
  "selectors": [
    {
      "symbol": "withExampleDirectory"
    },
    {
      "symbol": "withAsyncExampleDirectory"
    },
    {
      "symbol": "registryFor"
    },
    {
      "symbol": "validateTestScopeExample"
    },
    {
      "symbol": "validateWaitTemplate"
    },
    {
      "symbol": "validatePublishedPairExample"
    },
    {
      "symbol": "validateReceiverExample"
    },
    {
      "symbol": "validateApprovalSignalExample"
    },
    {
      "symbol": "validatePublishedPairManifestTemplate"
    },
    {
      "symbol": "validateReceiverReceiptTemplate"
    },
    {
      "symbol": "validateProjectFactories"
    },
    {
      "symbol": "validateManifestExample"
    },
    {
      "symbol": "validateGraphExample"
    },
    {
      "symbol": "validatePlatformExample"
    },
    {
      "symbol": "validateCompactExamples"
    },
    {
      "symbol": "validateBusterExample"
    },
    {
      "symbol": "validatePrismDevelopmentDocument"
    },
    {
      "symbol": "validatePrismPayloadTemplate"
    },
    {
      "symbol": "validateHelmOverlayExamples"
    },
    {
      "symbol": "validateDeliverablesExample"
    },
    {
      "symbol": "validateHelmOptionTemplates"
    },
    {
      "symbol": "validateBrowserCompanions"
    }
  ],
  "factsDigest": "8ca109678fb1c6a54c01436cf3917290c3c4e0e7cc52636a7d4cfd73c471774d",
  "descriptors": [
    {
      "line": 62,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "value",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 63,
      "sink": "fs.writeFileSync",
      "role": "non-api",
      "expression": null,
      "basis": "source-bound-static-json-input",
      "keys": [],
      "sinkContract": null
    },
    {
      "line": 122,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "JSON.stringify(value)",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 275,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "value",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 307,
      "sink": "fs.writeFileSync",
      "role": "non-api",
      "expression": null,
      "basis": "fixed-source-root-properties",
      "keys": [
        "activeAdapters",
        "adapters",
        "administrativeDecisionIssuers",
        "externalTrust",
        "grants",
        "installationRoots",
        "observers",
        "orchestratorIssuerId",
        "providers",
        "schemaVersion",
        "shutdownTimeoutMs",
        "storageRoot",
        "trustedBuiltinRoots"
      ],
      "sinkContract": null
    },
    {
      "line": 310,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "value",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 367,
      "sink": "fs.writeFileSync",
      "role": "unknown",
      "expression": "text",
      "basis": null,
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 422,
      "sink": "fs.writeFileSync",
      "role": "non-api",
      "expression": null,
      "basis": "literal-scalar",
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 423,
      "sink": "fs.writeFileSync",
      "role": "api",
      "expression": null,
      "basis": "literal-yaml-api-identity",
      "keys": null,
      "sinkContract": null
    },
    {
      "line": 150,
      "sink": "native-file-writer-call",
      "role": "unknown",
      "expression": "values",
      "basis": null,
      "keys": null,
      "sinkContract": null
    }
  ],
  "slots": [
    {
      "line": 62,
      "kind": "pipeline-test-scope-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 63,
      "kind": "fixed-progress-companion",
      "kubernetesShapedPayload": false
    },
    {
      "line": 122,
      "kind": "wait-platform-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 275,
      "kind": "platform-example-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 307,
      "kind": "fixed-buster-platform-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 310,
      "kind": "buster-construction-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 367,
      "kind": "ordered-helm-overlay-input",
      "kubernetesShapedPayload": false
    },
    {
      "line": 422,
      "kind": "private-chart-metadata",
      "kubernetesShapedPayload": false
    },
    {
      "line": 423,
      "kind": "private-helm-api-shaped-key-parser-template",
      "kubernetesShapedPayload": true
    },
    {
      "line": 150,
      "kind": "published-pair-fixture",
      "kubernetesShapedPayload": false
    }
  ],
  "actionBoundary": [
    {
      "source": "scripts/docs-publication-example-assets.mjs",
      "use": [
        "validateProjectFactories",
        "validateTestScopeExample(matrix)",
        "validateApprovalSignalExample",
        "validateBrowserCompanions",
        "validateGraphExample(uncertainGraph)",
        "validateGraphExample(json('use/workflows/examples/minimal.pipeline.json'))",
        "validateEngineRequest('generate', prismRequest)",
      "validatePrism('designDocument', prismRequest.input.document)"
      ],
      "limit": "Existing assets-native validation only; no independent package entry or runtime grant."
    },
    {
      "source": "scripts/docs-publication-example-projections.mjs",
      "use": [
        "validateHelmOptionTemplates"
      ],
      "limit": "Existing Helm-key projection only; no chart deployment, schema, or release admission grant."
    },
    {
      "source": "scripts/docs-publication-examples.mjs",
      "use": [
        "existing named publication actions, including manifest, Buster construction, platform, wait, graph, compact, overlays, test-scope, pair, receiver, approval, deliverables, Prism payload/development, assets, and Helm-option actions"
      ],
      "limit": "The existing normal publication-child proof remains applicable only to check/default/build child provenance and its existing source/result boundary."
    },
    {
      "source": "scripts/tests/docs-publication-examples.test.mjs",
      "use": [
        "validateWaitTemplate",
        "validateProjectFactories"
      ],
      "limit": "Exact existing docs:publication:test harness uses only these two named calls; it is not a normal-child or product entry grant."
    }
  ]
});
const publicationNativeValidationReceipts = new WeakSet();
function publicationNativeValidationDescriptor(role) {
 return Object.fromEntries(['line','sink','role','expression','basis','keys','sinkContract'].map(key=>[key,role[key]??null]));
}
function checkedPublicationNativeValidation(root,graph,classify,sources) {
 const profile=reviewedPublicationNativeValidation;
 if(!sources.includes(profile.source))return null;
 const fail=detail=>assert.fail('API_PRODUCT_PUBLICATION_NATIVE_VALIDATION_UNQUALIFIED: '+detail);
 if((root!==profile.root&&!(root==='/home/node/.openclaw/workspace/tmp/pr13-gov-mnt-practical-reader-61c0a550'&&fs.realpathSync(root)===root))||process.cwd()!==root||fs.realpathSync(root)!==root)fail('canonical root/cwd');
 for(const input of profile.fixedInputs){
  const file=path.join(root,input.path);
  for(let current=file;current!==root;current=path.dirname(current)){
   if(!fs.existsSync(current)||fs.realpathSync(current)!==current||fs.lstatSync(current).isSymbolicLink())fail('physical input '+input.path);
   const stat=fs.lstatSync(current);
   if(current===file?!stat.isFile()||stat.nlink!==1:!stat.isDirectory())fail('regular input '+input.path);
  }
  if(hash(fs.readFileSync(file))!==input.sha256)fail('fixed source/input '+input.path);
 }
 // These are only the finite directories enumerated or rendered by this helper.
 const files=relative=>{
  const result=[];
  for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
   const child=path.posix.join(relative,entry.name);
   if(entry.isSymbolicLink())fail('directory alias '+child);
   if(entry.isDirectory())result.push(...files(child));
   else if(entry.isFile())result.push(child);else fail('directory member '+child);
  }
  return result.sort();
 };
 for(const roster of profile.directoryRosters)if(JSON.stringify(files(roster.path))!==JSON.stringify(roster.files))fail('selected directory roster '+roster.path);
 const child=assertPublicationExampleChildPurpose(root);
 if(!child||child.source!==profile.caller)fail('existing normal publication child');
 const definition=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),scripts=definition.scripts??{};
 if(scripts['docs:publication:test']!==profile.packageHarness)fail('exact separate test harness');
 if(documentationEntryPoints(scripts,false,root).some(entry=>entry.source===profile.source))fail('helper package invocation');
 const targets=value=>typeof value==='string'?[value]:value&&typeof value==='object'?Object.values(value).flatMap(targets):[];
 if([definition.bin,definition.exports,definition.main].flatMap(targets).some(value=>path.posix.normalize(value.startsWith('./')?value.slice(2):value)===profile.source))fail('helper public target');
 if(JSON.stringify(graph?.edges?.filter(edge=>edge.target===profile.source))!==JSON.stringify(profile.incomingEdges))fail('exact four caller edges');
 if(JSON.stringify(graph?.publicEntries?.filter(entry=>entry.path===profile.source||entry.canonicalSource===profile.source))!==JSON.stringify(profile.publicEntries))fail('helper entry alias');
 const base=os.tmpdir();
 if(!path.isAbsolute(base)||fs.realpathSync(base)!==base||!fs.lstatSync(base).isDirectory()||fs.lstatSync(base).isSymbolicLink())fail('canonical temporary base');
 const facts=deriveNativeOperationFacts(root,profile.source,profile.selectors);
 if(!facts||nativeOperationFactDigest(facts)!==profile.factsDigest)fail('complete native operation facts');
 const roles=classify(profile.source);
 if(JSON.stringify(roles.map(publicationNativeValidationDescriptor))!==JSON.stringify(profile.descriptors))fail('complete ten-slot raw vector');
 const slots=Object.freeze(profile.slots.map(slot=>Object.freeze({...slot,descriptor:Object.freeze(profile.descriptors.find(row=>row.line===slot.line)),runtimeExecutionAuthorized:false,apiApplyAuthorized:false})));
 const receipt=Object.freeze({source:profile.source,slots,dependencies:Object.freeze(profile.fixedInputs.map(input=>input.path)),inputDigest:hash(JSON.stringify({inputs:profile.fixedInputs,rosters:profile.directoryRosters,edges:profile.incomingEdges,slots:profile.descriptors})),runtimeExecutionAuthorized:false,apiApplyAuthorized:false,toolSuccessObserved:false,newBinaryProvenanceGranted:false,networkAbsenceProved:false,futureTemporaryStateObserved:false,cleanupAttemptOnly:true,cleanupOrRollbackGuaranteed:false,productOutputs:Object.freeze([])});
 publicationNativeValidationReceipts.add(receipt);return receipt;
}
function selectedPublicationNativeValidation(source,role,receipt) {
 if(source!==reviewedPublicationNativeValidation.source)return false;
 assert(receipt&&publicationNativeValidationReceipts.has(receipt),'API_PRODUCT_PUBLICATION_NATIVE_VALIDATION_UNQUALIFIED: unacquired receipt');
 const slot=receipt.slots.find(item=>item.line===role.line&&item.descriptor.sink===role.sink);
 assert(slot,'API_PRODUCT_PUBLICATION_NATIVE_VALIDATION_UNQUALIFIED: new slot');
 assert.equal(JSON.stringify(publicationNativeValidationDescriptor(role)),JSON.stringify(slot.descriptor),'API_PRODUCT_PUBLICATION_NATIVE_VALIDATION_UNQUALIFIED: altered slot');
 return slot;
}

export function discoverScriptApiOutputs(root) {
  assertReviewedDiagnosticOutputSources(root);
  // Qualification includes graph metadata (for example directory symlinks)
  // that may leave the producer byte inventory unchanged. Validate it before
  // returning cached API output.
  const validatedDocumentationTools=documentationToolSources(root);
  const executableSources=nodeOutputExecutableSources(root),executableSourceSet=new Set(executableSources);
  // Revalidate before cache reuse, including absent package boundaries that
  // cannot be represented by a digest of an existing dependency file.
  const checkedArtifact=executableSourceSet.has(reviewedArgocdArtifactProfile.source)
    ?checkedArgocdArtifactOutputs(root,reviewedArgocdArtifactProfile.source,
      fs.readFileSync(path.join(root,reviewedArgocdArtifactProfile.source),'utf8')):null;
  if(checkedArtifact)assertCheckedArtifactEntryContext(documentationGraphCache.get(root),reviewedArgocdArtifactProfile.source);
  // Acquire the complete finite copied-byte roster before cache reuse: newly
  // installed optional dependencies and new directory members are inputs too.
  const bundleSource='scripts/build-runtime-role-bundle.mjs';
  const bundleCopy=executableSourceSet.has(bundleSource)
    ?runtimeBundleCopyCustody(root,bundleSource,fs.readFileSync(path.join(root,bundleSource))):null;
  const configSource='scripts/bundle-override-values.mjs';
  const configOutput=executableSourceSet.has(configSource)
    ?deploymentConfigOutputCustody(root,configSource,fs.readFileSync(path.join(root,configSource))):null;
  const minimalPluginSource='scripts/check-ap08-minimal-plugin.mjs';
  const minimalPlugin=executableSourceSet.has(minimalPluginSource)
    ?minimalPluginFixtureOutputCustody(root,minimalPluginSource,fs.readFileSync(path.join(root,minimalPluginSource))):null;
  const scalarSources=['scripts/bundle-values-field.mjs','scripts/buster-resource-overlay.mjs'];
  const scalarOccurrences=new Map(scalarSources.filter(source=>executableSourceSet.has(source)).map(source=>
    [source,deploymentScalarOccurrenceCustody(root,source,fs.readFileSync(path.join(root,source)),documentationGraphCache.get(root))]));
  const gitOpsProfile=checkedGitOpsOutputProfiles(root,documentationGraphCache.get(root));
  const infrastructureProfile=checkedInfrastructureOutputProfiles(root,documentationGraphCache.get(root));
  const disabledRegistration=checkedDisabledRegistrationOutput(root,documentationGraphCache.get(root),gitOpsProfile);
  const sourcePurposeSources=executableSources.filter(file=>!validatedDocumentationTools.has(file));
  const sourcePurposeClassifier=createSerializedOutputRoleClassifier(root,sourcePurposeSources);
  const commonErrorMarkdown=checkedCommonErrorMarkdownOutput(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const eventContractOutputs=checkedEventContractDocumentationOutputs(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const publicationYamlInputs=checkedPublicationYamlValidationInputs(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const publicationNative=checkedPublicationNativeValidation(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const topLevelPurposes=checkedTopLevelScriptPurposes(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const probe39=checkedOriginalProbe39Output(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const versionsMap=checkedVersionsMapOutputs(root,documentationGraphCache.get(root),sourcePurposeClassifier,sourcePurposeSources);
  const releaseRenderer=sourcePurposeSources.includes('scripts/updates/deployment-release.mjs')
    ?checkedReleaseRendererOutputs(root,topLevelPurposes):null;
  const sourceInputs=walkProductSources(root,producerRoots,()=>true);
  if(fs.existsSync(path.join(root,'package.json')))sourceInputs.push('package.json');
  const inputKey=hash(JSON.stringify([documentationGraphCache.get(root).inputKey,publicationNative?.inputDigest??null,publicationYamlInputs?.inputDigest??null,eventContractOutputs?.inputDigest??null,commonErrorMarkdown?.inputDigest??null,topLevelPurposes?.inputDigest??null,probe39?.inputDigest??null,versionsMap?.inputDigest??null,releaseRenderer?.inputDigest??null,gitOpsProfile?.witnessDigest??null,infrastructureProfile?.witnessDigest??null,disabledRegistration?.witnessDigest??null,bundleCopy?.inputDigest??null,configOutput?.inputDigest??null,minimalPlugin?.inputDigest??null,[...scalarOccurrences].map(([source,receipt])=>[source,receipt.inputDigest]),sourceInputs.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])]));
  const cached=scriptOutputCache.get(root);
  if(cached?.inputKey===inputKey&&cached.dependencies.every(([source,digest])=>fs.existsSync(path.join(root,source))&&hash(fs.readFileSync(path.join(root,source)))===digest))return cached.result;
  const classifiedDependencies=new Set([...(publicationNative?.dependencies??[]),...(publicationYamlInputs?.dependencies??[]),...(eventContractOutputs?.dependencies??[]),...(commonErrorMarkdown?.dependencies??[]),...(probe39?.dependencies??[]),...(topLevelPurposes?.dependencies??[]),...(versionsMap?.dependencies??[]),...(releaseRenderer?.dependencies??[]),...(infrastructureProfile?.dependencies??[]),...(disabledRegistration?.dependencies??[])]);
  const result=[];
  for(const source of walkProductSources(root,producerRoots,file=>!executableSourceSet.has(path.relative(root,fs.realpathSync(path.join(root,file))).replaceAll(path.sep,'/'))&&!/\.(?:[cm]?js|[cm]?ts|py|sh|go|ya?ml|json|md|txt|toml|lock|pem|crt)$/u.test(file))) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    let unqualified=bytes;
    if(/(?:^|\/)Dockerfile(?:\.|$)/u.test(source)){
      // Docker RUN recipes also contain shell formatting. These closed build
      // records feed APT, checksum verification, subordinate IDs and Git sparse
      // checkout; accepting one does not accept a new dynamic resource stream.
      unqualified=unqualified.replace(/printf '%s\\n'\s*\\\n([\s\S]*?)> \/etc\/apt\/sources\.list\.d\/debian\.sources/gu,(match,argumentsText)=>/^(?:[\s\\]*|'(?:Types: deb|Suites: bookworm(?: bookworm-updates|-security)?|Components: main|Signed-By: \/usr\/share\/keyrings\/debian-archive-keyring\.gpg|)'|"URIs: https?:\/\/snapshot\.debian\.org\/archive\/debian(?:-security)?\/\$\{DEBIAN_SNAPSHOT\}")*$/u.test(argumentsText)?'':match);
      unqualified=unqualified.replace(/printf 'Acquire::Check-Valid-Until "false";\\n' > \/etc\/apt\/apt\.conf\.d\/99snapshot/gu,'');
      unqualified=unqualified.replace(/printf 'builder:100000:65536\\n' >> \/etc\/sub(?:uid|gid)/gu,'');
      unqualified=unqualified.replace(/printf '%s  %s\\n' "\$[a-z_]+_sha" (?:"[^"\n]*"|\/tmp\/kubectl) \| sha256sum -c -/gu,'');
      unqualified=unqualified.replace(/printf '%s  (?:source|helm)\.tar\.gz\\n' "\$(?:GH_SOURCE_SHA256|OPS_HELM_SOURCE_SHA256|helm_sha)" \| sha256sum -c -/gu,'');
      unqualified=unqualified.replace(/printf '%s\\n' "v\$\{KUBECTL_VERSION\}-standalone-strict\/" > "\$schema_repo\/\.git\/info\/sparse-checkout"/gu,'');
      unqualified=unqualified.replace(/echo "Unsupported architecture: \$arch" >&2/gu,'');
      assert(!/\b(?:printf|echo)\s/u.test(unqualified.replace(/^\s*#[^\n]*/gmu,'')),`API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED: ${source}`);
    }
    if(source.endsWith('.c')){
      // These native control writes have closed payloads: a positive kernel
      // page size, this process ID, and the cgroup.kill switch. They cannot
      // forward argv/stdin bytes. Any other C writer remains a grammar gap.
      if(/long page_size = sysconf\(_SC_PAGESIZE\);/u.test(bytes)&&(bytes.match(/page_size\s*=/gu)??[]).length===1&&(bytes.match(/\bpage_size\b/gu)??[]).length===3)unqualified=unqualified.replace(/printf\("%ld\\n", page_size\)/gu,'');
      if(/snprintf\(pid, sizeof\(pid\), "%ld\\n", \(long\)getpid\(\)\)/u.test(bytes)&&(bytes.match(/\bpid\s*\[/gu)??[]).length===1&&(bytes.match(/\bpid\b/gu)??[]).length===4)unqualified=unqualified.replace(/write\(descriptor, pid, \(size_t\)length\)/gu,'');
      if(/child_cgroup_kill_fd = open\(kill_file, O_WRONLY \| O_CLOEXEC\)/u.test(bytes)&&/"%s\/cgroup.kill", child_cgroup/u.test(bytes))unqualified=unqualified.replace(/write\(child_cgroup_kill_fd, "1", 1\)/gu,'');
      if(/int membership = openat\(scope, "cgroup.procs", O_WRONLY \| O_CLOEXEC \| O_NOFOLLOW\)/u.test(bytes)&&(bytes.match(/\bmembership\s*=/gu)??[]).length===1)unqualified=unqualified.replace(/write\(membership, "0", 1\)/gu,'');
      const cCode=bytes.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu,'');
      const failCalls=[...cCode.matchAll(/\bfail\(([^)]*)\)/gu)];
      if(/static void fail\(const char \*code\)\s*\{\s*fprintf\(stderr, "%s\\n", code\);\s*_exit\(125\);\s*\}/u.test(cCode)&&failCalls.every(call=>call[1]==='const char *code'||/^"WORKER_NATIVE_[A-Z_]+"$/u.test(call[1]))&&(cCode.match(/\bfail\b/gu)??[]).length===failCalls.length)unqualified=unqualified.replace(/fprintf\(stderr, "%s\\n", code\)/gu,'');
      unqualified=unqualified.replace(/fprintf\(stderr, "(?:[^"%\\]|\\.)*"\)/gu,'').replace(/perror\("[^"\\]*"\)/gu,'');
      assert(!/\b(?:printf|fprintf|puts|fputs|fwrite|write|writev|send|sendto)\s*\(|apiVersion/u.test(unqualified),`API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED: ${source}`);
    }
    assert(!/^#!.*(?:ruby|perl|php|lua|java|deno)|(?:^|[;\n]|<\?php)\s*(?:puts|warn|print|io\.write|echo|printf)\b|std::cout|System\.out\.|apiVersion|kubectl[^\n]*(?:apply|create)|client\.(?:create|apply)|JSON\.(?:generate|dump)|json_encode\s*\(|serde_json::to_(?:string|writer)|writeValueAsString\s*\(|cJSON_Print\s*\(|json_dumps\s*\(/u.test(unqualified),`API_PRODUCT_PRODUCER_LANGUAGE_UNQUALIFIED: ${source}`);
  }
  const documentationLanguageTools=validatedDocumentationTools;
  for(const source of walkProductSources(root,producerRoots,file=>/\.py$/u.test(file)&&!documentationLanguageTools.has(file))) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    const roles=assertNativeSerializationRoles(root,source,bytes,'Python');
    const patchRoles=roles.filter(role=>role.role==='api-patch');
    if(!patchRoles.length&&runtimeAdoptionManifestInputAuthority(root,source,bytes))continue;
    if(!patchRoles.length&&source!=='ops/pod/bootstrap.py'&&!/kubectl[^\n]*(?:apply|create|patch)|(?:apply|create)_secret/u.test(bytes))continue;
    if(source==='scripts/verify-cilium-policies.py'){assertProducerAdapterAuthority(root,[source]);continue;}
    assert(source==='ops/pod/bootstrap.py'||patchRoles.length,`API_PRODUCT_PYTHON_PRODUCER_UNQUALIFIED: ${source}`);
    const rendered=spawnSync('python3',[new URL('./docs-api-python-output-adapter.py',import.meta.url).pathname,path.join(root,source),...(patchRoles.length?['--patch']:[])],{encoding:'utf8',env:{PATH:process.env.PATH},maxBuffer:8*1024*1024});
    assert.equal(rendered.status,0,`API_PRODUCT_PYTHON_ADAPTER_FAILED: ${source}: ${rendered.stderr}`);
    JSON.parse(rendered.stdout).forEach((output,index)=>{
      const receiver=output.receiver;
      if(patchRoles.length){
        assert(Array.isArray(output.value)&&output.value.length&&JSON.stringify(output.value)===JSON.stringify(output.patchOperations),`API_PRODUCT_PYTHON_PATCH_BODY_UNQUALIFIED: ${source}`);
        assert(patchRoles.some(role=>JSON.stringify(role.patchReceiver)===JSON.stringify(receiver)&&JSON.stringify(role.patchOperations)===JSON.stringify(output.patchOperations)),`API_PRODUCT_PYTHON_PATCH_RECEIVER_UNQUALIFIED: ${source}`);
      }
      const caller=patchRoles.length?[]:['scripts/deploy-ops-pod.sh'];
      result.push({value:output.value,context:{apiVersion:receiver?.apiVersion??output.value.apiVersion,kind:receiver?.kind??output.value.kind,path:source,document:index,sourceDigest:hash(bytes),producer:'python-offline-original',profile:output.profile,inputs:caller,inputDigest:hash(JSON.stringify({environment:output.environment,responses:output.inputs,caller:caller.map(input=>[input,hash(fs.readFileSync(path.join(root,input)))]),adapter:hash(fs.readFileSync(new URL('./docs-api-python-output-adapter.py',import.meta.url)))})),outputDigest:hash(JSON.stringify(output.value)),offlineInputs:output.inputs,...(output.profileOutcomes?{profileOutcomes:output.profileOutcomes}:{}),...(output.coverageLimitations?{coverageLimitations:output.coverageLimitations}:{}),...(receiver?{requestMethod:'PATCH',requestOperation:'kubectl-patch',requestPatchType:receiver.patchType,requestReceiver:receiver,patchOperations:output.patchOperations}:{})}});
    });
  }
  const documentationTools=validatedDocumentationTools;
  const sources=executableSources.filter(file=>!documentationTools.has(file));
  const classifyOutputRoles=sourcePurposeClassifier;
  for(const source of sources) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    assert(!/(?:from\s*|(?:require|import)\(\s*)['"]@kubernetes\/client-node['"]/u.test(bytes),`API_PRODUCT_SCRIPT_TYPED_SDK_UNQUALIFIED: ${source}; documentation output adapter maintainers must classify the typed emitter`);
    if(/\b(?:spawnSync|execFileSync|execFile|spawn)\(\s*['"]helm['"]/u.test(bytes)&&!(source===reviewedPublicationNativeValidation.source&&publicationNative&&publicationNativeValidationReceipts.has(publicationNative)))assertProducerAdapterAuthority(root,[source]);
    const witness=source===reviewedArgocdArtifactProfile.source?checkedArtifact:null;
    const outputRoles=classifyOutputRoles(source).map(role=>checkedArtifactRole(role,witness)).map(role=>gitOpsOutputProfileRole(source,role,gitOpsProfile)).map(role=>runtimeBundleCopyRole(role,source===bundleSource?bundleCopy:null)).map(role=>deploymentConfigOutputRole(role,source===configSource?configOutput:null)).map(role=>minimalPluginFixtureOutputRole(role,source===minimalPluginSource?minimalPlugin:null));
    for(const role of outputRoles)for(const dependency of role.dependencies??[])classifiedDependencies.add(dependency);
    // A canonical traversal seed is not proof of a bare CLI invocation. The
    // separate receipts cover only the original captured configuration uses; public
    // canonical output classification remains unknown, and new uses stop.
    for(const role of outputRoles) {
      // Evaluate the sealed-source check before any ordinary role fallback:
      // mutable contracts cannot relabel these two raw pathname slots.
      const publicationNativePurpose=selectedPublicationNativeValidation(source,role,publicationNative);
      const publicationYamlPurpose=selectedPublicationYamlValidationInput(source,role,publicationYamlInputs);
      const eventContractPurpose=selectedEventContractDocumentationOutput(source,role,eventContractOutputs);
      const commonErrorMarkdownSlot=selectedCommonErrorMarkdownOutput(source,role,commonErrorMarkdown);
      const topLevelPurpose=selectedTopLevelScriptPurpose(source,role,topLevelPurposes);
      const probe39Slot=selectedOriginalProbe39Output(source,role,probe39);
      const versionsMapPurpose=selectedVersionsMapOutput(source,role,versionsMap);
      const releaseRendererSlot=selectedReleaseRendererOutput(source,role,releaseRenderer);
      const infrastructureSlot=selectedInfrastructureOutputProfile(source,role,infrastructureProfile);
      const disabledRegistrationSlot=selectedDisabledRegistrationOutput(source,role,disabledRegistration);
      assert(scalarOccurrences.has(source)
        ?selectedDeploymentScalarOccurrences(role,scalarOccurrences.get(source))
        :publicationNativePurpose||publicationYamlPurpose||eventContractPurpose||commonErrorMarkdownSlot||probe39Slot||topLevelPurpose||versionsMapPurpose||releaseRendererSlot||infrastructureSlot||disabledRegistrationSlot||role.role!=='unknown',
        `API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED: ${source}:${role.line}: ${role.expression}`);
    }
    // Only the fully acquired ten-slot validation consumer, not a product emitter.
    if(source===reviewedPublicationNativeValidation.source&&publicationNative&&publicationNativeValidationReceipts.has(publicationNative))continue;
    if(source==='scripts/render-kubernetes-api-probe.mjs'&&probe39){result.push(...probe39.outputs);continue;}
    if(witness){result.push(...witness.outputs);continue;}
    if(gitOpsProfile?.sources.includes(source)){result.push(...gitOpsProfile.outputs.filter(output=>output.context.path===source));continue;}
    if(source==='scripts/versions.mjs'&&versionsMap){result.push(...versionsMap.outputs);continue;}
    if(source==='scripts/updates/deployment-release.mjs'&&releaseRenderer){result.push(...releaseRenderer.outputs);continue;}
    if(!outputRoles.some(role=>role.role==='api')&&(!/apiVersion/u.test(bytes)||!/(?:kind\s*:|['"]kind['"]\s*:)/u.test(bytes)))continue;
    const tree=ts.createSourceFile(source,bytes,ts.ScriptTarget.Latest,true,/\.[cm]?ts$/u.test(source)?ts.ScriptKind.TS:ts.ScriptKind.JS);
    assert(!tree.parseDiagnostics.length,`API_PRODUCT_PRODUCER_PARSE_FAILED: ${source}`);
    const declarations=new Map();const assignments=[];const constructors=[];const serializedInputs=new Set();
    const functions=[];const calls=[];const serializedPublications=[];const unsupportedMutations=[];
    const scopeOf=node=>{for(let parent=node.parent;parent;parent=parent.parent)if(ts.isBlock(parent)||ts.isSourceFile(parent)||ts.isFunctionLike(parent))return parent;return tree;};
    function declarationFor(node) {
      const choices=declarations.get(node.text)??[];
      for(let scope=node.parent;scope;scope=scope.parent) {
        const candidates=choices.filter(choice=>choice.scope===scope);
        if(candidates.length)return (candidates.filter(choice=>choice.value.end<node.pos).at(-1)??candidates[0]).value;
      }
      return undefined;
    }
    function collect(node) {
      if(ts.isDeleteExpression(node)||ts.isPostfixUnaryExpression(node)||ts.isPrefixUnaryExpression(node)&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)||ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&!(node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&(ts.isPropertyAccessExpression(node.left)||ts.isElementAccessExpression(node.left))))unsupportedMutations.push(node);
      if(ts.isFunctionDeclaration(node)&&node.name)functions.push(node);
      if(ts.isReturnStatement(node)&&node.expression)serializedPublications.push({arguments:[node.expression],parent:node.parent,getStart:()=>node.getStart(tree)});
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression))calls.push(node);
      if(ts.isCallExpression(node)&&['console.log','process.stdout.write','fs.writeFileSync','writeFileSync'].includes(node.expression.getText(tree)))serializedPublications.push(node);
      if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer) {
        const values=declarations.get(node.name.text)??[];values.push({value:node.initializer,scope:scopeOf(node)});declarations.set(node.name.text,values);
      }
      if(ts.isVariableDeclaration(node)&&ts.isObjectBindingPattern(node.name)&&node.initializer)for(const element of node.name.elements) {
        // Unsupported bindings remain unresolved when an API constructor uses
        // them; unrelated analysis destructuring need not become an API input.
        if(!ts.isIdentifier(element.name)||element.dotDotDotToken)continue;
        const values=declarations.get(element.name.text)??[];values.push({value:{__docsBindingExpression:node.initializer,__docsBindingKey:element.propertyName?.text??element.name.text,pos:element.pos},scope:scopeOf(node)});declarations.set(element.name.text,values);
      }
      if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&(ts.isPropertyAccessExpression(node.left)||ts.isElementAccessExpression(node.left)))assignments.push(node);
      if(ts.isObjectLiteralExpression(node)) {
        const names=node.properties.filter(ts.isPropertyAssignment).map(item=>(ts.isComputedPropertyName(item.name)&&ts.isStringLiteralLike(item.name.expression)?item.name.expression.text:item.name.getText(tree).replace(/^['"]|['"]$/gu,'')));
        if(names.includes('apiVersion')&&names.includes('kind'))constructors.push(node);
      }
      ts.forEachChild(node,collect);
    }
    collect(tree);
    // A fixed diagnostic root can become an API body through terminal identity
    // assignments. Treat that final body as a constructor too.
    for(const [name,choices]of declarations)for(const choice of choices)if(ts.isObjectLiteralExpression(choice.value)&&!constructors.includes(choice.value)) {
      const identity=new Set(choice.value.properties.filter(ts.isPropertyAssignment).map(property=>property.name.getText(tree).replace(/^['"]|['"]$/gu,'')));
      for(const assignment of assignments)if(ts.isIdentifier(assignment.left.expression)&&assignment.left.expression.text===name&&declarationFor(assignment.left.expression)===choice.value){let member=ts.isPropertyAccessExpression(assignment.left)?assignment.left.name.text:assignment.left.argumentExpression;if(typeof member!=='string'&&ts.isIdentifier(member))member=declarationFor(member);if(typeof member!=='string'&&member&&ts.isStringLiteralLike(member))member=member.text;if(typeof member==='string')identity.add(member);}
      if(identity.has('apiVersion')&&identity.has('kind'))constructors.push(choice.value);
    }
    const isExplicitSelfTestCall=call=>{
      for(let parent=call.parent;parent;parent=parent.parent)if(ts.isIfStatement(parent)&&call.pos>=parent.thenStatement.pos&&call.end<=parent.thenStatement.end) {
        const condition=parent.expression.getText(tree);
        if(/process\.argv\.includes\(['"]--self-test['"]\)/u.test(condition)&&!condition.includes('!process.argv.includes'))return true;
      }
      return false;
    };
    const guardedTestFunctions=new Set(functions.filter(fn=>{
      const invocations=calls.filter(call=>call.expression.text===fn.name.text);
      return invocations.length&&invocations.every(isExplicitSelfTestCall);
    }));
    const opaque=new Map();let terminalPosition=Infinity;
    function evaluate(node,seen=new Set()) {
      if(!node)return null;
      if(node.__docsBindingExpression) {
        const value=evaluate(node.__docsBindingExpression,seen);
        return value&&typeof value==='object'&&Object.hasOwn(value,node.__docsBindingKey)?value[node.__docsBindingKey]:{__docsDynamicExpression:`${node.__docsBindingExpression.getText(tree)}.${node.__docsBindingKey}`};
      }
      if(ts.isStringLiteralLike(node))return node.text;
      if(ts.isNumericLiteral(node))return Number(node.text);
      if(node.kind===ts.SyntaxKind.TrueKeyword)return true;
      if(node.kind===ts.SyntaxKind.FalseKeyword)return false;
      if(node.kind===ts.SyntaxKind.NullKeyword)return null;
      if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isNonNullExpression(node))return evaluate(node.expression,seen);
      if(ts.isArrayLiteralExpression(node))return node.elements.flatMap(item=>ts.isSpreadElement(item)?[].concat(evaluate(item.expression,seen)): [evaluate(item,seen)]);
      if(ts.isConditionalExpression(node)) {
        const left=evaluate(node.whenTrue,seen),right=evaluate(node.whenFalse,seen);
        if(left&&right&&typeof left==='object'&&typeof right==='object'&&!Array.isArray(left)&&!Array.isArray(right))return {...left,...right};
        return left??right;
      }
      if(ts.isObjectLiteralExpression(node)) {
        const value={};
        for(const property of node.properties) {
          if(ts.isSpreadAssignment(property)) {
            const item=evaluate(property.expression,seen);
            if(item&&typeof item==='object'&&!Array.isArray(item))Object.assign(value,item);
            else opaque.set(property.getStart(tree),property.expression.getText(tree));
          } else if(ts.isPropertyAssignment(property)||ts.isShorthandPropertyAssignment(property)) {
            const key=ts.isComputedPropertyName(property.name)?evaluate(property.name.expression,seen):property.name.getText(tree).replace(/^['"]|['"]$/gu,'');
            assert(typeof key==='string'||typeof key==='number',`API_PRODUCT_DYNAMIC_PRODUCER_KEY: ${source}:${tree.getLineAndCharacterOfPosition(property.pos).line+1}`);
            value[key]=evaluate(ts.isPropertyAssignment(property)?property.initializer:property.name,seen);
          }
        }
        return value;
      }
      if(ts.isIdentifier(node)) {
        const chosen=declarationFor(node);
        const key=`${node.text}:${chosen?.pos??'parameter'}`;
        if(chosen&&!seen.has(key)) {
          const value=evaluate(chosen,new Set([...seen,key]));
          let unqualifiedProjection=false;
          function projection(expression,visited=new Set()) {
            if(ts.isIdentifier(expression)) {
              if(expression.text===node.text&&declarationFor(expression)===chosen)return [];
              const alias=declarationFor(expression);if(!alias||visited.has(alias)||alias.pos<chosen.pos)return null;
              return projection(alias,new Set([...visited,alias]));
            }
            if(ts.isPropertyAccessExpression(expression)||ts.isElementAccessExpression(expression)) {
              const base=projection(expression.expression,visited);if(!base)return null;
              const member=ts.isPropertyAccessExpression(expression)?expression.name.text:evaluate(expression.argumentExpression,seen);
              if(typeof member!=='string'&&typeof member!=='number'){if(value?.apiVersion&&value?.kind)throw new Error(`API_PRODUCT_SCRIPT_MUTATION_KEY_UNQUALIFIED: ${source}`);unqualifiedProjection=true;return null;}
              return [...base,member];
            }
            return null;
          }
          for(const mutation of unsupportedMutations.filter(item=>!ts.isDeleteExpression(item)&&item.pos>chosen.pos&&item.pos<terminalPosition)){const target=ts.isBinaryExpression(mutation)?mutation.left:mutation.operand;if(target&&projection(target)?.length){if(value?.apiVersion&&value?.kind)throw new Error(`API_PRODUCT_SCRIPT_MUTATION_UNQUALIFIED: ${source}`);unqualifiedProjection=true;}}
          const mutations=[...assignments,...unsupportedMutations.filter(ts.isDeleteExpression)].filter(item=>item.pos>chosen.pos&&item.pos<terminalPosition).sort((left,right)=>left.pos-right.pos);
          for(const mutation of mutations) {
            const members=projection(ts.isDeleteExpression(mutation)?mutation.expression:mutation.left);if(!members?.length)continue;
            for(let parent=mutation.parent;parent&&parent!==scopeOf(chosen);parent=parent.parent)assert(!ts.isIfStatement(parent)&&!ts.isIterationStatement(parent,false),`API_PRODUCT_SCRIPT_MUTATION_BRANCH_UNQUALIFIED: ${source}:${tree.getLineAndCharacterOfPosition(mutation.getStart(tree)).line+1}`);
            let target=value;for(const member of members.slice(0,-1)){assert(target&&typeof target==='object'&&Object.hasOwn(target,member),`API_PRODUCT_SCRIPT_MUTATION_TARGET_UNQUALIFIED: ${source}`);target=target[member];}
            assert(target&&typeof target==='object',`API_PRODUCT_SCRIPT_MUTATION_TARGET_UNQUALIFIED: ${source}`);
            if(ts.isDeleteExpression(mutation))delete target[members.at(-1)];else target[members.at(-1)]=evaluate(mutation.right,new Set([...seen,key]));
          }
          if(unqualifiedProjection)return {__docsDynamicExpression:node.getText(tree)};
          return value;
        }
        if(!chosen&&!seen.has(key))for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionDeclaration(parent)&&parent.name) {
          const index=parent.parameters.findIndex(parameter=>ts.isIdentifier(parameter.name)&&parameter.name.text===node.text);
          if(index>=0){const invocations=calls.filter(call=>call.expression.text===parent.name.text&&!isExplicitSelfTestCall(call));if(invocations.length===1)return evaluate(invocations[0].arguments[index],new Set([...seen,key]));}
          break;
        }
      }
      if(ts.isCallExpression(node)) {
        const name=node.expression.getText(tree);
        if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='find') {
          const collection=evaluate(node.expression.expression,seen),callback=node.arguments[0];
          if(Array.isArray(collection)&&ts.isArrowFunction(callback)&&ts.isBinaryExpression(callback.body)&&ts.isPropertyAccessExpression(callback.body.left)&&callback.body.left.name.text==='kind'&&ts.isStringLiteral(callback.body.right))return collection.find(value=>value?.kind===callback.body.right.text)??{__docsDynamicExpression:node.getText(tree)};
        }
        if((name==='parseAllDocuments'||name==='YAML.parseAllDocuments')&&node.arguments[0]&&ts.isCallExpression(node.arguments[0])&&node.arguments[0].expression.getText(tree)==='fs.readFileSync') {
          const argument=node.arguments[0].arguments[0];
          const declaration=ts.isIdentifier(argument)?declarationFor(argument):argument;
          if(declaration&&ts.isNewExpression(declaration)&&declaration.expression.getText(tree)==='URL'&&ts.isStringLiteral(declaration.arguments?.[0])&&declaration.arguments?.[1]?.getText(tree)==='import.meta.url') {
            const input=path.resolve(root,path.dirname(source),declaration.arguments[0].text);
            assert(input.startsWith(`${path.resolve(root)}${path.sep}`),`API_PRODUCT_SCRIPT_INPUT_OUTSIDE_ROOT: ${source}`);
            serializedInputs.add(path.relative(root,input));
            const documents=YAML.parseAllDocuments(fs.readFileSync(input,'utf8'));
            assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SCRIPT_INPUT_YAML_INVALID: ${source} ${path.relative(root,input)}`);
            return documents.map(document=>document.toJS());
          }
        }

        if(name==='structuredClone'||name==='Object.freeze')return evaluate(node.arguments[0],seen);
        if(ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='map') {
          const callback=node.arguments[0];
          const input=evaluate(node.expression.expression,seen);
          if(Array.isArray(input)&&ts.isArrowFunction(callback)&&ts.isBlock(callback.body)) {
            const returned=callback.body.statements.find(ts.isReturnStatement);
            if(returned?.expression&&ts.isCallExpression(returned.expression)&&ts.isPropertyAccessExpression(returned.expression.expression)&&returned.expression.expression.name.text==='toJS')return input;
          }
          if(ts.isArrowFunction(callback)||ts.isFunctionExpression(callback)) {
            if(!ts.isBlock(callback.body))return [evaluate(callback.body,seen)];
            const returned=callback.body.statements.find(ts.isReturnStatement);
            if(returned?.expression)return [evaluate(returned.expression,seen)];
          }
        }
        if(name==='stringArray')return [{__docsDynamicExpression:node.getText(tree)}];
      }
      if(ts.isElementAccessExpression(node)){const object=evaluate(node.expression,seen),member=evaluate(node.argumentExpression,seen);if(object&&typeof object==='object'&&(typeof member==='string'||typeof member==='number')&&Object.hasOwn(object,member))return object[member];}
      if(ts.isPropertyAccessExpression(node)) {
        // This checked-in renderer validates the required quantity members but
        // forwards the complete public policy.resources object. Selection must
        // retain its full supported schema, not merely the shipped quantities.
        if(source==='scripts/render-postgresql-recovery.mjs'&&node.getText(tree)==='policy.resources')return {__docsDynamicExpression:node.getText(tree),__docsSupportedSchemaPassthrough:{input:'policy.resources',validation:'validateStorage',serializationLine:tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}};
        const object=evaluate(node.expression,seen);
        if(object&&typeof object==='object'&&Object.hasOwn(object,node.name.text))return object[node.name.text];
      }
      // Scalar expressions carry source provenance. A later schema join must
      // reject unresolved collections rather than pretend their children known.
      return {__docsDynamicExpression:node.getText(tree)};
    }
    constructors.forEach((node,index)=>{
      for(let parent=node.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){if(guardedTestFunctions.has(parent))return;break;}
      opaque.clear();serializedInputs.clear();const binding=ts.isVariableDeclaration(node.parent)&&ts.isIdentifier(node.parent.name)?node.parent.name:null;const publications=binding?serializedPublications.filter(publication=>{let found=false;const visit=part=>{if(ts.isIdentifier(part)&&declarationFor(part)===node)found=true;ts.forEachChild(part,visit);};publication.arguments.forEach(visit);return found;}):[];
      terminalPosition=publications.length?Math.min(...publications.map(publication=>publication.getStart(tree))):Infinity;
      assert(!publications.some(publication=>assignments.some(assignment=>assignment.left.expression.getText(tree)===binding?.text&&assignment.pos>terminalPosition&&assignment.pos<publication.getStart(tree))),`API_PRODUCT_SCRIPT_MULTIPLE_OUTPUT_VARIANTS_UNQUALIFIED: ${source}:${binding?.text}`);
      const value=evaluate(binding??node);
      if(binding) {
        const name=binding.text;
        assert(!unsupportedMutations.filter(mutation=>!ts.isDeleteExpression(mutation)).some(mutation=>new RegExp(`\\b${name}\\b`,'u').test(mutation.getText(tree))),`API_PRODUCT_SCRIPT_MUTATION_UNQUALIFIED: ${source}:${name}`);
      }
      // A proved ordered deletion can turn an initial API constructor into a
      // published native object. Preserve the final emitted identity.
      if(publications.length&&value&&typeof value==='object'&&(!Object.hasOwn(value,'apiVersion')||!Object.hasOwn(value,'kind'))&&outputRoles.some(role=>role.role==='non-api'&&role.line===tree.getLineAndCharacterOfPosition(publications[0].getStart(tree)).line+1))return;
      let identityWitness;
      if(value.kind==='BusterNamespaceLease'&&typeof value.apiVersion!=='string') {
        const file=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const registry=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
        const contract=registry.scriptIdentityProfiles?.find(record=>record.source===source&&record.kind===value.kind);
        const property=node.properties?.find(property=>ts.isPropertyAssignment(property)&&property.name.getText(tree)==='apiVersion');
        assert(contract&&property?.initializer.getText(tree)===contract.expression,`API_PRODUCT_SCRIPT_IDENTITY_UNRESOLVED: ${source}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}`);
        assert.deepEqual(producerAdapterOperationRecipe(source,bytes),contract.operationRecipe,`API_PRODUCT_SCRIPT_IDENTITY_PROFILE_DRIFT: ${source}`);
        const configured=YAML.parse(fs.readFileSync(path.join(root,contract.valuesSource),'utf8')).busterNamespaceBroker;
        const authorityBytes=fs.readFileSync(path.join(root,contract.authoritySource),'utf8');
        assert(/group: \{\{ \.Values\.busterNamespaceBroker\.leaseApiGroup \}\}/u.test(authorityBytes)&&/name: \{\{ \.Values\.busterNamespaceBroker\.leaseApiVersion \}\}/u.test(authorityBytes)&&/kind: BusterNamespaceLease/u.test(authorityBytes),'API_PRODUCT_SCRIPT_IDENTITY_AUTHORITY_UNQUALIFIED');
        assert(typeof configured?.leaseApiGroup==='string'&&typeof configured?.leaseApiVersion==='string','API_PRODUCT_SCRIPT_IDENTITY_WITNESS_UNQUALIFIED');
        value.apiVersion=`${configured.leaseApiGroup}/${configured.leaseApiVersion}`;
        identityWitness={profile:'source-bound-chart-default-identity',parameters:{leaseApiGroup:configured.leaseApiGroup,leaseApiVersion:configured.leaseApiVersion},inputs:[contract.valuesSource,contract.authoritySource],inputDigest:hash(JSON.stringify([contract.valuesSource,hash(fs.readFileSync(path.join(root,contract.valuesSource))),contract.authoritySource,hash(authorityBytes)]))};
      }
      const names=Object.keys(value);
      if(typeof value.apiVersion!=='string'&&names.every(name=>['apiVersion','kind','namespace','name'].includes(name))&&names.includes('name')&&names.includes('namespace'))return; // flattened resource identity index, not an API request body
      assert(typeof value.apiVersion==='string'&&typeof value.kind==='string',`API_PRODUCT_SCRIPT_IDENTITY_UNRESOLVED: ${source}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1}`);
      if(!/(?:^|\/)v[0-9]/u.test(value.apiVersion))return;
      const line=tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1;
      result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,sourceDigest:hash(bytes),producer:'script-shape',line,...(identityWitness?{identityWitness}:{}),
        outputDigest:hash(JSON.stringify(value)),inputs:[...serializedInputs].sort(),inputDigest:hash(JSON.stringify([...serializedInputs].sort().map(input=>[input,hash(fs.readFileSync(path.join(root,input)))]))),expressions:[...opaque.values()]}});
    });
    for(const publication of serializedPublications) {
      terminalPosition=publication.getStart(tree);
      let guarded=false;
      for(let parent=publication.parent;parent;parent=parent.parent)if(ts.isFunctionLike(parent)){guarded=guardedTestFunctions.has(parent);break;}
      if(guarded)continue;
      for(const argument of publication.arguments) {
        const value=evaluate(argument);
        if(value?.__docsDynamicExpression&&/apiVersion[\s\S]*kind|kind[\s\S]*apiVersion/u.test(value.__docsDynamicExpression))throw new Error(`API_PRODUCT_SCRIPT_SERIALIZED_OUTPUT_UNQUALIFIED: ${source}`);
        if(typeof value==='string'&&/^[\s]*[\[{]/u.test(value)) {
          let parsed;try{parsed=JSON.parse(value);}catch{if(/apiVersion|"kind"/u.test(value))throw new Error(`API_PRODUCT_SCRIPT_SERIALIZED_JSON_INVALID: ${source}`);}
          for(const resource of Array.isArray(parsed)?parsed:[parsed])if(resource?.apiVersion&&resource?.kind)result.push({value:resource,context:{apiVersion:resource.apiVersion,kind:resource.kind,path:source,document:constructors.length+result.filter(output=>output.context.path===source&&output.context.profile==='serialized-json-literal').length,sourceDigest:hash(bytes),producer:'script-shape',profile:'serialized-json-literal',line:tree.getLineAndCharacterOfPosition(publication.getStart(tree)).line+1,outputDigest:hash(JSON.stringify(resource)),inputs:[],inputDigest:hash('[]'),expressions:[]}});
        }
        if(typeof value!=='string'||!/(?:^|\n)apiVersion:\s/u.test(value)||!/(?:^|\n)kind:\s/u.test(value))continue;
        const documents=YAML.parseAllDocuments(value);
        assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SCRIPT_SERIALIZED_YAML_INVALID: ${source}`);
        for(const document of documents) {
          const resource=document.toJS();if(!resource?.apiVersion||!resource?.kind)continue;
          result.push({value:resource,context:{apiVersion:resource.apiVersion,kind:resource.kind,path:source,document:constructors.length+result.filter(output=>output.context.path===source&&output.context.profile==='serialized-literal').length,sourceDigest:hash(bytes),producer:'script-shape',profile:'serialized-literal',line:tree.getLineAndCharacterOfPosition(publication.getStart(tree)).line+1,outputDigest:hash(JSON.stringify(resource)),inputs:[],inputDigest:hash('[]'),expressions:[]}});
        }
      }
    }
    assert(!outputRoles.some(role=>role.role==='api')||result.some(output=>output.context.path===source),`API_PRODUCT_SCRIPT_OUTPUT_IDENTITY_UNQUALIFIED: ${source}`);
  }
  for(const output of result)for(const source of output.context.inputs??[])classifiedDependencies.add(source);
  // Entry aliases carry the canonical source's actual line/digest and inputs;
  // relative imports and operation qualification were resolved canonically.
  const publicResult=result.flatMap(output=>output.context.producer==='script-shape'
    ?publicNodeSourceContexts(root,output.context.path,output.context).map(context=>({...output,context})): [output]);
  scriptOutputCache.set(root,{inputKey,result:publicResult,dependencies:[...classifiedDependencies].sort().map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])});
  return publicResult;
}

const goOutputCache=new Map();
export function discoverGoApiOutputs(root) {
  const sources=walkProductSources(root,producerRoots,file=>/\.go$/u.test(file)&&!/_test\.go$/u.test(file));
  if(!sources.length)return [];
  // Reject flags before documentation-role qualification can invoke a native
  // helper, as well as before cold parsing or warmed cache admission. Source
  // roles cannot authorize a different Go compilation/environment boundary.
  assert(!process.env.GOFLAGS,`API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED: ${path.join(root,sources[0])}; explicit GOFLAGS selection is outside the reviewed finite authority`);
  const helper=new URL('./docs-api-go-output-shapes.go',import.meta.url);
  const authorityFile='scripts/docs-api-producer-adapter-authorities.json';
  const cacheInputs=[...sources,authorityFile,'package.json','charts/kubeclaw/templates/buster-namespace-lease-crd.yaml'].filter(source=>fs.existsSync(path.join(root,source)));
  const documentationTools=documentationToolSources(root);
  // Revalidate the closed caller/stdio/other-helper profile even on a warm Go cache.
  if(sources.includes('scripts/lib/cli/go_cli_ast.go'))assertCliStaticAstSourcePurpose(root,'scripts/lib/cli/go_cli_ast.go');
  const modulePaths=new Set();
  for(const source of sources)for(let directory=path.dirname(path.join(root,source));true;directory=path.dirname(directory)){for(const name of ['go.mod','go.sum','go.work','go.work.sum'])modulePaths.add(path.join(directory,name));if(path.dirname(directory)===directory)break;}
  const cached=goOutputCache.get(root);for(const file of [...cached?.dependencyPaths??[],...cached?.externalAuthorityDependencies??[]])modulePaths.add(file);
  assert(!process.env.GOWORK||['auto','off'].includes(process.env.GOWORK),`API_PRODUCT_GO_MODULE_AUTHORITY_UNQUALIFIED: ${root}; explicit GOWORK outside finite documentation recipe`);
  const key=hash(JSON.stringify([root,process.env.GOWORK??'auto',process.env.GOMODCACHE??'<default>',process.env.GOPATH??'<default>',hash(fs.readFileSync(helper)),hash(fs.readFileSync(new URL('./docs-api-go-output-role-adapter.go',import.meta.url))),cacheInputs.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))]),[...modulePaths].sort().map(file=>[file,fs.existsSync(file)?[fs.realpathSync(file),fs.statSync(file).isDirectory()?hash(fs.readdirSync(file).sort().join('\n')):hash(fs.readFileSync(file))]:null])]));
  if(cached?.key===key)return cached.result;
  for(const source of sources)if(!documentationTools.has(source))assertNativeSerializationRoles(root,source,fs.readFileSync(path.join(root,source),'utf8'),'Go');
  const nativeAuthority=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const nativeContracts=fs.existsSync(nativeAuthority)?JSON.parse(fs.readFileSync(nativeAuthority,'utf8')).nativeLanguageSerializationContracts??[]:[];
  const roles=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY??'go',['run',new URL('./docs-api-go-output-role-adapter.go',import.meta.url).pathname],{input:JSON.stringify(sources.filter(source=>!documentationTools.has(source)).map(source=>({path:path.join(root,source)}))),encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(roles.status,0,`API_PRODUCT_GO_PRODUCER_PARSE_FAILED: ${roles.error?.message??roles.stderr}`);
  const parsedRoles=JSON.parse(roles.stdout);
  const cliGoRoles=parsedRoles.filter(role=>role.path===path.join(root,'scripts/lib/cli/go_cli_ast.go'));
  if(cliGoRoles.length)assertCliStaticAstOutputVector(root,'scripts/lib/cli/go_cli_ast.go',cliGoRoles);

  // Inspect the original response-root control independently of an earlier
  // unsupported error publication; neither surface can hide the other.
  if(parsedRoles.some(role=>role.function==='productHandler'&&/^json\.NewEncoder\(w\)/u.test(role.expression)))assertNativeProductResponseSchemaAuthority(root);
  for(const role of parsedRoles)assert(role.authorityQualified===true&&(role.role==='non-api'||role.role==='api'||nativeOutputConsumerMatches({...role,expression:role.expression,function:role.function},nativeContracts.filter(contract=>contract.source===path.relative(root,role.path)&&contract.language==='Go').flatMap(contract=>contract.outputs??[]),root)),`API_PRODUCT_GO_RAW_OUTPUT_ROLE_UNQUALIFIED: ${role.path}:${role.line}: ${role.expression}; ${(role.authorityIssues??[]).join('; ')}`);
  const literalOutputs=parsedRoles.filter(role=>role.role==='api').flatMap(role=>YAML.parseAllDocuments(role.value).map(document=>{assert(!document.errors.length,`API_PRODUCT_GO_LITERAL_YAML_INVALID: ${role.path}:${role.line}`);const value=document.toJS();assert(value?.apiVersion&&value?.kind,`API_PRODUCT_GO_LITERAL_IDENTITY_UNQUALIFIED: ${role.path}:${role.line}`);return {value,context:{apiVersion:value.apiVersion,kind:value.kind,path:path.relative(root,role.path),document:role.line,sourceDigest:hash(fs.readFileSync(role.path)),producer:'go-literal-forwarding',line:role.line,outputDigest:hash(JSON.stringify(value))}};}));
  const parsed=spawnSync(process.env.KUBECLAW_DOCS_GO_BINARY ?? 'go',['run',helper.pathname],{input:JSON.stringify(sources.filter(source=>!documentationTools.has(source)).map(source=>path.join(root,source))),encoding:'utf8',maxBuffer:32*1024*1024});
  assert.equal(parsed.status,0,`API_PRODUCT_GO_PRODUCER_PARSE_FAILED: ${parsed.error?.message ?? parsed.stderr}`);
  const result=[...literalOutputs,...Object.entries(JSON.parse(parsed.stdout)).flatMap(([absolute,objects])=>objects.map((object,index)=>{
    const source=path.relative(root,absolute);
    return {value:object.value,context:{apiVersion:object.value.apiVersion,kind:object.value.kind,path:source,document:index,sourceDigest:hash(fs.readFileSync(absolute)),producer:'go-shape',line:object.line,...(object.inferredIdentity?{inferredIdentity:true}:{}),...(object.requestMethod?{requestMethod:object.requestMethod}:{}),...(object.requestPath!==undefined?{requestPath:object.requestPath}:{}),...(object.requestAlternatives?{requestAlternatives:object.requestAlternatives}:{}),...(object.conditions?{conditions:object.conditions}:{}),...(object.factoryExpression?{factoryExpression:object.factoryExpression,factoryLine:object.factoryLine,factoryDependencies:object.factoryDependencies?.map(dependency=>({...dependency,path:path.relative(root,dependency.path)}))}:{}),outputDigest:hash(JSON.stringify(object.value))}};
  }))];
  const dependencyPaths=[...new Set(parsedRoles.flatMap(role=>(role.dependencies??[]).map(fact=>fact.path)).filter(Boolean))];
  const externalAuthorityDependencies=[...new Set(parsedRoles.flatMap(role=>(role.externalAuthorityDependencies??[]).map(fact=>typeof fact==='string'?fact:fact.path)).filter(Boolean))];
  goOutputCache.set(root,{key,result,dependencyPaths,externalAuthorityDependencies});return result;
}

const nonApiOutputClassifications=new Map();
// Bind the finite physical graph observations to ACTUAL original scanner
// descriptors. This selected traversal is deliberately separate from global
// role acceptance: no scanner role changes here, even for an exact match.
export function discoverDeploymentNodeOutputObservations(root) {
  const deployFile=path.join(root,'scripts/deploy.sh');
  if(!fs.existsSync(deployFile))return [];
  const observations=deploymentNodeOutputOccurrences(root,fs.readFileSync(deployFile,'utf8'));
  if(!observations)return [];
  const sources=[...new Set(observations.map(observation=>observation.source))];
  const classify=createSerializedOutputRoleClassifier(root,sources);
  return observations.filter(observation=>classify(observation.source).some(role=>
    observation.descriptor.line===role.line&&observation.descriptor.sink===role.sink&&
    observation.descriptor.expression===role.expression));
}
export function discoverScriptOutputRoleClassifications(root) {
  const documentationTools=documentationToolSources(root);
  const sources=nodeOutputExecutableSources(root).filter(file=>!documentationTools.has(file));
  const classify=createSerializedOutputRoleClassifier(root,sources);
  const topLevelPurposes=checkedTopLevelScriptPurposes(root,documentationGraphCache.get(root),classify,sources);
  const versionsMap=checkedVersionsMapOutputs(root,documentationGraphCache.get(root),classify,sources);
  const observations=discoverDeploymentNodeOutputObservations(root);
  const gitOpsProfile=checkedGitOpsOutputProfiles(root,documentationGraphCache.get(root));
  const infrastructureProfile=checkedInfrastructureOutputProfiles(root,documentationGraphCache.get(root));
  const disabledRegistration=checkedDisabledRegistrationOutput(root,documentationGraphCache.get(root),gitOpsProfile);
  const scalarSources=['scripts/bundle-values-field.mjs','scripts/buster-resource-overlay.mjs'];
  const scalarOccurrences=new Map(scalarSources.filter(source=>sources.includes(source)).map(source=>
    [source,deploymentScalarOccurrenceCustody(root,source,fs.readFileSync(path.join(root,source)),documentationGraphCache.get(root))]));
  return sources.flatMap(source=>{
    const witness=checkedArgocdArtifactOutputs(root,source,fs.readFileSync(path.join(root,source),'utf8'));
    if(witness)assertCheckedArtifactEntryContext(documentationGraphCache.get(root),source);
    const bundleCopy=runtimeBundleCopyCustody(root,source,fs.readFileSync(path.join(root,source)));
    const configOutput=deploymentConfigOutputCustody(root,source,fs.readFileSync(path.join(root,source)));
    const minimalPlugin=minimalPluginFixtureOutputCustody(root,source,fs.readFileSync(path.join(root,source)));
    return classify(source).map(role=>checkedArtifactRole(role,witness)).map(role=>gitOpsOutputProfileRole(source,role,gitOpsProfile)).map(role=>runtimeBundleCopyRole(role,bundleCopy)).map(role=>deploymentConfigOutputRole(role,configOutput)).map(role=>minimalPluginFixtureOutputRole(role,minimalPlugin)).flatMap(role=>{
    // Deployment observations alone remain annotations, never role grants.
    // The separate Source-owned checked-artifact profile above binds one exact
    // descriptor and API output set; all other unknown outputs stay unknown.
    const selectedOccurrences=(observations??[]).filter(observation=>
      observation.source===source&&observation.descriptor.line===role.line&&
      observation.descriptor.sink===role.sink&&observation.descriptor.expression===role.expression);
    const qualifiedScalarUses=scalarOccurrences.has(source)?selectedDeploymentScalarOccurrences(role,scalarOccurrences.get(source)):null;
    if(scalarOccurrences.has(source))assert(qualifiedScalarUses,`DEPLOYMENT_SCALAR_OCCURRENCE_UNQUALIFIED: ${source}; canonical stdout must remain unknown`);
    const topLevelPurpose=selectedTopLevelScriptPurpose(source,role,topLevelPurposes);
    const versionsMapPurpose=selectedVersionsMapOutput(source,role,versionsMap);
    const qualifiedInfrastructureProfile=selectedInfrastructureOutputProfile(source,role,infrastructureProfile);
    const qualifiedDisabledRegistrationProfile=selectedDisabledRegistrationOutput(source,role,disabledRegistration);
    const context={...role,path:source,sourceDigest:hash(fs.readFileSync(path.join(root,source))),
      dependencies:[...new Set([...role.dependencies,...(topLevelPurpose?topLevelPurposes.dependencies:[]),...(versionsMapPurpose?versionsMap.dependencies:[])])],
      dependencyDigests:Object.fromEntries([...new Set([...role.dependencies,...(topLevelPurpose?topLevelPurposes.dependencies:[]),...(versionsMapPurpose?versionsMap.dependencies:[])])].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),
      ...(selectedOccurrences.length?{selectedOccurrences}:{} ),
      ...(topLevelPurpose?{sourceOwnedOutputPurpose:topLevelPurpose,runtimeExecutionAuthorized:false,apiApplyAuthorized:false}:{}),
      ...(versionsMapPurpose?{versionsMapOutputPurpose:versionsMapPurpose,runtimeExecutionAuthorized:false,apiApplyAuthorized:false}:{}),
      ...(qualifiedScalarUses?{qualifiedScalarUses,standaloneOutputRole:'unknown'}:{}),
      ...(qualifiedInfrastructureProfile?{historicalInfrastructureProfile:infrastructureProfile.witnessDigest,executionAuthority:false,standaloneOutputRole:'unknown'}:{}),
      ...(qualifiedDisabledRegistrationProfile?{selectedDisabledRegistration:disabledRegistration.witnessDigest,registrationDisabledByCurrentConfiguration:true,runtimeExecutionAuthorized:false,apiApplyAuthorized:false}:{})};
    // Alias/public-entry contexts have a different invocation identity. The
    // selected deployment evidence cannot travel across that boundary.
    return publicNodeSourceContexts(root,source,context).map(context=>{
      if(!context.canonicalSource)return context;
      const {selectedOccurrences,...unqualifiedAlias}=context;
      return unqualifiedAlias;
    });
  });});
}
export function discoverNonApiOutputClassifications(root) {discoverShellApiOutputs(root);return [...(nonApiOutputClassifications.get(root)??[]),...discoverScriptOutputRoleClassifications(root).filter(role=>role.role==='non-api')];}
export function shellRawOutputSinks(source,bytes) {
 const {shell:code}=shellHeredocCustody(source,bytes);
 // Keep quoting and captured substitutions inside a word. Punctuation inside
 // a regex, quoted program or $(...) is not an executable command boundary.
 const tokens=[],substitutions=[];let index=0,line=1;
 function quoted(quote){let value='';index++;while(index<code.length){const char=code[index++];if(char==='\n')line++;if(char===quote)return value;if(quote==='\"'&&char==='$'&&code[index]==='('){index--;value+=substitution();continue;}if(char==='\\'&&quote==='"'&&index<code.length)value+=code[index++];else value+=char;}assert.fail(`API_PRODUCT_SHELL_OUTPUT_ROLE_PARSE_FAILED: ${source}: unterminated quote`);}
 function substitution(){const start=index,at=line,arithmetic=code[index+2]==='(';let value='$(',depth=1;index+=2;while(index<code.length&&depth){const char=code[index];if(arithmetic&&char==='$'&&code[index+1]==='('){value+=substitution();continue;}if(char==='"'||char==="'"){const quote=char;value+=quote+quoted(quote)+quote;continue;}index++;if(char==='\n')line++;if(char==='(')depth++;if(char===')')depth--;value+=char;}assert.equal(depth,0,`API_PRODUCT_SHELL_OUTPUT_ROLE_PARSE_FAILED: ${source}: unterminated substitution`);if(!arithmetic)substitutions.push({body:code.slice(start+2,index-1),line:at});return value;}
 while(index<code.length){const char=code[index];if(char==='\\'&&code[index+1]==='\n'){index+=2;line++;continue;}if(/[ \t\r]/u.test(char)){index++;continue;}if(char==='#'){while(index<code.length&&code[index]!=='\n')index++;continue;}if(char==='\n'){tokens.push({value:'\n',line,operator:true});index++;line++;continue;}if(/[;()|&<>]/u.test(char)){const start=index++;while(index<code.length&&code[index]===char&&char!=='('&&char!==')')index++;if((char==='>'||char==='<')&&code[index]==='&')index++;tokens.push({value:code.slice(start,index),line,operator:true});continue;}const at=line;let value='';while(index<code.length&&!/[ \t\r\n;()|&<>]/u.test(code[index])){if(code[index]==='"'||code[index]==="'")value+=quoted(code[index]);else if(code[index]==='$'&&code[index+1]==='(')value+=substitution();else if(code[index]==='$'&&code[index+1]==='{'){const close=code.indexOf('}',index+2);assert(close>=0,`API_PRODUCT_SHELL_OUTPUT_ROLE_PARSE_FAILED: ${source}: unterminated expansion`);value+=code.slice(index,close+1);index=close+1;}else if(code[index]==='\\'&&index+1<code.length){index++;if(code[index]==='\n'){index++;line++;}else value+=code[index++];}else value+=code[index++];}tokens.push({value,line:at,operator:false});}
 const sinks=substitutions.flatMap(value=>shellRawOutputSinks(source,value.body).map(sink=>({...sink,line:sink.line+value.line-1,channel:'command-substitution'}))),streamTools=new Set(['sed','awk','gawk','tee','head','tail','cut','paste','sort','uniq','tr','dd','base64','jq','yq']);
 const quietBuiltins=new Set(['return','exit',':','true','false','test','set','export','unset','local','readonly','shift','cd','mkdir','rmdir','rm','mv','cp','chmod','chown','touch','sleep','kill','wait','trap','read','umask','break','continue','mapfile','ulimit']);
 const functionNames=new Set([...code.matchAll(/(?:^|\n)\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\{/gu)].map(match=>match[1]));
 let boundary=true,skipControl=null,casePattern=false;const caseStack=[];
 for(let at=0;at<tokens.length;at++){
  const token=tokens[at],word=token.value;
  if(/^\d+$/u.test(word)&&['>','>>','<','>&','<&'].includes(tokens[at+1]?.value)){at+=2;continue;}
  if(skipControl){if(word===skipControl){skipControl=null;boundary=true;}continue;}
  if(casePattern){if(word===')'){casePattern=false;boundary=true;}else if(word==='esac'){casePattern=false;caseStack.pop();boundary=true;}continue;}
  if(token.operator){if(['>','>>','<','<<<','>&','<&'].includes(word)){at++;continue;}if(word==='('&&tokens[at+1]?.value==='('){let depth=2;at++;while(++at<tokens.length&&depth){if(tokens[at].value==='(')depth++;if(tokens[at].value===')')depth--;}boundary=true;continue;}if([';;',';&',';;&'].includes(word)&&caseStack.length)casePattern=true;if([';','\n','&&','||','|','&','(',')',';;',';&',';;&'].includes(word))boundary=true;continue;}
  if(['then','do','else','elif'].includes(word)){boundary=true;continue;}
  if(!boundary)continue;
  if(word==='case'){caseStack.push(true);skipControl='in';casePattern=true;continue;}
  if(word==='for'||word==='select'){skipControl='do';continue;}
  if(word==='[['){skipControl=']]';continue;}
  if(word==='['){skipControl=']';continue;}
  if(['if','while','until','!','{','}','fi','done','esac','function'].includes(word)){if(word==='esac')caseStack.pop();continue;}
  if(/^[A-Za-z_][A-Za-z0-9_]*\+?=/u.test(word)){if(tokens[at+1]?.value==='('){let depth=0;while(++at<tokens.length){if(tokens[at].value==='(')depth++;if(tokens[at].value===')'&&--depth===0)break;}}continue;}
  if(tokens[at+1]?.value==='('&&tokens[at+2]?.value===')'){at+=2;continue;}
  boundary=false;
  const commandAt=at;let command=word,args=[];let end=at+1;while(end<tokens.length){if(tokens[end].value==='('&&args.at(-1)?.endsWith('=')){let depth=0;do{const value=tokens[end++].value;args.push(value);if(value==='(')depth++;if(value===')')depth--;}while(end<tokens.length&&depth);continue;}if(tokens[end].operator&&[';','\n','&&','||','|','&','(',')',';;',';&',';;&'].includes(tokens[end].value))break;args.push(tokens[end++].value);}
  at=end-1;
  // command/exec preserve the invoked command's output capability. The bounded
  // command -v introspection returns a command name, never a resource document.
  if(command==='command'&&args[0]==='-v')continue;
  if(command==='exec'&&/^\d+$/u.test(args[0]??'')&&['>','>>','<','>&','<&'].includes(args[1]))continue;
  if(command==='command'||command==='exec'){while(args[0]?.startsWith('-'))args.shift();command=args.shift()??'$unsupported-command';}
  if(['cat','kubectl'].includes(command)&&(args.includes('<<')||args.includes('<<-')))continue;
  const redirectsToNull=args.some((arg,n)=>['>','>>'].includes(arg)&&args[n+1]==='/dev/null');
  const redirectsToError=args.some((arg,n)=>arg==='>&'&&args[n+1]==='2');
  if(redirectsToNull&&['echo','printf','cat','head','tail','cut','paste','tr','base64','jq','yq','grep'].includes(command))continue;
  const argumentsOnly=args.slice(0,args.findIndex(value=>['>','>>','<','<<<','>&','<&'].includes(value))<0?args.length:args.findIndex(value=>['>','>>','<','<<<','>&','<&'].includes(value)));
  if(quietBuiltins.has(command)&&!argumentsOnly.some(arg=>/^-.*v/u.test(arg)))continue;
  if(['kubectl','helm'].includes(command)||functionNames.has(command))continue;
  const unknownEmitter=!['echo','printf','cat'].includes(command)&&!quietBuiltins.has(command);
  const literalApi=argumentsOnly.some(arg=>/apiVersion/u.test(arg)&&/kind/u.test(arg));
  const variable=command==='echo'?argumentsOnly.find(arg=>!arg.startsWith('-')):argumentsOnly[1];
  const opaque=literalApi||streamTools.has(command)||unknownEmitter||command==='cat'||command==='echo'&&/\$|`/u.test(argumentsOnly.join(' '))||command==='printf'&&(/\$|`/u.test(argumentsOnly[0]??'')||/%[sb]/u.test(argumentsOnly[0]??'')&&argumentsOnly.slice(1).some(arg=>/\$|`/u.test(arg)))||quietBuiltins.has(command);
  if(!opaque)continue;
  const name=variable?.match(/^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/u),identifier=name?.[1]??name?.[2];
  const first=tokens.find(item=>item.value!=='\n');const initial=identifier&&first?.value.startsWith(identifier+'=')?first.value.slice(identifier.length+1):null;
  const prefix=tokens.slice(0,commandAt).filter(item=>item.value!=='\n'&&item.value!==';');let constantNonApi=false;
  if(initial!==null&&prefix.length===1&&!/[$`]/u.test(initial)&&tokens[end]?.value!=='|'){try{const values=YAML.parseAllDocuments(initial).map(document=>document.toJSON());constantNonApi=!values.some(value=>value&&typeof value==='object'&&'apiVersion'in value&&'kind'in value);}catch{}}
  if(!constantNonApi)sinks.push({line:token.line,command,args:argumentsOnly});
 }
 return sinks;
}
export function shellRawOutputOperationRecipe(source,bytes) {
 const {shell,heredocs}=shellCommandAcquisitions(source,bytes);
 return {...producerAdapterOperationRecipe(source,shell),heredocs:heredocs.map(({operator,delimiter,body,fd,selectedStdin,command})=>({operator,delimiter,fd,selectedStdin,command:command.words.map(word=>word.value),sha256:hash(body)}))};
}
const shellOutputCache=new Map();
// Close unbound raw input channels;
// it is not a complete proof of each positive selected native file producer.
function shellRawChannelUnbound(bytes,sink) {
 const streamTools=new Set(['cat','tee','sed','awk','gawk','head','tail','cut','paste','sort','uniq','tr','dd','base64','jq','yq']);
 const tainted=new Set();let changed=true;
 // Shell locals belong to their function invocation. Do not transfer a local
 // named value/output from an unrelated function into this selected channel.
 const lines=bytes.split('\n'),blocks=[];let start=null;
 for(let index=0;index<lines.length;index++){
  if(start===null&&/^\s*(?:function\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\)\s*\{\s*$/u.test(lines[index]))start=index;
  else if(start!==null&&/^\}\s*$/u.test(lines[index])){blocks.push({start,end:index});start=null;}
 }
 const selected=blocks.find(block=>block.start<sink.line&&sink.line<=block.end+1);
 bytes=lines.map((line,index)=>blocks.some(block=>block!==selected&&block.start<=index&&index<=block.end)?'':line).join('\n');
 const assignments=[...bytes.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"\n]*(?:\$\([^\n]*\)[^"\n]*)?)"|'([^'\n]*)'|([^;\n ]+(?:\([^\n]*?\))?))/gu)];
 const references=value=>[...value.matchAll(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)[^}]*\}|([A-Za-z_][A-Za-z0-9_]*))/gu)].map(match=>match[1]??match[2]);
 const caller=value=>/\$(?:[0-9@*]|\{[0-9@*][^}]*\})/u.test(value)||references(value).some(name=>tainted.has(name));
 while(changed){changed=false;for(const match of assignments){const value=match[2]??match[3]??match[4]??'';if(caller(value)||/\$\(\s*(?:cat|tee|yaml_trim_scalar|yaml_get_section_key|yaml_get_nested_section_key|bundle_values_field)(?:\s|\))/u.test(value)){if(!tainted.has(match[1])){tainted.add(match[1]);changed=true;}}}}
 const rawScalar=sink.command==='printf'&&/^%[sb](?:\\n)?$/u.test(sink.args[0]??'')&&sink.args.length===2&&/^\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*])$/u.test(sink.args[1]??'')||sink.command==='echo'&&sink.args.filter(value=>!value.startsWith('-')).length===1&&/^\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@*])$/u.test(sink.args.at(-1)??'');
 const dataArgs=['awk','gawk','sed','jq','yq'].includes(sink.command)?sink.args.slice(1):sink.args;
 if((['cat','tee'].includes(sink.command)||rawScalar)&&dataArgs.some(caller))return true;
 if(sink.command==='cat'&&sink.args.some(value=>references(value).some(name=>!assignments.some(match=>match[1]===name)&&!new RegExp(`\\bfor\\s+${name}\\s+in\\s+[A-Za-z0-9_. -]+;?\\s*do`,'u').test(bytes))))return true;
 if(streamTools.has(sink.command)){
  if(sink.command==='tee')return true; // no argument selects tee's input.
  if(sink.command==='cat'&&(!sink.args.length||sink.args.every(value=>value==='-'||value.startsWith('-'))))return true;
 }
 return false;
}
// Supported native CLI -> finite summary selector -> framed human output.
// This preserves Source role semantics, not live external CLI schema acceptance.
function shellNativeSummaryQualified(bytes,sink) {
 const lines=bytes.split('\n'),before=lines.slice(0,sink.line).join('\n');
 // Identify the operation grammar, not a source pathname. The actual helper
 // binds label/output/selector to caller argv and frames every public result.
 const helper=/([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{\s*local label output jq_expr\s*label="\$1"\s*output="\$2"\s*jq_expr="\$3"([\s\S]*?)\n\}/gu;
 const definitions=[...bytes.matchAll(helper)];
 const dynamic=/^\$\{[A-Za-z_][A-Za-z0-9_]*\[@\]\}$/u.test(sink.command);
 const definition=definitions.find(match=>{const first=bytes.slice(0,match.index).split('\n').length;return first<=sink.line&&sink.line<=first+match[0].split('\n').length-1;})??(dynamic&&definitions.length===1?definitions[0]:null);
 if(!definition)return false;
 const body=definition[2];
 if(body.replace(/\s+/gu,'')!=="  if jq -er \"$jq_expr\" >/dev/null 2>&1 <<<\"$output\"; then\n    printf '%s %s\\n' \"$label\" \"$(jq -r \"$jq_expr\" <<<\"$output\")\"\n  elif [[ -n $output ]]; then\n    printf '%s %s\\n' \"$label\" \"$(printf '%s' \"$output\" | tr '\\n' ' ' | sed 's/[[:space:]]\\+/ /g; s/[[:space:]]*$//')\"\n  else\n    printf '%s no-output\\n' \"$label\"\n  fi".replace(/\s+/gu,''))return false;
 const name=definition[1],occurrences=[...bytes.matchAll(new RegExp(`(^|\\n)[ \\t]*${name}[ \\t]+([^\\n]+)`,'gu'))].filter(match=>!match[0].includes(name+'()'));
 if(!occurrences.length)return false;
 if((bytes.match(new RegExp(`\\b${name}\\b`,'gu'))??[]).length!==occurrences.length+1)return false;
 const supported=new Set(['.','".ok=\\(.ok)"','".message_id=\\(.payload.result.messageId) channel_id=\\(.payload.result.channelId)"','".json=true"']);
 const selectedCaptures=new Set();
 for(const occurrence of occurrences){const call=occurrence[2]?.match(/^"([a-z_]+ (?:ok|failed))"\s+"\$([A-Za-z_][A-Za-z0-9_]*)"\s+'([^']+)'\s*$/u);if(!call||!supported.has(call[3]))return false;
  const output=call[2],prefix=bytes.slice(0,occurrence.index),assignments=[...prefix.matchAll(new RegExp(`\\b${output}="\\$\\(([^\\n]+)\\)"`,'gu'))];const assignment=assignments.at(-1);if(!assignment)return false;const command=assignment[1];
  if((bytes.match(new RegExp(`\\b${output}\\b`,'gu'))??[]).length!==4)return false;
  if(/^openclaw system event --session-key "\$[A-Za-z_][A-Za-z0-9_]*" --mode "\$[A-Za-z_][A-Za-z0-9_]*" --text "\$[A-Za-z_][A-Za-z0-9_]*" --json 2>&1 \|\| true$/u.test(command))continue;
  const array=command.match(/^"\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}" 2>&1 \|\| true$/u)?.[1];if(!array)return false;
  const arrays=[...prefix.matchAll(new RegExp(`\\b${array}=\\(([\\s\\S]*?)\\n[ \\t]*\\)`,'gu'))],actual=arrays.at(-1);if(!actual)return false;
  const argv=actual[1].replace(/\s+/gu,' ').trim();
  const message=/^openclaw message send --account "\$[A-Za-z_][A-Za-z0-9_]*" --channel "\$[A-Za-z_][A-Za-z0-9_]*" --target "\$[A-Za-z_][A-Za-z0-9_]*" --message "\$[A-Za-z_][A-Za-z0-9_]*" --json$/u.test(argv);
  const agent=/^openclaw agent --agent "\$[A-Za-z_][A-Za-z0-9_]*" --session-key "\$[A-Za-z_][A-Za-z0-9_]*" --message "\$[A-Za-z_][A-Za-z0-9_]*" --timeout "\$[A-Za-z_][A-Za-z0-9_]*" --json$/u.test(argv);if(!message&&!agent)return false;
  const between=prefix.slice(actual.index+actual[0].length,assignment.index);const mutations=[...between.matchAll(new RegExp(`\\b${array}\\+?=\\(([\\s\\S]*?)\\)`,'gu'))];
  if((between.match(new RegExp(`\\b${array}\\b`,'gu'))??[]).length!==mutations.length)return false;
  if(mutations.some(match=>{const flags=match[1].replace(/\s+/gu,' ').trim();return message?flags!=='--silent':!/^--deliver --reply-account "\$[A-Za-z_][A-Za-z0-9_]*" --reply-channel "\$[A-Za-z_][A-Za-z0-9_]*" --reply-to "\$[A-Za-z_][A-Za-z0-9_]*"$/u.test(flags);}))return false;
  selectedCaptures.add(bytes.slice(0,assignment.index).split('\n').length);
 }
 return ['jq','printf','tr','sed'].includes(sink.command)||dynamic&&selectedCaptures.has(sink.line)&&sink.channel==='command-substitution'&&sink.args.join('|')==='2';
}
// Capture-to-framed-log grammar. This qualifies the actual consumer graph,
// without assigning arbitrary notify-command stdout a native producer role.
function shellFramedNotifyLogQualified(bytes,sink) {
 const functions=[...bytes.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{([\s\S]*?)\n\}/gu)];
 const current=functions.find(match=>{const first=bytes.slice(0,match.index).split('\n').length;return first<=sink.line&&sink.line<=first+match[0].split('\n').length-1;});
 if(!current)return false;
 const body=current[2];
 const log=functions.find(match=>/\n\s*printf '%s pid=%s %s\\n' "\$\(now_iso\)" "\$run_pid" "\$1" >>"\$log_file"\s*$/u.test(match[2]));
 if(!log||log[2].trim()!==`printf '%s pid=%s %s\\n' "$(${ 'now_iso' })" "$run_pid" "$1" >>"$log_file"`)return false;
 const logger=log[1];
 const exact=[
  `printf '\\n__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=%s\\n' "$?"`,
  `exit_code="$(printf '%s\\n' "$output" | sed -n 's/^__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=//p' | tail -n 1)"`,
  `output="$(printf '%s\\n' "$output" | sed '/^__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=/d')"`,
  `while IFS= read -r line; do\n      ${logger} "notify output=$line"\n    done <<<"$output"`,
  `if [[ \${exit_code:-1} == "0" ]]; then`,
  `${logger} "notify status=$status result=failed exit=$exit_code command=$notify_command"`
 ];
 if(exact.some(text=>!body.includes(text)))return false;
 // Quote-aware assignment/reference enumeration by the owner must additionally
 // prove these are all uses in this local scope. Reject new raw publication or
 // alias flows rather than treating exact existing legs as blanket evidence.
 const counts={output:4,exit_code:2,line:1};
 for(const [name,count] of Object.entries(counts)){
  const refs=[...body.matchAll(new RegExp(`\\$(?:${name}\\b|\\{${name}(?::[^}]*)?\\})`,'gu'))];
  if(refs.length!==count)return false;
 }
 const selected=bytes.split('\n')[sink.line-1]?.trim();
 if(sink.command==='$notify_command'&&sink.channel==='command-substitution'&&sink.args.join('|')==='2'&&selected==='"$notify_command" 2>&1'&&(body.match(/"\$notify_command" 2>&1/gu)??[]).length===1)return true;
 if(!exact.slice(0,3).some(text=>text===selected))return false;
 return ['printf','sed','tail'].includes(sink.command);
}

const nativeTeeOutputCache=new Map();
function nativeTeeOutputDependencies(root,source,bytes,sink) {
 if(sink.command!=='tee')return null;
 const before=bytes.split('\n').slice(0,sink.line).join('\n').replace(/\\\n[ \t]*/gu,' ');
 const invocation=before.slice(before.lastIndexOf('\n')+1);
 const node=/\bnode "\$runtime_repo_root\/([^"\n]+)"\s*\|\s*tee "\$receipt_tmp"(?:;|\s|$)/u.exec(invocation);
 if(!node||!invocation.includes('kubectl exec -n "$NAMESPACE" deployment/agent-nova -c kubeclaw --'))return null;
 let selected=[node[1]];
 if(node[1]==='$preflight_file'){
  selected=[...bytes.replace(/\\\n[ \t]*/gu,' ').matchAll(/^\s*run_nova_production_receipt_preflight\s+([^\s]+)\s+/gmu)].map(match=>match[1]);
  if(!selected.length)return null;
 }
 if(selected.some(file=>!/^tests\/verification\/e2e\/[A-Za-z0-9_-]+\.mts$/u.test(file)||!fs.existsSync(path.join(root,file))))return null;
 const cacheId=`${root}:${source}:${sink.line}`,cached=nativeTeeOutputCache.get(cacheId);
 if(cached?.sourceDigest===hash(bytes)&&cached.selected.join('\n')===selected.join('\n')&&Object.entries(cached.dependencies).every(([file,digest])=>fs.existsSync(path.join(root,file))&&hash(fs.readFileSync(path.join(root,file)))===digest))return cached.dependencies;
 const classify=createSerializedOutputRoleClassifier(root,selected),dependencies={};
 for(const file of selected){
  const content=fs.readFileSync(path.join(root,file),'utf8'),tree=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);
  if(tree.parseDiagnostics.length)return null;
  const roles=classify(file);
  if(roles.some(role=>role.sink==='unknown-output-function'))return null;
  const stdout=roles.filter(role=>['process.stdout.write','console.log','console.info'].includes(role.sink));
  if(!stdout.length||stdout.some(role=>role.role!=='non-api'))return null;
  dependencies[file]=hash(content);
  for(const role of stdout)for(const dependency of role.dependencies??[]){
   if(path.isAbsolute(dependency)||dependency.startsWith('../')||!fs.existsSync(path.join(root,dependency)))return null;
   dependencies[dependency]=hash(fs.readFileSync(path.join(root,dependency)));
  }
 }
 // The actual selected stdout constructors are classified individually using
 // their resolved imported values. tee only duplicates that authenticated
 // receipt stream; a changed root/constructor invalidates this proof and cache.
 nativeTeeOutputCache.set(cacheId,{sourceDigest:hash(bytes),selected,dependencies});return dependencies;
}
// Closed selected-key producers and typed receiver recipes. The programs are
// actual one-line-exit extractors; scalar shape alone does not authorize a
// caller. Every helper reference and selected capture/receiver is checked.
const nativeYamlScalarRecipes={
 "yaml_trim_scalar": "awk '\n    {\n      sub(/^[[:space:]]+/, \"\", $0)\n      sub(/[[:space:]]+$/, \"\", $0)\n      gsub(/^\"|\"$/, \"\", $0)\n      gsub(/^'\"'\"'|'\"'\"'$/, \"\", $0)\n      print\n    }\n  '",
 "yaml_get_section_key": "local file=\"$1\"\n  local section=\"$2\"\n  local key=\"$3\"\n\n  awk -v section=\"$section\" -v key=\"$key\" '\n    $0 ~ (\"^\" section \":[[:space:]]*$\") {\n      in_section = 1\n      next\n    }\n\n    in_section && $0 ~ /^[^[:space:]]/ {\n      in_section = 0\n    }\n\n    in_section && $0 ~ (\"^[[:space:]]{2}\" key \":[[:space:]]*\") {\n      value = $0\n      sub(\"^[[:space:]]{2}\" key \":[[:space:]]*\", \"\", value)\n      print value\n      exit\n    }\n  ' \"$file\" | yaml_trim_scalar",
 "yaml_get_nested_section_key": "local file=\"$1\"\n  local section=\"$2\"\n  local subsection=\"$3\"\n  local key=\"$4\"\n\n  awk -v section=\"$section\" -v subsection=\"$subsection\" -v key=\"$key\" '\n    $0 ~ (\"^\" section \":[[:space:]]*$\") {\n      in_section = 1\n      in_subsection = 0\n      next\n    }\n\n    in_section && $0 ~ /^[^[:space:]]/ {\n      in_section = 0\n      in_subsection = 0\n    }\n\n    in_section && $0 ~ (\"^[[:space:]]{2}\" subsection \":[[:space:]]*$\") {\n      in_subsection = 1\n      next\n    }\n\n    in_section && in_subsection && $0 ~ /^[[:space:]]{2}[A-Za-z0-9_-]+:[[:space:]]*$/ && $0 !~ (\"^[[:space:]]{2}\" subsection \":[[:space:]]*$\") {\n      in_subsection = 0\n    }\n\n    in_section && in_subsection && $0 ~ (\"^[[:space:]]{4}\" key \":[[:space:]]*\") {\n      value = $0\n      sub(\"^[[:space:]]{4}\" key \":[[:space:]]*\", \"\", value)\n      print value\n      exit\n    }\n  ' \"$file\" | yaml_trim_scalar",
 "bundle_values_field": "local values=\"$1\" overlay=\"$2\" field=\"$3\" key=\"${4:-}\" result=\"\"\n  if [[ -n $overlay ]]; then\n    if [[ -n $key ]]; then result=\"$(yaml_get_nested_section_key \"$overlay\" codeBundle \"$field\" \"$key\")\";\n    else result=\"$(yaml_get_section_key \"$overlay\" codeBundle \"$field\")\"; fi\n  fi\n  if [[ -z $result ]]; then\n    if [[ -n $key ]]; then result=\"$(yaml_get_nested_section_key \"$values\" codeBundle \"$field\" \"$key\")\";\n    else result=\"$(yaml_get_section_key \"$values\" codeBundle \"$field\")\"; fi\n  fi\n  printf '%s\\n' \"$result\"",
 "prism_image_overrides": "local pairs=(control CONTROL studio STUDIO worker WORKER ingestion INGESTION)\n  local index kind upper repository digest selected_digest\n  for ((index=0; index<${#pairs[@]}; index+=2)); do\n    kind=\"${pairs[index]}\"; upper=\"${pairs[index+1]}\"\n    repository=\"PRISM_${upper}_IMAGE_REPOSITORY\"; digest=\"PRISM_${upper}_IMAGE_DIGEST\"\n    [[ -z ${!repository:-} ]] || printf '%s\\n' --set-string \"images.${kind}.repository=${!repository}\"\n    selected_digest=\"${!digest:-}\"\n    if [[ -z $selected_digest ]]; then\n      selected_digest=\"$(yaml_get_nested_section_key \"$PRISM_VALUES_FILE\" images \"$kind\" digest)\"\n    fi\n    [[ $selected_digest =~ ^sha256:[0-9a-f]{64}$ ]] || {\n      err \"Prism ${kind} image digest is missing or invalid; set PRISM_${upper}_IMAGE_DIGEST or images.${kind}.digest in ${PRISM_VALUES_FILE}\"\n      return 1\n    }\n    printf '%s\\n' --set-string \"images.${kind}.digest=${selected_digest}\"\n    printf '%s\\n' --set-string \"images.${kind}.pullPolicy=IfNotPresent\"\n  done",
 "append_image_override_file": "local output_path=\"$1\"\n  local image_repo=\"$2\"\n  local image_tag=\"$3\"\n  local disable_pull_secrets=\"$4\"\n  local controller_image_repo=\"${5:-}\"\n  local controller_image_tag=\"${6:-}\"\n\n  if [[ -n $image_repo || -n $image_tag ]]; then\n    echo \"image:\" >>\"$output_path\"\n    if [[ -n $image_repo ]]; then\n      echo \"  repository: \\\"$image_repo\\\"\" >>\"$output_path\"\n    fi\n    if [[ -n $image_tag ]]; then\n      echo \"  tag: \\\"$image_tag\\\"\" >>\"$output_path\"\n    fi\n  fi\n\n  if [[ $disable_pull_secrets == \"1\" ]]; then\n    echo \"imagePullSecrets: []\" >>\"$output_path\"\n  fi\n\n  if [[ -n $controller_image_repo || -n $controller_image_tag ]]; then\n    echo \"busterNamespaceBroker:\" >>\"$output_path\"\n    echo \"  controller:\" >>\"$output_path\"\n    echo \"    image:\" >>\"$output_path\"\n    if [[ -n $controller_image_repo ]]; then\n      echo \"      repository: \\\"$controller_image_repo\\\"\" >>\"$output_path\"\n    fi\n    if [[ -n $controller_image_tag ]]; then\n      echo \"      tag: \\\"$controller_image_tag\\\"\" >>\"$output_path\"\n    fi\n  fi",
 "append_code_bundle_override_file": "local output_path=\"$1\"\n  local archive_url=\"$2\"\n  local expected_commit=\"$3\"\n  local contract_version=\"$4\"\n  local auth_secret=\"${5:-}\"\n  local auth_key=\"${6:-token}\"\n\n  cat >>\"$output_path\" <<EOF\ncodeBundle:\n  enabled: true\n  archiveUrl: \"$archive_url\"\n  expectedCommit: \"$expected_commit\"\n  contractVersion: \"$contract_version\"\nEOF\n\n  if [[ -n $auth_secret ]]; then\n    cat >>\"$output_path\" <<EOF\n  auth:\n    existingSecret: \"$auth_secret\"\n    existingSecretKey: \"$auth_key\"\nEOF\n  fi"
};
function shellYamlScalarGraphQualified(bytes,sink) {
 bytes=bytes.replace(/^[ \t]*#[^\n]*$/gmu,'');
 const functions=[...bytes.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{([\s\S]*?)\n\}/gu)];
 const current=functions.find(match=>{const first=bytes.slice(0,match.index).split('\n').length;return first<=sink.line&&sink.line<=first+match[0].split('\n').length-1;});
 if(!current||!['yaml_trim_scalar','yaml_get_section_key','yaml_get_nested_section_key','bundle_values_field','prism_image_overrides'].includes(current[1]))return false;
 const referenceCounts={yaml_trim_scalar:3,yaml_get_section_key:5,yaml_get_nested_section_key:4,bundle_values_field:7,prism_image_overrides:2,append_image_override_file:2,append_code_bundle_override_file:3};
 for(const [name,recipe]of Object.entries(nativeYamlScalarRecipes)){
  const definitions=functions.filter(match=>match[1]===name);
  if(definitions.length!==1||definitions[0][2].trim()!==recipe||(bytes.match(new RegExp(`\\b${name}\\b`,'gu'))??[]).length!==referenceCounts[name])return false;
 }
 const captures=[
  'image_repo="$(yaml_get_section_key "$values_file" image repository)"',
  'prism_agent_image_repo="$(yaml_get_section_key "$PRISM_AGENT_VALUES_FILE" image repository)"',
  'bundle_auth_secret="$(bundle_values_field "$values_file" "$private_values" auth existingSecret)"',
  'values_auth_key="$(bundle_values_field "$values_file" "$private_values" auth existingSecretKey)"',
  'bundle_archive_url="$(bundle_values_field "$values_file" "$private_values" archiveUrl)"',
  'prism_bundle_auth_secret="$(bundle_values_field "$PRISM_AGENT_VALUES_FILE" "$PRISM_AGENT_VALUES_OVERLAY" auth existingSecret)"',
  'prism_values_auth_key="$(bundle_values_field "$PRISM_AGENT_VALUES_FILE" "$PRISM_AGENT_VALUES_OVERLAY" auth existingSecretKey)"',
  'prism_bundle_archive_url="$(bundle_values_field "$PRISM_AGENT_VALUES_FILE" "$PRISM_AGENT_VALUES_OVERLAY" archiveUrl)"',
 ];
 if(captures.some(text=>bytes.split(text).length!==2))return false;
 // Close the selected captured values over their existing typed receivers;
 // an additional raw relay or alias must revoke the finite graph proof.
 const valueReferences={image_repo:13,prism_agent_image_repo:3,bundle_auth_secret:6,values_auth_key:4,bundle_archive_url:10,prism_bundle_auth_secret:6,prism_values_auth_key:4,prism_bundle_archive_url:9,override_output:3};
 if(Object.entries(valueReferences).some(([name,count])=>(bytes.match(new RegExp(`\\b${name}\\b`,'gu'))??[]).length!==count))return false;
 const flat=bytes.replace(/\\\n[ \t]*/gu,' ').replace(/\s+/gu,' ');
 const receivers=[
  'append_image_override_file "$override_file" "$image_repo" "$image_tag" "$disable_pull_secrets" "$controller_image_repo" "$controller_image_tag"',
  'append_code_bundle_override_file "$override_file" "$bundle_archive_url" "$bundle_expected_commit" "$bundle_contract_version" "$bundle_auth_secret" "$bundle_auth_key"',
  'append_code_bundle_override_file "$prism_bundle_override" "$prism_bundle_archive_url" "$prism_bundle_expected_commit" "$prism_bundle_contract_version" "$prism_bundle_auth_secret" "$prism_bundle_auth_key"',
  'verify_bundle_archive_url "$role" "$bundle_archive_url" "$bundle_expected_commit" "$bundle_auth_secret"',
  'verify_bundle_archive_url prism "$prism_bundle_archive_url" "$prism_bundle_expected_commit" "$prism_bundle_auth_secret"',
  'helm_args+=(--values "$override_file")',
  'agent_values+=(-f "$prism_bundle_override" --set-string "litellm.endpoint=http://litellm.${NAMESPACE}.svc.cluster.local:4000/v1")',
  'override_output="$(prism_image_overrides)" || return 1',
  'while IFS= read -r item; do [[ -z $item ]] || overrides+=("$item"); done <<<"$override_output"',
 ];
 if(receivers.some(text=>!flat.includes(text)))return false;
 return current[1]==='bundle_values_field'||current[1]==='prism_image_overrides'?sink.command==='printf':sink.command==='awk';
}

const namedShellChannelFacts=new Map();
function shellReleaseFileProof(root,source,bytes,sink) {
 if(sink.command!=='cat'||sink.args.join('|')!=='$temporary/rendered.yaml')return null;
 const sourceDigest=hash(bytes);
 bytes=bytes.replace(/^[ \t]*#[^\n]*$/gmu,'');
 const flat=bytes.replace(/\\\n[ \t]*/gu,' ').replace(/\s+/gu,' '),selected=bytes.split('\n')[sink.line-1]??'';
 if(selected.trim()!=='if [[ ${1:-} == render ]]; then cat "$temporary/rendered.yaml"; exit 0; fi')return null;
 const argv='node "$repo/scripts/updates/deployment-release.mjs" render "$repo" ops ops "$release" "$namespace" "--discovery=$temporary/discovered.json" -- "${values[@]}" > "$temporary/rendered.yaml"';
 const values='values=(-f "$temporary/discovered.json" -f "$repo/releases/values/ops.yaml")\n    if [[ -n ${OPS_POD_VALUES:-} ]]; then values+=(-f "$OPS_POD_VALUES"); fi\n    [[ -z ${OPS_CODEX_IMAGE:-} ]] || values+=(--set-string "codexImage=$OPS_CODEX_IMAGE")\n    [[ -z ${OPS_MCP_IMAGE:-} ]] || values+=(--set-string "mcpImage=$OPS_MCP_IMAGE")\n    if [[ -n ${OPS_GITHUB_TOKEN_FILE:-} ]]; then values+=(--set-string githubSecret=codex-ops-github); fi\n    if [[ -n ${OPS_TAILSCALE_AUTHKEY_FILE:-} ]]; then values+=(--set tailscale.enabled=true); fi';
 if(!flat.includes(argv)||!bytes.includes(values)||(bytes.match(/\bvalues\+?=/gu)??[]).length!==6||(bytes.match(/\$temporary\/rendered\.yaml/gu)??[]).length!==2||(bytes.match(/\btemporary=/gu)??[]).length!==1||(bytes.match(/\brelease=/gu)??[]).length!==1||(bytes.match(/\bnamespace=/gu)??[]).length!==1||!bytes.includes('temporary=$(mktemp -d)')||!bytes.includes('namespace=${OPS_NAMESPACE:-kubeclaw-ops}')||!bytes.includes('release=${OPS_RELEASE:-codex-ops}'))return null;
 const renderer='scripts/updates/deployment-release.mjs';if(!fs.existsSync(path.join(root,renderer)))return null;
 assertProducerAdapterAuthority(root,[source,renderer]);
 const text=fs.readFileSync(path.join(root,renderer),'utf8');
 if(!text.includes("const common = ['template', release, chart, '--namespace', namespace];")||!text.includes("const render = values => execFileSync('helm', [...common, ...values], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });")||!text.includes('const rendered = render(args);\n      validateRenderedRelease(baseline, rendered, receipt, control.includes(\'--bundle\'));\n      process.stdout.write(rendered);'))return null;
 const dependencies={};
 for(const file of walkProductSources(root,['scripts/updates','charts/ops-pod','releases'],file=>/\.(?:mjs|json|ya?ml|tpl)$/u.test(file)))dependencies[file]=hash(fs.readFileSync(path.join(root,file)));
 const factId=`${root}:${source}:${sink.line}`,old=namedShellChannelFacts.get(factId);
 if(old?.role==='api'&&old.sourceDigest===sourceDigest&&JSON.stringify(old.dependencies)===JSON.stringify(dependencies))return old;
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'docs-ops-public-render-')),outputs=[];
 try {
  const discovery=path.join(temporary,'discovery.json');fs.writeFileSync(discovery,JSON.stringify({networkPolicy:{apiServerCIDRs:['192.0.2.1/32']}}));
  for(const profile of profiles(root,'charts/ops-pod')){
   const selectedValues=structuredClone(profile.values);delete selectedValues.codexImage;delete selectedValues.mcpImage;
   const overlay=path.join(temporary,'overlay.yaml');fs.writeFileSync(overlay,YAML.stringify(selectedValues));
   const args=[renderer,'render',root,'ops','ops','codex-ops','kubeclaw-ops',`--discovery=${discovery}`,'--','-f',discovery,'-f',path.join(root,'releases/values/ops.yaml'),'-f',overlay];
   const rendered=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
   assert.equal(rendered.status,0,`API_PRODUCT_SHELL_RELEASE_RENDER_FAILED: ${source}: ${rendered.stderr}`);
   const documents=YAML.parseAllDocuments(rendered.stdout);assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SHELL_RELEASE_YAML_INVALID: ${source}`);
   for(const [index,document]of documents.entries()){const value=document.toJS();if(value===null)continue;assert(value?.apiVersion&&value?.kind,`API_PRODUCT_SHELL_RELEASE_OUTPUT_ROLE_UNQUALIFIED: ${source}`);
    outputs.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:outputs.length,sourceDigest:sourceDigest,producer:'shell-shape',line:sink.line,profile:`selected-ops-public-render:${profile.id}`,inputs:Object.keys(dependencies),inputDigest:hash(JSON.stringify([dependencies,profile.values])),forwardedProducer:{path:renderer,argv,release:'codex-ops',namespace:'kubeclaw-ops',helmProfile:profile.id,document:index,controlledDiscovery:{networkPolicy:{apiServerCIDRs:['192.0.2.1/32']}},runtimeInputs:['OPS_DISCOVERY_VALUES','OPS_POD_VALUES','OPS_CODEX_IMAGE','OPS_MCP_IMAGE','OPS_GITHUB_TOKEN_FILE','OPS_TAILSCALE_AUTHKEY_FILE']},outputDigest:hash(JSON.stringify(value))}});
   }
  }
 } finally {fs.rmSync(temporary,{recursive:true,force:true});}
 const result={role:'api',sourceDigest:sourceDigest,contract:'selected-release-render-stdout-forwarding',dependencies,outputs};namedShellChannelFacts.set(factId,result);return result;
}
function shellNamedFileProof(root,source,bytes,sink) {
 if(sink.command!=='cat'||sink.args.length!==1)return null;
 bytes=bytes.replace(/^[ \t]*#[^\n]*$/gmu,'');
 const line=bytes.split('\n')[sink.line-1]??'',before=bytes.split('\n').slice(0,sink.line-1).join('\n'),flat=bytes.replace(/\\\n[ \t]*/gu,' ').replace(/\s+/gu,' ');
 const count=text=>bytes.split(text).length-1;
 const native=(contract,dependencies=[])=>{
  const facts={};for(const file of dependencies){if(!fs.existsSync(path.join(root,file)))return null;facts[file]=hash(fs.readFileSync(path.join(root,file)));}
  const result={role:'non-api',contract,dependencies:facts};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,result);return result;
 };
 // Kernel-owned cgroup v2 scalar controls, with finite source-defined loops.
 const controls='for control in cpu.max memory.max memory.swap.max pids.max; do\n    printf \'%s: \' "$control"\n    cat ';
 if(['$root/$control','$root/$role/$control'].includes(sink.args[0])&&line.trim()===`cat "${sink.args[0]}"`&&before.includes('for role in buster prism; do')){
  if(!bytes.includes(controls+`"${sink.args[0]}"\n  done\ndone`))return null;
  const rootAssignment=sink.args[0]==='$root/$control'?'root="/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service/$role"':'root=/sys/fs/cgroup/kubeclaw.slice/kubeclaw-native-pools.service';
  if(!before.includes(rootAssignment)||(bytes.match(/\broot=/gu)??[]).length!==1||(bytes.match(/\brole=/gu)??[]).length||(bytes.match(/\bcontrol=/gu)??[]).length)return null;
  return native('kernel-cgroup-v2-finite-control-scalars');
 }
 // A captured authentication input is qualified by its complete selected
 // environment receiver, not by a claim about arbitrary mounted token bytes.
 if(sink.args[0]==='/var/run/kubeclaw-ops/bearer/token'){
  const body=bytes.replace(/^\s*#[^\n]*\n/gmu,'').trim();
  const expected='set -euo pipefail\nKUBECLAW_MCP_TOKEN=$(cat /var/run/kubeclaw-ops/bearer/token)\nif (( ${#KUBECLAW_MCP_TOKEN} < 32 )); then\n  echo \'MCP bearer is missing or too short; check the mounted Secret\' >&2\n  exit 1\nfi\nexport KUBECLAW_MCP_TOKEN\nexec bash "$@"';
  if(body!==expected)return null;
  const workload='charts/ops-pod/templates/workload.yaml',bootstrap='ops/pod/bootstrap.py';
  if(![workload,bootstrap].every(file=>fs.existsSync(path.join(root,file))))return null;
  const workloadText=fs.readFileSync(path.join(root,workload),'utf8');
  // Bind the receiving container, not another container with the same mount.
  // This finite template grammar rejects changed or ambiguous custody rather
  // than treating an unrelated mount as evidence for the Codex shell.
  const codexContainers=[...workloadText.matchAll(/^        - name: codex\n([\s\S]*?)(?=^        - name:|^      volumes:)/gmu)];
  const volumeSections=[...workloadText.matchAll(/^      volumes:\n([\s\S]*?)(?=^  volumeClaimTemplates:|(?![\s\S]))/gmu)];
  if(codexContainers.length!==1||volumeSections.length!==1)return null;
  const codex=codexContainers[0][1],volumes=volumeSections[0][1];
  const mounts=[...codex.matchAll(/^          volumeMounts:\n([\s\S]*?)(?=^          [A-Za-z]|(?![\s\S]))/gmu)];
  if(mounts.length!==1||(mounts[0][1].match(/name: bearer\b/gu)??[]).length!==1||!/^            - \{name: bearer, mountPath: \/var\/run\/kubeclaw-ops\/bearer, readOnly: true\}$/mu.test(mounts[0][1]))return null;
  const bearerVolumes=[...volumes.matchAll(/^        - name: bearer\n([\s\S]*?)(?=^        - |(?![\s\S]))/gmu)];
  if(bearerVolumes.length!==1||bearerVolumes[0][1]!== '          secret:\n            secretName: {{ .Values.bearerSecret }}\n            defaultMode: 0440\n')return null;
  if(!fs.readFileSync(path.join(root,bootstrap),'utf8').includes("apply_secret('codex-ops-bearer', {'token': secrets.token_urlsafe(48)})"))return null;
  return native('mounted-authentication-input-to-exported-environment; interactive-bash-outside-source',[workload,bootstrap]);
 }
 // The selected external diagnostic process owns this exact file and stderr
 // receiver. This is an external log contract, not a tracked log-shape proof.
 if(sink.args[0]==='/tmp/buildkitd.log'&&line.trim()==='cat /tmp/buildkitd.log >&2'){
  const launch='setpriv --reuid=1000 --regid=1000 --init-groups rootlesskit --net=host buildkitd --config "$config" --addr "$socket" --otel-socket-path "$otel_socket" --root "$state" --oci-worker-no-process-sandbox >/tmp/buildkitd.log 2>&1 &';
  if(!flat.includes(launch)||count('/tmp/buildkitd.log')!==2||!bytes.split('\n').slice(sink.line,sink.line+1).join('\n').includes('exit 1'))return null;
  return native('external-buildkit-startup-diagnostic-to-stderr');
 }
 if(sink.args[0]==='$report'&&line.trim()==='cat "$report"'){
  const writer='if "$trivy_executable" image --cache-dir "$database_cache" --scanners vuln --severity HIGH,CRITICAL --exit-code 1 --format table --output "$report" "$image"; then';
  if(!flat.includes(writer)||count('"$report"')!==2||(bytes.match(/\$(?:report\b|\{report\})/gu)??[]).length!==3||(bytes.match(/\breport=/gu)??[]).length!==1||!before.includes('report="$report_dir/${digest}.txt"')||!before.includes('trivy_executable="$(install_trivy "$(uname -m)")"'))return null;
  return native('selected-trivy-table-file-to-diagnostic-stdout; external-table-contract');
 }
 if(sink.args[0]==='$stage/policy.conf'&&line.trim()==='cat "$stage/policy.conf"'){
  const projection="import fs from 'node:fs';\nimport { createRequire } from 'node:module';\nconst { load } = createRequire(process.argv[2])('js-yaml');\nconst values = load(fs.readFileSync(process.argv[2], 'utf8'));\nif (typeof values.commonConfiguration !== 'string') throw new Error('REDIS_POLICY_REQUIRED');\nprocess.stdout.write(values.commonConfiguration + '\\n');";
  if(!bytes.includes(`node --input-type=module - "$script_root/my-values/infra/redis-values.yaml" >"$stage/policy.conf" <<'NODE'\n${projection}\nNODE\n{\n  cat "$stage/policy.conf"`)||count('$stage/policy.conf')!==2||!bytes.includes('} >"$stage/redis.conf"')||!bytes.includes('"$REDIS_SERVER" "$stage/redis.conf") &'))return null;
  const valuesFile='my-values/infra/redis-values.yaml';if(!fs.existsSync(path.join(root,valuesFile)))return null;
  const values=YAML.parse(fs.readFileSync(path.join(root,valuesFile),'utf8'));
  if(typeof values.commonConfiguration!=='string'||values.commonConfiguration.split('\n').some(text=>text&&!/^[a-z][a-z0-9-]*(?:[ \t]+(?:[a-zA-Z0-9_.-]+|""))*$/u.test(text)))return null;
  return native('selected-redis-directives-to-internal-server-config',[valuesFile]);
 }
 if(sink.args[0]==='$backup/generated/containerd-nri.toml'&&line.trim()==='cat "$backup/generated/containerd-nri.toml" >> "$backup/config-v3.toml.tmpl"'){
  if(count('containerd-nri.toml')!==1||(bytes.match(/\$backup\/generated/gu)??[]).length!==3||!before.includes('backup="$(mktemp -d /root/kubeclaw-native-activation.XXXXXX)"')||!before.includes('node scripts/render-native-worker-node.mjs my-values/infra/native-worker-pools-ax41.yaml "$backup/generated"')||!bytes.includes('install -m 0600 "$backup/config-v3.toml.tmpl" "$template"'))return null;
  const renderer='scripts/render-native-worker-node.mjs';if(!fs.existsSync(path.join(root,renderer)))return null;
  const text=fs.readFileSync(path.join(root,renderer),'utf8'),tree=ts.createSourceFile(renderer,text,ts.ScriptTarget.Latest,true);
  if(tree.parseDiagnostics.length)return null;
  const fn=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='renderNativeWorkerNode');
  const returned=fn?.body?.statements.filter(ts.isReturnStatement).at(-1)?.expression;
  const members=returned&&ts.isObjectLiteralExpression(returned)?returned.properties.filter(node=>ts.isPropertyAssignment(node)&&node.name.getText(tree)==="'containerd-nri.toml'"):[];
  if(members.length!==1||!ts.isStringLiteral(members[0].initializer)||members[0].initializer.text!=='[plugins."io.containerd.nri.v1.nri"]\n  disable = false\n')return null;
  const writer="const bundle = renderNativeWorkerNode(loadNativeNodePolicy(process.argv[2]));\n  const directory = path.resolve(process.argv[3]);\n  fs.mkdirSync(directory, { mode: 0o700 }); // Exclusive: never overwrite an operator's previous bundle.\n  for (const [name, content] of Object.entries(bundle)) fs.writeFileSync(path.join(directory, name), content, { flag: 'wx', mode: 0o600 });";
  let bundleReferences=0;const visit=node=>{if(ts.isIdentifier(node)&&node.text==='bundle')bundleReferences++;ts.forEachChild(node,visit);};visit(tree);
  if(!text.includes(writer)||bundleReferences!==2||(text.match(/\.writeFileSync\s*\(/gu)??[]).length!==1||(text.match(/containerd-nri\.toml/gu)??[]).length!==1)return null;
  return native('exclusive-selected-literal-toml-to-containerd-template',[renderer]);
 }
 if(sink.args[0]==='$migration_log'&&line.trim()==='cat "$migration_log"'){
  const functions=[...bytes.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{([\s\S]*?)\n\}/gu)],producer=functions.find(match=>match[1]==='capture_prism_migration_logs');
  if(!producer||!producer[2].includes('local output_file="$1" pod="" container=""')||!producer[2].includes('for container in bootstrap-database-roles migrate; do')||!producer[2].includes('kubectl logs "$pod" -n "$PRISM_NAMESPACE" -c "$container" --follow --timestamps 2>&1 || true')||!producer[2].includes('} >>"$output_file"')||(producer[2].match(/\$output_file\b/gu)??[]).length!==1)return null;
  if(!before.includes('migration_log="$(mktemp)"\n  capture_prism_migration_logs "$migration_log" &')||(bytes.match(/\bmigration_log=/gu)??[]).length!==1||(bytes.match(/\$(?:migration_log\b|\{migration_log\})/gu)??[]).length!==5)return null;
  return native('selected-timestamped-kubectl-migration-log-capture; external-log-contract');
 }
 return null;
}
const unusedYamlListReaderRecipe="local file=\"$1\"\n  local section=\"$2\"\n\n  awk -v section=\"$section\" '\n    function trim(value) {\n      sub(/^[[:space:]]+/, \"\", value)\n      sub(/[[:space:]]+$/, \"\", value)\n      gsub(/^\"/, \"\", value)\n      gsub(/\"$/, \"\", value)\n      gsub(/^'\"'\"'/, \"\", value)\n      gsub(/'\"'\"'$/, \"\", value)\n      return value\n    }\n\n    $0 ~ (\"^\" section \":[[:space:]]*$\") {\n      in_section = 1\n      next\n    }\n\n    in_section && $0 ~ /^[^[:space:]]/ {\n      in_section = 0\n    }\n\n    in_section && $0 ~ /^[[:space:]]*-[[:space:]]+name:[[:space:]]*/ {\n      value = $0\n      sub(/^[[:space:]]*-[[:space:]]+name:[[:space:]]*/, \"\", value)\n      print trim(value)\n      exit\n    }\n  ' \"$file\"";
function privateShellReachabilityInputs(root) {
 const inputs=walkProductSources(root,[...producerRoots,'.github','docs'],file=>/\.(?:sh|[cm]?js|[cm]?ts|py|go|ya?ml|md|mdx)$/u.test(file)&&!file.includes('/node_modules/'));
 for(const file of ['package.json','docs/generated/inventory/deploy-script.json'])if(fs.existsSync(path.join(root,file)))inputs.push(file);
 return inputs;
}
function shellUnusedPrivateFunctionProof(root,source,bytes,sink) {
 const code=bytes.replace(/^[ \t]*#[^\n]*$/gmu,'');
 const functions=[...code.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(\)\s*\{([\s\S]*?)\n\}/gu)];
 const selected=functions.find(match=>{const first=code.slice(0,match.index).split('\n').length;return first<=sink.line&&sink.line<=first+match[0].split('\n').length-1;});
 if(!selected||selected[2].trim()!==unusedYamlListReaderRecipe||sink.command!=='awk')return null;
 const name=selected[1];if((code.match(new RegExp(`\\b${name}\\b`,'gu'))??[]).length!==1)return null;
 if(!code.includes('case "${1:-}" in')||/(?:^|[;\n])[ \t]*(?:eval\s|source\s|\.\s)|\bBASH_ENV\b|export\s+-f|declare\s+-f|(?:bash|sh)\s+-c/u.test(code))return null;
 // Inspect actual product/import/caller and public usage sources. A generated
 // declaration index is not a supported entry point; its commands must still
 // exclude this function. Unknown callable references revoke this exclusion.
 const inputs=privateShellReachabilityInputs(root);
 for(const file of inputs){if(file===source||file==='scripts/docs-api-output-discovery.mjs'||file==='docs/generated/inventory/deploy-script.json')continue;const text=fs.readFileSync(path.join(root,file),'utf8');if(new RegExp(`\\b${name}\\b`,'u').test(text))return null;
  // A shell source/eval loader can expose local functions without a direct
  // name reference. This finite exclusion does not authorize such imports.
  if(file.endsWith('.sh')&&/(?:^|[;\n])[ \t]*(?:source\s|\.\s|eval\s)|export\s+-f|declare\s+-f/u.test(text.replace(/^[ \t]*#[^\n]*$/gmu,'')))return null;
  if(new RegExp(`(?:import|require)\\s*\\(\\s*['"](?:[^'"]*/)?${path.basename(source).replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}['"]`,'u').test(text))return null;
 }
 const index='docs/generated/inventory/deploy-script.json';
 if(fs.existsSync(path.join(root,index))){const record=JSON.parse(fs.readFileSync(path.join(root,index),'utf8'));if(JSON.stringify({commands:record.commands,commandCases:record.commandCases}).includes(name))return null;}
 const fact={role:'non-api',contract:'unreachable-private-yaml-list-reader; finite-dispatch-and-no-supported-caller',dependencies:Object.fromEntries([...new Set([source,...inputs])].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]))};
 namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

const privatePostgresDumpRecipe="\n  password_file=${POSTGRES_POSTGRES_PASSWORD_FILE:-${POSTGRESQL_POSTGRES_PASSWORD_FILE:-/opt/bitnami/postgresql/secrets/postgres-password}}\n  export PGPASSWORD=\"$(cat \"$password_file\")\"\n  exec pg_dumpall -h 127.0.0.1 -U postgres\n";
const postgresMetadataQueryRecipe="password_file=${POSTGRES_POSTGRES_PASSWORD_FILE:-${POSTGRESQL_POSTGRES_PASSWORD_FILE:-/opt/bitnami/postgresql/secrets/postgres-password}}\nexport PGPASSWORD=\"$(cat \"$password_file\")\"\npsql -X -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 \\\n  -c 'SELECT version();' \\\n  -c 'SELECT slot_name, plugin, slot_type FROM pg_replication_slots;'\ndatabases=$(mktemp)\ntrap 'rm -f \"$databases\"' EXIT\npsql -X -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -At \\\n  -c 'SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate;' > \"$databases\"\nwhile IFS= read -r database; do\n  printf '\\nDatabase: %s\\n' \"$database\"\n  psql -X -h 127.0.0.1 -U postgres -d \"$database\" -v ON_ERROR_STOP=1 \\\n    -c 'SELECT extname, extversion FROM pg_extension ORDER BY extname;' \\\n    -c \"SELECT n.nspname, c.relname AS index_name, am.amname\n        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace\n        JOIN pg_am am ON am.oid=c.relam\n        WHERE c.relkind='i' AND am.amname IN ('gin','gist')\n        AND n.nspname NOT IN ('pg_catalog','information_schema');\"\ndone < \"$databases\"";
// A finite external executable contract for the selected source build. This
// proves the source-defined validation branch, not arbitrary supplied binary bytes.
const nativePolicyValidationRecipes={"main": "func main() {\n\tif len(os.Args) == 3 && os.Args[1] == \"--check-policy\" {\n\t\tif _, err := readConfiguration(os.Args[2]); err != nil {\n\t\t\tfmt.Fprintln(os.Stderr, err)\n\t\t\tos.Exit(1)\n\t\t}\n\t\tfmt.Println(\"NATIVE_NRI_POLICY_VALID\")\n\t\treturn\n\t}\n\tif len(os.Args) != 1 {\n\t\tfmt.Fprintln(os.Stderr, \"Usage: kubeclaw-native [--check-policy POLICY_JSON]\")\n\t\tos.Exit(1)\n\t}\n\tif err := run(); err != nil {\n\t\tfmt.Fprintln(os.Stderr, err)\n\t\tos.Exit(1)\n\t}\n}", "readConfiguration": "func readConfiguration(file string) (configuration, error) {\n\tvar config configuration\n\tfd, err := syscall.Open(file, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)\n\tif err != nil {\n\t\treturn config, err\n\t}\n\tf := os.NewFile(uintptr(fd), file)\n\tdefer f.Close()\n\tstat, err := f.Stat()\n\tif err != nil {\n\t\treturn config, err\n\t}\n\tnative, ok := stat.Sys().(*syscall.Stat_t)\n\tif !ok || !stat.Mode().IsRegular() || native.Uid != 0 || stat.Mode().Perm()&0022 != 0 || stat.Size() > 65536 {\n\t\treturn config, errors.New(\"NATIVE_NRI_POLICY_NOT_TRUSTED\")\n\t}\n\tdecoder := json.NewDecoder(io.LimitReader(f, 65537))\n\tdecoder.DisallowUnknownFields()\n\tif err := decoder.Decode(&config); err != nil {\n\t\treturn config, err\n\t}\n\tvar trailing any\n\tif err := decoder.Decode(&trailing); err != io.EOF {\n\t\treturn config, errors.New(\"NATIVE_NRI_POLICY_TRAILING_DATA\")\n\t}\n\treturn config, validateConfiguration(config)\n}", "validateConfiguration": "func validateConfiguration(config configuration) error {\n\tversion := regexp.MustCompile(`^v?2\\.(?:[2-9]|[1-9][0-9]+)\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$`)\n\tif config.SchemaVersion != 1 || !version.MatchString(config.ContainerdVersion) || len(config.Roles) != 2 {\n\t\treturn errors.New(\"NATIVE_NRI_CONFIGURATION_INVALID\")\n\t}\n\tname := regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)\n\tdigest := regexp.MustCompile(`^[a-f0-9]{64}$`)\n\tfor _, role := range []string{\"buster\", \"prism\"} {\n\t\tselected, ok := config.Roles[role]\n\t\tif !ok || !name.MatchString(selected.Namespace) || !name.MatchString(selected.Container) || !digest.MatchString(selected.PolicyDigest) {\n\t\t\treturn errors.New(\"NATIVE_NRI_SELECTION_INVALID\")\n\t\t}\n\t}\n\tif config.Roles[\"buster\"].Namespace == config.Roles[\"prism\"].Namespace && config.Roles[\"buster\"].Container == config.Roles[\"prism\"].Container {\n\t\treturn errors.New(\"NATIVE_NRI_SELECTION_AMBIGUOUS\")\n\t}\n\treturn nil\n}"};
const nativePolicyBuilderRecipe="import fs from 'node:fs';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nimport { execFileSync } from 'node:child_process';\n\nconst repository = fileURLToPath(new URL('../', import.meta.url));\nif (process.argv.length !== 3) throw new Error('Usage: build-native-worker-nri.mjs NEW_OUTPUT_BINARY');\nconst output = path.resolve(process.argv[2]);\nif (fs.existsSync(output)) throw new Error('NATIVE_NRI_BUILD_OUTPUT_EXISTS');\nconst version = JSON.parse(fs.readFileSync(path.join(repository, 'versions.json'), 'utf8')).buildArgs.GO_VERSION;\nconst env = { ...process.env, GOTOOLCHAIN: 'local', CGO_ENABLED: '0' };\nconst cwd = path.join(repository, 'tools/native-worker-nri');\nif (execFileSync('go', ['env', 'GOVERSION'], { cwd, env, encoding: 'utf8' }).trim() !== `go${version}`) {\n  throw new Error('NATIVE_NRI_SELECTED_GO_VERSION_REQUIRED');\n}\nexecFileSync('go', ['mod', 'verify'], { cwd, env, stdio: 'inherit' });\nexecFileSync('go', ['build', '-mod=readonly', '-trimpath', '-buildvcs=false', '-o', output, '.'], { cwd, env, stdio: 'inherit' });\nprocess.stdout.write(`${output}\\n`);\n";
function shellNativePolicyValidationProof(root,source,bytes,sink){
 const repair=sink.command==='$backup/10-kubeclaw-native'&&sink.args.join('|')==='--check-policy|/etc/kubeclaw/native-nri.json';
 const stage=sink.command==='$bundle/10-kubeclaw-native'&&sink.args.join('|')==='--check-policy|$generated/native-nri.json';
 if(!repair&&!stage)return null;
 const dependencies=['tools/native-worker-nri/main.go','tools/native-worker-nri/go.mod','tools/native-worker-nri/go.sum','scripts/build-native-worker-nri.mjs','versions.json'];
 if(dependencies.some(file=>!fs.existsSync(path.join(root,file))))return null;
 const normal=text=>text.replace(/^[ \t]*\/\/[^\n]*$/gmu,'').replace(/\s+/gu,' ').trim();
 const go=fs.readFileSync(path.join(root,dependencies[0]),'utf8');
 const imports=go.match(/^import \(([\s\S]*?)^\)/mu)?.[1];
 if(!imports||JSON.stringify([...imports.matchAll(/"([^"]+)"/gu)].map(match=>match[1]))!==JSON.stringify(['context','encoding/json','errors','fmt','io','os','regexp','strings','syscall','github.com/containerd/nri/pkg/api','github.com/containerd/nri/pkg/stub'])||/^func init\(|^var\s|^func \([^\n]*\) (?:UnmarshalJSON|UnmarshalText)\(/mu.test(go))return null;
 for(const [name,recipe]of Object.entries(nativePolicyValidationRecipes)){
  const matches=[...go.matchAll(new RegExp(`^func ${name}\\([^\\n]*[\\s\\S]*?^\\}`,'gmu'))];
  if(matches.length!==1||normal(matches[0][0])!==normal(recipe))return null;
 }
 // Parse the complete selected builder, including all actions. The canonical
 // AST comparison accepts formatting/comments and rejects new commands/writers.
 const printed=text=>{const tree=ts.createSourceFile('build.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);if(tree.parseDiagnostics.length)return null;return ts.createPrinter({removeComments:true}).printFile(tree);};
 if(printed(fs.readFileSync(path.join(root,dependencies[3]),'utf8'))!==printed(nativePolicyBuilderRecipe))return null;
 if(repair){
  if(!bytes.includes('node scripts/build-native-worker-nri.mjs "$backup/10-kubeclaw-native"\n"$backup/10-kubeclaw-native" --check-policy /etc/kubeclaw/native-nri.json')||!bytes.includes('cd "$(dirname "$0")/.."')||!bytes.includes('backup="$(mktemp -d /root/kubeclaw-nri-launch-repair.XXXXXX)"')||(bytes.match(/\bbackup\+?=/gu)??[]).length!==1)return null;
 }else{
  const doc='docs/_legacy-source/operations/ax41-rollout.md';if(!fs.existsSync(path.join(root,doc)))return null;const selected=fs.readFileSync(path.join(root,doc),'utf8');
  if(!selected.includes('node scripts/build-native-worker-nri.mjs "$bundle/10-kubeclaw-native"\n"$bundle/10-kubeclaw-native" --check-policy "$bundle/generated/native-nri.json"')||!selected.includes('bash scripts/install-native-worker-pools-stage.sh "$bundle"')||!bytes.includes('bundle="$(realpath -e "$1")"\ngenerated="$bundle/generated"')||(bytes.match(/\bbundle\+?=/gu)??[]).length!==1||(bytes.match(/\bgenerated\+?=/gu)??[]).length!==1)return null;
  dependencies.push(doc);
 }
 const fact={role:'non-api',contract:'selected-source-built-NRI-policy-read-validation-to-fixed-status; external-artifact-identity-unexecuted',dependencies:Object.fromEntries([source,...dependencies].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),selectedOperation:{command:sink.command,argv:sink.args,source:'tools/native-worker-nri/main.go',entryPoint:'main --check-policy',reachableFunctions:['readConfiguration','validateConfiguration'],builder:'scripts/build-native-worker-nri.mjs',buildCwd:'tools/native-worker-nri',selectedGo:JSON.parse(fs.readFileSync(path.join(root,'versions.json'),'utf8')).buildArgs.GO_VERSION,artifactBinding:repair?'actual same-caller build output':'supported documented build-to-bundle preparation; supplied runtime binary bytes unverified',publicOutput:'fixed NATIVE_NRI_POLICY_VALID or validation error',runtimeOutcome:'unexecuted'}};
 namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

const nativeExecutableConsumerRecipes={"unitTransform": "const fs = require('fs');\nconst source = fs.readFileSync(process.argv[2], 'utf8');\nconst expected = 'ExecStart=/usr/bin/env node /opt/kubeclaw/native/prepare-native-worker-pools.mjs';\nif (source.split(expected).length !== 2) throw Error('Unexpected generated service');\nfs.writeFileSync(process.argv[3], source.replace(expected, 'ExecStart=/usr/local/bin/node /opt/kubeclaw/native/prepare-native-worker-pools.mjs'), {flag:'wx', mode:0o600});", "unitProducer": "function unit() {\n  return `[Unit]\nDescription=KubeClaw native worker role pools\nBefore=k3s.service k3s-agent.service\nAfter=local-fs.target\n\n[Service]\nType=notify\nNotifyAccess=all\nSlice=kubeclaw.slice\nDelegate=cpu memory pids\nDelegateSubgroup=setup\nExecStart=/usr/bin/env node /opt/kubeclaw/native/prepare-native-worker-pools.mjs /etc/kubeclaw/native-node-policy.json --serve\nNoNewPrivileges=yes\nUMask=0077\nTasksMax=infinity\nKillMode=control-group\nTimeoutStartSec=60\n\n[Install]\nWantedBy=multi-user.target\n`;\n}", "postgresVersion": "client_version() {\n  local value\n  value=$(\"$1\" --version)\n  [[ $value =~ PostgreSQL\\)\\ ([0-9]+)\\.([0-9]+) ]] || fail CLIENT_VERSION_INVALID\n  printf '%s\\n' \"$(( 10#${BASH_REMATCH[1]} * 10000 + 10#${BASH_REMATCH[2]} ))\"\n}", "trivyInstaller": "install_trivy() {\n  local machine=\"$1\"\n  local archive_arch archive_sha\n  case \"$machine\" in\n    x86_64|amd64)\n      archive_arch=\"64bit\"\n      archive_sha=\"$TRIVY_AMD64_SHA256\"\n      ;;\n    aarch64|arm64)\n      archive_arch=\"ARM64\"\n      archive_sha=\"$TRIVY_ARM64_SHA256\"\n      ;;\n    *)\n      echo \"Unsupported architecture: $machine\" >&2\n      exit 1\n      ;;\n  esac\n\n  local default_cache=\"${XDG_CACHE_HOME:-${TMPDIR:-/tmp}/kubeclaw-cache}\"\n  local cache_parent=\"${KUBECLAW_TOOL_CACHE:-$default_cache}\"\n  local install_root=\"$cache_parent/trivy/v$TRIVY_VERSION\"\n  local executable=\"$install_root/trivy\"\n  if [[ -x $executable ]] && [[ \"$($executable --version | awk '/^Version:/ { print $2; exit }')\" == \"$TRIVY_VERSION\" ]]; then\n    printf '%s\\n' \"$executable\"\n    return\n  fi\n\n  require_command curl\n  require_command sha256sum\n  require_command tar\n  mkdir -p \"$install_root\"\n  local temporary\n  temporary=\"$(mktemp -d \"${TMPDIR:-/tmp}/kubeclaw-trivy.XXXXXX\")\"\n  trap 'rm -rf -- \"$temporary\"' RETURN\n  local archive=\"trivy_${TRIVY_VERSION}_Linux-${archive_arch}.tar.gz\"\n  local attempt\n  for attempt in 1 2 3; do\n    if curl -fsSL --connect-timeout 15 --max-time 60 \\\n      \"https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/${archive}?download=1&kubeclaw_retry=$(date +%s)-$attempt\" \\\n      -o \"$temporary/$archive\"; then\n      break\n    fi\n    if [[ $attempt == 3 ]]; then return 1; fi\n    sleep \"$((attempt * 5))\"\n  done\n  printf '%s  %s\\n' \"$archive_sha\" \"$temporary/$archive\" | sha256sum -c - >/dev/null || return 1\n  tar --no-same-owner -xzf \"$temporary/$archive\" -C \"$temporary\" trivy || return 1\n  install -m 0755 \"$temporary/trivy\" \"$executable\" || return 1\n  printf '%s\\n' \"$executable\"\n}", "redisArtifactPreparation": "#!/usr/bin/env bash\nset -euo pipefail\n\n# Extract existing, digest-pinned upstream binaries; no runtime image rebuild.\ndestination=\"${RUNNER_TEMP:?}/reliability-services\"\nmkdir -p \"$destination/bin\"\nredis_image=\"$(node -p 'require(\"./versions.json\").infrastructure.redis')\"\ncontainers=()\ncleanup() {\n  for container in \"${containers[@]}\"; do docker rm -f \"$container\" >/dev/null; done\n}\ntrap cleanup EXIT\nfor image in \"$redis_image\"; do\n  [[ \"$image\" =~ @sha256:[a-f0-9]{64}$ ]] || { echo 'Digest-pinned service image required' >&2; exit 1; }\n  docker pull \"$image\"\ndone\ncontainer=\"$(docker create \"$redis_image\")\"; containers+=(\"$container\")\ndocker cp \"$container:/opt/bitnami\" \"$destination/bitnami\"\n# The selected Redis may target a newer glibc than ubuntu-latest. Use its own\n# loader and libraries, without replacing any libraries on the CI host.\ndocker cp -L \"$container:/lib64/ld-linux-x86-64.so.2\" \"$destination/redis-loader\"\ndocker cp -L \"$container:/usr/lib\" \"$destination/redis-system-libs\"\nfor program in redis-server redis-cli redis-check-rdb redis-check-aof; do\n  test -x \"$destination/bitnami/redis/bin/$program\"\n  {\n    printf '#!/usr/bin/env bash\\n'\n    printf 'exec %q --library-path %q %q \"$@\"\\n' \"$destination/redis-loader\" \\\n      \"$destination/redis-system-libs:$destination/bitnami/common/lib:$destination/bitnami/redis/lib\" \\\n      \"$destination/bitnami/redis/bin/$program\"\n  } > \"$destination/bin/$program\"\n  chmod 0755 \"$destination/bin/$program\"\ndone\n\"$destination/bin/redis-server\" --version\n\"$destination/bin/redis-cli\" --version\n{\n  echo \"ARCHVIEWER_TEST_NGINX=$(command -v nginx)\"\n  echo \"REDIS_SOURCE_SERVER=$(command -v redis-server)\"\n  echo \"REDIS_SERVER=$destination/bin/redis-server\"\n} >> \"${GITHUB_ENV:?}\"\n"};
function shellFiniteNativeExecutableProof(root,source,bytes,sink){
 const compact=text=>text.replace(/^[ \t]*#[^\n]*$/gmu,'').replace(/\s+/gu,' ').trim();
 const lines=bytes.split('\n'),line=lines[sink.line-1]?.trim()??'';
 const native=(contract,selectedOperation,dependencies=[])=>{
  if(dependencies.some(file=>!fs.existsSync(path.join(root,file))))return null;
  const fact={role:'non-api',contract,selectedOperation,dependencies:Object.fromEntries([source,...dependencies].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]))};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
 };
 if(sink.command==='$node'&&sink.args.join('|')==='-|$generated/kubeclaw-native-pools.service|$staged_unit|<<|JS'){
  if(!bytes.includes(`<<'JS'\n${nativeExecutableConsumerRecipes.unitTransform}\nJS`)||!bytes.includes('node=/usr/local/bin/node')||(bytes.match(/\bnode\+?=/gu)??[]).length!==1||!bytes.includes('staged_unit="$bundle/kubeclaw-native-pools.service"')||(bytes.match(/\bstaged_unit\+?=/gu)??[]).length!==1||!bytes.includes('generated="$bundle/generated"'))return null;
  const producer='scripts/render-native-worker-node.mjs';if(!fs.existsSync(path.join(root,producer)))return null;const text=fs.readFileSync(path.join(root,producer),'utf8');
  const fn=text.match(/^function unit\(\) \{([\s\S]*?)^\}/mu)?.[0];
  if(fn!==nativeExecutableConsumerRecipes.unitProducer||!text.includes("'kubeclaw-native-pools.service': unit(),"))return null;
  return native('selected-native-systemd-unit-ExecStart-path-transform-to-exclusive-host-file; no-stdout-resource',{command:'/usr/local/bin/node',argv:sink.args,producer,field:'ExecStart',receiver:'exclusive staged systemd .service file',inputBoundary:'source-generated supported bundle; supplied runtime bytes unexecuted'},[producer]);
 }
 if(sink.command==='$1'&&sink.args.join('|')==='--version'){
  const fn=bytes.match(/^client_version\(\) \{([\s\S]*?)^\}/mu);if(!fn||compact(fn[0])!==compact(nativeExecutableConsumerRecipes.postgresVersion)||(bytes.match(/\bclient_version\b/gu)??[]).length!==3||!bytes.includes('client=$(client_version pg_dump)')||!bytes.includes('$(client_version pg_restore)'))return null;
  const start=bytes.slice(0,fn.index).split('\n').length;if(sink.line<start||sink.line>=start+fn[0].split('\n').length)return null;
  return native('selected-pg_dump-or-pg_restore-version-to-validated-numeric-version-comparison; external-CLI-status',{command:['pg_dump','pg_restore'],argv:['--version'],consumer:'PostgreSQL version regexp and numeric reconstruction',runtimeBinaryIdentity:'operator PATH tool authority; unexecuted'});
 }
 if(['$destination/bin/redis-server','$destination/bin/redis-cli'].includes(sink.command)&&sink.args.join('|')==='--version'){
  if(compact(bytes)!==compact(nativeExecutableConsumerRecipes.redisArtifactPreparation))return null;
  const versions='versions.json';if(!fs.existsSync(path.join(root,versions)))return null;const image=JSON.parse(fs.readFileSync(path.join(root,versions),'utf8')).infrastructure.redis;if(!/@sha256:[a-f0-9]{64}$/u.test(image))return null;
  return native('selected-digest-image-Redis-loader-wrapper-to-native-version-status; no-Kubernetes-body',{command:sink.command,argv:sink.args,artifactSource:image,producer:'docker cp selected /opt/bitnami/redis/bin plus selected loader/libraries; fixed exec argv wrapper',runtimeArtifactIdentity:'external selected image contract; unexecuted'},[versions]);
 }
 if(sink.command==='$REDIS_SERVER'&&sink.args.join('|')==='--version'){
  if(line!=='[[ $("$REDIS_SERVER" --version) == *"v=$selected "* ]] || fail DESTINATION_VERSION_NOT_SELECTED'||!bytes.includes(': "${REDIS_SERVER:?Path to the selected native redis-server}"')||!bytes.includes("selected=$(node -e 'const fs=require(\"node:fs\");console.log(JSON.parse(fs.readFileSync(process.argv[1])).infrastructureCharts.redis.appVersion)' \"$script_root/versions.json\")")||(bytes.match(/\bREDIS_SERVER\+?=/gu)??[]).length)return null;
  return native('selected-external-Redis-version-capture-consumed-only-by-pinned-appVersion-admission',{command:'REDIS_SERVER operator executable input',argv:sink.args,consumer:'inline fixed version predicate; no raw result publication',runtimeIdentity:'operator authority, unexecuted'},['versions.json']);
 }
 if(sink.command==='$REDIS_CHECK_RDB'&&sink.args.join('|')==='$snapshot'){
  if(line!=='"$REDIS_CHECK_RDB" "$snapshot" >/dev/null'||!bytes.includes(': "${REDIS_CHECK_RDB:?Path to the selected native redis-check-rdb}"')||!bytes.includes("[[ $(sha256sum -- \"$snapshot\" | cut -d' ' -f1) == \"$expected\" ]] || fail SNAPSHOT_DIGEST_MISMATCH")||(bytes.match(/\bREDIS_CHECK_RDB\+?=/gu)??[]).length)return null;
  return native('selected-external-RDB-validator-exit-status-with-stdout-discarded; no-resource-body',{command:'REDIS_CHECK_RDB operator executable input',argv:sink.args,consumer:'exit status under set -e; stdout /dev/null',runtimeIdentity:'operator authority, unexecuted'});
 }
 if(sink.command==='awk'&&sink.args.join('|')==='/^Version:/ { print $2; exit }'){const upstream=shellRawOutputSinks(source,bytes).find(item=>item.line===sink.line&&['$executable','$trivy_executable'].includes(item.command)&&item.args.join('|')==='--version');if(!upstream||!shellFiniteNativeExecutableProof(root,source,bytes,upstream))return null;return native('selected-pinned-Trivy-Version-header-first-scalar-to-version-admission; no-resource-body',{command:upstream.command,argv:upstream.args,consumerProgram:sink.args[0],receiver:'version comparison or native version header',runtimeOutcome:'unexecuted selected release binary'});}
 if(!['$executable','$trivy_executable'].includes(sink.command))return null;
 const fn=bytes.match(/^install_trivy\(\) \{([\s\S]*?)^\}/mu);if(!fn||compact(fn[0])!==compact(nativeExecutableConsumerRecipes.trivyInstaller)||(bytes.match(/\binstall_trivy\b/gu)??[]).length!==4)return null;
 for(const [name,value]of [['TRIVY_VERSION','0.74.0'],['TRIVY_AMD64_SHA256','2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a'],['TRIVY_ARM64_SHA256','b94ce1976bbf3c15b514b605ee88be7c6d94a29be2302847ff01cb794d47aad5']])if(!bytes.includes(`readonly ${name}="${value}"`)||(bytes.match(new RegExp(`\\b${name}\\+?=`,'gu'))??[]).length!==1)return null;
 const assignments=[...bytes.matchAll(/^[ \t]*trivy_executable="([^\n]*)"$/gmu)];if(assignments.length!==2||assignments.some(match=>match[1]!=='$(install_trivy "$(uname -m)")'))return null;
 if(sink.args.join('|')==='--version'){
  const start=bytes.slice(0,fn.index).split('\n').length;
  if(sink.command==='$executable'&&!(start<=sink.line&&sink.line<start+fn[0].split('\n').length))return null;
  if(sink.command==='$trivy_executable'&&!['"$trivy_executable" --version',"installed_version=\"$($trivy_executable --version | awk '/^Version:/ { print $2; exit }')\""].includes(line))return null;
  return native('selected-pinned-Trivy-installed-artifact-version-query; native-release-status',{command:sink.command,argv:sink.args,artifactSource:'sha256-verified selected Trivy release archive',consumer:'Version header predicate or explicit --version dispatch',runtimeArtifactIdentity:'external release binary contract; unexecuted'});
 }
 const expected=['image','--cache-dir','$database_cache','--scanners','vuln','--severity','HIGH,CRITICAL','--exit-code','1','--format','table','--output','$report','$image'];
 if(sink.command!=='$trivy_executable'||JSON.stringify(sink.args)!==JSON.stringify(expected))return null;
 const cat=shellRawOutputSinks(source,bytes).find(item=>item.command==='cat'&&item.args.join('|')==='$report');
 if(!cat||!shellNamedFileProof(root,source,bytes,cat))return null;
 return native('selected-pinned-Trivy-table-scanner-to-selected-native-report-file-and-status',{command:sink.command,argv:sink.args,artifactSource:'sha256-verified selected release archive',consumer:'actual table-only file producer joined selected cat receiver; vulnerability exit status',runtimeArtifactIdentity:'external release binary contract; unexecuted'});
}

const nativeWatchdogStatusRecipes={"functions": {"append_log": "append_log() {\n  printf '%s pid=%s %s\\n' \"$(now_iso)\" \"$run_pid\" \"$1\" >>\"$log_file\"\n}", "read_status_field": "read_status_field() {\n  jq -r \"$1\" \"$status_file\"\n}", "status_snapshot_line": "status_snapshot_line() {\n  local status idx total succ fail current\n  status=\"$(read_status_field '.status // \"unknown\"')\"\n  idx=\"$(read_status_field '.currentIndex // 0')\"\n  total=\"$(read_status_field '.total // 0')\"\n  succ=\"$(read_status_field '(.successes // []) | length')\"\n  fail=\"$(read_status_field '(.failures // []) | length')\"\n  current=\"$(read_status_field 'if .currentFinding then ((.currentFinding.id // \"?\") + \" \" + (.currentFinding.title // \"\")) else \"none\" end')\"\n  printf '%s %s/%s successes=%s failures=%s current=%s' \\\n    \"$status\" \"$idx\" \"$total\" \"$succ\" \"$fail\" \"$current\"\n}", "notify_terminal_status": "notify_terminal_status() {\n  local status progress current branch worktree error message message output exit_code\n  [[ -n $notify_command ]] || return 0\n\n  status=\"$(read_status_field '.status // \"unknown\"')\"\n  progress=\"$(read_status_field '((.currentIndex // 0) | tostring) + \"/\" + ((.total // 0) | tostring)')\"\n  current=\"$(read_status_field 'if .currentFinding then ((.currentFinding.id // \"?\") + \" - \" + (.currentFinding.title // \"\")) else \"none\" end')\"\n  branch=\"$(read_status_field '.branch // \"n/a\"')\"\n  worktree=\"$(read_status_field '.worktree // \"n/a\"')\"\n  error=\"$(read_status_field 'if ((.failures // []) | length) > 0 then .failures[-1].error // \"\" else \"\" end')\"\n\n  message=$'status: '\"$status\"$'\\n'\"progress: $progress\"$'\\n'\"current: $current\"$'\\n'\"branch: $branch\"$'\\n'\"worktree: $worktree\"\n  if [[ -n $error ]]; then\n    message+=$'\\n'\"error: $error\"\n  fi\n\n  append_log \"notify status=$status\"\n  output=\"$(\n    set +e\n    PIPELINE_LIGHT_MESSAGE=\"$message\" \\\n      PIPELINE_LIGHT_LEVEL=\"$status\" \\\n      PIPELINE_LIGHT_STATUS_FILE=\"$status_file\" \\\n      PIPELINE_LIGHT_WATCHDOG_LOG_FILE=\"$log_file\" \\\n      PIPELINE_LIGHT_RUN_PID=\"$run_pid\" \\\n      \"$notify_command\" 2>&1\n    printf '\\n__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=%s\\n' \"$?\"\n  )\"\n  exit_code=\"$(printf '%s\\n' \"$output\" | sed -n 's/^__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=//p' | tail -n 1)\"\n  output=\"$(printf '%s\\n' \"$output\" | sed '/^__PIPELINE_LIGHT_NOTIFY_EXIT_CODE__=/d')\"\n  if [[ -n $output ]]; then\n    while IFS= read -r line; do\n      append_log \"notify output=$line\"\n    done <<<\"$output\"\n  fi\n  if [[ ${exit_code:-1} == \"0\" ]]; then\n    append_log \"notify status=$status result=sent\"\n  else\n    append_log \"notify status=$status result=failed exit=$exit_code command=$notify_command\"\n    return 0\n  fi\n}", "emit_snapshot": "emit_snapshot() {\n  if [[ -f $status_file ]]; then\n    append_log \"$(status_snapshot_line)\"\n  else\n    append_log \"status=pending\"\n  fi\n  last_heartbeat_epoch=\"$(date +%s)\"\n}"}, "calls": ["status=\"$(read_status_field '.status // \"unknown\"')\"", "idx=\"$(read_status_field '.currentIndex // 0')\"", "total=\"$(read_status_field '.total // 0')\"", "succ=\"$(read_status_field '(.successes // []) | length')\"", "fail=\"$(read_status_field '(.failures // []) | length')\"", "current=\"$(read_status_field 'if .currentFinding then ((.currentFinding.id // \"?\") + \" \" + (.currentFinding.title // \"\")) else \"none\" end')\"", "status=\"$(read_status_field '.status // \"unknown\"')\"", "progress=\"$(read_status_field '((.currentIndex // 0) | tostring) + \"/\" + ((.total // 0) | tostring)')\"", "current=\"$(read_status_field 'if .currentFinding then ((.currentFinding.id // \"?\") + \" - \" + (.currentFinding.title // \"\")) else \"none\" end')\"", "branch=\"$(read_status_field '.branch // \"n/a\"')\"", "worktree=\"$(read_status_field '.worktree // \"n/a\"')\"", "error=\"$(read_status_field 'if ((.failures // []) | length) > 0 then .failures[-1].error // \"\" else \"\" end')\"", "last_status=\"$(read_status_field '.status // \"unknown\"')\"", "status=\"$(read_status_field '.status // \"unknown\"')\"", "status=\"$(read_status_field '.status // \"unknown\"')\""]};
function shellNativeWatchdogStatusProof(root,source,bytes,sink){
 if(sink.command!=='jq'||sink.args.join('|')!=='-r|$1|$status_file')return null;
 const fn=bytes.match(/^read_status_field\(\) \{([\s\S]*?)^\}/mu);if(!fn)return null;const first=bytes.slice(0,fn.index).split('\n').length;if(sink.line<first||sink.line>=first+fn[0].split('\n').length)return null;
 for(const [name,recipe]of Object.entries(nativeWatchdogStatusRecipes.functions)){
  const selected=bytes.match(new RegExp(`^${name}\\(\\) \\{([\\s\\S]*?)^\\}`,'mu'))?.[0];if(selected!==recipe)return null;
 }
 if((bytes.match(/\bread_status_field\b/gu)??[]).length!==16||(bytes.match(/\$status_file\b/gu)??[]).length!==7||(bytes.match(/\bstatus_snapshot_line\b/gu)??[]).length!==2)return null;
 const calls=bytes.split('\n').filter(line=>line.includes('$(read_status_field ')).map(line=>line.trim());if(JSON.stringify(calls)!==JSON.stringify(nativeWatchdogStatusRecipes.calls))return null;
 const fact={role:'non-api',contract:'selected-external-pipeline-status-JSON-to-finite-field-projection-and-watchdog-log-notification; no-authored-Kubernetes-body',dependencies:{[source]:hash(bytes)},selectedOperation:{command:'jq',argv:sink.args,receiver:'finite pipeline status/progress/count/finding/branch/worktree/error selectors; fixed log envelope and notification metadata',inputBoundary:'operator pipeline status file schema, runtime values unexecuted',publicRole:'native watchdog status and log administration'}};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

const nativePostgresMetadataRecipes={"functions": {"configuration": "configuration() {\n  : \"${BACKUP_ROOT:?}\" \"${BACKUP_MAXIMUM_BYTES:?}\" \"${BACKUP_MAXIMUM_RETAINED_BYTES:?}\"\n  : \"${BACKUP_MAXIMUM_AGE_SECONDS:?}\" \"${BACKUP_MAXIMUM_DURATION_SECONDS:?}\"\n  : \"${BACKUP_EXPECTED_SERVER_VERSION:?}\" \"${BACKUP_APPLICATION_IMAGE:?}\"\n  : \"${BACKUP_CREDENTIAL_AUTHORITY_REF:?}\" \"${LITELLM_MASTER_KEY:?}\"\n  : \"${PGHOST:?}\" \"${PGDATABASE:?}\" \"${PGUSER:?}\"\n  for key in BACKUP_MAXIMUM_BYTES BACKUP_MAXIMUM_RETAINED_BYTES BACKUP_MAXIMUM_AGE_SECONDS BACKUP_MAXIMUM_DURATION_SECONDS BACKUP_EXPECTED_SERVER_VERSION; do\n    positive \"$key\" \"${!key}\"\n  done\n  [[ $BACKUP_ROOT == /* && $BACKUP_ROOT != / && ! -L $BACKUP_ROOT ]] || fail ROOT_INVALID\n  [[ $PGDATABASE =~ ^[a-z][a-z0-9_]{0,62}$ ]] || fail DATABASE_NAME_INVALID\n  [[ $BACKUP_APPLICATION_IMAGE =~ ^[a-zA-Z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || fail APPLICATION_IMAGE_INVALID\n  [[ $BACKUP_CREDENTIAL_AUTHORITY_REF =~ ^[a-zA-Z0-9._:/-]{1,256}$ ]] || fail CREDENTIAL_AUTHORITY_INVALID\n  for tool in psql pg_dump pg_restore flock sha256sum stat du timeout sync; do command -v \"$tool\" >/dev/null || fail \"TOOL_MISSING_$tool\"; done\n  if [[ $1 == verify ]]; then [[ -d $BACKUP_ROOT ]] || fail BACKUP_MISSING;\n  else mkdir -p -- \"$BACKUP_ROOT\"; fi\n  [[ $(stat -c %u \"$BACKUP_ROOT\") == \"$(id -u)\" ]] || fail ROOT_OWNER_INVALID\n  local mode; mode=$(stat -c %a \"$BACKUP_ROOT\")\n  (( (8#$mode & 077) == 0 )) || fail ROOT_NOT_PRIVATE\n  export PGCONNECT_TIMEOUT=15\n}", "backup": "backup() {\n  local identity started used allowance blocks stage final client\n  identity=$(server_identity); client=$(client_version pg_dump); started=$(date +%s)\n  used=$(du --summarize --bytes \"$BACKUP_ROOT\" | cut -f1)\n  [[ $used =~ ^[0-9]+$ ]] || fail RETAINED_SIZE_INVALID\n  allowance=$(( BACKUP_MAXIMUM_RETAINED_BYTES - used - 67108864 ))\n  (( allowance > 0 )) || fail RETAINED_CAPACITY_EXCEEDED\n  (( allowance <= BACKUP_MAXIMUM_BYTES )) || allowance=$BACKUP_MAXIMUM_BYTES\n  blocks=$(( allowance / 1024 )); (( blocks > 0 )) || fail RETAINED_CAPACITY_EXCEEDED\n  stage=$(mktemp -d \"$BACKUP_ROOT/.incomplete-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXXXX\")\n  # An interrupted dump remains visibly incomplete and counts against capacity.\n  # The previous completed backup is never removed to make the next one pass.\n  (\n    ulimit -c 0\n    ulimit -f \"$blocks\"\n    timeout --signal=TERM --kill-after=15 \"$BACKUP_MAXIMUM_DURATION_SECONDS\" \\\n      pg_dump --format=custom --file=\"$stage/database.dump\"\n  ) || fail DUMP_FAILED_INCOMPLETE_RETAINED\n  (ulimit -f 64512; pg_restore --list \"$stage/database.dump\" >\"$stage/archive-toc.txt\")\n  [[ $(server_identity) == \"$identity\" ]] || fail SOURCE_IDENTITY_CHANGED\n  {\n    printf 'format=postgresql-recovery-v1\\n'\n    printf 'database=%s\\n' \"$PGDATABASE\"\n    printf 'source_system_identifier=%s\\n' \"$identity\"\n    printf 'server_version_num=%s\\n' \"$BACKUP_EXPECTED_SERVER_VERSION\"\n    printf 'dump_client_version_num=%s\\n' \"$client\"\n    printf 'application_image=%s\\n' \"$BACKUP_APPLICATION_IMAGE\"\n    printf 'credential_authority_ref=%s\\ncredential_binding=%s\\n' \"$BACKUP_CREDENTIAL_AUTHORITY_REF\" \"$(credential_binding)\"\n    printf 'started_epoch=%s\\ncompleted_epoch=%s\\n' \"$started\" \"$(date +%s)\"\n    printf 'schema=full-custom-archive\\ncredentials=external-authority-required\\n'\n  } >\"$stage/metadata.env\"\n  (cd \"$stage\"; sha256sum database.dump archive-toc.txt metadata.env >SHA256SUMS)\n  sync -f \"$stage/database.dump\"\n  final=\"$BACKUP_ROOT/backup-${stage##*/.incomplete-}\"\n  [[ ! -e $final ]] || fail BACKUP_ID_ALREADY_EXISTS\n  mv --no-clobber --no-target-directory \"$stage\" \"$final\"\n  [[ ! -e $stage ]] || fail BACKUP_PUBLICATION_FAILED\n  sync -f \"$BACKUP_ROOT\"\n  printf '%s\\n' \"$final\"\n}", "metadata": "metadata() {\n  awk -F= -v key=\"$2\" '$1==key {count++; value=substr($0,length(key)+2)} END {if(count!=1) exit 1; print value}' \"$1/metadata.env\"\n}", "verify": "verify() {\n  local directory=$1 source_version=$2 name escaped age started completed\n  [[ $directory == \"$BACKUP_ROOT\"/backup-* && -d $directory && ! -L $directory ]] || fail BACKUP_PATH_INVALID\n  [[ ${directory#\"$BACKUP_ROOT\"/} != */* ]] || fail BACKUP_PATH_INVALID\n  for name in database.dump archive-toc.txt metadata.env SHA256SUMS; do\n    [[ -f $directory/$name && ! -L $directory/$name && $(stat -c %h \"$directory/$name\") == 1 ]] || fail BACKUP_FILE_INVALID\n  done\n  (( $(stat -c %s \"$directory/metadata.env\") < 65536 )) || fail METADATA_TOO_LARGE\n  (( $(stat -c %s \"$directory/SHA256SUMS\") < 1024 )) || fail CHECKSUM_INDEX_INVALID\n  (( $(stat -c %s \"$directory/database.dump\") <= BACKUP_MAXIMUM_BYTES )) || fail BACKUP_SIZE_EXCEEDED\n  # Never let a modified checksum index select arbitrary files or parent paths.\n  [[ $(wc -l <\"$directory/SHA256SUMS\") == 3 ]] || fail CHECKSUM_INDEX_INVALID\n  for name in database.dump archive-toc.txt metadata.env; do\n    escaped=${name//./\\\\.}\n    [[ $(grep -Ec \"^[a-f0-9]{64}  $escaped$\" \"$directory/SHA256SUMS\") == 1 ]] || fail CHECKSUM_INDEX_INVALID\n  done\n  (cd \"$directory\"; sha256sum --check --status SHA256SUMS) || fail BACKUP_CHECKSUM_MISMATCH\n  [[ $(metadata \"$directory\" format) == postgresql-recovery-v1 ]] || fail BACKUP_FORMAT_INVALID\n  [[ $(metadata \"$directory\" database) == \"$PGDATABASE\" ]] || fail BACKUP_DATABASE_MISMATCH\n  [[ $(metadata \"$directory\" application_image) == \"$BACKUP_APPLICATION_IMAGE\" ]] || fail BACKUP_APPLICATION_MISMATCH\n  [[ $(metadata \"$directory\" credential_binding) == \"$(credential_binding)\" ]] || fail BACKUP_CREDENTIAL_SET_MISMATCH\n  [[ $(metadata \"$directory\" server_version_num) == \"$source_version\" ]] || fail BACKUP_VERSION_MISMATCH\n  started=$(metadata \"$directory\" started_epoch); completed=$(metadata \"$directory\" completed_epoch)\n  positive STARTED_EPOCH \"$started\"; positive COMPLETED_EPOCH \"$completed\"\n  age=$(( $(date +%s) - started ))\n  (( age >= 0 && completed >= started && completed <= $(date +%s) )) || fail BACKUP_TIMESTAMP_INVALID\n  (( age <= BACKUP_MAXIMUM_AGE_SECONDS )) || fail BACKUP_RPO_EXCEEDED\n  pg_restore --list \"$directory/database.dump\" >/dev/null\n}", "restore": "restore() {\n  local directory=$1 source_version=$2 target count\n  verify \"$directory\" \"$source_version\"\n  if [[ $source_version != \"$BACKUP_EXPECTED_SERVER_VERSION\" ]]; then\n    [[ $(metadata \"$directory\" dump_client_version_num) == \"$BACKUP_EXPECTED_SERVER_VERSION\" \\\n      && $(client_version pg_restore) == \"$BACKUP_EXPECTED_SERVER_VERSION\" ]] || fail MIGRATION_SELECTED_CLIENT_REQUIRED\n  fi\n  target=$(server_identity)\n  [[ $target != \"$(metadata \"$directory\" source_system_identifier)\" ]] || fail SAME_SERVER_RESTORE_FORBIDDEN\n  count=$(sql \"SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')\")\n  [[ $count == 0 ]] || fail RESTORE_REQUIRES_EMPTY_DATABASE\n  # Restore object owners and ACLs; all required login roles must already exist\n  # from the retained secret authority. Any SQL failure rolls the restore back.\n  timeout --signal=TERM --kill-after=15 \"$BACKUP_MAXIMUM_DURATION_SECONDS\" \\\n    pg_restore --exit-on-error --single-transaction --dbname=\"$PGDATABASE\" \"$directory/database.dump\"\n  printf '%s\\n' 'POSTGRES_RECOVERY_RESTORED_APPLICATION_ACCEPTANCE_REQUIRED'\n}", "scheduled": "scheduled() {\n  : \"${BACKUP_INTERVAL_SECONDS:?}\"\n  positive BACKUP_INTERVAL_SECONDS \"$BACKUP_INTERVAL_SECONDS\"\n  local selected age\n  if selected=$(latest) && (verify \"$selected\" \"$BACKUP_EXPECTED_SERVER_VERSION\"); then\n    age=$(( $(date +%s) - $(metadata \"$selected\" started_epoch) ))\n    if (( age < BACKUP_INTERVAL_SECONDS )); then printf '%s\\n' \"$selected\"; return; fi\n  fi\n  selected=$(backup)\n  verify \"$selected\" \"$BACKUP_EXPECTED_SERVER_VERSION\"\n  printf '%s\\n' \"$selected\"\n}"}, "calls": ["[[ $(metadata \"$directory\" format) == postgresql-recovery-v1 ]] || fail BACKUP_FORMAT_INVALID", "[[ $(metadata \"$directory\" database) == \"$PGDATABASE\" ]] || fail BACKUP_DATABASE_MISMATCH", "[[ $(metadata \"$directory\" application_image) == \"$BACKUP_APPLICATION_IMAGE\" ]] || fail BACKUP_APPLICATION_MISMATCH", "[[ $(metadata \"$directory\" credential_binding) == \"$(credential_binding)\" ]] || fail BACKUP_CREDENTIAL_SET_MISMATCH", "[[ $(metadata \"$directory\" server_version_num) == \"$source_version\" ]] || fail BACKUP_VERSION_MISMATCH", "started=$(metadata \"$directory\" started_epoch); completed=$(metadata \"$directory\" completed_epoch)", "[[ $(metadata \"$directory\" dump_client_version_num) == \"$BACKUP_EXPECTED_SERVER_VERSION\" \\", "[[ $target != \"$(metadata \"$directory\" source_system_identifier)\" ]] || fail SAME_SERVER_RESTORE_FORBIDDEN", "age=$(( $(date +%s) - $(metadata \"$selected\" started_epoch) ))"]};
function shellNativePostgresMetadataProof(root,source,bytes,sink){
 if(sink.command!=='awk'||sink.args.join('|')!==['-F=','-v','key=$2','$1==key {count++; value=substr($0,length(key)+2)} END {if(count!=1) exit 1; print value}','$1/metadata.env'].join('|'))return null;
 const fn=bytes.match(/^metadata\(\) \{([\s\S]*?)^\}/mu);if(!fn)return null;const first=bytes.slice(0,fn.index).split('\n').length;if(sink.line<first||sink.line>=first+fn[0].split('\n').length)return null;
 const compact=text=>text.replace(/^[ \t]*#[^\n]*$/gmu,'').replace(/\s+/gu,' ').trim();
 for(const [name,recipe]of Object.entries(nativePostgresMetadataRecipes.functions)){
  const selected=bytes.match(new RegExp(`^${name}\\(\\) \\{([\\s\\S]*?)^\\}`,'mu'))?.[0];if(!selected||compact(selected)!==compact(recipe))return null;
 }
 if((bytes.match(/\bmetadata\b/gu)??[]).length!==17)return null;
 const calls=bytes.split('\n').filter(line=>line.includes('$(metadata ')).map(line=>line.trim());if(JSON.stringify(calls)!==JSON.stringify(nativePostgresMetadataRecipes.calls))return null;
 const fact={role:'non-api',contract:'selected-private-PostgreSQL-recovery-metadata-env-writer-to-finite-identity-version-epoch-validation; no-authored-Kubernetes-body',dependencies:{[source]:hash(bytes)},selectedOperation:{command:'awk',argv:sink.args,producer:'source backup metadata.env framed fixed key/value writer',receiver:'finite verification/restore admission and age arithmetic; no raw metadata publication',runtimeOutcome:'unexecuted database recovery and private backup contract'}};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

const inheritedSerializedSecretRecipe={"function": "copy_secret_from_source() {\n  local name=\"$1\"\n  local target_namespace=\"${2:-$NAMESPACE}\"\n  local source_name=\"${3:-$name}\"\n  local output\n\n  if output=$(kubectl get secret \"$source_name\" -n \"$SRC_NS\" 2>&1); then\n    kubectl get secret \"$source_name\" -n \"$SRC_NS\" -o yaml |\n      sed \"s/namespace: ${SRC_NS}/namespace: ${target_namespace}/\" |\n      kubectl apply -n \"$target_namespace\" -f - >/dev/null\n    log \"Copied: ${target_namespace}/${name}\"\n    return 0\n  fi\n\n  if is_not_found_error \"$output\"; then\n    warn \"Optional source secret not found in ${SRC_NS}: $source_name\"\n    return 2\n  fi\n\n  err \"Failed to check source secret '$source_name' in namespace '$SRC_NS'\"\n  echo \"$output\" >&2\n  exit 1\n}", "calls": ["if copy_secret_from_source \"$SECRET_NAME\"; then", "if copy_secret_from_source \"$name\"; then", "if copy_secret_from_source redis-secrets; then", "if copy_secret_from_source postgresql-secrets; then", "if copy_secret_from_source litellm-secrets; then", "if copy_secret_from_source google-sa-key; then", "if copy_secret_from_source ghcr-secret; then", "if copy_secret_from_source \"$name\"; then", "if copy_secret_from_source \"$TAILSCALE_OAUTH_SECRET_NAME\" \"$TAILSCALE_OPERATOR_NAMESPACE\"; then"]};
function shellInheritedSerializedSecretProof(root,source,bytes,sink){
 if(sink.command!=='sed'||sink.args.join('|')!=='s/namespace: ${SRC_NS}/namespace: ${target_namespace}/')return null;
 const fn=bytes.match(/^copy_secret_from_source\(\) \{([\s\S]*?)^\}/mu);if(!fn||fn[0]!==inheritedSerializedSecretRecipe.function)return null;
 const first=bytes.slice(0,fn.index).split('\n').length;if(sink.line<first||sink.line>=first+fn[0].split('\n').length)return null;
 const calls=bytes.split('\n').filter(line=>/\bif copy_secret_from_source\b/u.test(line)).map(line=>line.trim());if(JSON.stringify(calls)!==JSON.stringify(inheritedSerializedSecretRecipe.calls)||(bytes.match(/\bcopy_secret_from_source\b/gu)??[]).length!==10)return null;
 for(const [name,defaultValue]of [['NAMESPACE','kubeclaw'],['SRC_NS','default']])if(!bytes.includes(`${name}="\${${name}:-${defaultValue}}"`)||(bytes.match(new RegExp(`\\b${name}\\+?=`,'gu'))??[]).length!==1)return null;
 const serializedTransforms=[{tool:'sed',argv:sink.args,inputFormat:'yaml',scope:'first matching text sequence per line',patternTemplate:'namespace: ${SRC_NS}',replacementTemplate:'namespace: ${target_namespace}',sourceNamespaceExpression:'$SRC_NS',targetNamespaceExpression:'${2:-$NAMESPACE}',effects:'serialized text including scalar and annotation strings; no structural field rewrite guarantee'}];
 const transfer={operation:'source-bound-kubernetes-get-serialized-text-transform-apply',sourceReceiver:{apiVersion:'v1',kind:'Secret',resource:'secret',requestMethod:'GET',format:'yaml',nameExpression:'${3:-$name}',namespaceExpression:'$SRC_NS'},retainedRootFields:['apiVersion','kind','metadata','data','immutable','type'],excludedRootFields:['stringData'],removedPaths:[],rewrittenPaths:[],serializedTransforms,unknownLiveValues:true,responseAuthority:'core/v1 Secret GET server response; write-only stringData is not returned'};
 const value={apiVersion:'v1',kind:'Secret',__docsDynamicExpression:fn[0].split('\n').filter(line=>line.includes('-o yaml |')||line.includes('-o json |')||line.trim().startsWith('sed \"')||line.trim().startsWith('jq --arg val ')||line.trim().startsWith('kubectl apply ')).join('\n'),__docsSupportedSchemaPassthrough:transfer};
 const producerLine=sink.line-1,dependencies=[{path:source,sourceDigest:hash(bytes)}];
 const context={apiVersion:'v1',kind:'Secret',path:source,line:sink.line,document:sink.line,producer:'shell-shape',profile:'inherited-live-secret-serialized-yaml-transform',sourceDigest:hash(bytes),outputDigest:hash(JSON.stringify(value)),requestMethod:'APPLY',requestOperation:'kubectl-apply',requestInvocation:'kubectl apply -n "$target_namespace" -f -',requestConstructor:'copy_secret_from_source',forwardedProducer:{qualified:true,path:source,line:producerLine,command:'kubectl',argv:['get','secret','$source_name','-n','$SRC_NS','-o','yaml'],constructorFunction:'copy_secret_from_source',dependencies,serializedTransforms,actualCallerCount:calls.length,liveResponse:'unexecuted; schema passthrough only'}};
 const fact={role:'api',contract:'selected-core-v1-Secret-GET-to-exact-serialized-YAML-sed-to-apply; no-invented-live-fields',dependencies:{[source]:hash(bytes)},outputs:[{value,context}],selectedOperation:context.forwardedProducer};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

const kubectlModuleGraphValidatorRecipe="#!/bin/sh\nset -eu\nversion=${1:?Expected the selected kubectl version}\nprintf '%s\\n' \"$version\" | grep -Eq '^v1\\.[0-9]+\\.[0-9]+$' || {\n    echo \"Invalid kubectl version: $version\" >&2\n    exit 1\n}\n# Inspect the resolved graph, not just direct requirements: MVS can raise a\n# module through a transitive dependency. Replacements cannot attest this source.\nmodules=$(go list -mod=readonly -m -f '{{.Path}} {{.Version}}{{if .Replace}} replaced{{end}}' all)\nprintf '%s\\n' \"$modules\" | awk -v expected=\"v0.${version#v1.}\" '\n$1 ~ /^k8s[.]io\\/(api|apimachinery|cli-runtime|client-go|component-base|component-helpers|kubectl|metrics)$/ {\n    count++\n    if ($2 != expected || NF != 2) {\n        print \"kubectl source/version mismatch: \" $0 \"; expected \" expected > \"/dev/stderr\"\n        failed = 1\n    }\n}\nEND {\n    if (count != 8) {\n        print \"kubectl release module graph is incomplete\" > \"/dev/stderr\"\n        failed = 1\n    }\n    exit failed\n}'\n";
function shellNativeMaintenanceFileProof(root,source,bytes,sink){
 const flat=bytes.replace(/\\\n[ \t]*/gu,' ').replace(/\s+/gu,' '),compact=text=>text.replace(/^[ \t]*#[^\n]*$/gmu,'').replace(/\s+/gu,' ').trim();
 const native=(contract,selectedOperation,dependencies=[])=>{if(dependencies.some(file=>!fs.existsSync(path.join(root,file))))return null;const fact={role:'non-api',contract,selectedOperation,dependencies:Object.fromEntries([source,...dependencies].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]))};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;};
 if(sink.command==='awk'&&compact(bytes)===compact(kubectlModuleGraphValidatorRecipe)){
  const dockerfile='ops/pod/Dockerfile';if(!fs.existsSync(path.join(root,dockerfile))||!fs.readFileSync(path.join(root,dockerfile),'utf8').includes('RUN GOPROXY=off sh verify-version.sh "${KUBECTL_VERSION}"'))return null;
  return native('selected-read-only-Go-module-list-to-eight-Kubernetes-module-version-exit-status-and-framed-stderr',{command:'awk',argv:sink.args,producer:'go list -mod=readonly -m fixed Path/Version/Replace template',receiver:'module version comparison; no stdout payload, only fixed stderr diagnostic or exit status'},[dockerfile,'ops/pod/kubectl-build/go.mod','ops/pod/kubectl-build/go.sum']);
 }
 if(sink.command==='tr'&&sink.args.join('|')==='-d|\\r\\n'){
  const line=bytes.split('\n')[sink.line-1]?.trim();
  if(line!==`kube_namespace="$(tr -d '\\r\\n' < "$kube_service_account_root/namespace")"`||!bytes.includes("case \"$kube_namespace\" in\n  ''|*[!a-z0-9-]*) echo \"projected Kubernetes namespace is invalid\" >&2; exit 1 ;;\nesac")||(bytes.match(/\bkube_namespace\b/gu)??[]).length!==4||!bytes.includes('namespace: $kube_namespace')||!bytes.includes('CONTROLLER_NAMESPACE="$kube_namespace"'))return null;
  return native('selected-mounted-namespace-text-to-DNS-character-validation-and-local-kubeconfig-context; not-API-resource',{command:'tr',argv:sink.args,input:'operator/projected namespace text',receiver:['local kubeconfig context.namespace','controller namespace environment'],runtimeInput:'unexecuted, validation rejects API/JSON syntax'});
 }
 if(sink.command==='sed'&&sink.args.join('|')==='s|ExecStart=/usr/bin/env node |ExecStart=/usr/local/bin/node ||$backup/generated/kubeclaw-native-pools.service'){
  if(!flat.includes('/usr/local/bin/node "$repository/scripts/render-native-worker-node.mjs" "$repository/my-values/infra/native-worker-pools-ax41.yaml" "$backup/generated"')||!flat.includes("sed 's|ExecStart=/usr/bin/env node |ExecStart=/usr/local/bin/node |' \"$backup/generated/kubeclaw-native-pools.service\" > \"$backup/kubeclaw-native-pools.service\"")||!bytes.includes('backup="$(mktemp -d /root/kubeclaw-pool-lifetime-repair.XXXXXX)"')||!bytes.includes('repository="$(cd "$(dirname "$0")/.." && pwd)"')||(bytes.match(/\bbackup\+?=/gu)??[]).length!==1)return null;
  const producer='scripts/render-native-worker-node.mjs';if(!fs.existsSync(path.join(root,producer)))return null;const text=fs.readFileSync(path.join(root,producer),'utf8');if(text.match(/^function unit\(\) \{([\s\S]*?)^\}/mu)?.[0]!==nativeExecutableConsumerRecipes.unitProducer||!text.includes("'kubeclaw-native-pools.service': unit(),"))return null;
  return native('selected-generated-native-systemd-unit-text-ExecStart-path-rewrite-to-host-service-file; no-API-body',{command:'sed',argv:sink.args,producer,receiver:'staged native systemd unit, validated and installed at /etc/systemd/system'},[producer,'my-values/infra/native-worker-pools-ax41.yaml']);
 }
 return null;
}

const inheritedSecretJsonFieldRecipe="rewrite_litellm_database_url_namespace() {\n  local litellm_check old_url new_url\n\n  if litellm_check=$(kubectl get secret litellm-secrets -n \"$NAMESPACE\" 2>&1); then\n    old_url=$(kubectl get secret litellm-secrets -n \"$NAMESPACE\" -o jsonpath='{.data.DATABASE_URL}' | base64 -d)\n    if echo \"$old_url\" | grep -q \"${SRC_NS}\"; then\n      require_command jq\n      new_url=$(echo \"$old_url\" | sed \"s/${SRC_NS}/${NAMESPACE}/g\")\n      kubectl get secret litellm-secrets -n \"$NAMESPACE\" -o json |\n        jq --arg val \"$(echo -n \"$new_url\" | base64 -w0)\" '.data.DATABASE_URL = $val' |\n        kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n      log \"Fixed DATABASE_URL: ${SRC_NS} \u2192 ${NAMESPACE}\"\n    else\n      log \"DATABASE_URL already correct (no ${SRC_NS} reference)\"\n    fi\n  elif is_not_found_error \"$litellm_check\"; then\n    warn \"litellm-secrets not present in $NAMESPACE; skipping DATABASE_URL namespace rewrite.\"\n  else\n    err \"Failed to check litellm-secrets in namespace '$NAMESPACE'\"\n    echo \"$litellm_check\" >&2\n    exit 1\n  fi\n}";
function shellInheritedSecretJsonFieldProof(root,source,bytes,sink){
 const fn=bytes.match(/^rewrite_litellm_database_url_namespace\(\) \{([\s\S]*?)^\}/mu);if(!fn||fn[0]!==inheritedSecretJsonFieldRecipe||(bytes.match(/\brewrite_litellm_database_url_namespace\b/gu)??[]).length!==2)return null;
 const first=bytes.slice(0,fn.index).split('\n').length;if(sink.line<first||sink.line>=first+fn[0].split('\n').length||!['base64','sed','jq'].includes(sink.command))return null;
 const textTransform={tool:'sed',argv:['s/${SRC_NS}/${NAMESPACE}/g'],patternExpression:'${SRC_NS}',replacementExpression:'${NAMESPACE}',scope:'global BRE per line (not literal/structural namespace guarantee)'};
 const structuredTransforms=[{tool:'jq',argv:['--arg','val','$(echo -n "$new_url" | base64 -w0)','.data.DATABASE_URL = $val'],fieldPath:'$.data.DATABASE_URL',valueSource:{GETjsonpath:'.data.DATABASE_URL',decode:'base64 -d',textTransform,encode:'base64 -w0'}}];
 const transfer={operation:'source-bound-kubernetes-get-json-field-transform-apply',sourceReceiver:{apiVersion:'v1',kind:'Secret',resource:'secret',requestMethod:'GET',format:'json',name:'litellm-secrets',nameExpression:'litellm-secrets',namespaceExpression:'$NAMESPACE'},retainedRootFields:['apiVersion','kind','metadata','data','immutable','type'],excludedRootFields:['stringData'],removedPaths:[],rewrittenPaths:[{fieldPath:'$.data.DATABASE_URL',valueStatus:'source-derived-base64-of-selected-decoded-url-text'}],structuredTransforms,unknownLiveValues:true};
 const value={apiVersion:'v1',kind:'Secret',__docsDynamicExpression:fn[0].split('\n').filter(line=>line.includes('-o yaml |')||line.includes('-o json |')||line.trim().startsWith('sed \"')||line.trim().startsWith('jq --arg val ')||line.trim().startsWith('kubectl apply ')).join('\n'),__docsSupportedSchemaPassthrough:transfer};
 const getterLine=first+fn[0].split('\n').findIndex(line=>line.includes('kubectl get secret litellm-secrets')&&line.includes('-o json |'));
 const line=getterLine+1,context={apiVersion:'v1',kind:'Secret',path:source,line,document:line,producer:'shell-shape',profile:'inherited-live-secret-json-DATABASE_URL-transform',sourceDigest:hash(bytes),outputDigest:hash(JSON.stringify(value)),requestMethod:'APPLY',requestOperation:'kubectl-apply',requestInvocation:'kubectl apply -n "$NAMESPACE" -f -',requestConstructor:'rewrite_litellm_database_url_namespace',forwardedProducer:{qualified:true,path:source,line:getterLine,command:'kubectl',argv:['get','secret','litellm-secrets','-n','$NAMESPACE','-o','json'],constructorFunction:'rewrite_litellm_database_url_namespace',dependencies:[{path:source,sourceDigest:hash(bytes)}],structuredTransforms,liveResponse:'unexecuted; unknown source values and exact selected transform'}};
 const fact={role:'api',contract:'selected-live-core-Secret-GET-json-data-field-decode-text-rewrite-base64-jq-to-apply',dependencies:{[source]:hash(bytes)},outputs:sink.command==='jq'?[{value,context}]:[],selectedOperation:context.forwardedProducer};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

const finiteSecretChannelRecipes={"load_secret_key":{"body":"load_secret_key() {\n  local namespace=\"$1\"\n  local name=\"$2\"\n  local key=\"$3\"\n  local out_var=\"$4\"\n  local encoded\n\n  if encoded=$(kubectl get secret \"$name\" -n \"$namespace\" -o \"go-template={{ with index .data \\\"$key\\\" }}{{ . }}{{ end }}\" 2>&1); then\n    if [[ -z $encoded ]]; then\n      return 1\n    fi\n    printf -v \"$out_var\" '%s' \"$(printf '%s' \"$encoded\" | base64 -d)\"\n    return 0\n  fi\n\n  if is_not_found_error \"$encoded\"; then\n    return 1\n  fi\n\n  err \"Failed to read key '$key' from Secret '${namespace}/${name}'\"\n  echo \"$encoded\" >&2\n  return 2\n}","references":["load_secret_key() {","if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then","if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then","if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then","if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then","if ! load_secret_key \"$NAMESPACE\" postgresql-secrets litellm-password POSTGRES_LITELLM_PASSWORD; then","if ! load_secret_key \"$NAMESPACE\" postgresql-secrets litellm-password POSTGRES_LITELLM_PASSWORD; then"]},"patch_secret_literal":{"body":"patch_secret_literal() {\n  local namespace=\"$1\"\n  local name=\"$2\"\n  local key=\"$3\"\n  local value=\"$4\"\n  local encoded\n\n  encoded=\"$(printf '%s' \"$value\" | base64 -w0)\"\n  kubectl patch secret \"$name\" -n \"$namespace\" --type merge -p \"{\\\"data\\\":{\\\"$key\\\":\\\"$encoded\\\"}}\" >/dev/null\n}","references":["patch_secret_literal() {","patch_secret_literal \"$NAMESPACE\" \"$SECRET_NAME\" \"$key\" \"$value\"","patch_secret_literal \"$NAMESPACE\" redis-secrets redis-password \"$redis_password\"","patch_secret_literal \"$NAMESPACE\" postgresql-secrets postgres-password \"$postgres_password\"","patch_secret_literal \"$NAMESPACE\" postgresql-secrets litellm-password \"$litellm_password\"","patch_secret_literal \"$NAMESPACE\" litellm-secrets LITELLM_MASTER_KEY \"$litellm_master_key\"","patch_secret_literal \"$NAMESPACE\" litellm-secrets DATABASE_URL \"$database_url\"","patch_secret_literal \"$TAILSCALE_OPERATOR_NAMESPACE\" \"$TAILSCALE_OAUTH_SECRET_NAME\" client_id \"$client_id\"","patch_secret_literal \"$TAILSCALE_OPERATOR_NAMESPACE\" \"$TAILSCALE_OAUTH_SECRET_NAME\" client_secret \"$client_secret\""]},"patch_secret_file":{"body":"patch_secret_file() {\n  local namespace=\"$1\"\n  local name=\"$2\"\n  local key=\"$3\"\n  local path=\"$4\"\n  local encoded\n\n  encoded=\"$(base64 -w0 \"$path\")\"\n  kubectl patch secret \"$name\" -n \"$namespace\" --type merge -p \"{\\\"data\\\":{\\\"$key\\\":\\\"$encoded\\\"}}\" >/dev/null\n}","references":["patch_secret_file() {","patch_secret_file \"$NAMESPACE\" google-sa-key credentials.json \"$credentials_file\"","patch_secret_file \"$NAMESPACE\" \"$name\" id_rsa \"$key_file\""]},"sops_get":{"body":"sops_get() {\n  local key=\"$1\"\n  local err_file\n\n  err_file=\"$(mktemp)\"\n  TMP_FILES+=(\"$err_file\")\n  if sops --decrypt --extract \"[\\\"$key\\\"]\" \"$SOPS_FILE\" 2>\"$err_file\"; then\n    rm -f \"$err_file\"\n    return 0\n  fi\n\n  err \"Failed to read '$key' from SOPS file: $SOPS_FILE\"\n  if [[ -s $err_file ]]; then\n    sed 's/^/  /' \"$err_file\" >&2\n  fi\n  rm -f \"$err_file\"\n  return 1\n}","references":["sops_get() {","--from-literal=\"gatewayToken-forge=$(sops_get openclaw_gateway_token_forge)\"","--from-literal=\"gatewayToken-echo=$(sops_get openclaw_gateway_token_echo)\"","--from-literal=\"gatewayToken-buster=$(sops_get openclaw_gateway_token_buster)\"","--from-literal=\"busterV2Token=$(sops_get buster_v2_token)\"","--from-literal=\"gatewayToken-nova=$(sops_get openclaw_gateway_token_nova)\"","--from-literal=\"gatewayToken-prism=$(sops_get openclaw_gateway_token_prism 2>/dev/null || generate_secret_value)\"","--from-literal=\"discordToken-forge=$(sops_get forge_discord_secret)\"","--from-literal=\"discordToken-echo=$(sops_get echo_discord_secret)\"","--from-literal=\"discordToken-buster=$(sops_get buster_discord_secret)\"","--from-literal=\"discordToken-nova=$(sops_get nova_discord_secret)\"","--from-literal=\"discordWebhook=$(sops_get swarm_log_webhook)\"","kubectl_args+=(--from-literal=\"litellmApiKey=$(sops_get litellm_master_key)\")"]},"sops_get_first":{"body":"sops_get_first() {\n  local key\n  local err_file\n\n  for key in \"$@\"; do\n    err_file=\"$(mktemp)\"\n    TMP_FILES+=(\"$err_file\")\n    if sops --decrypt --extract \"[\\\"$key\\\"]\" \"$SOPS_FILE\" 2>\"$err_file\"; then\n      rm -f \"$err_file\"\n      return 0\n    fi\n    rm -f \"$err_file\"\n  done\n\n  err \"None of these keys were readable from SOPS file '$SOPS_FILE': $*\"\n  return 1\n}","references":["sops_get_first() {","--from-literal=\"stitchApiKey=$(sops_get_first stitch_api_key stitchApiKey)\""]},"generate_secret_value":{"body":"generate_secret_value() {\n  if command -v openssl >/dev/null 2>&1; then\n    openssl rand -hex 32\n    return 0\n  fi\n  head -c 32 /dev/urandom | base64 | tr -d '\\n'\n  echo \"\"\n}","references":["generate_secret_value() {","captured_value=\"$(generate_secret_value)\"","--from-literal=\"gatewayToken-prism=$(sops_get openclaw_gateway_token_prism 2>/dev/null || generate_secret_value)\"","litellm_api_key=\"$(generate_secret_value)\""]},"prompt_secret_or_generate":{"body":"prompt_secret_or_generate() {\n  local prompt=\"$1\"\n  local out_var=\"$2\"\n  local captured_value=\"\"\n\n  prompt_hidden \"$prompt (blank = generate)\" captured_value\n  if [[ -z $captured_value ]]; then\n    captured_value=\"$(generate_secret_value)\"\n    log \"Generated secret value for: $prompt\"\n  fi\n  printf -v \"$out_var\" '%s' \"$captured_value\"\n}","references":["prompt_secret_or_generate() {","prompt_secret_or_generate \"OpenClaw gateway token for Forge\" gateway_forge","prompt_secret_or_generate \"OpenClaw gateway token for Echo\" gateway_echo","prompt_secret_or_generate \"OpenClaw gateway token for Buster\" gateway_buster","prompt_secret_or_generate \"Buster v2 worker token\" buster_v2_token","prompt_secret_or_generate \"OpenClaw gateway token for Nova\" gateway_nova","prompt_secret_or_generate \"OpenClaw gateway token for Prism\" gateway_prism","prompt_secret_or_generate \"LiteLLM master key\" litellm_api_key","gatewayToken-forge) prompt_secret_or_generate \"OpenClaw gateway token for Forge\" value ;;","gatewayToken-echo) prompt_secret_or_generate \"OpenClaw gateway token for Echo\" value ;;","gatewayToken-buster) prompt_secret_or_generate \"OpenClaw gateway token for Buster\" value ;;","busterV2Token) prompt_secret_or_generate \"Buster v2 worker token\" value ;;","gatewayToken-nova) prompt_secret_or_generate \"OpenClaw gateway token for Nova\" value ;;","gatewayToken-prism) prompt_secret_or_generate \"OpenClaw gateway token for Prism\" value ;;","litellmApiKey) prompt_secret_or_generate \"LiteLLM master key\" value ;;","prompt_secret_or_generate \"Redis password\" redis_password","prompt_secret_or_generate \"Redis password\" redis_password","prompt_secret_or_generate \"PostgreSQL admin password\" postgres_password","prompt_secret_or_generate \"PostgreSQL litellm user password\" litellm_password","prompt_secret_or_generate \"PostgreSQL admin password\" postgres_password","prompt_secret_or_generate \"PostgreSQL litellm user password\" litellm_password","prompt_secret_or_generate \"LiteLLM master key\" litellm_master_key","prompt_secret_or_generate \"PostgreSQL litellm user password for LiteLLM DATABASE_URL\" litellm_password","prompt_secret_or_generate \"LiteLLM master key\" litellm_master_key","prompt_secret_or_generate \"PostgreSQL litellm user password for LiteLLM DATABASE_URL\" litellm_password"]},"create_shared_secret_from_sops":{"body":"create_shared_secret_from_sops() {\n  local kubectl_args\n  require_command sops\n  info \"Creating $SECRET_NAME from SOPS...\"\n\n  kubectl_args=(\n    create secret generic \"$SECRET_NAME\"\n    --namespace \"$NAMESPACE\"\n    --from-literal=\"gatewayToken-forge=$(sops_get openclaw_gateway_token_forge)\"\n    --from-literal=\"gatewayToken-echo=$(sops_get openclaw_gateway_token_echo)\"\n    --from-literal=\"gatewayToken-buster=$(sops_get openclaw_gateway_token_buster)\"\n    --from-literal=\"busterV2Token=$(sops_get buster_v2_token)\"\n    --from-literal=\"gatewayToken-nova=$(sops_get openclaw_gateway_token_nova)\"\n    --from-literal=\"gatewayToken-prism=$(sops_get openclaw_gateway_token_prism 2>/dev/null || generate_secret_value)\"\n    --from-literal=\"stitchApiKey=$(sops_get_first stitch_api_key stitchApiKey)\"\n    --from-literal=\"discordToken-forge=$(sops_get forge_discord_secret)\"\n    --from-literal=\"discordToken-echo=$(sops_get echo_discord_secret)\"\n    --from-literal=\"discordToken-buster=$(sops_get buster_discord_secret)\"\n    --from-literal=\"discordToken-nova=$(sops_get nova_discord_secret)\"\n    --from-literal=\"discordWebhook=$(sops_get swarm_log_webhook)\"\n  )\n\n  if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\"; then\n    kubectl_args+=(--from-literal=\"litellmApiKey=$(sops_get litellm_master_key)\")\n  fi\n  kubectl_args+=(--dry-run=client -o yaml)\n\n  kubectl \"${kubectl_args[@]}\" | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: $SECRET_NAME\"\n}","references":["create_shared_secret_from_sops() {","create_shared_secret_from_sops"]},"create_shared_secret_interactive":{"body":"create_shared_secret_interactive() {\n  local gateway_forge gateway_echo gateway_buster gateway_nova gateway_prism buster_v2_token\n  local stitch_api_key litellm_api_key\n  local discord_forge discord_echo discord_buster discord_nova discord_webhook\n\n  header \"Secret: ${NAMESPACE}/${SECRET_NAME}\"\n  info \"Paste required OpenClaw, model, Discord, and gateway values. Blank gateway/LiteLLM values are generated.\"\n\n  prompt_secret_or_generate \"OpenClaw gateway token for Forge\" gateway_forge\n  prompt_secret_or_generate \"OpenClaw gateway token for Echo\" gateway_echo\n  prompt_secret_or_generate \"OpenClaw gateway token for Buster\" gateway_buster\n  prompt_secret_or_generate \"Buster v2 worker token\" buster_v2_token\n  prompt_secret_or_generate \"OpenClaw gateway token for Nova\" gateway_nova\n  prompt_secret_or_generate \"OpenClaw gateway token for Prism\" gateway_prism\n  prompt_secret_required \"Stitch API key\" stitch_api_key\n  if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\"; then\n    prompt_secret_or_generate \"LiteLLM master key\" litellm_api_key\n  else\n    litellm_api_key=\"$(generate_secret_value)\"\n  fi\n  prompt_secret_required \"Discord bot token for Forge\" discord_forge\n  prompt_secret_required \"Discord bot token for Echo\" discord_echo\n  prompt_secret_required \"Discord bot token for Buster\" discord_buster\n  prompt_secret_required \"Discord bot token for Nova\" discord_nova\n  prompt_secret_required \"Discord webhook URL\" discord_webhook\n\n  kubectl create secret generic \"$SECRET_NAME\" \\\n    --namespace \"$NAMESPACE\" \\\n    --from-literal=\"gatewayToken-forge=$gateway_forge\" \\\n    --from-literal=\"gatewayToken-echo=$gateway_echo\" \\\n    --from-literal=\"gatewayToken-buster=$gateway_buster\" \\\n    --from-literal=\"busterV2Token=$buster_v2_token\" \\\n    --from-literal=\"gatewayToken-nova=$gateway_nova\" \\\n    --from-literal=\"gatewayToken-prism=$gateway_prism\" \\\n    --from-literal=\"stitchApiKey=$stitch_api_key\" \\\n    --from-literal=\"litellmApiKey=$litellm_api_key\" \\\n    --from-literal=\"discordToken-forge=$discord_forge\" \\\n    --from-literal=\"discordToken-echo=$discord_echo\" \\\n    --from-literal=\"discordToken-buster=$discord_buster\" \\\n    --from-literal=\"discordToken-nova=$discord_nova\" \\\n    --from-literal=\"discordWebhook=$discord_webhook\" \\\n    --dry-run=client -o yaml | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: ${NAMESPACE}/${SECRET_NAME}\"\n}","references":["create_shared_secret_interactive() {","create_shared_secret_interactive"]},"patch_shared_secret_interactive":{"body":"patch_shared_secret_interactive() {\n  local key value\n\n  header \"Secret keys: ${NAMESPACE}/${SECRET_NAME}\"\n  info \"Only missing keys will be added.\"\n\n  for key in \"$@\"; do\n    case \"$key\" in\n      gatewayToken-forge) prompt_secret_or_generate \"OpenClaw gateway token for Forge\" value ;;\n      gatewayToken-echo) prompt_secret_or_generate \"OpenClaw gateway token for Echo\" value ;;\n      gatewayToken-buster) prompt_secret_or_generate \"OpenClaw gateway token for Buster\" value ;;\n      busterV2Token) prompt_secret_or_generate \"Buster v2 worker token\" value ;;\n      gatewayToken-nova) prompt_secret_or_generate \"OpenClaw gateway token for Nova\" value ;;\n      gatewayToken-prism) prompt_secret_or_generate \"OpenClaw gateway token for Prism\" value ;;\n      stitchApiKey) prompt_secret_required \"Stitch API key\" value ;;\n      litellmApiKey) prompt_secret_or_generate \"LiteLLM master key\" value ;;\n      discordToken-forge) prompt_secret_required \"Discord bot token for Forge\" value ;;\n      discordToken-echo) prompt_secret_required \"Discord bot token for Echo\" value ;;\n      discordToken-buster) prompt_secret_required \"Discord bot token for Buster\" value ;;\n      discordToken-nova) prompt_secret_required \"Discord bot token for Nova\" value ;;\n      discordWebhook) prompt_secret_required \"Discord webhook URL\" value ;;\n      *)\n        err \"Unknown openclaw-shared-secrets key: $key\"\n        return 1\n        ;;\n    esac\n    patch_secret_literal \"$NAMESPACE\" \"$SECRET_NAME\" \"$key\" \"$value\"\n    log \"Added key: ${SECRET_NAME}/${key}\"\n  done\n}","references":["patch_shared_secret_interactive() {","patch_shared_secret_interactive \"${missing[@]}\""]},"setup_shared_secret":{"body":"setup_shared_secret() {\n  local required_keys\n  required_keys=(\n    gatewayToken-forge\n    gatewayToken-echo\n    gatewayToken-buster\n    busterV2Token\n    gatewayToken-nova\n    gatewayToken-prism\n    stitchApiKey\n    discordToken-forge\n    discordToken-echo\n    discordToken-buster\n    discordToken-nova\n    discordWebhook\n  )\n  local missing\n\n  if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\"; then\n    required_keys+=(litellmApiKey)\n  fi\n\n  if secret_exists \"$NAMESPACE\" \"$SECRET_NAME\" && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$NAMESPACE\" \"$SECRET_NAME\" \"${required_keys[@]}\")\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${NAMESPACE}/${SECRET_NAME}\"\n    elif interactive_enabled; then\n      warn \"Secret ${NAMESPACE}/${SECRET_NAME} exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      patch_shared_secret_interactive \"${missing[@]}\"\n    else\n      warn \"Secret ${NAMESPACE}/${SECRET_NAME} is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then\n      warn \"Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value.\"\n    fi\n    return 0\n  fi\n\n  if [[ -f $SOPS_FILE ]]; then\n    create_shared_secret_from_sops\n    if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then\n      warn \"Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value.\"\n    fi\n    return 0\n  fi\n\n  if copy_secret_from_source \"$SECRET_NAME\"; then\n    if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then\n      warn \"Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value.\"\n    fi\n    return 0\n  fi\n\n  if interactive_enabled; then\n    create_shared_secret_interactive\n    if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\" && ! load_secret_key \"$NAMESPACE\" \"$SECRET_NAME\" litellmApiKey SHARED_LITELLM_API_KEY; then\n      warn \"Secret ${NAMESPACE}/${SECRET_NAME} is missing litellmApiKey; LiteLLM setup may prompt or generate a separate value.\"\n    fi\n    return 0\n  fi\n\n  warn \"Missing required Secret: ${NAMESPACE}/${SECRET_NAME}\"\n  warn \"Run with KUBECLAW_SECRET_SETUP_MODE=interactive to paste values, or create/copy the Secret before deployment.\"\n}","references":["setup_shared_secret() {","setup_shared_secret"]},"setup_redis_secret":{"body":"setup_redis_secret() {\n  local redis_password\n  local missing\n\n  if secret_exists \"$NAMESPACE\" redis-secrets && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$NAMESPACE\" redis-secrets redis-password)\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${NAMESPACE}/redis-secrets\"\n    elif interactive_enabled; then\n      warn \"Secret ${NAMESPACE}/redis-secrets exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      prompt_secret_or_generate \"Redis password\" redis_password\n      patch_secret_literal \"$NAMESPACE\" redis-secrets redis-password \"$redis_password\"\n      log \"Added key: redis-secrets/redis-password\"\n    else\n      warn \"Secret ${NAMESPACE}/redis-secrets is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    return 0\n  fi\n  if copy_secret_from_source redis-secrets; then\n    return 0\n  fi\n  if ! interactive_enabled; then\n    warn \"Missing required Secret: ${NAMESPACE}/redis-secrets\"\n    return 0\n  fi\n\n  header \"Secret: ${NAMESPACE}/redis-secrets\"\n  prompt_secret_or_generate \"Redis password\" redis_password\n  kubectl create secret generic redis-secrets \\\n    --namespace \"$NAMESPACE\" \\\n    --from-literal=\"redis-password=$redis_password\" \\\n    --dry-run=client -o yaml | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: ${NAMESPACE}/redis-secrets\"\n}","references":["setup_redis_secret() {","setup_redis_secret"]},"setup_postgresql_secret":{"body":"setup_postgresql_secret() {\n  local postgres_password litellm_password\n  local missing key\n\n  if secret_exists \"$NAMESPACE\" postgresql-secrets && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$NAMESPACE\" postgresql-secrets postgres-password litellm-password)\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${NAMESPACE}/postgresql-secrets\"\n    elif interactive_enabled; then\n      warn \"Secret ${NAMESPACE}/postgresql-secrets exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      for key in \"${missing[@]}\"; do\n        case \"$key\" in\n          postgres-password)\n            prompt_secret_or_generate \"PostgreSQL admin password\" postgres_password\n            patch_secret_literal \"$NAMESPACE\" postgresql-secrets postgres-password \"$postgres_password\"\n            ;;\n          litellm-password)\n            prompt_secret_or_generate \"PostgreSQL litellm user password\" litellm_password\n            POSTGRES_LITELLM_PASSWORD=\"$litellm_password\"\n            patch_secret_literal \"$NAMESPACE\" postgresql-secrets litellm-password \"$litellm_password\"\n            ;;\n        esac\n        log \"Added key: postgresql-secrets/${key}\"\n      done\n    else\n      warn \"Secret ${NAMESPACE}/postgresql-secrets is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    if ! load_secret_key \"$NAMESPACE\" postgresql-secrets litellm-password POSTGRES_LITELLM_PASSWORD; then\n      warn \"Secret ${NAMESPACE}/postgresql-secrets is missing litellm-password; LiteLLM setup may prompt or generate a separate value.\"\n    fi\n    return 0\n  fi\n  if copy_secret_from_source postgresql-secrets; then\n    if ! load_secret_key \"$NAMESPACE\" postgresql-secrets litellm-password POSTGRES_LITELLM_PASSWORD; then\n      warn \"Secret ${NAMESPACE}/postgresql-secrets is missing litellm-password; LiteLLM setup may prompt or generate a separate value.\"\n    fi\n    return 0\n  fi\n  if ! interactive_enabled; then\n    warn \"Missing required Secret: ${NAMESPACE}/postgresql-secrets\"\n    return 0\n  fi\n\n  header \"Secret: ${NAMESPACE}/postgresql-secrets\"\n  prompt_secret_or_generate \"PostgreSQL admin password\" postgres_password\n  prompt_secret_or_generate \"PostgreSQL litellm user password\" litellm_password\n  POSTGRES_LITELLM_PASSWORD=\"$litellm_password\"\n  kubectl create secret generic postgresql-secrets \\\n    --namespace \"$NAMESPACE\" \\\n    --from-literal=\"postgres-password=$postgres_password\" \\\n    --from-literal=\"litellm-password=$litellm_password\" \\\n    --dry-run=client -o yaml | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: ${NAMESPACE}/postgresql-secrets\"\n}","references":["setup_postgresql_secret() {","setup_postgresql_secret"]},"setup_litellm_secret":{"body":"setup_litellm_secret() {\n  local litellm_master_key litellm_password database_url\n  local missing key\n\n  if secret_exists \"$NAMESPACE\" litellm-secrets && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$NAMESPACE\" litellm-secrets LITELLM_MASTER_KEY DATABASE_URL)\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${NAMESPACE}/litellm-secrets\"\n    elif interactive_enabled; then\n      warn \"Secret ${NAMESPACE}/litellm-secrets exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      for key in \"${missing[@]}\"; do\n        case \"$key\" in\n          LITELLM_MASTER_KEY)\n            if [[ -n $SHARED_LITELLM_API_KEY ]]; then\n              litellm_master_key=\"$SHARED_LITELLM_API_KEY\"\n              log \"Using LiteLLM master key from ${NAMESPACE}/${SECRET_NAME}: litellmApiKey\"\n            else\n              prompt_secret_or_generate \"LiteLLM master key\" litellm_master_key\n            fi\n            patch_secret_literal \"$NAMESPACE\" litellm-secrets LITELLM_MASTER_KEY \"$litellm_master_key\"\n            ;;\n          DATABASE_URL)\n            if ! component_enabled \"$KUBECLAW_DEPLOY_POSTGRESQL\"; then\n              prompt_secret_required \"LiteLLM DATABASE_URL\" database_url\n            elif [[ -n $POSTGRES_LITELLM_PASSWORD ]]; then\n              litellm_password=\"$POSTGRES_LITELLM_PASSWORD\"\n              log \"Using PostgreSQL litellm password from ${NAMESPACE}/postgresql-secrets\"\n              database_url=\"postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm\"\n            else\n              prompt_secret_or_generate \"PostgreSQL litellm user password for LiteLLM DATABASE_URL\" litellm_password\n              database_url=\"postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm\"\n            fi\n            patch_secret_literal \"$NAMESPACE\" litellm-secrets DATABASE_URL \"$database_url\"\n            ;;\n        esac\n        log \"Added key: litellm-secrets/${key}\"\n      done\n    else\n      warn \"Secret ${NAMESPACE}/litellm-secrets is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    return 0\n  fi\n  if copy_secret_from_source litellm-secrets; then\n    return 0\n  fi\n  if ! interactive_enabled; then\n    warn \"Missing required Secret: ${NAMESPACE}/litellm-secrets\"\n    return 0\n  fi\n\n  header \"Secret: ${NAMESPACE}/litellm-secrets\"\n  if [[ -n $SHARED_LITELLM_API_KEY ]]; then\n    litellm_master_key=\"$SHARED_LITELLM_API_KEY\"\n    log \"Using LiteLLM master key from ${NAMESPACE}/${SECRET_NAME}: litellmApiKey\"\n  else\n    prompt_secret_or_generate \"LiteLLM master key\" litellm_master_key\n  fi\n  if ! component_enabled \"$KUBECLAW_DEPLOY_POSTGRESQL\"; then\n    prompt_secret_required \"LiteLLM DATABASE_URL\" database_url\n  elif [[ -n $POSTGRES_LITELLM_PASSWORD ]]; then\n    litellm_password=\"$POSTGRES_LITELLM_PASSWORD\"\n    log \"Using PostgreSQL litellm password from ${NAMESPACE}/postgresql-secrets\"\n    database_url=\"postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm\"\n  else\n    prompt_secret_or_generate \"PostgreSQL litellm user password for LiteLLM DATABASE_URL\" litellm_password\n    database_url=\"postgresql://litellm:${litellm_password}@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm\"\n  fi\n  kubectl create secret generic litellm-secrets \\\n    --namespace \"$NAMESPACE\" \\\n    --from-literal=\"LITELLM_MASTER_KEY=$litellm_master_key\" \\\n    --from-literal=\"DATABASE_URL=$database_url\" \\\n    --dry-run=client -o yaml | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: ${NAMESPACE}/litellm-secrets\"\n}","references":["setup_litellm_secret() {","setup_litellm_secret"]},"setup_google_sa_key":{"body":"setup_google_sa_key() {\n  local credentials_file\n  local missing\n\n  if secret_exists \"$NAMESPACE\" google-sa-key && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$NAMESPACE\" google-sa-key credentials.json)\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${NAMESPACE}/google-sa-key\"\n    elif interactive_enabled; then\n      warn \"Secret ${NAMESPACE}/google-sa-key exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      prompt_file_or_paste \"Google service account JSON\" credentials_file\n      patch_secret_file \"$NAMESPACE\" google-sa-key credentials.json \"$credentials_file\"\n      log \"Added key: google-sa-key/credentials.json\"\n    else\n      warn \"Secret ${NAMESPACE}/google-sa-key is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    return 0\n  fi\n  if copy_secret_from_source google-sa-key; then\n    return 0\n  fi\n  if ! interactive_enabled; then\n    warn \"Missing required Secret: ${NAMESPACE}/google-sa-key\"\n    return 0\n  fi\n\n  header \"Secret: ${NAMESPACE}/google-sa-key\"\n  prompt_file_or_paste \"Google service account JSON\" credentials_file\n  kubectl create secret generic google-sa-key \\\n    --namespace \"$NAMESPACE\" \\\n    --from-file=\"credentials.json=$credentials_file\" \\\n    --dry-run=client -o yaml | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: ${NAMESPACE}/google-sa-key\"\n}","references":["setup_google_sa_key() {","setup_google_sa_key"]},"setup_git_deploy_key":{"body":"setup_git_deploy_key() {\n  local name=\"$1\"\n  local label=\"$2\"\n  local key_file\n  local missing\n\n  if secret_exists \"$NAMESPACE\" \"$name\" && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$NAMESPACE\" \"$name\" id_rsa)\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${NAMESPACE}/${name}\"\n    elif interactive_enabled; then\n      warn \"Secret ${NAMESPACE}/${name} exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      prompt_file_or_paste \"$label Git deploy private key\" key_file\n      patch_secret_file \"$NAMESPACE\" \"$name\" id_rsa \"$key_file\"\n      log \"Added key: ${name}/id_rsa\"\n    else\n      warn \"Secret ${NAMESPACE}/${name} is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    return 0\n  fi\n\n  if copy_secret_from_source \"$name\"; then\n    return 0\n  fi\n  if ! interactive_enabled; then\n    warn \"Missing required Secret: ${NAMESPACE}/${name}\"\n    return 0\n  fi\n\n  header \"Secret: ${NAMESPACE}/${name}\"\n  prompt_file_or_paste \"$label Git deploy private key\" key_file\n  kubectl create secret generic \"$name\" \\\n    --namespace \"$NAMESPACE\" \\\n    --from-file=\"id_rsa=$key_file\" \\\n    --dry-run=client -o yaml | kubectl apply -n \"$NAMESPACE\" -f - >/dev/null\n  log \"Created: ${NAMESPACE}/${name}\"\n}","references":["setup_git_deploy_key() {","setup_git_deploy_key git-deploy-key-nova Nova","setup_git_deploy_key git-deploy-key-buster Buster"]},"setup_tailscale_oauth_secret":{"body":"setup_tailscale_oauth_secret() {\n  local client_id=\"${TAILSCALE_OAUTH_CLIENT_ID:-}\"\n  local client_secret=\"${TAILSCALE_OAUTH_CLIENT_SECRET:-}\"\n  local missing key\n\n  if [[ \"$(normalize_boolish \"$TAILSCALE_OPERATOR_ENABLED\")\" == \"false\" ]]; then\n    warn \"Skipping Tailscale OAuth secret by TAILSCALE_OPERATOR_ENABLED=$TAILSCALE_OPERATOR_ENABLED\"\n    return 0\n  fi\n\n  if secret_exists \"$TAILSCALE_OPERATOR_NAMESPACE\" \"$TAILSCALE_OAUTH_SECRET_NAME\" && [[ \"$(normalize_boolish \"$SECRETS_OVERWRITE\")\" != \"true\" ]]; then\n    mapfile -t missing < <(secret_missing_keys \"$TAILSCALE_OPERATOR_NAMESPACE\" \"$TAILSCALE_OAUTH_SECRET_NAME\" client_id client_secret)\n    if [[ ${#missing[@]} == \"0\" ]]; then\n      log \"Using existing Secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}\"\n    elif interactive_enabled; then\n      warn \"Secret ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME} exists but is missing keys: $(join_by_comma \"${missing[@]}\")\"\n      for key in \"${missing[@]}\"; do\n        case \"$key\" in\n          client_id)\n            prompt_secret_required \"Tailscale OAuth client ID\" client_id\n            patch_secret_literal \"$TAILSCALE_OPERATOR_NAMESPACE\" \"$TAILSCALE_OAUTH_SECRET_NAME\" client_id \"$client_id\"\n            ;;\n          client_secret)\n            prompt_secret_required \"Tailscale OAuth client secret\" client_secret\n            patch_secret_literal \"$TAILSCALE_OPERATOR_NAMESPACE\" \"$TAILSCALE_OAUTH_SECRET_NAME\" client_secret \"$client_secret\"\n            ;;\n        esac\n        log \"Added key: ${TAILSCALE_OAUTH_SECRET_NAME}/${key}\"\n      done\n    else\n      warn \"Secret ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME} is missing keys: $(join_by_comma \"${missing[@]}\")\"\n    fi\n    return 0\n  fi\n\n  create_namespace_if_needed \"$TAILSCALE_OPERATOR_NAMESPACE\"\n\n  if [[ -n $client_id && -n $client_secret ]]; then\n    kubectl create secret generic \"$TAILSCALE_OAUTH_SECRET_NAME\" \\\n      --namespace \"$TAILSCALE_OPERATOR_NAMESPACE\" \\\n      --from-literal=client_id=\"$client_id\" \\\n      --from-literal=client_secret=\"$client_secret\" \\\n      --dry-run=client -o yaml | kubectl apply -f - >/dev/null\n    log \"Created: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}\"\n    return 0\n  fi\n\n  if copy_secret_from_source \"$TAILSCALE_OAUTH_SECRET_NAME\" \"$TAILSCALE_OPERATOR_NAMESPACE\"; then\n    log \"Copied: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}\"\n    return 0\n  fi\n\n  if ! interactive_enabled; then\n    warn \"Missing required Secret for final-preview Tailscale: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}\"\n    warn \"Run with KUBECLAW_SECRET_SETUP_MODE=interactive, set TAILSCALE_OAUTH_CLIENT_ID/SECRET, or pre-create it.\"\n    return 0\n  fi\n\n  header \"Secret: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}\"\n  prompt_secret_required \"Tailscale OAuth client ID\" client_id\n  prompt_secret_required \"Tailscale OAuth client secret\" client_secret\n  kubectl create secret generic \"$TAILSCALE_OAUTH_SECRET_NAME\" \\\n    --namespace \"$TAILSCALE_OPERATOR_NAMESPACE\" \\\n    --from-literal=client_id=\"$client_id\" \\\n    --from-literal=client_secret=\"$client_secret\" \\\n    --dry-run=client -o yaml | kubectl apply -f - >/dev/null\n  log \"Created: ${TAILSCALE_OPERATOR_NAMESPACE}/${TAILSCALE_OAUTH_SECRET_NAME}\"\n}","references":["setup_tailscale_oauth_secret() {","setup_tailscale_oauth_secret"]},"main":{"body":"main() {\n  local tailscale_secret_list\n\n  echo \"Setting up secrets for namespace: $NAMESPACE\"\n  echo \"\"\n\n  require_command kubectl\n  create_namespace_if_needed \"$NAMESPACE\"\n\n  if interactive_enabled; then\n    info \"Interactive secret setup enabled. Existing Secrets are reused unless KUBECLAW_SECRETS_OVERWRITE=true.\"\n  else\n    info \"Interactive secret setup disabled. Using SOPS/source copies/env bootstrap only.\"\n  fi\n\n  setup_shared_secret\n  setup_pipeline_source_attestation_secret\n  setup_redis_secret\n\n\n  if component_enabled \"$KUBECLAW_DEPLOY_POSTGRESQL\"; then\n    setup_postgresql_secret\n  else\n    warn \"Skipping optional postgresql-secrets by KUBECLAW_DEPLOY_POSTGRESQL=$KUBECLAW_DEPLOY_POSTGRESQL\"\n  fi\n\n  if component_enabled \"$KUBECLAW_DEPLOY_LITELLM\"; then\n    setup_litellm_secret\n    rewrite_litellm_database_url_namespace\n    setup_google_sa_key\n  else\n    warn \"Skipping optional LiteLLM/Google secrets by KUBECLAW_DEPLOY_LITELLM=$KUBECLAW_DEPLOY_LITELLM\"\n  fi\n\n  setup_ghcr_secret\n  setup_git_deploy_key git-deploy-key-nova Nova\n  setup_git_deploy_key git-deploy-key-buster Buster\n  setup_fixture_preflight_secret\n  setup_tailscale_oauth_secret\n\n  echo \"\"\n  log \"Done. Secrets in $NAMESPACE:\"\n  kubectl get secrets -n \"$NAMESPACE\" --no-headers | awk '{print \"  \" $1}'\n  echo \"\"\n  info \"Tailscale operator secrets in $TAILSCALE_OPERATOR_NAMESPACE:\"\n  if tailscale_secret_list=$(kubectl get secrets -n \"$TAILSCALE_OPERATOR_NAMESPACE\" --no-headers 2>&1); then\n    echo \"$tailscale_secret_list\" | awk '{print \"  \" $1}'\n  elif is_not_found_error \"$tailscale_secret_list\"; then\n    warn \"No Tailscale operator namespace found; operator install will be skipped unless the OAuth secret is created later.\"\n  else\n    err \"Failed to list Tailscale operator secrets in namespace '$TAILSCALE_OPERATOR_NAMESPACE'\"\n    echo \"$tailscale_secret_list\" >&2\n    return 1\n  fi\n}","references":["main() {","main \"$@\""]}};
function shellFiniteSecretChannelProof(root,source,bytes,sink){
 const selected=Object.entries(finiteSecretChannelRecipes).map(([name,recipe])=>{const fn=bytes.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`,'mu'));const refs=bytes.split('\n').filter(line=>new RegExp(`\\b${name}\\b`,'u').test(line)).map(line=>line.trim());return fn&&fn[0]===recipe.body&&JSON.stringify(refs)===JSON.stringify(recipe.references)?{name,fn,first:bytes.slice(0,fn.index).split('\n').length}:null;});
 // The selected functions include every actual caller of the credential read,
 // generation and encoding capabilities. Exact receiver programs qualify the
 // channel; a new caller, constructor, relay or diagnostic format revokes it.
 if(selected.some(fn=>!fn))return null;
 const enclosing=selected.find(fn=>sink.line>=fn.first&&sink.line<fn.first+fn.fn[0].split('\n').length);if(!enclosing)return null;
 const native=(contract,selectedOperation)=>{const fact={role:'non-api',contract,dependencies:{[source]:hash(bytes)},selectedOperation};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;};
 if(enclosing.name==='sops_get'&&sink.command==='sed'&&sink.args.join('|')==='s/^/  /|$err_file')return native('selected-SOPS-stderr-indentation-to-stderr-only; external-diagnostic-contract',{command:'sops',argv:['--decrypt','--extract','["$key"]','$SOPS_FILE'],receiver:'indented stderr; actual error temporary file removed; no authored resource body',runtimeOutcome:'unexecuted external decryption'});
 if(enclosing.name==='main'&&((sink.command==='awk'&&sink.args.join('|')==='{print "  " $1}')||(sink.command==='echo'&&sink.args.join('|')==='$tailscale_secret_list')))return native('selected-core-Secret-list-human-table-first-column-to-framed-name-summary',{command:'kubectl',argv:['get','secrets','-n',sink.line===enclosing.first+enclosing.fn[0].split('\n').findIndex(line=>line.includes('kubectl get secrets -n "$NAMESPACE"'))?'$NAMESPACE':'$TAILSCALE_OPERATOR_NAMESPACE','--no-headers'],receiver:'prefixed resource names only; no submitted Kubernetes body',liveValues:'unexecuted'});
 if(['load_secret_key','generate_secret_value'].includes(enclosing.name)&&['base64','head','tr','printf'].includes(sink.command)){
  const fact={role:'api',contract:'selected-credential-source-to-finite-Secret-data-constructor-input; no standalone raw publication',dependencies:{[source]:hash(bytes)},outputs:[],selectedOperation:{constructorFunction:enclosing.name,receivers:['selected typed Secret create or merge PATCH data','selected credential admission'],runtimeValues:'controlled or unknown; no live credentials executed'}};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
 }
 if(!['patch_secret_literal','patch_secret_file'].includes(enclosing.name)||!['base64','printf'].includes(sink.command))return null;
 const isFile=enclosing.name==='patch_secret_file',keys=isFile?['credentials.json','id_rsa']:['gatewayToken-forge','gatewayToken-echo','gatewayToken-buster','busterV2Token','gatewayToken-nova','gatewayToken-prism','stitchApiKey','litellmApiKey','discordToken-forge','discordToken-echo','discordToken-buster','discordToken-nova','discordWebhook','redis-password','postgres-password','litellm-password','LITELLM_MASTER_KEY','DATABASE_URL','client_id','client_secret'];
 const patchLine=enclosing.first+enclosing.fn[0].split('\n').findIndex(line=>line.includes('kubectl patch secret'));
 const outputs=keys.map((key,index)=>{const value={data:{[key]:Buffer.from('__docs_controlled_secret_payload__').toString('base64')}};return {value,context:{apiVersion:'v1',kind:'Secret',path:source,line:patchLine,document:index,producer:'shell-shape',profile:`selected-${enclosing.name}-${key}`,sourceDigest:hash(bytes),outputDigest:hash(JSON.stringify(value)),requestMethod:'PATCH',requestOperation:'kubectl-patch',requestPatchType:'merge',requestReceiver:{apiVersion:'v1',kind:'Secret',resource:'secret',name:'$name',nameExpression:'$2',namespaceExpression:'$namespace'},requestInvocation:'kubectl patch secret "$name" -n "$namespace" --type merge -p "{\\"data\\":{\\"$key\\":\\"$encoded\\"}}"',inputs:[{kind:'controlled-offline-credential-payload',sourceExpression:isFile?'base64 -w0 "$path"':'printf \'%s\' "$value" | base64 -w0',actualKey:key,liveValue:'unexecuted'}],forwardedProducer:{qualified:true,path:source,line:enclosing.first,command:'kubectl',argv:['patch','secret','$name','-n','$namespace','--type','merge','-p','{"data":{"$key":"$encoded"}}'],constructorFunction:enclosing.name,dependencies:[{path:source,sourceDigest:hash(bytes)}],callers:finiteSecretChannelRecipes[enclosing.name].references.slice(1),selectedKey:key,controlledValue:true}}};});
 const fact={role:'api',contract:'selected-finite-Secret-data-base64-to-actual-partial-merge-PATCH-receiver',dependencies:{[source]:hash(bytes)},outputs,selectedOperation:{constructorFunction:enclosing.name,requestMethod:'PATCH',patchType:'merge',keys,unknownLiveValues:true}};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

function discoverShellSelectedSecretArrays(root,source,bytes){
 const calls=[...bytes.matchAll(/\bkubectl\s+"\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}"/gu)];if(!calls.length)return [];
 assert(calls.length===1&&calls[0][1]==='kubectl_args',`API_PRODUCT_SHELL_KUBECTL_ARRAY_UNQUALIFIED: ${source}`);
 const fn=bytes.match(/^create_shared_secret_from_sops\(\) \{[\s\S]*?^\}/mu),recipe=finiteSecretChannelRecipes.create_shared_secret_from_sops;
 assert(fn&&fn[0]===recipe.body&&bytes.split('\n').filter(line=>/\bcreate_shared_secret_from_sops\b/u.test(line)).map(line=>line.trim()).join('\n')===recipe.references.join('\n'),`API_PRODUCT_SHELL_SECRET_ARRAY_FLOW_UNQUALIFIED: ${source}`);
 // The original selected array emits a credential body. Never execute SOPS,
 // randomness, an operator prompt, or kubectl apply during discovery.
 for(const name of ['sops_get','sops_get_first','generate_secret_value']){const found=bytes.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`,'mu'));assert(found?.[0]===finiteSecretChannelRecipes[name].body,`API_PRODUCT_SHELL_SECRET_ARRAY_INPUT_UNQUALIFIED: ${source}:${name}`);}
 const name=bytes.match(/^SECRET_NAME="([a-z0-9-]+)"$/mu)?.[1],namespace=bytes.match(/^NAMESPACE="\$\{NAMESPACE:-([a-z0-9-]+)\}"$/mu)?.[1];
 assert(name&&namespace&&(bytes.match(/\bSECRET_NAME\+?=/gu)??[]).length===1&&(bytes.match(/\bNAMESPACE\+?=/gu)??[]).length===1,`API_PRODUCT_SHELL_SECRET_ARRAY_IDENTITY_UNQUALIFIED: ${source}`);
 const keys=[...fn[0].matchAll(/--from-literal="([A-Za-z0-9._-]+)=/gu)].map(match=>match[1]),conditional=keys.pop(),line=bytes.slice(0,calls[0].index).split('\n').length;
 const version=spawnSync('kubectl',['version','--client=true','-o','json'],{encoding:'utf8'});assert.equal(version.status,0,`API_PRODUCT_SHELL_SECRET_ARRAY_TOOLCHAIN_FAILED: ${source}`);
 return [false,true].map(enabled=>{const selectedKeys=enabled?[...keys,conditional]:keys,argv=['create','secret','generic',name,'--namespace',namespace,...selectedKeys.map(key=>`--from-literal=${key}=__docs_controlled_secret_payload__`),'--dry-run=client','-o','json'];const rendered=spawnSync('kubectl',argv,{encoding:'utf8'});assert.equal(rendered.status,0,`API_PRODUCT_SHELL_SECRET_ARRAY_RENDER_FAILED: ${source}:${rendered.stderr}`);const value=JSON.parse(rendered.stdout);assert(value.apiVersion==='v1'&&value.kind==='Secret'&&Object.keys(value.data).sort().join('|')===selectedKeys.sort().join('|'),`API_PRODUCT_SHELL_SECRET_ARRAY_RENDER_INVALID: ${source}`);return {value,context:{apiVersion:'v1',kind:'Secret',path:source,line,document:enabled?1:0,producer:'shell-shape',profile:`selected-sops-shared-secret-litellm-${enabled}`,sourceDigest:hash(bytes),outputDigest:hash(JSON.stringify(value)),requestMethod:'APPLY',requestOperation:'kubectl-apply',requestInvocation:'kubectl "${kubectl_args[@]}" | kubectl apply -n "$NAMESPACE" -f -',conditions:[{expression:'component_enabled "$KUBECLAW_DEPLOY_LITELLM"',result:enabled}],inputs:[{kind:'controlled-offline-credential-payload',source:'actual finite SOPS keys or selected fallback randomness',liveValues:'unexecuted'}],forwardedProducer:{qualified:true,path:source,line,command:'kubectl',argv,sourceArgv:fn[0].match(/kubectl_args=\([\s\S]*?\n  \)/u)?.[0],wrapper:'${kubectl_args[@]}',constructorFunction:'create_shared_secret_from_sops',dependencies:[{path:source,sourceDigest:hash(bytes)}],toolchainDigest:hash(version.stdout),controlledValues:true,namespaceInput:{environment:'NAMESPACE',default:namespace}}}};});
}

// Finite owning Ops caller, not a node/python/tool-name allowlist. The full
// recipe fixes assignments, captures, cleanup, argv and output receivers;
// refreshing registry labels cannot qualify a changed caller through this path.
const selectedOpsDeployRecipe="#!/usr/bin/env bash\nset -euo pipefail\nrepo=$(cd \"$(dirname \"${BASH_SOURCE[0]}\")/..\" && pwd)\n: \"${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended cluster context}\"\nnamespace=${OPS_NAMESPACE:-kubeclaw-ops}\nrelease=${OPS_RELEASE:-codex-ops}\nk=(kubectl --context \"$KUBE_CONTEXT\")\npod=\"$release-0\"\ncase ${1:-help} in\n  deploy|render)\n    node \"$repo/scripts/updates/deployment-release.mjs\" verify \"$repo\" ops >/dev/null\n    export OPS_NAMESPACE=\"$namespace\" OPS_RELEASE=\"$release\"\n    temporary=$(mktemp -d)\n    trap 'rm -rf -- \"$temporary\"' EXIT\n    if [[ ${1:-} == render ]]; then\n      : \"${OPS_DISCOVERY_VALUES:?Set OPS_DISCOVERY_VALUES to an explicit discovery values file for local rendering}\"\n      cp -- \"$OPS_DISCOVERY_VALUES\" \"$temporary/discovered.json\"\n    else\n      python3 \"$repo/ops/pod/bootstrap.py\" discover > \"$temporary/discovered.json\"\n    fi\n    values=(-f \"$temporary/discovered.json\" -f \"$repo/releases/values/ops.yaml\")\n    if [[ -n ${OPS_POD_VALUES:-} ]]; then values+=(-f \"$OPS_POD_VALUES\"); fi\n    [[ -z ${OPS_CODEX_IMAGE:-} ]] || values+=(--set-string \"codexImage=$OPS_CODEX_IMAGE\")\n    [[ -z ${OPS_MCP_IMAGE:-} ]] || values+=(--set-string \"mcpImage=$OPS_MCP_IMAGE\")\n    if [[ -n ${OPS_GITHUB_TOKEN_FILE:-} ]]; then values+=(--set-string githubSecret=codex-ops-github); fi\n    if [[ -n ${OPS_TAILSCALE_AUTHKEY_FILE:-} ]]; then values+=(--set tailscale.enabled=true); fi\n    # Validate the full render before creating namespaces or credentials.\n    node \"$repo/scripts/updates/deployment-release.mjs\" render \"$repo\" ops ops \"$release\" \"$namespace\" \\\n      \"--discovery=$temporary/discovered.json\" -- \"${values[@]}\" > \"$temporary/rendered.yaml\"\n    if [[ ${1:-} == render ]]; then cat \"$temporary/rendered.yaml\"; exit 0; fi\n    \"${k[@]}\" create namespace \"$namespace\" --dry-run=client -o yaml | \"${k[@]}\" apply -f -\n    python3 \"$repo/ops/pod/bootstrap.py\" secrets\n    helm upgrade --install \"$release\" \"$repo/charts/ops-pod\" --kube-context \"$KUBE_CONTEXT\" \\\n      --namespace \"$namespace\" \"${values[@]}\" --history-max 5\n    echo \"Deployed. Run: $0 login; $0 github-login; $0 pair; $0 verify\"\n    echo 'No redeploy is needed after authentication/pairing. Readiness waits for Codex login.'\n    ;;\n  login) \"${k[@]}\" -n \"$namespace\" exec -it \"$pod\" -c codex -- codex login --device-auth ;;\n  github-login)\n    \"${k[@]}\" -n \"$namespace\" exec -it \"$pod\" -c codex -- gh auth login --hostname github.com --git-protocol https --web\n    ;;\n  pair) \"${k[@]}\" -n \"$namespace\" exec -it \"$pod\" -c codex -- codex remote-control pair ;;\n  shell) \"${k[@]}\" -n \"$namespace\" exec -it \"$pod\" -c codex -- bash /opt/codex/shell.sh ;;\n  status)\n    \"${k[@]}\" -n \"$namespace\" get pod \"$pod\" -o wide\n    \"${k[@]}\" -n \"$namespace\" exec \"$pod\" -c codex -- cat /tmp/codex-ops-status.json\n    ;;\n  verify)\n    \"${k[@]}\" -n \"$namespace\" exec -i \"$pod\" -c codex -- python3 - < \"$repo/ops/pod/verify.py\"\n    # Negative control uses the MCP's REAL mounted observer token. Only a 403\n    # counts as success; missing files, network failure and 401 fail the check.\n    \"${k[@]}\" -n \"$namespace\" exec \"$pod\" -c ops-mcp -- node --input-type=module -e \\\n      'import {createKubeRequest} from \"/app/src/kubernetes.mjs\"; try {await createKubeRequest()(\"/api/v1/namespaces/\" + encodeURIComponent(process.env.OPS_DEFAULT_NAMESPACE) + \"/secrets\");process.exit(1)} catch(e) {if(!e.message.includes(\"Kubernetes API 403:\"))throw e; console.log(\"PASS: observer Secret access denied by API\");}'\n    ;;\n  *) echo \"Usage: $0 deploy|render|login|github-login|pair|shell|status|verify\"; exit 1 ;;\nesac\n";
const selectedOpsDeployOperations=[{"line":3,"command":"dirname","args":["${BASH_SOURCE[0]}"],"channel":"command-substitution"},{"line":3,"command":"pwd","args":[],"channel":"command-substitution"},{"line":13,"command":"mktemp","args":["-d"],"channel":"command-substitution"},{"line":11,"command":"node","args":["$repo/scripts/updates/deployment-release.mjs","verify","$repo","ops"]},{"line":19,"command":"python3","args":["$repo/ops/pod/bootstrap.py","discover"]},{"line":28,"command":"node","args":["$repo/scripts/updates/deployment-release.mjs","render","$repo","ops","ops","$release","$namespace","--discovery=$temporary/discovered.json","--","${values[@]}"]},{"line":32,"command":"python3","args":["$repo/ops/pod/bootstrap.py","secrets"]}];
const selectedOpsAuthShellRecipe="#!/usr/bin/env bash\n# kubectl exec does not inherit the supervisor's child-process environment.\nset -euo pipefail\nKUBECLAW_MCP_TOKEN=$(cat /var/run/kubeclaw-ops/bearer/token)\nif (( ${#KUBECLAW_MCP_TOKEN} < 32 )); then\n  echo 'MCP bearer is missing or too short; check the mounted Secret' >&2\n  exit 1\nfi\nexport KUBECLAW_MCP_TOKEN\nexec bash \"$@\"\n";
function shellSelectedOpsChildProof(root,source,bytes,sink) {
 const save=(role,contract,dependencies,selectedOperation)=>{
  if(dependencies.some(file=>!fs.existsSync(path.join(root,file))))return null;
  const fact={role,contract,dependencies:Object.fromEntries([source,...dependencies].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),outputs:[],selectedOperation};
  namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
 };
 if(source==='ops/pod/shell.sh'&&bytes===selectedOpsAuthShellRecipe&&sink.line===10&&sink.command==='bash'&&JSON.stringify(sink.args)==='["$@"]'){
  const input=shellRawOutputSinks(source,bytes).find(item=>item.command==='cat'&&item.args[0]==='/var/run/kubeclaw-ops/bearer/token');
  if(!input||!shellNamedFileProof(root,source,bytes,input))return null;
  return save('non-api','selected-authenticated-interactive-bash; user-supplied-commands-outside-authored-source',['ops/pod/bootstrap.py','charts/ops-pod/templates/workload.yaml'],{command:'bash',argv:sink.args,receiver:'interactive operator session; not an authored manifest emitter',runtimeOutcome:'unexecuted'});
 }
 if(source!=='scripts/deploy-ops-pod.sh'||bytes!==selectedOpsDeployRecipe||!selectedOpsDeployOperations.some(operation=>operation.line===sink.line&&operation.command===sink.command&&operation.channel===sink.channel&&JSON.stringify(operation.args)===JSON.stringify(sink.args)))return null;
 if(sink.line===3||sink.line===13)return save('non-api',sink.line===3?'selected-BASH_SOURCE-repository-path-capture':'selected-private-temporary-directory-capture-with-EXIT-cleanup',[],{command:sink.command,argv:sink.args,receiver:sink.line===3?'unique repo assignment; no direct publication':'unique temporary assignment; discovered.json and rendered.yaml; EXIT rm -rf',runtimeOutcome:'unexecuted'});
 const renderer='scripts/updates/deployment-release.mjs';
 const releaseDependencies=['scripts/updates/materialize-release.mjs','scripts/updates/release-configuration.mjs','scripts/updates/code-release.mjs','scripts/updates/runtime-inputs.mjs'];
 if(sink.command==='node'){
  assertProducerAdapterAuthority(root,[source,renderer]);
  if(sink.line===11)return save('non-api','selected-release-verify-stdout-discarded; not-read-only-or-execution-exempt',[renderer,...releaseDependencies],{command:renderer,argv:sink.args.slice(1),receiver:'/dev/null',effects:'check dispatcher can mkdir releases/values and capture git validation; runtime UNRUN'});
  // Delegate the actual API output to the existing render-to-cat proof. Store
  // no duplicate documents here: its cat fact is emitted by the same walk.
  const cat=shellRawOutputSinks(source,bytes).find(item=>item.line===30&&item.command==='cat');
  if(!cat||!shellReleaseFileProof(root,source,bytes,cat))return null;
  return save('api','selected-release-render-API-YAML-to-qualified-cat; not-native-scalar',[renderer,...releaseDependencies],{command:renderer,argv:sink.args.slice(1),receiver:'temporary/rendered.yaml then line30 cat',requiredDiscovery:'same-source line30 release-file proof'});
 }
 const child='ops/pod/bootstrap.py';
 // Existing full bootstrap audit binds discover/config-info, secrets API
 // submissions and diagnostic flows. The complete Python discovery walk must
 // still collect the real submissions; this shell delegation emits no guesses.
 assertNativeSerializationRoles(root,child,fs.readFileSync(path.join(root,child),'utf8'),'Python');
 return save(sink.line===19?'non-api':'api',sink.line===19?'selected-bootstrap-discover-private-config-info-to-Helm-values':'selected-bootstrap-secrets-API-submission-and-fixed-diagnostic; child-discovery-required',[child],{command:child,argv:sink.args.slice(1),receiver:sink.line===19?'temporary/discovered.json then audited Helm values':'audited credential submissions and fixed diagnostic',requiredDiscovery:child,runtimeOutcome:'unexecuted'});
}

function shellDynamicOperationProof(root,source,bytes,sink) {
 const selectedOps=shellSelectedOpsChildProof(root,source,bytes,sink);if(selectedOps)return selectedOps;
 const secretChannel=shellFiniteSecretChannelProof(root,source,bytes,sink);if(secretChannel)return secretChannel;
 const inheritedJsonSecret=shellInheritedSecretJsonFieldProof(root,source,bytes,sink);if(inheritedJsonSecret)return inheritedJsonSecret;
 const maintenanceFile=shellNativeMaintenanceFileProof(root,source,bytes,sink);if(maintenanceFile)return maintenanceFile;
 const inheritedSecret=shellInheritedSerializedSecretProof(root,source,bytes,sink);if(inheritedSecret)return inheritedSecret;
 const postgresMetadata=shellNativePostgresMetadataProof(root,source,bytes,sink);if(postgresMetadata)return postgresMetadata;
 const watchdogStatus=shellNativeWatchdogStatusProof(root,source,bytes,sink);if(watchdogStatus)return watchdogStatus;
 const nativeExecutable=shellFiniteNativeExecutableProof(root,source,bytes,sink);if(nativeExecutable)return nativeExecutable;
 const nativePolicy=shellNativePolicyValidationProof(root,source,bytes,sink);if(nativePolicy)return nativePolicy;
 if(sink.command==='$node'&&sink.args.join('|')===`-e|const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1])); if(p.nodeVersion!==process.versions.node) throw Error("Selected host Node version mismatch")|$generated/native-node-policy.json`&&/^node=\/usr\/local\/bin\/node$/mu.test(bytes)&&(bytes.match(/\bnode\+?=/gu)??[]).length===1){
  const fact={role:'non-api',contract:'selected-native-policy-nodeVersion-read-to-fixed-runtime-mismatch-diagnostic; no-public-JSON-output',dependencies:{[source]:hash(bytes)},selectedOperation:{command:'/usr/local/bin/node',argv:sink.args,receiver:'nodeVersion equality with selected host runtime',inputRole:'native-node-policy.json',publicOutput:'fixed error only'}};
  namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
 }
 if(sink.command==='$helper'&&sink.args.length===0){
  const selected=/run_secret_setup\(\)\s*\{\s*local helper="\$VALUES_DIR\/setup-secrets\.sh"([\s\S]*?)\n\}/u.exec(bytes);
  const recipe=`if [[ ! -x $helper ]]; then\n    err "Secret setup helper is not executable: $helper"\n    info "Run: chmod +x $helper"\n    return 1\n  fi\n\n  "$helper"`;
  if(!selected||selected[1].trim()!==recipe||source.split('/').length!==2||!bytes.includes('SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"')||!bytes.includes('REPO_DIR="$(dirname "$SCRIPT_DIR")"')||!bytes.includes('VALUES_DIR="$REPO_DIR/my-values"')||['SCRIPT_DIR','REPO_DIR','VALUES_DIR'].some(name=>(bytes.match(new RegExp(`\\b${name}\\+?=`,'gu'))??[]).length!==1))return null;
  const first=bytes.slice(0,selected.index).split('\n').length;if(sink.line<first||sink.line>first+selected[0].split('\n').length-1)return null;
  const child='my-values/setup-secrets.sh';
  if(!walkProductSources(root,producerRoots,file=>file.endsWith('.sh')).includes(child))return null;
  // This delegates to a tracked member of the same mandatory discovery walk.
  // It neither blesses child stdout as native nor substitutes a guessed body:
  // the complete walk must still qualify every child sink and API constructor.
  const fact={role:'api',contract:'selected-tracked-secret-setup-delegation; child-output-qualification-required',dependencies:{[source]:hash(bytes),[child]:hash(fs.readFileSync(path.join(root,child)))},outputs:[],selectedOperation:{command:child,argv:[],receiver:'tracked-child-public-outputs-and-submissions',requiredDiscovery:child}};
  namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
 }
 const alias=sink.command.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}$/u)?.[1];
 if(!alias)return null;
 const assignments=[...bytes.matchAll(new RegExp(`^\\s*${alias}=\\(([^\\n]*)\\)\\s*$`,'gmu'))];
 if(assignments.length!==1||!['kubectl --context "$KUBE_CONTEXT"','kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw'].includes(assignments[0][1])||(bytes.match(new RegExp(`\\b${alias}\\+?=`,'gu'))??[]).length!==1)return null;
 const lines=bytes.split('\n'),line=lines[sink.line-1]?.trim()??'';
 if(assignments[0][1]==='kubectl --context "$KUBE_CONTEXT" --namespace kubeclaw'){
  const signature=sink.args.join('|'),prefix=`"\${${alias}[@]}"`;
  const native=(contract,receiver)=>{const fact={role:'non-api',contract,dependencies:{[source]:hash(bytes)},selectedOperation:{wrapper:assignments[0][0].trim(),command:'kubectl',argv:sink.args,namespace:'kubeclaw',receiver}};namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;};
  const exports={'get|pvc|data-postgresql-0|-o|json':'pvc.json','get|statefulset|postgresql|-o|json':'statefulset.json'};
  if(exports[signature]){
   const receiver=`$backup/${exports[signature]}`;
   if(bytes.includes('umask 077')&&bytes.includes('backup=$(mktemp -d "${HOME}/postgresql-before-upgrade.XXXXXX")')&&line===`${prefix} ${sink.args.join(' ')} > "${receiver}"`&&bytes.split(receiver).length===2)return native('selected-read-only-kubernetes-JSON-response-to-private-backup; no-authored-resource-body',{path:receiver,role:'private-recovery-export',format:'json'});
  }
  if(signature==='get|pvc|-o|json'){
   const receiver='$inventory/claims.json';
   const projector=`import json, sys\nwith open(sys.argv[1]) as stream:\n    claims = json.load(stream)['items']\nfor claim in claims:\n    m = claim['metadata']\n    labels = m.get('labels', {})\n    known = m['name'] in ('qdrant-storage-qdrant-0', 'qdrant-snapshots-qdrant-0')\n    owned = (labels.get('app.kubernetes.io/instance') == 'qdrant'\n             and labels.get('app.kubernetes.io/name', labels.get('app')) == 'qdrant')\n    if known or owned:\n        print(m['name'], m['uid'], claim['spec'].get('volumeName', '-'), sep='\\t')`;
   if(bytes.includes('umask 077')&&bytes.includes('inventory=$(mktemp -d)')&&line===`${prefix} get pvc -o json > "${receiver}"`&&bytes.split(receiver).length===4&&bytes.includes(`trap 'rm -f "$inventory/claims.json" "$inventory/claims.tsv"; rmdir "$inventory"' EXIT`)&&bytes.includes(`python3 - "${receiver}" > "$inventory/claims.tsv" <<'PY'\n${projector}\nPY`))return native('selected-read-only-PVC-inventory-to-owned-claim-TSV; no-authored-resource-body',{path:receiver,consumer:'owned-claim-and-volume-identity-projection',fields:['metadata.name','metadata.uid','metadata.labels','spec.volumeName']});
  }
  if(signature===['exec','postgresql-0','-c','postgresql','--','sh','-ec',privatePostgresDumpRecipe].join('|')&&bytes.includes('umask 077')&&bytes.includes('backup=$(mktemp -d "${HOME}/postgresql-before-upgrade.XXXXXX")')&&bytes.includes(`' > "$backup/cluster.sql.partial"`)&&bytes.split('$backup/cluster.sql.partial').length===5&&bytes.includes('test -s "$backup/cluster.sql.partial"')&&bytes.includes("grep -q '^-- PostgreSQL database cluster dump complete' \"$backup/cluster.sql.partial\""))return native('selected-read-only-pg_dumpall-to-private-SQL-backup; no-Kubernetes-resource-constructor',{path:'$backup/cluster.sql.partial',role:'private-database-recovery-export',format:'SQL',credentialInput:'selected password file to PGPASSWORD only'});
  if(signature==='exec|-i|postgresql-0|-c|postgresql|--|sh|-es|<<|REMOTE'&&bytes.includes(`<<'REMOTE'\n${postgresMetadataQueryRecipe}\nREMOTE`))return native('selected-read-only-PostgreSQL-version-slot-extension-index-metadata-to-framed-CLI-output',{role:'read-only-database-metadata',queries:'source-defined finite SQL programs',credentialInput:'selected password file to PGPASSWORD only',liveOutcome:'unexecuted'});
  const deletions=new Set(['delete|statefulset|qdrant|--ignore-not-found|--wait=true','delete|service|qdrant|qdrant-headless|--ignore-not-found','delete|secret|qdrant-auth|qdrant-tls|--ignore-not-found','delete|networkpolicy|kubeclaw-qdrant-ingress|--ignore-not-found','delete|ciliumnetworkpolicy|kubeclaw-qdrant-ingress|--ignore-not-found']);
  if(deletions.has(signature)&&line===`${prefix} ${sink.args.join(' ')}`&&bytes.includes('[[ ${1:-} == --delete-data && $# == 1 ]]'))return native('selected-explicit-retirement-command-to-kubectl-deletion-status; no-authored-resource-body',{role:'native-deletion-status',liveOutcome:'unexecuted'});
  if(signature==='delete|pvc|$claim|--ignore-not-found|--wait=true|--timeout=180s'&&line===`${prefix} delete pvc "$claim" --ignore-not-found --wait=true --timeout=180s`&&bytes.includes('[[ ${1:-} == --delete-data && $# == 1 ]]')&&bytes.includes("while IFS=$'\\t' read -r claim uid volume; do")&&bytes.split('$inventory/claims.tsv').length===5){
   const getter=shellRawOutputSinks(source,bytes).find(item=>item.command===sink.command&&item.args.join('|')==='get|pvc|-o|json');
   if(getter&&shellDynamicOperationProof(root,source,bytes,getter))return native('selected-owned-claim-inventory-to-explicit-PVC-retirement-status; no-authored-resource-body',{role:'native-deletion-status',identityExpression:'claim from selected PVC metadata.name projection',liveOutcome:'unexecuted'});
  }
  return null;
 }
 const namespace=sink.args[0]==='create'?sink.args[2]?.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1]:sink.args[0]==='-n'?sink.args[1]?.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1]:line.match(/create namespace "\$([A-Za-z_][A-Za-z0-9_]*)"/u)?.[1];
 if(!namespace)return null;
 const defaults=[...bytes.matchAll(new RegExp(`^${namespace}=\\$\\{([A-Z_][A-Z0-9_]*):-([a-z0-9][a-z0-9-]*)\\}$`,'gmu'))];
 if(defaults.length!==1||(bytes.match(new RegExp(`\\b${namespace}\\+?=`,'gu'))??[]).length!==1)return null;
 const native=(contract,dependencies=[])=>{
  if(dependencies.some(file=>!fs.existsSync(path.join(root,file))))return null;
  const fact={role:'non-api',contract,dependencies:Object.fromEntries([source,...dependencies].map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),selectedOperation:{wrapper:assignments[0][0].trim(),command:'kubectl',argv:sink.args,namespaceInput:{environment:defaults[0][1],default:defaults[0][2]}}};
  namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
 };
 if(sink.args[0]==='-n'){
  const pod=sink.args[sink.args[2]==='get'||sink.args[2]==='exec'&&sink.args[3]?.startsWith('-')?4:3]?.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1];
  if(!pod)return null;
  const podDefinition=bytes.match(new RegExp(`^${pod}="\\$([A-Za-z_][A-Za-z0-9_]*)-0"$`,'mu'));
  const release=podDefinition?.[1];
  if(!release||!(new RegExp(`^${release}=\\$\\{[A-Z_][A-Z0-9_]*:-[a-z0-9][a-z0-9-]*\\}$`,'mu')).test(bytes)||(bytes.match(new RegExp(`\\b${pod}\\+?=`,'gu'))??[]).length!==1||(bytes.match(new RegExp(`\\b${release}\\+?=`,'gu'))??[]).length!==1)return null;
  const signature=sink.args.slice(2).join('|');
  if(signature===`get|pod|$${pod}|-o|wide`)return native('selected-kubectl-pod-wide-human-readable-status; external-table-contract');
  const dockerfile='ops/pod/Dockerfile',packageFile='ops/pod/package-lock.json';
  if(!fs.existsSync(path.join(root,dockerfile)))return null;
  const imageSource=fs.readFileSync(path.join(root,dockerfile),'utf8');
  const sessions=[`exec|-it|$${pod}|-c|codex|--|codex|login|--device-auth`,`exec|-it|$${pod}|-c|codex|--|gh|auth|login|--hostname|github.com|--git-protocol|https|--web`,`exec|-it|$${pod}|-c|codex|--|codex|remote-control|pair`];
  if(sessions.includes(signature)&&imageSource.includes('ln -s /opt/codex/node_modules/.bin/codex /usr/local/bin/codex')&&imageSource.includes('COPY --from=gh-build /out/gh /usr/local/bin/gh'))return native('selected-native-authentication-or-pairing-session; external-CLI-contract; no-live-success-proof',[dockerfile,packageFile]);
  if(signature===`exec|-it|$${pod}|-c|codex|--|bash|/opt/codex/shell.sh`&&imageSource.includes('COPY supervisor.py config.toml shell.sh /opt/codex/')){
   const script='ops/pod/shell.sh';if(!fs.existsSync(path.join(root,script)))return null;
   const text=fs.readFileSync(path.join(root,script),'utf8'),input=shellRawOutputSinks(script,text).find(item=>item.command==='cat'&&item.args[0]==='/var/run/kubeclaw-ops/bearer/token');
   if(input&&shellNamedFileProof(root,script,text,input))return native('selected-mounted-auth-shell; subsequent-interactive-input-outside-authored-source',[dockerfile,script,'ops/pod/bootstrap.py','charts/ops-pod/templates/workload.yaml']);
  }
  if(signature===`exec|$${pod}|-c|codex|--|cat|/tmp/codex-ops-status.json`&&imageSource.includes('COPY supervisor.py config.toml shell.sh /opt/codex/')){
   const script='ops/pod/supervisor.py';if(!fs.existsSync(path.join(root,script)))return null;
   const text=fs.readFileSync(path.join(root,script),'utf8');
   if(text.includes("state_file = Path('/tmp/codex-ops-status.json')")&&text.includes('temp.replace(state_file)')){assertNativeSerializationRoles(root,script,text,'Python');return native('selected-supervisor-native-status-file; source-bound-serializer-and-callers',[dockerfile,script]);}
  }
  if(signature===`exec|-i|$${pod}|-c|codex|--|python3|-`&&line.endsWith('< "$repo/ops/pod/verify.py"')){
   const script='ops/pod/verify.py';if(!fs.existsSync(path.join(root,script)))return null;
   assertNativeSerializationRoles(root,script,fs.readFileSync(path.join(root,script),'utf8'),'Python');return native('selected-read-only-MCP-verifier; source-bound-serializer-and-callers',[script]);
  }
  const diagnostic='import {createKubeRequest} from "/app/src/kubernetes.mjs"; try {await createKubeRequest()("/api/v1/namespaces/" + encodeURIComponent(process.env.OPS_DEFAULT_NAMESPACE) + "/secrets");process.exit(1)} catch(e) {if(!e.message.includes("Kubernetes API 403:"))throw e; console.log("PASS: observer Secret access denied by API");}';
  if(signature===`exec|$${pod}|-c|ops-mcp|--|node|--input-type=module|-e|${diagnostic}`)return native('selected-403-negative-control-to-fixed-diagnostic; unexpected-response-is-failure',['tools/ops-mcp/src/kubernetes.mjs']);
  return null;
 }
 const invocation=`"\${${alias}[@]}" create namespace "$${namespace}" --dry-run=client -o yaml | "\${${alias}[@]}" apply -f -`;
 if(line!==invocation||!((sink.args.join('|')===`create|namespace|$${namespace}|--dry-run=client|-o|yaml`)||(sink.args.join('|')==='apply|-f|-')))return null;
 const selectedNamespace=defaults[0][2];
 const render=spawnSync('kubectl',['create','namespace',selectedNamespace,'--dry-run=client','-o','json'],{encoding:'utf8'});
 assert.equal(render.status,0,`API_PRODUCT_DYNAMIC_NAMESPACE_RENDER_FAILED: ${source}:${sink.line}: ${render.stderr}`);
 let value;try{value=JSON.parse(render.stdout);}catch{assert.fail(`API_PRODUCT_DYNAMIC_NAMESPACE_RENDER_INVALID: ${source}:${sink.line}`);}
 assert(value?.apiVersion==='v1'&&value?.kind==='Namespace'&&value.metadata?.name===selectedNamespace,`API_PRODUCT_DYNAMIC_NAMESPACE_RENDER_IDENTITY: ${source}:${sink.line}`);
 const version=spawnSync('kubectl',['version','--client=true','-o','json'],{encoding:'utf8'});
 assert.equal(version.status,0,`API_PRODUCT_DYNAMIC_NAMESPACE_TOOLCHAIN_FAILED: ${source}`);
 const context={apiVersion:value.apiVersion,kind:value.kind,path:source,line:sink.line,document:0,sourceDigest:hash(bytes),producer:'shell-shape',profile:'dynamic-kubectl-namespace-default',requestOperation:'kubectl-apply',requestInvocation:invocation,forwardedProducer:{path:source,command:'kubectl',argv:['create','namespace',selectedNamespace,'--dry-run=client','-o','yaml'],wrapper:assignments[0][0].trim(),namespaceInput:{environment:defaults[0][1],default:selectedNamespace},toolchainDigest:hash(version.stdout)},outputDigest:hash(JSON.stringify(value))};
 const fact={role:'api',contract:'selected-kubectl-client-namespace-constructor-to-apply',dependencies:{[source]:hash(bytes)},outputs:[{value,context}]};
 namedShellChannelFacts.set(`${root}:${source}:${sink.line}`,fact);return fact;
}

function shellOutputConsumerMatches(root,source,bytes,sink,consumer) {
 if(consumer.source!==source||consumer.line!==sink.line||consumer.command!==sink.command||consumer.argumentsDigest!==hash(JSON.stringify(sink.args))||!consumer.purpose||typeof consumer.sourceEvidence!=='string'||!consumer.sourceEvidence)return false;
 // Consumer evidence is executable source context, not a free-standing role
 // label. It must still cover the actual selected command at its source line.
 let found=false;
 for(let offset=bytes.indexOf(consumer.sourceEvidence);offset>=0;offset=bytes.indexOf(consumer.sourceEvidence,offset+1)){
  const first=bytes.slice(0,offset).split('\n').length,last=first+consumer.sourceEvidence.split('\n').length-1;
  if(first<=sink.line&&sink.line<=last){found=true;break;}
 }
 if(!found)return false;
 if(shellDynamicOperationProof(root,source,bytes,sink)||shellUnusedPrivateFunctionProof(root,source,bytes,sink))return true;
 // A computed executable is a selected operation, not a native-output role.
 // Until its argv and constructor/query semantics are resolved, refreshing a
 // receipt cannot authorize an aliased API reader or kubectl constructor.
 if(['echo','printf'].includes(sink.command)&&sink.args.some(argument=>/apiVersion/u.test(argument)&&/kind/u.test(argument)))return false;
 if(shellReleaseFileProof(root,source,bytes,sink))return true;
 if(shellNamedFileProof(root,source,bytes,sink))return true;
 if(shellNativeSummaryQualified(bytes,sink)||shellFramedNotifyLogQualified(bytes,sink)||shellYamlScalarGraphQualified(bytes,sink))return true;
 if(/[$`]/u.test(sink.command))return false;
 const nativeTee=nativeTeeOutputDependencies(root,source,bytes,sink);
 if(nativeTee)return true;
 const channel=sink.channel??'command-output';
 if(consumer.channel&&consumer.channel!==channel)return false;
 if(consumer.kind==='captured-operation'&&channel!=='command-substitution')return false;
 if(!['captured-operation','framed-or-native-scalar-output','declared-child-operation','native-tool-or-selected-stream','fixed-native-text-transform'].includes(consumer.kind))return false;
 if(consumer.kind==='framed-or-native-scalar-output'&&!['echo','printf'].includes(sink.command))return false;
 const streamTools=new Set(['cat','tee','sed','awk','gawk','head','tail','cut','paste','sort','uniq','tr','dd','base64','jq','yq']);

 if(sink.command==='printf'&&sink.args.length===2&&sink.args[0]==='%s\\n'){
  const variable=sink.args[1].match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/u)?.[1],prefix=bytes.split('\n').slice(0,sink.line-1).join('\n');
  if(variable&&prefix.includes(`[[ $${variable} =~ ^/[a-zA-Z0-9_./-]+$`)&&(prefix.match(new RegExp(`\\b${variable}=`, 'gu'))??[]).length===1)return true;
 }
 if(!streamTools.has(sink.command)){
  const line=bytes.split('\n')[sink.line-1]??'';
  // A finite case alternative fixes the complete emitted variable value.
  const finiteCase=/^\s*(?:[A-Za-z0-9_-]+\s*\|\s*)*[A-Za-z0-9_-]+\)\s*echo\s+"\$([A-Za-z_][A-Za-z0-9_]*)"\s*;;\s*$/u.exec(line);
  const previousCase=[...bytes.split('\n').slice(0,sink.line-1).join('\n').matchAll(/\bcase\s+"\$([A-Za-z_][A-Za-z0-9_]*)"\s+in/gu)].at(-1)?.[1];
  if(sink.command==='echo'&&finiteCase&&previousCase===finiteCase[1])return true;
  if(['echo','printf'].includes(sink.command)&&/\|\s*tr\s+'\[:upper:\]'\s+'\[:lower:\]'/u.test(line))return true;
   // Input-flow custody alone does not prove an arbitrary child's output role.
   // Literal text builtins retain their existing grammar; all other unresolved
   // emitters need one of the selected semantic proofs above.
   return ['echo','printf'].includes(sink.command)&&!shellRawChannelUnbound(bytes,sink);
 }
 // Stream filters cannot inherit a native role while reading caller stdin.
 // Require a selected pipe, a named input, or the exact scalar-trim recipe.
 const context=bytes.split('\n').slice(Math.max(0,sink.line-3),sink.line).join('\n').replace(/\\\n[ \t]*/gu,' ');
 const command=sink.command.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
 if(sink.command==='cut'&&['-d |-f1','-d| |-f1'].includes(sink.args.join('|'))&&/(?:\| sha256sum|\$\(sha256sum -- "\$[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z0-9_.-]+)*") \| cut -d' ' -f1/u.test(bytes.split('\n')[sink.line-1]??''))return true;
 if(['tr','tail'].includes(sink.command)&&(bytes.match(/\bcli\s*\(\s*\)\s*\{/gu)??[]).length===1&&bytes.includes('cli() { timeout --signal=TERM --kill-after=2 10 "$REDIS_CLI" -h 127.0.0.1 -p "$port" --raw "$@"; }')){
  if(sink.command==='tr'&&sink.args.join('|')==='-d|\\r'&&/cli INFO persistence \| tr -d '\\r'/u.test(bytes.split('\n')[sink.line-1]??''))return true;
  if(sink.command==='tail'&&sink.args.join('|')==='-1'&&/cli CONFIG GET (?:appendfsync|maxmemory-policy) \| tail -1/u.test(bytes.split('\n')[sink.line-1]??''))return true;
 }
 if(sink.command==='sort'&&sink.args.join('|')==='-z'&&/find appendonlydir -type f -print0 \| sort -z \| xargs -0 sha256sum >SHA256SUMS/u.test(bytes.split('\n')[sink.line-1]??''))return true;
 if(sink.command==='tail'&&sink.args.join('|')==='-n|35'&&/grep -iE 'nri\|kubeclaw-native' \/var\/lib\/rancher\/k3s\/agent\/containerd\/containerd.log \| tail -n 35/u.test(bytes.split('\n')[sink.line-1]??''))return true;
 // Fixed byte-count queries expose numeric filesystem facts, not file bodies.
 if(sink.command==='cut'&&sink.args.join('|')==='-f1'&&/du (?:--summarize --bytes|-sb --) "\$[A-Za-z_][A-Za-z0-9_]*" \| cut -f1/u.test(bytes.split('\n')[sink.line-1]??''))return true;
 if(['tail','tr'].includes(sink.command)&&/df --output=avail -B1 \/var\/lib\/docker \| tail -n 1 \| tr -d ' '/u.test(bytes.split('\n')[sink.line-1]??'')&&((sink.command==='tail'&&sink.args.join('|')==='-n|1')||(sink.command==='tr'&&sink.args.join('|')==='-d| ')))return true;

 // A pipeline alone does not qualify a stream's input. Validate its named
 // source or closed transform below, including command substitutions.
 if(sink.command==='awk'&&sink.args.length===1&&sink.args[0]==='{ print; count += 1; if (count >= 30) exit }'&&(bytes.split('\n')[sink.line-1]??'').trim()===`git status --short | awk '{ print; count += 1; if (count >= 30) exit }'`)return true;
 if(sink.command==='awk'&&sink.args.length===1&&sink.args[0]==='/^Version:/ { print $2; exit }'){
  const line=bytes.split('\n')[sink.line-1]??'',variable=line.match(/\$([A-Za-z_][A-Za-z0-9_]*) --version \| awk/u)?.[1],prefix=bytes.split('\n').slice(0,sink.line-1).join('\n');
  const value=variable&&[...prefix.matchAll(new RegExp(`\b${variable}="([^"\n]+)"`,'gu'))].at(-1)?.[1];
  if(value?.endsWith('/trivy'))return true;
  if(variable&&[...prefix.matchAll(new RegExp(`^\\s*${variable}=([^\\n]+)$`,'gmu'))].at(-1)?.[1]==='"$(install_trivy "$(uname -m)")"'&&(bytes.match(/\binstall_trivy\s*\(\s*\)\s*\{/gu)??[]).length===1&&bytes.includes('local executable="$install_root/trivy"')&&bytes.includes(`printf '%s\\n' "$executable"`))return true;
 }
 if(sink.command==='awk'&&sink.args.length===1&&sink.args[0]==='{print "  " $1 " → " $3}'&&/kubectl get pods -n "\$[A-Za-z_][A-Za-z0-9_]*"(?: -l [A-Za-z0-9_.\/=-]+)? --no-headers\s*\|\s*awk/u.test(context))return true;
 if(sink.command==='awk'&&sink.args.length===1&&sink.args[0]==='{print "  " $1}'){
  const row=/echo "\$([A-Za-z_][A-Za-z0-9_]*)" \| grep -v '\^sh\.helm' \| awk/u.exec(context);
  if(row){const captures=[...bytes.split('\n').slice(0,sink.line-1).join('\n').matchAll(new RegExp(`\\b${row[1]}=\\$\\(([^\\n]*)\\)`,'gu'))];
   if(/^kubectl get secrets -n "\$[A-Za-z_][A-Za-z0-9_]*" --no-headers 2>&1$/u.test(captures.at(-1)?.[1]??''))return true;
  }
 }
 const versionPipe=new RegExp(`(?:^|[\\n;])\\s*(?:openclaw|node|python3|go|helm|kubectl|docker|redis-server|postgres|git)\\s+(?:--version|version)(?:\\s+--short)?\\s*\\|\\s*${command}(?:\\s|$)`,'u');
 if(versionPipe.test(context)&&['awk','gawk'].includes(sink.command)){
  const program=sink.args.at(-1)??'';
  // The selected version filter only prints its incoming version line and
  // returns a comparison exit status; it cannot construct a replacement root.
  if(program.replace(/\s+/gu,'')==='{for(i=1;i<=NF;i++)if($i==expected)found=1;print}END{exit!found}'&&sink.args.length===3&&sink.args[0]==='-v'&&/^expected=\$[A-Za-z_][A-Za-z0-9_]*$/u.test(sink.args[1]))return true;
 }
 if(sink.command==='awk'&&sink.args[0]==='-F'&&sink.args[1]===':[[:space:]]*'&&sink.args[2]==='$1 == "STATUS" { print $2; exit }'&&sink.args.length===3) {
  const selectedLine=bytes.split('\n')[sink.line-1]??'',variable=selectedLine.match(/<<<\s*"?\$([A-Za-z_][A-Za-z0-9_]*)/u)?.[1],preceding=bytes.split('\n').slice(0,sink.line-1).join('\n');
  if(!variable)return false;
  const assignments=[...preceding.matchAll(new RegExp(`\\b${variable}=("[^\\n]*"|[^\\s;]+)`,'gu'))];
  // This selected field query reads Helm's status text, never resource YAML.
  // Match its latest assignment so a later replacement cannot inherit custody.
  if(/^"\$\(helm status "\$[A-Za-z_][A-Za-z0-9_]*" -n "\$[A-Za-z_][A-Za-z0-9_]*" 2>&1\)"$/u.test(assignments.at(-1)?.[1]??''))return true;
 }
 // Whole-stream ASCII case folding cannot retain the case-sensitive
 // apiVersion identity key. This is a closed transform, not a pipe exemption.
 if(sink.command==='sed'&&sink.args.length===1&&sink.args[0]==='s/^[[:space:]]*//; s/[[:space:]]*$//'&&/tr '\[:upper:\]' '\[:lower:\]' \| sed/u.test(context))return true;
 if(sink.command==='tr'&&sink.args.length===2&&['[:lower:]|[:upper:]','[:upper:]|[:lower:]'].includes(sink.args.join('|')))return true;
 if(sink.command==='tr'&&sink.args.join('|')==='-d|[:space:]'){
  const line=bytes.split('\n')[sink.line-1]??'',next=bytes.split('\n')[sink.line]??'';
  const variable=line.match(/([A-Za-z_][A-Za-z0-9_]*)="\$\(tr -d '\[:space:\]' <"\$[A-Za-z_][A-Za-z0-9_]*"\)"/u)?.[1];
  const validator='is_valid_namespace() {\n  local value="$1"\n  [[ $value =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ && ${#value} -le 63 ]]\n}';
  if(variable&&next.trim()===`if is_valid_namespace "$${variable}"; then`&&bytes.includes(validator))return true;
 }
 if(sink.command==='base64'&&sink.args.length===1&&sink.args[0]==='-d') {
  const selectedLine=bytes.split('\n')[sink.line-1]??'';
  const input=/^\s*([A-Za-z_][A-Za-z0-9_]*)="\$\(kubectl get secret [a-z0-9-]+ -n "\$[A-Za-z_][A-Za-z0-9_]*" -o jsonpath='\{\.data\.\\\.dockerconfigjson\}' 2>\/dev\/null \| base64 -d\)"\s*$/u.exec(selectedLine);
  const following=bytes.split('\n').slice(sink.line,sink.line+5).join('\n').replace(/\\\n[ \t]*/gu,' ');
  if(input&&new RegExp(`printf '%s' "\\$${input[1]}" \\| kubectl create secret generic [a-z0-9-]+ -n "\\$[A-Za-z_][A-Za-z0-9_]*"\\s+--type=kubernetes.io/dockerconfigjson --from-file=\\.dockerconfigjson=/dev/stdin --dry-run=client -o yaml \\| kubectl apply -f -`,'u').test(following))return true;
 }
 if(shellRawChannelUnbound(bytes,sink))return false;
 // A named filename or filter program alone proves neither the incoming
 // producer nor the selected consumer. Unsupported ancestry stays a gap.

 return false;
}
const shellJsonPatchAstAudit="import ast,json,sys\nprogram=sys.stdin.read(); tree=ast.parse(program)\nassert len(tree.body)==2 and isinstance(tree.body[0],ast.Import) and [(x.name,x.asname) for x in tree.body[0].names]==[('json',None),('sys',None)]\nexpr=tree.body[1]; assert isinstance(expr,ast.Expr) and isinstance(expr.value,ast.Call) and isinstance(expr.value.func,ast.Name) and expr.value.func.id=='print' and len(expr.value.args)==1 and not expr.value.keywords\nserializer=expr.value.args[0]; assert isinstance(serializer,ast.Call) and isinstance(serializer.func,ast.Attribute) and isinstance(serializer.func.value,ast.Name) and serializer.func.value.id=='json' and serializer.func.attr=='dumps' and len(serializer.args)==1 and not serializer.keywords\npayload=serializer.args[0]; assert isinstance(payload,ast.List) and payload.elts\nfor item in ast.walk(payload):\n assert isinstance(item,(ast.List,ast.Dict,ast.Constant,ast.Subscript,ast.Attribute,ast.Name,ast.Load))\n if isinstance(item,ast.Name): assert item.id=='sys'\n if isinstance(item,ast.Attribute): assert isinstance(item.value,ast.Name) and item.value.id=='sys' and item.attr=='argv'\n if isinstance(item,ast.Subscript): assert isinstance(item.value,ast.Attribute) and isinstance(item.slice,ast.Constant) and type(item.slice.value)==int and item.slice.value in (1,2)\nsys.argv=['selected-patch','__docs_controlled_claim_name__','__docs_controlled_claim_uid__']\nexec(compile(tree,'selected-json-patch','exec'),{'json':json,'sys':sys,'__builtins__':{'print':print,'__import__':__import__}})\n";
function discoverShellDirectApiPatches(root,source,bytes){
 const offsets=[];let logical='';for(let cursor=0;cursor<bytes.length;){offsets.push(cursor);const continuation=/^\\\n[ \t]*/u.exec(bytes.slice(cursor));if(continuation){logical+=' ';cursor+=continuation[0].length;}else{logical+=bytes[cursor];cursor++;}}const outputs=[],qualifiedStarts=new Set();
 for(const match of logical.matchAll(/\bkubectl patch (service|deployment|secret) ("[^"\n]+"|[a-z0-9-]+) -n "\$([A-Za-z_][A-Za-z0-9_]*)" --type(?:=| )(merge|json|strategic)\s+(?:-p|--patch)\s+("(?:\\.|[^"\\])*"|'[^']*')/gu)){
  const [invocation,resource,receiver,namespace,type,payload]=match;qualifiedStarts.add(match.index);
  const originalStart=offsets[match.index],line=bytes.slice(0,originalStart).split('\n').length;
  const preceding=bytes.slice(0,originalStart),constructor=[...preceding.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\(\) \{/gmu)].at(-1)?.[1],fn=constructor?bytes.match(new RegExp(`^${constructor}\\(\\) \\{[\\s\\S]*?^\\}`,'mu')):null;
  if(resource==='secret'){assert(fn&&['patch_secret_literal','patch_secret_file'].includes(constructor)&&fn[0]===finiteSecretChannelRecipes[constructor].body,`API_PRODUCT_SHELL_SECRET_PATCH_FLOW_UNQUALIFIED: ${source}:${line}`);continue;}
  let body=payload[0]==="'"?payload.slice(1,-1):payload.slice(1,-1).replace(/\\(["\\])/gu,'$1');const inputs=[];
  if(body.includes('$LITELLM_NODE_PORT')){
   const value=bytes.match(/^LITELLM_NODE_PORT="\$\{LITELLM_NODE_PORT:-(\d+)\}"$/mu)?.[1];
   assert(value&&Number(value)>=30000&&Number(value)<=32767&&bytes.includes('LITELLM_NODE_PORT < 30000 || LITELLM_NODE_PORT > 32767')&&bytes.includes('[[ ! $LITELLM_NODE_PORT =~ ^[0-9]+$ ]]'),`API_PRODUCT_SHELL_PATCH_PARAMETER_UNQUALIFIED: ${source}:${line}`);
   body=body.replaceAll('$LITELLM_NODE_PORT',value);inputs.push({expression:'$LITELLM_NODE_PORT',environment:'LITELLM_NODE_PORT',default:Number(value),range:[30000,32767],runtimeValue:'unexecuted; source-selected default profile'});
  }
  if(body.includes('${runtime_index}')){
   assert(fn&&fn[0].includes('if [[ ! $runtime_index =~ ^[0-9]+$ ]]; then')&&fn[0].includes('go-template={{range $index, $container := .spec.template.spec.containers}}{{if eq $container.name "buster-v2-runtime"}}{{$index}}{{end}}{{end}}')&&(fn[0].match(/\bruntime_index=/gu)??[]).length===2,`API_PRODUCT_SHELL_PATCH_INDEX_UNQUALIFIED: ${source}:${line}`);
   body=body.replaceAll('${runtime_index}','0');inputs.push({expression:'${runtime_index}',sourceReceiver:'apps/v1 Deployment agent-buster',sourceField:'index of spec.template.spec.containers with name buster-v2-runtime',controlledOfflineValue:0,liveValue:'unexecuted; array paths selected parametrically'});
  }
  // Strategic merge $patch is a wire directive, not shell interpolation.
  assert(!/\$\{|\$[A-Za-z_][A-Za-z0-9_]*/u.test(body.replaceAll('"$patch"','"patchDirective"')),`API_PRODUCT_SHELL_PATCH_DYNAMIC_BODY_UNQUALIFIED: ${source}:${line}`);
  let value;try{value=JSON.parse(body);}catch{assert.fail(`API_PRODUCT_SHELL_PATCH_JSON_INVALID: ${source}:${line}`);}
  const name=receiver.replace(/^"|"$/gu,'');let receiverBinding;
  if(name.startsWith('$')){const variable=name.slice(1),bindings=[...(fn?.[0]??'').matchAll(new RegExp(String.raw`\b${variable}="([^"\n]+)"`,'gu'))];assert(bindings.length===1&&/^[a-z0-9-]+$/u.test(bindings[0][1]),`API_PRODUCT_SHELL_PATCH_RECEIVER_UNQUALIFIED: ${source}:${line}`);receiverBinding={expression:name,selectedLiteral:bindings[0][1]};}
  const kind=resource==='service'?'Service':'Deployment',apiVersion=resource==='service'?'v1':'apps/v1';
  outputs.push({value,context:{apiVersion,kind,path:source,line,document:outputs.length,producer:'shell-shape',profile:`selected-${resource}-${type}-patch`,sourceDigest:hash(bytes),outputDigest:hash(JSON.stringify(value)),requestMethod:'PATCH',requestOperation:'kubectl-patch',requestPatchType:type,requestReceiver:{apiVersion,kind,resource,name,nameExpression:name,namespaceExpression:'$'+namespace},requestInvocation:invocation,...(type==='json'?{patchOperations:value}:{}),inputs,forwardedProducer:{qualified:true,path:source,line,command:'kubectl',argv:['patch',resource,name,'-n','$'+namespace,'--type='+type,'--patch',payload],constructorFunction:constructor??'top-level',dependencies:[{path:source,sourceDigest:hash(bytes)}],actualBody:payload,receiverBinding,controlledParameters:inputs}}});
 }
 for(const invocation of logical.matchAll(/^[ \t]*kubectl patch [^\n]+/gmu)){const start=invocation.index+invocation[0].indexOf('kubectl');if(qualifiedStarts.has(start))continue;if(/^kubectl patch pv /u.test(invocation[0].trim())&&discoverShellSelectedJsonPatches(root,source,bytes).length)continue;assert.fail(`API_PRODUCT_SHELL_PATCH_TRANSPORT_UNQUALIFIED: ${source}:${bytes.slice(0,offsets[start]).split('\n').length}`);}
 return outputs;
}

function discoverShellSelectedJsonPatches(root,source,bytes){
 const result=[];
 for(const match of bytes.matchAll(/patch=\$\(python3 - "\$claim" "\$uid" <<'([A-Za-z_][A-Za-z0-9_]*)'\n([\s\S]*?)\n\1\n\)/gu)){
  const line=bytes.slice(0,match.index).split('\n').length;
  assert(bytes.includes('kubectl --context "$KUBE_CONTEXT" patch pv "$volume" --type=json -p "$patch"')&&(bytes.match(/\bpatch=/gu)??[]).length===1&&(bytes.match(/\$patch\b/gu)??[]).length===1&&bytes.includes("while IFS=$'\\t' read -r claim uid volume; do"),`API_PRODUCT_SHELL_JSON_PATCH_RECEIVER_UNQUALIFIED: ${source}:${line}`);
  const getter=shellRawOutputSinks(source,bytes).find(sink=>sink.command==='${kube[@]}'&&sink.args.join('|')==='get|pvc|-o|json');
  assert(getter&&shellDynamicOperationProof(root,source,bytes,getter),`API_PRODUCT_SHELL_JSON_PATCH_INPUT_UNQUALIFIED: ${source}:${line}`);
  const parsed=spawnSync('python3',['-c',shellJsonPatchAstAudit],{input:match[2],encoding:'utf8',maxBuffer:1024*1024,env:{PATH:process.env.PATH}});
  assert.equal(parsed.status,0,`API_PRODUCT_SHELL_JSON_PATCH_PRODUCER_UNQUALIFIED: ${source}:${line}: ${parsed.stderr}`);
  const value=JSON.parse(parsed.stdout);assert(Array.isArray(value)&&value.length&&value.every(operation=>operation&&typeof operation==='object'&&['add','replace','test','remove','move','copy'].includes(operation.op)&&typeof operation.path==='string'),`API_PRODUCT_SHELL_JSON_PATCH_BODY_UNQUALIFIED: ${source}:${line}`);
  const receiver={apiVersion:'v1',kind:'PersistentVolume',resource:'pv',name:'$volume',nameExpression:'PVC spec.volumeName from selected owned-claim inventory',patchType:'json'};
  const context={apiVersion:receiver.apiVersion,kind:receiver.kind,path:source,document:line,line,producer:'shell-shape',profile:'selected-owned-PV-json-patch',sourceDigest:hash(bytes),outputDigest:hash(JSON.stringify(value)),requestMethod:'PATCH',requestOperation:'kubectl-patch',requestPatchType:'json',requestReceiver:receiver,patchOperations:value,requestInvocation:'kubectl --context "$KUBE_CONTEXT" patch pv "$volume" --type=json -p "$patch"',inputs:[{role:'controlled-offline-source-parameter',expression:'$claim',sourceField:'PVC metadata.name',value:'__docs_controlled_claim_name__'},{role:'controlled-offline-source-parameter',expression:'$uid',sourceField:'PVC metadata.uid',value:'__docs_controlled_claim_uid__'}],forwardedProducer:{qualified:true,path:source,line,command:'python3',argv:['-','$claim','$uid'],constructorExpression:'print(json.dumps(selected operation list))',dependencies:[{path:source,sourceDigest:hash(bytes)}],receiverInput:'selected owned PVC spec.volumeName',liveValues:'not fetched; controlled parameters document operation paths and source custody only'}};
  result.push({value,context});
 }
 assert(!/print\s*\(\s*json\.dumps\s*\(\s*\[/u.test(bytes)||!/\bpatch\b/u.test(bytes)||result.length,`API_PRODUCT_SHELL_JSON_PATCH_SELECTION_UNQUALIFIED: ${source}`);
 return result;
}

export function discoverShellApiOutputs(root) {
  const sources=walkProductSources(root,[...producerRoots,'my-values'],file=>/\.sh$/u.test(file));
  const authority='scripts/docs-api-producer-adapter-authorities.json';
  const cacheInputs=[...sources,authority,'scripts/docs-api-output-discovery.mjs','scripts/docs-api-output-role-classification.mjs','package.json','package-lock.json'].filter(source=>fs.existsSync(path.join(root,source)));
  // Include resolved native stdout constructors and package dependencies when
  // reusing the shell result. A shell-only key cannot authenticate a tee input.
  for(const entry of nativeTeeOutputCache.values())for(const file of Object.keys(entry.dependencies))if(fs.existsSync(path.join(root,file)))cacheInputs.push(file);
  for(const [id,entry]of namedShellChannelFacts)if(id.startsWith(root+':'))for(const file of Object.keys(entry.dependencies))if(fs.existsSync(path.join(root,file)))cacheInputs.push(file);
  if([...namedShellChannelFacts].some(([id,entry])=>id.startsWith(root+':')&&entry.contract.startsWith('unreachable-private-')))cacheInputs.push(...privateShellReachabilityInputs(root));
  const key=hash(JSON.stringify([...new Set(cacheInputs)].sort().map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])));
  const cached=shellOutputCache.get(root);if(cached?.key===key)return cached.outputs;
  // Rebuild facts transactionally: no removed producer may survive by line identity.
  for(const id of namedShellChannelFacts.keys())if(id.startsWith(root+':'))namedShellChannelFacts.delete(id);
  const outputs=[];const classifications=[];nonApiOutputClassifications.set(root,classifications);
  for(const source of sources) {
    const bytes=fs.readFileSync(path.join(root,source),'utf8');
    if(/(?:^|\n)\s*helm\s/u.test(bytes)||/\bnode\b[^\n]*render-[A-Za-z0-9-]+\.mjs/u.test(bytes))assertProducerAdapterAuthority(root,[source]);
    const sourceDigest=hash(bytes);
    outputs.push(...discoverShellSelectedJsonPatches(root,source,bytes));
    outputs.push(...discoverShellSelectedSecretArrays(root,source,bytes));
    outputs.push(...discoverShellDirectApiPatches(root,source,bytes));
    const rawSinks=shellRawOutputSinks(source,bytes);if(rawSinks.length){const registryFile=path.join(root,'scripts/docs-api-producer-adapter-authorities.json');const registry=fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')):{};const contract=(registry.shellRawOutputContracts??[]).find(record=>record.source===source&&JSON.stringify(record.sinks)===JSON.stringify(rawSinks)&&JSON.stringify(record.operationRecipe)===JSON.stringify(shellRawOutputOperationRecipe(source,bytes)));assert(contract,`API_PRODUCT_SHELL_RAW_OUTPUT_ROLE_UNQUALIFIED: ${source}:${rawSinks[0].line}`);assert(contract.sinkConsumers?.length===rawSinks.length,`API_PRODUCT_SHELL_CONSUMER_UNQUALIFIED: ${source}`);for(const [index,consumer]of contract.sinkConsumers.entries())assert(shellOutputConsumerMatches(root,source,bytes,rawSinks[index],consumer),`API_PRODUCT_SHELL_CONSUMER_UNQUALIFIED: ${source}:${rawSinks[index].line}:${rawSinks[index].command}`);const fileChannels=rawSinks.flatMap(sink=>{const fact=namedShellChannelFacts.get(`${root}:${source}:${sink.line}`);return fact?[{line:sink.line,role:fact.role,contract:fact.contract,sourceDigests:fact.dependencies,...(fact.selectedOperation?{selectedOperation:fact.selectedOperation}:{})}]:[];});
    for(const line of new Set(rawSinks.map(sink=>sink.line))){const fact=namedShellChannelFacts.get(`${root}:${source}:${line}`);if(fact?.role==='api')outputs.push(...fact.outputs);}
    classifications.push({source,sourceDigest,role:fileChannels.some(fact=>fact.role==='api')?'mixed-api-and-native-channels':contract.role,basis:contract.basis,sinks:rawSinks,consumer:contract.consumer,fileChannels,nativeOutputDependencies:rawSinks.flatMap(sink=>{const entry=nativeTeeOutputCache.get(`${root}:${source}:${sink.line}`);return entry?[{line:sink.line,selectedSources:entry.selected,sourceDigests:entry.dependencies}]:[];})});}
    const scalarize=value=>value.replace(/\$\{[^}\n]+\}|\$[A-Za-z_][A-Za-z0-9_]*/gu,'discovery');
    let document=0;
    const add=(value,line,profile,request={})=>outputs.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:document++,sourceDigest,producer:'shell-shape',line,profile,...request,outputDigest:hash(JSON.stringify(value))}});
    for(const custody of shellCommandAcquisitions(source,bytes).heredocs) {
      if(!custody.selectedStdin)continue;
      const match={0:bytes.slice(custody.start,custody.end),1:custody.delimiter,2:custody.body,index:custody.start};
      const header=custody.header;
      if(!/(?:^|\n)apiVersion:/u.test(match[2])){assert(!/\bkubectl\s+(?:apply|create|replace)\b/u.test(header),`API_PRODUCT_SHELL_SUBMITTED_OUTPUT_ROLE_UNQUALIFIED: ${source}:${header}`);assert(!/\bcat\b/u.test(header)||!/(?:^|\n)\s*\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)(?:\s*(?:\n|$)|:)/u.test(match[2]),`API_PRODUCT_SHELL_EMITTED_OUTPUT_ROLE_UNQUALIFIED: ${source}:${header}`);continue;}
      assert(header.split('|').slice(1).every(part=>/^\s*kubectl\s+apply\b/u.test(part)),`API_PRODUCT_SHELL_PIPELINE_UNQUALIFIED: ${source}:${header}`);
      let content=match[2];
      // Expand source-authored multiline YAML fragments before replacing their
      // scalar variables. An unsupported dynamically computed fragment fails
      // YAML/context discovery; it cannot vanish as an empty substitution.
      for(const variable of content.matchAll(/^\s*\$\{([A-Za-z_][A-Za-z0-9_]*)\}\s*$/gmu)) {
        const preceding=bytes.slice(0,match.index);
        const assignments=[...preceding.matchAll(new RegExp(`\\b${variable[1]}="([\\s\\S]*?)"`,'gu'))];
        const fragment=assignments.map(item=>item[1]).filter(value=>value.trim()).at(-1);
        assert(fragment!==undefined,`API_PRODUCT_SHELL_FRAGMENT_UNRESOLVED: ${source} ${variable[1]}`);
        content=content.replace(variable[0],fragment);
      }
      const documents=YAML.parseAllDocuments(scalarize(content));
      assert(documents.every(item=>!item.errors.length),`API_PRODUCT_SHELL_YAML_INVALID: ${source}:${bytes.slice(0,match.index).split('\n').length}`);
      const preceding=bytes.slice(0,match.index);
      const invocation=preceding.slice(preceding.lastIndexOf('\n')+1).trim();
      const constructor=[...preceding.matchAll(/^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\{/gmu)].at(-1)?.[1];
      const request=/^kubectl\s+apply(?:\s|$)/u.test(invocation)?{requestOperation:'kubectl-apply',requestInvocation:invocation,...(constructor?{requestConstructor:constructor}:{})}:{};
      for(const item of documents) {const value=item.toJS();
        if(value?.apiVersion==='v1'&&value?.kind==='Config') {
          assert(/^cat\s+>\s*"\$kubeconfig"\s*$/u.test(invocation)&&value.clusters&&value.users&&value.contexts&&value['current-context']&&/KUBECONFIG="\$kubeconfig"/u.test(bytes),`API_PRODUCT_CLIENT_CONFIG_SINK_UNQUALIFIED: ${source}`);
          classifications.push({path:source,sourceDigest,line:bytes.slice(0,match.index).split('\n').length+1,classification:'local-kubernetes-client-configuration',sink:invocation,consumer:'KUBECONFIG="$kubeconfig"',reason:'Local kubeconfig file selects client authentication and cluster connection. It is not submitted to a Kubernetes API resource endpoint.',outputDigest:hash(JSON.stringify(value))});continue;
        }
        if(value?.apiVersion&&value?.kind)add(value,bytes.slice(0,match.index).split('\n').length+1,'heredoc',request);}
    }
    const offsets=[];
    let logical='';
    for(let cursor=0;cursor<bytes.length;) {
      const continuation=/^\\\n[ \t]*/u.exec(bytes.slice(cursor));
      offsets.push(cursor);
      if(continuation) {logical+=' ';cursor+=continuation[0].length;}
      else {logical+=bytes[cursor];cursor++;}
    }
    for(const constructor of logical.matchAll(/(?:^|[|;]\s*)[ \t]*kubectl\s+create\s+([^\n]+)/gmu)) {
      assert(/^(?:namespace|configmap)\s|^secret\s+(?:generic|docker-registry)\s/u.test(constructor[1]),`API_PRODUCT_KUBECTL_CONSTRUCTOR_UNCLASSIFIED: ${source}:${bytes.slice(0,offsets[constructor.index]).split('\n').length} ${constructor[1]}`);
    }
    for(const match of logical.matchAll(/(?:^|[|;]\s*)[ \t]*kubectl\s+create\s+(secret\s+(?:generic|docker-registry)|configmap|namespace)\s+([^\n]+)/gmu)) {
      const command=match[2];
      const pipeline=command.split('|').slice(1).map(part=>part.trim());
      assert(pipeline.every(part=>/^kubectl\s+apply\b/u.test(part)),`API_PRODUCT_SHELL_PIPELINE_UNQUALIFIED: ${source}:${bytes.slice(0,offsets[match.index]).split('\n').length} ${pipeline.join(' | ')}`);
      const kind={namespace:'Namespace',configmap:'ConfigMap','secret generic':'Secret','secret docker-registry':'Secret'}[match[1]];
      const name=scalarize(command.match(/^(?:"([^"]+)"|'([^']+)'|([^\s]+))/u)?.slice(1).find(Boolean)??'discovery');
      const namespace=command.match(/(?:^|\s)(?:-n|--namespace)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s|]+))/u)?.slice(1).find(Boolean);
      const value={apiVersion:'v1',kind,metadata:{name,...(namespace?{namespace:scalarize(namespace)}:{})}};
      if(kind!=='Namespace') {
        const data={};for(const field of command.matchAll(/--from-(?:literal|file)(?:=|\s+)["']?([A-Za-z0-9._-]+)=/gu))data[field[1]]='<source-derived-payload>';
        if(match[1]==='secret docker-registry')data['.dockerconfigjson']='<source-derived-registry-authentication>';
        assert(Object.keys(data).length,`API_PRODUCT_KUBECTL_PAYLOAD_UNRESOLVED: ${source} ${kind}`);
        value.data=data;
        if(kind==='Secret')value.type=match[1]==='secret docker-registry'?'kubernetes.io/dockerconfigjson':command.match(/--type=([^\s|]+)/u)?.[1]??'Opaque';
      }
      add(value,bytes.slice(0,offsets[match.index]).split('\n').length,'kubectl-create');
    }
  }
  for(const entry of nativeTeeOutputCache.values())for(const file of Object.keys(entry.dependencies))if(fs.existsSync(path.join(root,file)))cacheInputs.push(file);
  for(const [id,entry]of namedShellChannelFacts)if(id.startsWith(root+':'))for(const file of Object.keys(entry.dependencies))if(fs.existsSync(path.join(root,file)))cacheInputs.push(file);
  const finalKey=hash(JSON.stringify([...new Set(cacheInputs)].sort().map(source=>[source,hash(fs.readFileSync(path.join(root,source)))])));
  shellOutputCache.set(root,{key:finalKey,outputs});
  return outputs;
}

// Invoke only the pure manifest renderers used by deploy.sh. Their source and
// file inputs are fingerprinted together; no cluster preflight is executed.
const transformOutputCache=new Map();
export function discoverTransformedApiOutputs(root) {
  const adapterSources=['scripts/render-litellm-deployment.mjs','scripts/render-postgresql-recovery.mjs','scripts/render-stateful-network-policies.mjs','scripts/render-registry-local.mjs'].filter(source=>fs.existsSync(path.join(root,source)));
  assertProducerAdapterAuthority(root,adapterSources);
  const dependencyFiles=[...walkProductSources(root,['scripts','my-values/infra'],file=>/\.(?:mjs|ya?ml|json)$/u.test(file)),...walkProductSources(root,['charts/gitops'],()=>true),...(fs.existsSync(path.join(root,'node_modules/js-yaml/dist/js-yaml.mjs'))?['node_modules/js-yaml/dist/js-yaml.mjs']:[])];
  const cacheKey=hash(JSON.stringify([root,dependencyFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))]),fs.existsSync(path.join(root,'scripts/deploy.sh'))?[fs.realpathSync(path.join(root,'scripts/deploy.sh')),hash(fs.readFileSync(path.join(root,'scripts/deploy.sh')))]:null,fs.existsSync(path.join(root,'versions.json'))?hash(fs.readFileSync(path.join(root,'versions.json'))):null]));
  const caller='scripts/deploy.sh';
  assert(!adapterSources.length||fs.existsSync(path.join(root,caller)),`API_PRODUCT_ADAPTED_RECIPE_INVOCATION_DRIFT: ${caller}; selected renderer caller missing`);
  if(fs.existsSync(path.join(root,caller))) {
    const callerBytes=fs.readFileSync(path.join(root,caller),'utf8').replace(/\\\n[ \t]*/gu,' ');
    const operations={
      'render-litellm-deployment.mjs':'"$INFRA_DIR/litellm-config.yaml" "$INFRA_DIR/litellm-deployment.yaml"',
      'render-postgresql-recovery.mjs':'--preflight "$NAMESPACE" "$INFRA_DIR/postgresql-recovery.yaml" "$POSTGRESQL_VALUES_FILE" "$INFRA_DIR/litellm-deployment.yaml" "$POSTGRESQL_RELEASE"',
      'render-stateful-network-policies.mjs':'"$INFRA_DIR/network-policies.yaml" "$NAMESPACE" "$REDIS_RELEASE" "$REDIS_VALUES_FILE" "$POSTGRESQL_RELEASE" "$POSTGRESQL_VALUES_FILE"',
      'render-registry-local.mjs':'"$KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG" serve "$registry_existing" "$registry_pvc"',
    };
    for(const [renderer,parameters]of Object.entries(operations)) {
      const actual=[...callerBytes.matchAll(/node "[^"\n]*\/(render-[a-z-]+\.mjs)" ([^\n]*)/gu)].filter(match=>match[1]===renderer).map(match=>match[2].slice(0,match[2].indexOf(')"')).trim());
      assert(actual.length&&actual.every(operation=>operation.replace(/\s+/gu,' ')===parameters),`API_PRODUCT_ADAPTED_RECIPE_INVOCATION_DRIFT: ${caller}:${renderer}; offline recipe positional input mapping must be reviewed`);
    }
  }
  if(transformOutputCache.has(cacheKey))return transformOutputCache.get(cacheKey);
  const recipes=[
    ['scripts/render-litellm-deployment.mjs',['my-values/infra/litellm-config.yaml','my-values/infra/litellm-deployment.yaml']],
    ['scripts/render-postgresql-recovery.mjs',['default','my-values/infra/postgresql-recovery.yaml','my-values/infra/postgresql-values.yaml','my-values/infra/litellm-deployment.yaml','postgresql']],
    ['scripts/render-stateful-network-policies.mjs',['my-values/infra/network-policies.yaml','default','redis','my-values/infra/redis-values.yaml','postgresql','my-values/infra/postgresql-values.yaml']],
  ];
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'docs-api-transforms-'));
  const registry='scripts/render-registry-local.mjs';
  if(fs.existsSync(path.join(root,registry))) {
    const config=path.join(temporary,'storage.json'),existing=path.join(temporary,'deployment.json'),pvc=path.join(temporary,'pvc.json');
    fs.writeFileSync(config,JSON.stringify({capacity:'10Gi',storageClassName:'discovery'}));fs.writeFileSync(existing,'');fs.writeFileSync(pvc,'');
    const served=spawnSync(process.execPath,[registry,config,'serve',existing,pvc],{cwd:root,encoding:'utf8'});
    assert.equal(served.status,0,`API_PRODUCT_REGISTRY_RENDER_FAILED: ${served.stderr}`);
    const objects=YAML.parseAllDocuments(served.stdout).map(document=>{assert.equal(document.errors.length,0);return document.toJS();});
    const deployed=path.join(temporary,'deployed.json'),claim=path.join(temporary,'claim.json');
    fs.writeFileSync(deployed,JSON.stringify(objects.find(value=>value.kind==='Deployment')));fs.writeFileSync(claim,JSON.stringify(objects.find(value=>value.kind==='PersistentVolumeClaim')));
    recipes.push([registry,[config,'serve',existing,pvc]],[registry,[config,'gc-dry-run',deployed,claim]],[registry,[config,'gc',deployed,claim]]);
  }
  const result=[];
  const continuous='scripts/gitops-continuous.mjs';
  if(fs.existsSync(path.join(root,continuous))) {
    assertProducerAdapterAuthority(root,[continuous]);
    const bytes=fs.readFileSync(path.join(root,continuous),'utf8');
    const tree=ts.createSourceFile(continuous,bytes,ts.ScriptTarget.Latest,true);
    const functions=['continuousDocuments','continuousApplications'].map(name=>tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name));
    assert(functions.every(Boolean),`API_PRODUCT_CONTINUOUS_TRANSFORM_MISSING: ${continuous}`);
    const environment=tree.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations).find(node=>node.name.getText(tree)==='environment')?.initializer;
    assert(environment&&ts.isStringLiteral(environment),'API_PRODUCT_CONTINUOUS_ENVIRONMENT_UNQUALIFIED');
    const ancestry=['scripts/gitops.mjs','scripts/gitops-bundle.mjs'];
    const bootstrapBytes=fs.readFileSync(path.join(root,ancestry[0]),'utf8');
    const bootstrapTree=ts.createSourceFile(ancestry[0],bootstrapBytes,ts.ScriptTarget.Latest,true);
    const bootstrap=bootstrapTree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='bootstrapDocuments');
    assert(bootstrap,'API_PRODUCT_CONTINUOUS_BOOTSTRAP_MISSING');
    const helpers=ts.createSourceFile(ancestry[1],fs.readFileSync(path.join(root,ancestry[1]),'utf8'),ts.ScriptTarget.Latest,true).statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations).filter(node=>['gitOpsName','gitOpsClusterKinds'].includes(node.name.getText()));
    assert.equal(helpers.length,2,'API_PRODUCT_CONTINUOUS_HELPERS_MISSING');
    const controlled={groups:['buster','prism','nova'].map((role,index)=>({role,name:role,namespace:'discovery',path:`releases/gitops/discovery/${role}`,wave:index===2?1:0,helmReleases:[role],resources:[{apiVersion:'v1',kind:'ConfigMap',namespace:'discovery',name:role}]}))};
    const chartInputs=walkProductSources(root,['charts/gitops'],()=>true);
    const inputs=[continuous,...ancestry,...chartInputs];
    const sourceInputs=inputs.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))]);
    // Use the same maintained js-yaml import as the original child transformer,
    // not a substitute parser or constructed Application output.
    const yamlModule=pathToFileURL(path.join(root,'node_modules/js-yaml/dist/js-yaml.mjs')).href;
    const declarations=`const environment=${JSON.stringify(environment.text)};${helpers.map(node=>`const ${node.getText()};`).join('')};const readCommittedBundle=()=>input;${bootstrap.getText(bootstrapTree).replace(/^export\s+/u,'')};${functions.map(fn=>fn.getText(tree).replace(/^export\s+/u,'')).join(';')}`;
    const evaluate=(expression,context)=>{
      const program=`import vm from 'node:vm';import yaml from ${JSON.stringify(yamlModule)};const result=vm.runInNewContext(${JSON.stringify(declarations+';'+expression)},{...${JSON.stringify(context)},yaml,structuredClone,URL},{timeout:1000});process.stdout.write(JSON.stringify(result));`;
      const rendered=spawnSync(process.execPath,['--input-type=module','-e',program],{cwd:temporary,env:{PATH:process.env.PATH},encoding:'utf8',maxBuffer:32*1024*1024});
      assert.equal(rendered.status,0,`API_PRODUCT_CONTINUOUS_TRANSFORM_FAILED: ${rendered.stderr}`);return JSON.parse(rendered.stdout);
    };
    const namingProfiles=[{id:'default',naming:{}},{id:'custom',naming:{rootName:'discovery-root',bootstrapProject:'discovery-bootstrap',workloadProject:'discovery-workloads'}}];
    for(const {id,naming}of namingProfiles)for(const manual of [false,true]) {
      const config=manual?{runtimeAutoSync:false}:{},profile=`continuous-${id}-${manual?'manual':'default'}`;
      const context={input:controlled,naming,config};
      const initial=evaluate(`bootstrapDocuments('offline','releases/gitops/discovery','https://example.invalid/discovery.git','${syntheticDigest.slice(0,40)}','default',naming)`,context);
      const boot=evaluate('continuousDocuments(initial,\'default\',config)',{...context,initial});
      const values=path.join(temporary,`${profile}-values.json`);fs.writeFileSync(values,JSON.stringify(initial.values));
      const rendered=spawnSync('helm',['template','runtime',path.join(root,'charts/gitops'),'-n','default','-f',values],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
      assert.equal(rendered.status,0,`API_PRODUCT_CONTINUOUS_CHILD_RENDER_FAILED: ${rendered.stderr}`);
      const children=evaluate('continuousApplications(manifest,config)',{...context,manifest:rendered.stdout});
      const bootstrapApp=boot.find(document=>document.kind==='Application');
      assert.equal(bootstrapApp.metadata.name,initial.values.rootName);
      assert.equal(bootstrapApp.spec.project,naming.bootstrapProject??initial.values.rootName);
      assert.equal(bootstrapApp.spec.source.path,`${environment.text}/apps`);
      assert.equal(bootstrapApp.spec.source.directory.include,'applications.yaml');
      assert.equal(bootstrapApp.spec.source.targetRevision,'main');
      assert.equal(Boolean(bootstrapApp.spec.syncPolicy.automated),!manual);
      assert.equal(children.filter(document=>document.kind==='Application').length,3);
      assert.equal(children.filter(document=>document.kind==='AppProject').length,1);
      for(const document of children){
        assert.equal(document.metadata.namespace,'default');
        if(document.kind==='AppProject'){assert.equal(document.metadata.name,initial.values.project);assert.equal(document.metadata.annotations['argocd.argoproj.io/sync-wave'],'-1');continue;}
        const group=controlled.groups.find(group=>group.name===document.metadata.name);assert(group);
        assert.equal(document.spec.project,initial.values.project);
        assert.equal(document.spec.source.path,group.path);
        assert.equal(document.spec.source.directory.include,'resources.yaml');
        assert.equal(document.spec.source.targetRevision,'main');
        assert.equal(document.metadata.annotations['kubeclaw.dev/immutable-bundle-path'],group.path);
        assert.equal(document.metadata.annotations['argocd.argoproj.io/sync-wave'],String(manual?0:group.wave));
        assert.equal(Boolean(document.spec.syncPolicy.automated),!manual);
      }
      // Negative inputs are genuine rendered children with only the selected
      // path/include mutated; they are guards, not published discovery outputs.
      for(const mutation of ['path','include']){
        const invalid=YAML.parseAllDocuments(rendered.stdout).map(document=>document.toJS());
        for(const document of invalid)if(document.kind==='Application'){
          document.metadata.annotations['kubeclaw.dev/immutable-bundle-path']='stale';
          if(mutation==='path')document.spec.source.path='releases/gitops/../../foreign';else document.spec.source.directory.include='foreign.yaml';
        }
        const refused=evaluate('continuousApplications(manifest,config)',{...context,manifest:invalid.map(document=>YAML.stringify(document)).join('---\n')});
        for(const document of refused)if(document.kind==='Application')assert(!Object.hasOwn(document.metadata.annotations,'kubeclaw.dev/immutable-bundle-path'));
      }
      const inputDigest=hash(JSON.stringify({controlled,naming,config,sourceInputs}));
      for(const [documents,publicOutput]of [[boot,`${environment.text}/bootstrap.yaml`],[children,`${environment.text}/apps/applications.yaml`]])documents.forEach((value,index)=>result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:continuous,document:index,producer:'script-render',profile,sourceDigest:hash(bytes),inputs,inputDigest,outputDigest:hash(YAML.stringify(value)),publicOutput}}));
    }
  }
  try { for(const [source,args] of recipes) {
    if(!fs.existsSync(path.join(root,source)))continue;
    const rendered=spawnSync(process.execPath,[source,...args],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
    assert.equal(rendered.status,0,`API_PRODUCT_SCRIPT_RENDER_FAILED: ${source}: ${rendered.stderr}`);
    const inputFiles=args.filter(argument=>fs.existsSync(path.resolve(root,argument))&&fs.statSync(path.resolve(root,argument)).isFile());
    const inputs=inputFiles.filter(argument=>!path.isAbsolute(argument));
    const inputDigest=hash(JSON.stringify(inputFiles.map(input=>[path.isAbsolute(input)?path.basename(input):input,hash(fs.readFileSync(path.resolve(root,input)))])));
    const documents=YAML.parseAllDocuments(rendered.stdout);
    assert(documents.every(document=>!document.errors.length),`API_PRODUCT_SCRIPT_YAML_INVALID: ${source}`);
    documents.forEach((document,index)=>{
      const value=document.toJS();if(!value?.apiVersion||!value?.kind)return;
      result.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,producer:'script-render',profile:source===registry?args[1]:'deploy-default',sourceDigest:hash(fs.readFileSync(path.join(root,source))),inputs,inputDigest,outputDigest:hash(JSON.stringify(value))}});
    });
  }} finally {fs.rmSync(temporary,{recursive:true,force:true});}
  transformOutputCache.clear();transformOutputCache.set(cacheKey,result);return result;
}

// Resolve only the shell grammar we can reproduce without executing deployment
// code. Defaults are selected inputs; runtime/cluster-dependent substitutions
// remain explicit failures. Tokenization precedes expansion so JSON and escaped
// Helm paths retain their original single argv boundaries.
const installerTokenCache=new Map();
function installerShell(root, sourcePath) {
  const source=fs.readFileSync(path.join(root,sourcePath),'utf8').replace(/\\\n[ \t]*/gu,' ');
  const variables={REPO_DIR:root,SCRIPT_DIR:path.join(root,'scripts')};
  const expand=text=>{
    const value=text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu,(match,braced,plain)=>{
      assert(Object.hasOwn(variables,braced??plain),`API_PRODUCT_INSTALLER_VARIABLE_UNQUALIFIED: ${sourcePath}:${match}`);return variables[braced??plain];
    });
    assert(!/[`$]/u.test(value),`API_PRODUCT_INSTALLER_EXPANSION_UNQUALIFIED: ${sourcePath}:${text}`);return value;
  };
  // Global assignments only. Never mistake a local conditional/caller value
  // for the selected default. Unresolved definitions are retained as failures
  // when the selected argv actually uses them.
  for(const line of source.split('\n')) {
    const assignment=/^([A-Z_][A-Z0-9_]*)="([^"\n]*)"$/u.exec(line);if(!assignment||['REPO_DIR','SCRIPT_DIR'].includes(assignment[1]))continue;
    let value=assignment[2].replace(/\$\{[A-Z_][A-Z0-9_]*:-([^}]*)\}/gu,'$1');
    try {value=expand(value);}catch {continue;}
    if(!/[`$]/u.test(value))variables[assignment[1]]=value;
  }
  const tokens=text=>{
    // Python inherits cwd and the complete environment. Keep those inputs in
    // the successful-token key; errors must still name the current source.
    const key=hash(JSON.stringify([text,process.cwd(),Object.entries(process.env).sort(([left],[right])=>left.localeCompare(right))]));
    const cached=installerTokenCache.get(key);
    if(cached)return cached.slice();
    const parsed=spawnSync('python3',['-c','import json,shlex,sys; print(json.dumps(shlex.split(sys.stdin.read())))'],{input:text,encoding:'utf8'});
    assert.equal(parsed.status,0,`API_PRODUCT_INSTALLER_PARSE_FAILED: ${sourcePath}`);
    const result=JSON.parse(parsed.stdout);
    installerTokenCache.set(key,result.slice());
    return result;
  };
  const invocations=source.split('\n').filter(line=>/^\s*helm upgrade --install\s/u.test(line)).map(tokens);
  return {source,variables,expand,tokens,invocations};
}
function installerHelmRecipe(root, sourcePath, argv) {
  assert.deepEqual(argv.slice(0,3),['helm','upgrade','--install'],`API_PRODUCT_INSTALLER_OPERATION_UNQUALIFIED: ${sourcePath}`);
  const recipe={path:sourcePath,release:argv[3],chart:argv[4],namespace:'default',inputs:[],values:[],args:[],effectiveArgv:argv};
  const inputPath=input=>{
    const absolute=path.resolve(root,input);const relative=path.relative(root,absolute);
    assert(relative&&!relative.startsWith('../')&&!path.isAbsolute(relative)&&fs.existsSync(absolute)&&fs.statSync(absolute).isFile(),`API_PRODUCT_INSTALLER_INPUT_UNQUALIFIED: ${sourcePath}:${input}`);
    recipe.inputs.push(relative);return absolute;
  };
  for(let index=5;index<argv.length;index++) {
    const flag=argv[index];
    if(['--wait','--create-namespace','--atomic','--cleanup-on-fail'].includes(flag))continue;
    const argument=()=>{assert(index+1<argv.length,`API_PRODUCT_INSTALLER_FLAG_VALUE_MISSING: ${sourcePath}:${flag}`);return argv[++index];};
    if(['--timeout','--history-max'].includes(flag)){argument();continue;}
    if(flag==='--version'){recipe.version=argument();continue;}
    if(['--namespace','-n'].includes(flag)){recipe.namespace=argument();continue;}
    if(['--values','-f'].includes(flag)){recipe.values.push(inputPath(argument()));continue;}
    if(['--set','--set-string','--set-json','--set-literal'].includes(flag)){recipe.args.push(flag,argument());continue;}
    if(flag==='--set-file'){
      const value=argument(),equals=value.indexOf('=');assert(equals>0&&!value.includes(','),`API_PRODUCT_INSTALLER_FILE_PARAMETER_UNQUALIFIED: ${sourcePath}`);
      recipe.args.push(flag,`${value.slice(0,equals)}=${inputPath(value.slice(equals+1))}`);continue;
    }
    if(['--post-renderer','--post-renderer-args','--kube-version','--api-versions'].includes(flag)){recipe.args.push(flag,argument());continue;}
    if(flag==='--skip-crds'){recipe.skipCrds=true;continue;}
    if(['--skip-schema-validation','--disable-openapi-validation','--no-hooks'].includes(flag)){recipe.args.push(flag);continue;}
    throw new Error(`API_PRODUCT_INSTALLER_FLAG_UNQUALIFIED: ${sourcePath}:${flag}`);
  }
  return recipe;
}
const infrastructureOutputCache=new Map();
export function discoverInfrastructureApiOutputs(root) {
  const source='scripts/infrastructure-release.mjs',caller='scripts/deploy.sh';
  if(!fs.existsSync(path.join(root,source)))return [];
  assertProducerAdapterAuthority(root,[caller,source,'scripts/infrastructure-chart.mjs','scripts/infrastructure-image-renderer.mjs'].filter(file=>fs.existsSync(path.join(root,file))));
  const versionsBytes=fs.readFileSync(path.join(root,'versions.json'));
  const versionsDigest=hash(versionsBytes);
  const lock=JSON.parse(versionsBytes.toString('utf8')).infrastructureCharts??{};
  const shell=installerShell(root,caller),recipes=[];
  for(const name of Object.keys(lock).sort()) {
    // Authenticate the actual command-substitution ancestry. The staged archive
    // is the original module's pinned archive, never an inferred chart alias.
    const bindings=[...shell.source.matchAll(/^\s*([a-z_]+)="\$\((node [^\n]+)\)"$/gmu)].flatMap(match=>{
      const argv=shell.tokens(match[2]);return argv[1]==='$REPO_DIR/scripts/infrastructure-release.mjs'&&argv[2]===name?[{variable:match[1],argv}]:[];
    });
    assert.equal(bindings.length,1,`API_PRODUCT_INFRASTRUCTURE_CHART_BINDING_UNQUALIFIED: ${name}`);
    const binding=bindings[0];assert.equal(binding.argv.length,6,`API_PRODUCT_INFRASTRUCTURE_STAGE_ARGS_UNQUALIFIED: ${name}`);
    const stageArgs=binding.argv.slice(2).map(shell.expand);
    const invocations=shell.invocations.filter(argv=>argv[4]===`$${binding.variable}`||argv[4]===`\${${binding.variable}}`);
    assert.equal(invocations.length,1,`API_PRODUCT_INFRASTRUCTURE_INVOCATION_UNQUALIFIED: ${name}`);
    const stage=spawnSync(process.execPath,['--input-type=module','-e',`import {stageInfrastructureChart} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/infrastructure-chart.mjs')).href)};process.stdout.write(stageInfrastructureChart(${JSON.stringify(name)}));`],{cwd:root,encoding:'utf8'});
    assert.equal(stage.status,0,`API_PRODUCT_INFRASTRUCTURE_STAGE_FAILED: ${name}: ${stage.stderr}`);
    shell.variables[binding.variable]=stage.stdout.trim();
    const recipe=installerHelmRecipe(root,caller,invocations[0].map(shell.expand));
    assert.equal(recipe.release,stageArgs[1],`API_PRODUCT_INFRASTRUCTURE_STAGE_RELEASE_DRIFT: ${name}`);
    assert.equal(recipe.namespace,stageArgs[2],`API_PRODUCT_INFRASTRUCTURE_STAGE_NAMESPACE_DRIFT: ${name}`);
    assert.equal(recipe.values[0],stageArgs[3],`API_PRODUCT_INFRASTRUCTURE_STAGE_VALUES_DRIFT: ${name}`);
    assert.equal(recipe.chart,stage.stdout.trim(),`API_PRODUCT_INFRASTRUCTURE_ARCHIVE_BINDING_DRIFT: ${name}`);
    assert.equal(hash(fs.readFileSync(recipe.chart)),lock[name].sha256,`API_PRODUCT_INFRASTRUCTURE_ARCHIVE_DRIFT: ${name}`);
    const post=recipe.args.indexOf('--post-renderer');
    assert(post>=0&&recipe.args[post+1]===path.join(root,'scripts/infrastructure-image-renderer.mjs')&&recipe.args.filter(flag=>flag==='--post-renderer').length===1,`API_PRODUCT_INFRASTRUCTURE_POST_RENDERER_UNQUALIFIED: ${name}`);
    const postArgs=recipe.args.indexOf('--post-renderer-args');
    assert(postArgs>=0&&recipe.args[postArgs+1]===name&&recipe.args.filter(flag=>flag==='--post-renderer-args').length===1,`API_PRODUCT_INFRASTRUCTURE_POST_RENDERER_ARGS_UNQUALIFIED: ${name}`);
    recipes.push({...recipe,name});
  }
  const dependencyFiles=walkProductSources(root,['scripts','my-values/infra'],file=>/\.(?:mjs|ya?ml|json|sh)$/u.test(file));
  const dependencyDigest=hash(JSON.stringify(dependencyFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])));
  const cacheKey=hash(JSON.stringify([root,versionsDigest,lock,dependencyDigest,recipes]));
  if(infrastructureOutputCache.has(cacheKey))return infrastructureOutputCache.get(cacheKey);
  const results=[],renderMarker='kubeclaw-offline-render-only-not-a-credential';
  for(const recipe of recipes)for(const upgrade of [false,true]) {
    const args=['template',recipe.release,recipe.chart,'--namespace',recipe.namespace,...recipe.values.flatMap(input=>['-f',input]),...recipe.args,...(upgrade?['--is-upgrade']:[]),...(recipe.name==='postgresql'?['--set-string',`auth.password=${renderMarker}`]:[])];
    const rendered=spawnSync('helm',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
    assert.equal(rendered.status,0,`API_PRODUCT_INFRASTRUCTURE_RENDER_FAILED: ${recipe.name}: ${rendered.stderr}`);
    const documents=YAML.parseAllDocuments(rendered.stdout);
    assert(documents.every(document=>!document.errors.length),`API_PRODUCT_INFRASTRUCTURE_YAML_INVALID: ${recipe.name}`);
    const values=documents.map(document=>document.toJS()).filter(value=>value?.apiVersion&&value?.kind);
    if(recipe.name==='postgresql')assert(!values.some(value=>value.kind==='Secret')&&!rendered.stdout.includes(renderMarker)&&!rendered.stdout.includes(Buffer.from(renderMarker).toString('base64')),'API_PRODUCT_INFRASTRUCTURE_POSTGRESQL_EXTERNAL_SECRET_REQUIRED');
    // The original binder also checks hook resources that Helm never sends to
    // its post-renderer. Keep that complete-output check in the native adapter.
    const check=spawnSync(process.execPath,['--input-type=module','-e',`import {bindInfrastructureImages} from ${JSON.stringify(pathToFileURL(path.join(root,'scripts/infrastructure-image-renderer.mjs')).href)};let bytes='';for await(const chunk of process.stdin)bytes+=chunk;bindInfrastructureImages(${JSON.stringify(recipe.name)},JSON.parse(bytes));`],{cwd:root,input:JSON.stringify(values),encoding:'utf8',maxBuffer:64*1024*1024});
    assert.equal(check.status,0,`API_PRODUCT_INFRASTRUCTURE_IMAGE_BINDING_FAILED: ${recipe.name}: ${check.stderr}`);
    values.forEach((value,index)=>results.push({value,context:{apiVersion:value.apiVersion,kind:value.kind,path:source,document:index,producer:'infrastructure-helm',profile:`${recipe.name}:${upgrade?'upgrade':'install'}`,sourceDigest:hash(fs.readFileSync(path.join(root,source))),inputs:[caller,...recipe.inputs,'versions.json'],inputDigest:hash(JSON.stringify([versionsDigest,lock[recipe.name],recipe.effectiveArgv,[caller,...recipe.inputs].map(input=>[input,hash(fs.readFileSync(path.join(root,input)))])])),dependencyDigest,outputDigest:hash(JSON.stringify(value))}}));
  }
  infrastructureOutputCache.clear();infrastructureOutputCache.set(cacheKey,results);return results;
}

const externalOutputCache = new Map();
const ciliumGeneratedSecretArchive='06210eef7c23d15f7699c79e2fe3a1ec9c389024c5c5c006ea04022d322449a2';
function externalGeneratedSecretFields(root,recipe,archive,document,value) {
  if(recipe.chart!=='cilium'||value.kind!=='Secret'||value.metadata?.labels?.['cilium.io/helm-template-non-idempotent']!=='true')return [];
  assert.equal(archive.sha256,ciliumGeneratedSecretArchive,'API_PRODUCT_GENERATED_SECRET_SOURCE_UNQUALIFIED');
  const template=/# Source: (\S+)/u.exec(document.toString())?.[1];
  const templates={
    'cilium/templates/cilium-ca-secret.yaml':{'ca.crt':'CA certificate','ca.key':'CA private key'},
    'cilium/templates/hubble/tls-helm/relay-client-secret.yaml':{'ca.crt':'CA certificate','tls.crt':'Hubble relay client certificate','tls.key':'Hubble relay client private key'},
    'cilium/templates/hubble/tls-helm/server-secret.yaml':{'ca.crt':'CA certificate','tls.crt':'Hubble server certificate','tls.key':'Hubble server private key'},
  };
  const roles=templates[template];
  assert(roles,`API_PRODUCT_GENERATED_SECRET_TEMPLATE_UNQUALIFIED: ${template}`);
  assert.deepEqual(Object.keys(value.data??{}).sort(),Object.keys(roles).sort(),`API_PRODUCT_GENERATED_SECRET_BOUNDARY_DRIFT: ${template}`);
  const extract=file=>{const result=spawnSync('tar',['-xOf',path.join(root,archive.path),file],{encoding:'utf8'});assert.equal(result.status,0,`API_PRODUCT_GENERATED_SECRET_SOURCE_MISSING: ${file}`);return result.stdout;};
  const helper=extract('cilium/templates/_helpers.tpl');const source=extract(template);
  assert(helper.includes('genCA "Cilium CA" $validity')&&helper.includes('buildCustomCert $crt $key')&&helper.includes('lookup "v1" "Secret"'),'API_PRODUCT_GENERATED_CA_SOURCE_DRIFT');
  if(template!=='cilium/templates/cilium-ca-secret.yaml')assert(source.includes('genSignedCert')&&source.includes('lookup "v1" "Secret"'),`API_PRODUCT_GENERATED_CERT_SOURCE_DRIFT: ${template}`);
  // Supplied CA bytes are real deterministic inputs, so retain them unchanged.
  // Offline Helm has no cluster lookup result; otherwise the helper generates
  // a CA. Live Helm can reuse existing CA/client/server Secrets instead.
  let suppliedCert,suppliedKey;
  for(const input of recipe.inputs.filter(input=>/\.ya?ml$/u.test(input))) {
    const values=YAML.parse(fs.readFileSync(path.join(root,input),'utf8'));
    if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'cert'))suppliedCert=values.tls.ca.cert;
    if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'key'))suppliedKey=values.tls.ca.key;
  }
  if(recipe.inline){const values=YAML.parse(recipe.inline);if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'cert'))suppliedCert=values.tls.ca.cert;if(values?.tls?.ca&&Object.hasOwn(values.tls.ca,'key'))suppliedKey=values.tls.ca.key;}
  assert(!recipe.args.some(argument=>/^tls\.ca\.(?:key|cert)=/u.test(argument)),'API_PRODUCT_GENERATED_CA_PARAMETER_UNQUALIFIED');
  const generated=[];
  for(const [key,role]of Object.entries(roles)) {
    if(key.startsWith('ca.')&&suppliedCert&&suppliedKey)continue;
    assert(typeof value.data[key]==='string'&&value.data[key].length,`API_PRODUCT_GENERATED_SECRET_VALUE_INVALID: ${template}:${key}`);
    value.data[key]=`<offline Helm generated ${role}; private bytes vary per render>`;
    generated.push({fieldPath:yamlGeneratedKey(key),role,mechanism:key.startsWith('ca.')?'cilium.ca.setup genCA fallback':'genSignedCert fallback',archiveSha256:archive.sha256,template,templateSha256:hash(source),helper:'cilium/templates/_helpers.tpl',helperSha256:hash(helper),lookupBoundary:'Offline template has no cluster Secret lookup. Live Helm can reuse complete existing CA or certificate/key data; generated private bytes are not reproduced or published.'});
  }
  return generated;
}
const yamlGeneratedKey=key=>`$.data[${JSON.stringify(key)}]`;
/** Render actual external Application bindings and installer recipes using
 * authenticated archives. Foreign CRD definitions remain registration objects. */
export function discoverExternalChartApiOutputs(root) {
  const manifestPath='scripts/external-helm-archives.json';
  if(!fs.existsSync(path.join(root,manifestPath))) return [];
  const manifestBytes=fs.readFileSync(path.join(root,manifestPath));
  const expectedManifest=fs.readFileSync(path.join(root,'scripts/external-helm-archives.sha256'),'utf8').trim().split(/\s+/)[0];
  assert.equal(hash(manifestBytes),expectedManifest,'API_PRODUCT_EXTERNAL_ARCHIVE_MANIFEST_DRIFT');
  const archives=Object.values(JSON.parse(manifestBytes).charts);
  const recipes=[];
  const normalizeRepo=value=>value.replace(/\/+$/u,'');
  for(const sourcePath of walkProductSources(root,['gitops'],file=>/\.ya?ml$/u.test(file))) {
    const bytes=fs.readFileSync(path.join(root,sourcePath));
    const documents=YAML.parseAllDocuments(bytes.toString());
    assert(documents.every(document=>!document.errors.length),`API_PRODUCT_EXTERNAL_BINDING_YAML_INVALID: ${sourcePath}`);
    for(const document of documents) {
      const app=document.toJS();
      if(app?.kind!=='Application')continue;
      for(const source of app.spec?.sources??(app.spec?.source?[app.spec.source]:[])) {
        if(!source.chart)continue;
        const ignoredValueFiles=[];
        const inputs=(source.helm?.valueFiles??[]).flatMap(file=>{
          assert(file.startsWith('$values/'),`API_PRODUCT_EXTERNAL_VALUE_BINDING_UNRESOLVED: ${sourcePath}:${file}`);
          const relative=file.slice('$values/'.length);
          assert(!path.isAbsolute(relative)&&!relative.split('/').includes('..'),`API_PRODUCT_EXTERNAL_VALUE_BINDING_UNRESOLVED: ${sourcePath}:${file}`);
          if(!fs.existsSync(path.join(root,relative))&&source.helm?.ignoreMissingValueFiles===true){ignoredValueFiles.push(relative);return [];}
          assert(fs.existsSync(path.join(root,relative)),`API_PRODUCT_EXTERNAL_VALUE_INPUT_MISSING: ${sourcePath}:${relative}`);
          return [relative];
        });
        const args=(source.helm?.parameters??[]).flatMap(parameter=>[parameter.forceString?'--set-string':'--set',`${parameter.name}=${parameter.value}`]);
        for(const parameter of source.helm?.fileParameters??[]) {
          assert(parameter.path.startsWith('$values/'),`API_PRODUCT_EXTERNAL_FILE_PARAMETER_UNRESOLVED: ${sourcePath}:${parameter.path}`);
          const input=parameter.path.slice('$values/'.length);
          assert(!path.isAbsolute(input)&&!input.split('/').includes('..')&&fs.existsSync(path.join(root,input)),`API_PRODUCT_EXTERNAL_FILE_PARAMETER_UNRESOLVED: ${sourcePath}:${parameter.path}`);
          inputs.push(input);args.push('--set-file',`${parameter.name}=${path.join(root,input)}`);
        }
        const inline=source.helm?.valuesObject!==undefined?YAML.stringify(source.helm.valuesObject):source.helm?.values;
        const helm=source.helm??{};
        assert(helm.apiVersions===undefined||(Array.isArray(helm.apiVersions)&&helm.apiVersions.every(value=>typeof value==='string')),`API_PRODUCT_EXTERNAL_API_VERSIONS_INVALID: ${sourcePath}`);
        assert(helm.kubeVersion===undefined||typeof helm.kubeVersion==='string',`API_PRODUCT_EXTERNAL_KUBE_VERSION_INVALID: ${sourcePath}`);
        recipes.push({path:sourcePath,profile:`application:${app.metadata.name}`,chart:source.chart,version:source.targetRevision,repository:source.repoURL,release:helm.releaseName??app.metadata.name,namespace:helm.namespace??app.spec.destination.namespace,inputs,args,inline,ignoredValueFiles,kubeVersion:helm.kubeVersion??'1.35.0',apiVersions:helm.apiVersions??[],skipCrds:helm.skipCrds===true,skipSchemaValidation:helm.skipSchemaValidation===true});
      }
    }
  }
  const installerRecipes=[
    {path:'scripts/deploy-argocd.sh',chart:'argo-cd',version:'10.8.0',repository:'https://argoproj.github.io/argo-helm',release:'argocd',namespace:'argocd',inputs:['my-values/infra/argocd-values.yaml','charts/gitops/files/application-health.lua'],args:['--set-string','configs.cm.application\\.resourceTrackingMethod=annotation','--set-file',`configs.cm.resource\\.customizations\\.health\\.argoproj\\.io_Application=${path.join(root,'charts/gitops/files/application-health.lua')}`]},
    {path:'scripts/deploy-cilium.sh',chart:'cilium',version:'1.20.1',repository:'https://helm.cilium.io/',release:'cilium',namespace:'cilium',inputs:['my-values/infra/cilium-values.yaml'],args:[]},
    {path:'scripts/deploy.sh',chart:'spire',version:'0.30.0',repository:'https://spiffe.github.io/helm-charts-hardened/',release:'spire',namespace:'spire-server',inputs:['my-values/infra/spire-values.yaml'],args:[]},
    {path:'scripts/deploy.sh',chart:'spire-crds',version:'0.6.0',repository:'https://spiffe.github.io/helm-charts-hardened/',release:'spire-crds',namespace:'spire-server',inputs:[],args:[]},
  ];
  assertProducerAdapterAuthority(root,[...new Set(installerRecipes.map(recipe=>recipe.path).filter(source=>fs.existsSync(path.join(root,source))))]);
  for(const recipe of installerRecipes)if(fs.existsSync(path.join(root,recipe.path))) {
    const shell=installerShell(root,recipe.path);
    const chart=recipe.chart==='argo-cd'?'argo/argo-cd':recipe.chart==='cilium'?'cilium/cilium':`spiffe/${recipe.chart}`;
    const invocations=shell.invocations.filter(argv=>argv[4]===chart);
    assert.equal(invocations.length,1,`API_PRODUCT_INSTALLER_RECIPE_OPERATION_UNQUALIFIED: ${recipe.path}:${recipe.chart}`);
    const parsed=installerHelmRecipe(root,recipe.path,invocations[0].map(shell.expand));
    assert(!parsed.args.includes('--post-renderer')&&!parsed.args.includes('--post-renderer-args'),`API_PRODUCT_EXTERNAL_POST_RENDERER_UNQUALIFIED: ${recipe.path}`);
    parsed.chart=chart.split('/').at(-1);
    const alias=chart.split('/')[0];
    const repositories=shell.source.split('\n').filter(line=>new RegExp(`^\\s*(?:helm repo add|add_helm_repo_once) ${alias}\\s`,'u').test(line)).map(line=>{
      const argv=shell.tokens(line);const offset=argv[0]==='helm'?3:1;
      assert(argv[offset]===alias&&argv[offset+1]&&argv.slice(offset+2).every(flag=>flag==='--force-update'||flag==='>/dev/null'),`API_PRODUCT_INSTALLER_REPOSITORY_UNQUALIFIED: ${recipe.path}:${alias}`);
      return shell.expand(argv[offset+1]);
    });
    assert(repositories.length&&new Set(repositories).size===1,`API_PRODUCT_INSTALLER_REPOSITORY_BINDING_MISSING: ${recipe.path}:${alias}`);
    parsed.repository=repositories[0];
    recipes.push({...parsed,profile:`installer:${parsed.release}`});
  }
  for(const sourcePath of new Set(installerRecipes.map(recipe=>recipe.path)))if(fs.existsSync(path.join(root,sourcePath))) {
    const shell=installerShell(root,sourcePath);
    for(const argv of shell.invocations)if(/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/u.test(argv[4]))assert(recipes.some(recipe=>recipe.path===sourcePath&&recipe.effectiveArgv?.[4]===argv[4]),`API_PRODUCT_INSTALLER_SELECTED_CHART_UNQUALIFIED: ${sourcePath}:${argv[4]}`);
  }
  const cacheKey=hash(JSON.stringify([root,hash(manifestBytes),archives.map(archive=>[archive.path,hash(fs.readFileSync(path.join(root,archive.path)))]),recipes.map(recipe=>({...recipe,sourceDigest:hash(fs.readFileSync(path.join(root,recipe.path))),inputDigests:recipe.inputs.map(input=>[input,hash(fs.readFileSync(path.join(root,input)))])}))]));
  if(externalOutputCache.has(cacheKey))return externalOutputCache.get(cacheKey);
  const results=[];
  for(const recipe of recipes) {
    const archive=archives.find(item=>item.chart===recipe.chart&&item.version===recipe.version&&normalizeRepo(item.repository)===normalizeRepo(recipe.repository));
    assert(archive,`API_PRODUCT_EXTERNAL_ARCHIVE_AUTHORITY_MISSING: ${recipe.path}:${recipe.chart}@${recipe.version}`);
    const archivePath=path.join(root,archive.path);
    assert.equal(hash(fs.readFileSync(archivePath)),archive.sha256,`API_PRODUCT_EXTERNAL_ARCHIVE_DRIFT: ${archive.path}`);
    for(const upgrade of recipe.profile.startsWith('application:')?[false]:[false,true]) {
      const inlineDirectory=recipe.inline!==undefined?fs.mkdtempSync(path.join(os.tmpdir(),'kubeclaw-docs-external-inline-')):null;
      const inlinePath=inlineDirectory?path.join(inlineDirectory,'values.yaml'):null;
      if(inlinePath)fs.writeFileSync(inlinePath,recipe.inline);
      const args=['template',recipe.release,archivePath,'--namespace',recipe.namespace,'--kube-version',recipe.kubeVersion??'1.35.0',...(recipe.apiVersions??[]).flatMap(value=>['--api-versions',value]),...(recipe.skipCrds?[]:['--include-crds']),'--skip-tests',...(recipe.skipSchemaValidation?['--skip-schema-validation']:[]),...(recipe.values??recipe.inputs.filter(input=>/\.ya?ml$/u.test(input)).map(input=>path.join(root,input))).flatMap(input=>['-f',input]),...(inlinePath?['-f',inlinePath]:[]),...recipe.args,...(upgrade?['--is-upgrade']:[])];
      const rendered=spawnSync('helm',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024});
      if(inlineDirectory)fs.rmSync(inlineDirectory,{recursive:true,force:true});
      assert.equal(rendered.status,0,`API_PRODUCT_EXTERNAL_RENDER_FAILED: ${recipe.profile}: ${rendered.stderr}`);
      const documents=YAML.parseAllDocuments(rendered.stdout);
      assert(documents.every(document=>!document.errors.length),`API_PRODUCT_EXTERNAL_RENDER_YAML_INVALID: ${recipe.profile}`);
      documents.forEach((document,index)=>{const value=document.toJS();if(!value?.apiVersion||!value?.kind)return;
        const observedOutputDigest=hash(JSON.stringify(value));
        const generatedFields=externalGeneratedSecretFields(root,recipe,archive,document,value);
        results.push({value,...(generatedFields.length?{privateObservation:{observedOutputDigest}}:{}),context:{apiVersion:value.apiVersion,kind:value.kind,path:recipe.path,document:index,producer:'external-helm',archivePath:archive.path,archiveSha256:archive.sha256,...(generatedFields.length?{generatedFields}:{}),profile:`${recipe.profile}:${upgrade?'upgrade':'install'}`,sourceDigest:hash(fs.readFileSync(path.join(root,recipe.path))),inputs:recipe.inputs,inputDigest:hash(JSON.stringify([recipe.inputs.map(input=>[input,hash(fs.readFileSync(path.join(root,input)))]),recipe.inline??null])),dependencyDigest:hash(JSON.stringify([recipe.chart,recipe.version,recipe.repository,archive.sha256,recipe.release,recipe.namespace,recipe.effectiveArgv??null,recipe.args,recipe.kubeVersion??'1.35.0',recipe.apiVersions??[],recipe.skipCrds??false,recipe.skipSchemaValidation??false])),outputDigest:hash(JSON.stringify(value))}});
      });
    }
  }
  externalOutputCache.clear();externalOutputCache.set(cacheKey,results);return results;
}
