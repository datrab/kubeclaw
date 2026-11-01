import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {shellNativeNodeEntries} from './docs-shell-source-custody.mjs';

const authorityPath = 'scripts/docs-api-top-level-script-purpose-authority.json';
const authoritySha256 = '88850308d72e7f7595d0926dded683d1224731d7169f0648b97b0f3afe037f95';
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
]);
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
  'scripts/updates/deployment-release.mjs:177': 'full validated40hex selected code/image commit scalar after selected-release checks; not observed materialization or Helm success',
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
  const actual = selectedSources.flatMap(source => classify(source).map(role => ({source, ...descriptor(role)})));
  if (JSON.stringify(actual) !== JSON.stringify(authority.descriptors)) fail('canonical native slot/role roster; registry relabel or missing/new slot');
  const receipt = Object.freeze({
    witnessDigest: authoritySha256, inputDigest: hash(JSON.stringify(facts)), currentPurposeInputBindingDigest,
    dependencies: Object.freeze([authorityPath, ...facts.map(input => input.path)]),
    descriptors: Object.freeze(authority.descriptors.map(Object.freeze)),
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
  });
  receipts.add(receipt);
  return receipt;
}

export function selectedTopLevelScriptPurpose(source, role, receipt) {
  if (!selectedSources.includes(source)) return null;
  assert(receipt && receipts.has(receipt), 'API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: unacquired receipt');
  const expected = receipt.descriptors.find(item => item.source === source && item.line === role.line && item.sink === role.sink);
  assert(expected && JSON.stringify(descriptor(expected)) === JSON.stringify(descriptor(role)),
    'API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED: changed canonical slot or role');
  const purpose = purposes[`${source}:${role.line}`];
  if (!purpose) return null; // Raw/API/mixed streams still need their own finite adapters.
  return Object.freeze({purpose, canonicalRawRole: role.role, witnessDigest: receipt.witnessDigest, inputDigest: receipt.inputDigest,
    currentPurposeInputBindingDigest: receipt.currentPurposeInputBindingDigest,
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
    limit: 'Source-owned output purpose only; runtime inputs/results unobserved; arbitrary embedded tool/status bytes are not globally non-API.'});
}

// Builtin NodeTest receiving-context purpose only; never payload truth or an
// execution/safety grant. Existing exact Source profiles remain independent.
//
// A reusable, deliberately partial ownership grammar. Authority is actual
// builtin test receiver + fresh allocator/lifecycle + closed lexical callers,
// NEVER test directory, fixture Source hash, raw descriptor roster or temp name.
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
  if (!graph || graph.edges.some(edge => edge.target === source)
    || graph.aliases.some(alias => JSON.stringify(alias).includes(source))) return null;
  // A canonical public traversal seed is NOT a CLI invocation. Require genuine
  // maintained package argv instead; the graph's public canonical source is
  // allowed only at its identical path. Bin/main/exports ownership is separate.
  if (graph.publicEntries.some(entry => entry.canonicalSource === source && entry.path !== source)) return null;
  const pkg = JSON.parse(physical('package.json') ?? 'null');
  if (!pkg || [pkg.bin, pkg.main, pkg.exports].some(value =>
    value && JSON.stringify(value).includes(source))) return null;
  if (!Array.isArray(nativePackageEntries)) return null;
  const entries = nativePackageEntries.filter(entry => entry.source === source);
  if (!entries.length) return null;
  for (const entry of entries) {
    if (pkg.scripts?.[entry.name] !== entry.command) return null;
    const invocations = shellNativeNodeEntries(`package.json#${entry.name}`, entry.command);
    const targeting = invocations.filter(invocation=>invocation.start===entry.nativeCommandStart
      && invocation.end===entry.nativeCommandEnd); // native maintained expansion, not a new glob parser
    // No env/loader/wrapper/cwd inference. Existing parser rejects unsupported
    // options; every actual targeting invocation must be a direct node --test.
    if (!entry.nativeTest || targeting.length!==1 || targeting.some(invocation => !invocation.nativeTest
      || invocation.words[0]?.value !== 'node' || invocation.words.some(word => word.expanded))) return null;
  }

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
  const defaultImport = module => {
    const imports = tree.statements.filter(node => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === module
      && node.importClause?.name && !node.importClause.namedBindings);
    return imports.length === 1 ? imports[0].importClause.name : null;
  };
  const fsName = defaultImport('node:fs'), pathName = defaultImport('node:path');
  const osName = defaultImport('node:os'), assertName = defaultImport('node:assert/strict');
  const testNames = tree.statements.filter(node => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'node:test')
    .flatMap(node => [node.importClause?.name, ...(node.importClause?.namedBindings
      && ts.isNamedImports(node.importClause.namedBindings) ? node.importClause.namedBindings.elements
        .filter(element => (element.propertyName ?? element.name).text === 'test').map(element => element.name) : [])]).filter(Boolean);
  if (![fsName, pathName, osName].every(Boolean) || !testNames.length) return null;
  const member = (node, binding, name) => !!node && ts.isPropertyAccessExpression(node)
    && same(node.expression, binding) && node.name.text === name;
  const call = (node, binding, name, count) => !!node && ts.isCallExpression(node)
    && member(node.expression, binding, name) && node.arguments.length === count;
  // No builtin object/method aliasing, mutation or passing of imported handles.
  // Arbitrary ordinary Source code is not globally exempted by this predicate.
  for (const binding of [fsName, pathName, osName]) {
    if (refs(binding).some(node => {
      const access = node.parent;
      return !(ts.isPropertyAccessExpression(access) && access.expression === node
        && ts.isCallExpression(access.parent) && access.parent.expression === access)
        && !(binding === assertName && ts.isCallExpression(access) && access.expression === node);
    })) return null;
  }
  const testCallback = registration => {
    const args=registration.arguments;
    if (![2,3].includes(args.length)||!ts.isStringLiteral(args[0])) return null;
    if(args.length===3&&(!ts.isObjectLiteralExpression(args[1])||args[1].properties.some(property=>
      !ts.isPropertyAssignment(property)||!(ts.isIdentifier(property.name)||ts.isStringLiteral(property.name))
      ||!(ts.isStringLiteral(property.initializer)||ts.isNumericLiteral(property.initializer)
        ||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword].includes(property.initializer.kind)))))return null;
    const callback=args.at(-1);
    return (ts.isArrowFunction(callback)||ts.isFunctionExpression(callback))&&ts.isBlock(callback.body)?callback:null;
  };
  const callbacks = new Set();
  for (const reference of testNames.flatMap(refs)) {
    const registration = reference.parent;
    if (!ts.isCallExpression(registration) || registration.expression !== reference
      || !ts.isExpressionStatement(registration.parent) || registration.parent.parent !== tree) return null;
    const callback = testCallback(registration);
    if (!callback) return null;
    callbacks.add(callback);
  }
  if (!callbacks.size) return null;
  // Local helper closure is derived from REAL binding references, not its name.
  // A helper may return any record/property names; exported/escaped callbacks,
  // recursion without a test seed and dynamic invocation remain unsupported.
  const helperBinding=fn=>ts.isFunctionDeclaration(fn)?fn.name
    :ts.isVariableDeclaration(fn.parent)&&fn.parent.initializer===fn&&isConst(fn.parent)
      &&identifier(fn.parent.name)?fn.parent.name:null;
  const helpers=nodes.filter(node=>{
    if(ts.isFunctionDeclaration(node))return !!node.name&&!!node.body&&!node.modifiers?.some(modifier=>modifier.kind!==ts.SyntaxKind.AsyncKeyword)&&node.parent===tree;
    if(!(ts.isArrowFunction(node)||ts.isFunctionExpression(node)&&!node.name)||!helperBinding(node))return false;
    const statement=node.parent.parent.parent;
    return ts.isVariableStatement(statement)&&statement.parent===tree&&!statement.modifiers?.length;
  });
  const awaitedHelperReference=(reference,fn)=>{
    const invocation=reference.parent;
    if(!ts.isCallExpression(invocation)||invocation.expression!==reference)return false;
    if(!fn.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.AsyncKeyword))return true;
    let selected=invocation;
    while(ts.isParenthesizedExpression(selected.parent))selected=selected.parent;
    return ts.isAwaitExpression(selected.parent);
  };
  const closed = new Set(callbacks);
  const helperCalls = new Map();
  for (let changed = true; changed;) {
    changed = false;
    for (const fn of helpers) {
      if (closed.has(fn)) continue;
      const references = refs(helperBinding(fn));
      if (!references.length || references.some(reference => !awaitedHelperReference(reference,fn)
        || !closed.has(enclosingFunction(reference)))) continue;
      closed.add(fn); helperCalls.set(fn, references.map(reference => reference.parent)); changed = true;
    }
  }
  // Nested t.test callbacks are genuine builtin receiving contexts only when t
  // resolves to a registered callback's own context parameter; not method text.
  for (let changed = true; changed;) {
    changed = false;
    for (const node of nodes.filter(ts.isCallExpression)) {
      const owner = enclosingFunction(node), parameter = owner?.parameters[0]?.name;
      if (!callbacks.has(owner) || !identifier(parameter)
        || !member(node.expression, parameter, 'test')) continue;
      const callback = testCallback(node);
      if (callback
        && !callbacks.has(callback)) { callbacks.add(callback); closed.add(callback); changed = true; }
    }
  }
  // Helpers called solely from nested test contexts get the same closure check.
  for (let changed = true; changed;) {
    changed = false;
    for (const fn of helpers) {
      if (closed.has(fn)) continue;
      const references = refs(helperBinding(fn));
      if (references.length && references.every(reference => awaitedHelperReference(reference,fn)
        && closed.has(enclosingFunction(reference)))) {
        closed.add(fn); helperCalls.set(fn, references.map(reference => reference.parent)); changed = true;
      }
    }
  }
  const empty = {bindings:new Map(), chain:[]};
  const unwrap = node => {
    while (node && (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node)
      || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
    return node;
  };
  const mutationPath = expression => {
    const keys=[];
    while(ts.isPropertyAccessExpression(expression)||ts.isElementAccessExpression(expression)){
      keys.unshift(ts.isPropertyAccessExpression(expression)?expression.name.text
        :ts.isStringLiteral(expression.argumentExpression)?expression.argumentExpression.text:null);
      expression=expression.expression;
    }
    return identifier(expression)?{base:expression,keys}:null;
  };
  const mutated = (binding, keys = []) => nodes.some(node => {
    let target=null;
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind<=ts.SyntaxKind.LastAssignment)target=node.left;
    if(ts.isDeleteExpression(node)||ts.isPostfixUnaryExpression(node)||ts.isPrefixUnaryExpression(node))target=node.expression??node.operand;
    const projection=target&&mutationPath(target);
    return projection&&same(projection.base,binding)
      && (keys.length ? projection.keys.slice(0,Math.min(keys.length,projection.keys.length)).every((key,index)=>key===null||key===keys[index])
        : !projection.keys.length);
  });
  if([...callbacks].some(callback=>identifier(callback.parameters[0]?.name)
    && (mutated(callback.parameters[0].name,['test'])||mutated(callback.parameters[0].name,['after']))))return null;
  const safeSuffix = value => typeof value === 'string' && value && !value.includes('\\')
    && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
  const returned = fn => {
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
    const returns = nodes.filter(node => ts.isReturnStatement(node) && enclosingFunction(node) === fn);
    return returns.length === 1 && returns[0].parent === fn.body ? returns[0].expression : null;
  };
  // This is an OWNERSHIP domain only: literal relative suffix / owned path /
  // lazy record / local closure. It never evaluates arbitrary JavaScript, treats
  // function output as true, or infers non-API from a test or temporary dirname.
  const withOrigins=(result,origins)=>result?{...result,origins:[...new Set([...(result.origins??[]),...origins])]}:null;
  function value(node, context = empty, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return null;
    seen = new Set([...seen,node]);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return {kind:'literal',text:node.text};
    if (identifier(node)) {
      const symbol = sym(node), bound = context.bindings.get(symbol);
      if (bound) return withOrigins(value(bound.node,bound.context,seen),[node]);
      const declaration = symbol?.declarations?.find(declaration => ts.isVariableDeclaration(declaration)
        || ts.isBindingElement(declaration) || ts.isFunctionDeclaration(declaration));
      if (declaration && ts.isFunctionDeclaration(declaration)) return closed.has(declaration) ? {kind:'function',fn:declaration,context} : null;
      if (declaration && ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)
        && !declaration.dotDotDotToken && identifier(declaration.name)) {
        const variable = declaration.parent.parent;
        if (!isConst(variable) || mutated(declaration.name)) return null;
        const record = value(variable.initializer,context,seen);
        const key = declaration.propertyName ?? declaration.name;
        return record?.kind === 'record' && (identifier(key) || ts.isStringLiteral(key))
          ? withOrigins(value(record.properties.get(key.text),record.context,seen),[declaration.name,...(record.origins??[])]) : null;
      }
      if (!isConst(declaration) || !identifier(declaration.name) || mutated(declaration.name)) return null;
      return withOrigins(value(declaration.initializer,context,seen),[declaration.name]);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const properties = new Map();
      for (const property of node.properties) {
        if (!(ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property))
          || !(identifier(property.name) || ts.isStringLiteral(property.name))
          || properties.has(property.name.text)) return null;
        properties.set(property.name.text,ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer);
      }
      return {kind:'record',properties,context};
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return {kind:'function',fn:node,context};
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const projection=mutationPath(node);
      if(projection&&mutated(projection.base,projection.keys))return null;
      const record = value(node.expression,context,seen);
      const key = ts.isPropertyAccessExpression(node) ? node.name.text
        : ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null;
      return record?.kind === 'record' && key !== null ? withOrigins(value(record.properties.get(key),record.context,seen),record.origins??[]) : null;
    }
    if (!ts.isCallExpression(node)) return null;
    if (call(node,fsName,'mkdtempSync',1) && call(node.arguments[0],pathName,'join',2)
      && call(node.arguments[0].arguments[0],osName,'tmpdir',0)
      && ts.isStringLiteral(node.arguments[0].arguments[1]) && closed.has(enclosingFunction(node))) {
      return {kind:'owned',allocator:node,context,key:[...context.chain,node.getStart(tree)].join(':'),parts:[]};
    }
    if (member(node.expression,pathName,'join') && node.arguments.length >= 2) {
      const base = value(node.arguments[0],context,seen);
      const suffixes = node.arguments.slice(1).map(argument=>value(argument,context,seen));
      return base?.kind === 'owned' && suffixes.every(suffix=>suffix?.kind==='literal'&&safeSuffix(suffix.text))
        ? {...base,parts:[...base.parts,...suffixes.flatMap(suffix=>suffix.text.split('/'))]} : null;
    }
    if (call(node,pathName,'dirname',1)) {
      const base = value(node.arguments[0],context,seen);
      return base?.kind === 'owned' && base.parts.length ? {...base,parts:base.parts.slice(0,-1)} : null;
    }
    const callee = value(node.expression,context,seen);
    if (callee?.kind !== 'function' || !closed.has(callee.fn)
      || callee.fn.parameters.some(parameter=>!identifier(parameter.name) || parameter.dotDotDotToken)) return null;
    const expression = returned(callee.fn);
    if (!expression) return null;
    const child = {bindings:new Map(callee.context.bindings),chain:[...context.chain,node.getStart(tree)]};
    callee.fn.parameters.forEach((parameter,index)=>child.bindings.set(sym(parameter.name),
      node.arguments[index] ? {node:node.arguments[index],context} : {node:parameter.initializer,context:child}));
    return value(expression,child,seen);
  }
  const rootSame = (left,right) => left?.kind === 'owned' && right?.kind === 'owned' && left.key === right.key;
  const rootContext = pathValue => pathValue.context;
  const rootLifecycle = pathValue => nodes.some(node => {
    if (!call(node,fsName,'rmSync',2)) return false;
    const target = value(node.arguments[0],rootContext(pathValue));
    if (!rootSame(pathValue,target) || target.parts.length) return false;
    // Finally removal is the actual enclosing allocator owner's cleanup, not a
    // same-text root from a different helper invocation or a conditional branch.
    const allocatorOwner = enclosingFunction(pathValue.allocator);
    for (let parent=node.parent;parent;parent=parent.parent) {
      if (ts.isBlock(parent) && ts.isTryStatement(parent.parent) && parent.parent.finallyBlock === parent
        && enclosingFunction(parent) === allocatorOwner) return true;
      if (ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) {
        const registration = parent.parent;
        if (!ts.isCallExpression(registration) || registration.arguments.length !== 1
          || registration.arguments[0] !== parent || !ts.isPropertyAccessExpression(registration.expression)
          || registration.expression.name.text !== 'after') return false;
        let receiver = registration.expression.expression;
        if(identifier(receiver)&&mutated(receiver,['after']))return false;
        const bound = rootContext(pathValue).bindings.get(sym(receiver));
        if (bound) receiver = bound.node;
        return [...callbacks].some(callback=>identifier(callback.parameters[0]?.name)
          && same(receiver,callback.parameters[0].name));
      }
      if (ts.isFunctionLike(parent)) return false;
    }
    return false;
  });
  // Reject ownership-handle/global escapes and rebinding. Passing an owned path
  // to a real test's product receiver remains a fixture setup operation; it does
  // NOT exempt that callee's API sinks or grant its exported runtime capability.
  const noEscape = (expression,origins) => {
    const inspect = node => {
      if (!identifier(node)) return true;
      const declaration = sym(node)?.declarations?.find(declaration=>ts.isVariableDeclaration(declaration)||ts.isParameter(declaration)||ts.isBindingElement(declaration));
      if (!declaration || !(isConst(declaration)||ts.isParameter(declaration)
        ||ts.isBindingElement(declaration)&&isConst(declaration.parent.parent)) || !identifier(declaration.name)) return true;
      const record=value(declaration.name)?.kind==='record';
      return refs(declaration.name).every(reference=>{
        if(record&&!(ts.isPropertyAccessExpression(reference.parent)&&reference.parent.expression===reference
          || ts.isElementAccessExpression(reference.parent)&&reference.parent.expression===reference
            && ts.isStringLiteral(reference.parent.argumentExpression)
          ||ts.isReturnStatement(reference.parent)&&helpers.includes(enclosingFunction(reference))
            &&closed.has(enclosingFunction(reference))))return false;
        const owner = enclosingFunction(reference);
        if (!closed.has(owner) && ![...closed].some(callback=>{
          for(let parent=reference.parent;parent;parent=parent.parent)if(parent===callback)return true;
          return false;
        })) return false;
        for(let parent=reference;parent&&!ts.isStatement(parent);parent=parent.parent){
          if(ts.isBinaryExpression(parent)&&parent.operatorToken.kind>=ts.SyntaxKind.FirstAssignment
            && parent.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&parent.right.getStart(tree)<=reference.getStart(tree)
            && parent.right.end>=reference.end)return false;
        }
        return !mutated(declaration.name);
      });
    };
    let okay=true;const walk=node=>{if(!inspect(node))okay=false;ts.forEachChild(node,walk);};walk(expression);for(const origin of origins)if(!inspect(origin))okay=false;return okay;
  };
  const contextsFor=(owner,seen=new Set())=>{
    if(callbacks.has(owner))return [empty];
    if(seen.has(owner)||!helperCalls.has(owner))return [];
    const result=[];seen=new Set([...seen,owner]);
    for(const invocation of helperCalls.get(owner))for(const parent of contextsFor(enclosingFunction(invocation),seen)){
      if(owner.parameters.some(parameter=>!identifier(parameter.name)||parameter.dotDotDotToken))return [];
      const child={bindings:new Map(parent.bindings),chain:[...parent.chain,invocation.getStart(tree)]};
      owner.parameters.forEach((parameter,index)=>child.bindings.set(sym(parameter.name),invocation.arguments[index]
        ?{node:invocation.arguments[index],context:parent}:{node:parameter.initializer,context:child}));
      result.push(child);
    }
    return result;
  };
  const owned = [];
  for (const write of nodes.filter(node => call(node,fsName,'writeFileSync',2) && closed.has(enclosingFunction(node)))) {
    const contexts=contextsFor(enclosingFunction(write));
    const targets=contexts.map(context=>value(write.arguments[0],context));
    if(!contexts.length||targets.some(target=>target?.kind!=='owned'||!target.parts.length||!rootLifecycle(target))
      ||!noEscape(write.arguments[0],targets.flatMap(target=>target.origins??[])))continue;
    const line = tree.getLineAndCharacterOfPosition(write.getStart(tree)).line + 1;
    if (nodes.filter(node=>ts.isCallExpression(node)&&node.expression.getText(tree)==='fs.writeFileSync'
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
    owned.push({roles:new Map(occurrenceRoles.map(role=>[role,JSON.stringify(role)])),start:write.getStart(tree),end:write.end,
      payloadStart:payload.getStart(tree),payloadEnd:payload.end,closedLiteral:literal(payload)||json&&literal(payload.arguments[0])});
  }
  if (!owned.length) return null;
  const receipt=Object.freeze({purpose:'native-node-test-owned-fixture-write',runtimeApiGrant:false,applyGrant:false,rawRoleMutation:false});
  nodeFixtureReceipts.set(receipt,{source,bytes,owned});return receipt;
}

export function selectedNodeTestFixturePurpose(source,role,receipt,apiExclusion=false) {
  const proof=nodeFixtureReceipts.get(receipt);
  return !!proof&&proof.source===source&&proof.owned.some(occurrence=>occurrence.roles.has(role)
    && occurrence.roles.get(role)===JSON.stringify(role)&&(!apiExclusion||occurrence.closedLiteral));
}
export function selectedNodeTestFixtureNodePurpose(source,tree,node,receipt) {
  const proof=nodeFixtureReceipts.get(receipt);
  return !!proof&&proof.source===source&&tree.text===proof.bytes&&node.getSourceFile?.()===tree
    && proof.owned.some(occurrence=>occurrence.closedLiteral&&(node.getStart(tree)===occurrence.start&&node.end===occurrence.end
      || node.getStart(tree)>=occurrence.payloadStart&&node.end<=occurrence.payloadEnd));
}
