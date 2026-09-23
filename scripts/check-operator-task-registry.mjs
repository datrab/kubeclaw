#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'docs/generated/inventory/operator-tasks.json');
assert.ok(fs.existsSync(registryPath), 'operator task registry is missing; generate docs/generated/inventory/operator-tasks.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
assert.equal(registry.schemaVersion, 'operator-task-registry-v1', 'unsupported operator task registry version');
assert.equal(registry.generatedFrom, 'docs/operator-tasks.json',
  'operator task registry must identify its authored generation source');
assert.deepEqual(registry.recoveryOutcomeSources, [
  'skills/nova/project/recovery.ts',
  'skills/nova/project/delivery-manifest.ts',
], 'operator task registry must name every project recovery outcome authority');
assert.ok(Array.isArray(registry.tasks), 'operator task registry must contain a tasks array');

const REQUIRED_TASK_IDS = [
  'install-preflight',
  'start-readiness-observe',
  'run-control',
  'symptom-diagnosis',
  'backup-restore',
  'upgrade-rollback',
  'rotation',
  'capacity-retention',
  'plugin-lifecycle',
  'decommission',
  'prism-studio',
  'demo-delivery',
  'worker-trust',
];
const REQUIRED_LIFECYCLE_COVERAGE = new Map([
  ['install', 'install-preflight'],
  ['preflight', 'install-preflight'],
  ['start', 'start-readiness-observe'],
  ['health', 'start-readiness-observe'],
  ['observe', 'start-readiness-observe'],
  ['signal', 'run-control'],
  ['resume', 'run-control'],
  ['cancel boundary', 'run-control'],
  ['diagnose', 'symptom-diagnosis'],
  ['backup', 'backup-restore'],
  ['restore', 'backup-restore'],
  ['upgrade', 'upgrade-rollback'],
  ['rollback', 'upgrade-rollback'],
  ['decommission', 'decommission'],
]);
const REQUIRED_PROCEDURE_FIELDS = [
  'supportedStartStateAndVersion',
  'executionLocation',
  'implementationAuthority',
  'preconditions',
  'orderedSteps',
  'expectedObservations',
  'stopConditions',
  'failureDistinction',
  'recoveryRollback',
  'cleanup',
  'evidence',
];
const SEMANTIC_REQUIREMENTS = new Map([
  ['supportedStartStateAndVersion', /\b(?:start|state|version|applies|release|current)\b/iu],
  ['executionLocation', /\b(?:run|location|machine|browser|cluster|repository|environment)\b/iu],
  ['implementationAuthority', /\b(?:authorit|owner|owns|source|implementation|contract|schema)\w*/iu],
  ['preconditions', /\b(?:precondition|before|requires?|start|stop|must)\w*/iu],
  ['orderedSteps', /(?:^|\n)\s*(?:\d+\.|```(?:bash|sh|json)?)/imu],
  ['expectedObservations', /\b(?:expected|observation|result|output|reports?|proof|verify|success)\w*/iu],
  ['stopConditions', /\b(?:stop|abort|refuse|reject|do not|must not|unsupported)\w*/iu],
  ['failureDistinction', /\b(?:failure|cause|symptom|error|mismatch|denied|distinguish|observation|condition|state)\w*/iu],
  ['recoveryRollback', /\b(?:recover|rollback|restore|repair|return|reconcile)\w*/iu],
  ['cleanup', /\b(?:cleanup|remove|delete|temporary|retain|revoke)\w*/iu],
  ['evidence', /\b(?:evidence|retain|record|output|receipt|digest|log)\w*/iu],
]);
const useRoot = process.env.OPERATOR_TASK_USE_ROOT
  ? path.resolve(process.env.OPERATOR_TASK_USE_ROOT) : path.join(root, 'docs/site/use');
function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  }).sort();
}

function shellFences(markdown) {
  const lines = markdown.split('\n');
  const fences = [];
  const containerContent = (line) => {
    let value = line;
    // Remove Markdown container syntax, not shell content. Repeating this step
    // handles nested blockquotes and list items at arbitrary indentation.
    while (true) {
      const previous = value;
      value = value.replace(/^\s*>[ \t]?/u, '');
      value = value.replace(/^\s*(?:[-+*]|\d+[.)])[ \t]+/u, '');
      if (value === previous) break;
    }
    return value.trimStart();
  };
  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^(`{3,}|~{3,})\s*(bash|sh)\s*$/u.exec(containerContent(lines[index]));
    if (!opening) continue;
    const marker = opening[1][0];
    const minimum = opening[1].length;
    const body = [];
    for (index += 1; index < lines.length; index += 1) {
      const content = containerContent(lines[index]);
      const closing = /^(`{3,}|~{3,})\s*$/u.exec(content);
      if (closing && closing[1][0] === marker && closing[1].length >= minimum) break;
      body.push(content);
    }
    fences.push(body.join('\n'));
  }
  return fences;
}

const usePages = markdownFiles(useRoot);

const discoveredTasks = new Map();
const discoveredVariants = new Map();
for (const filePath of usePages) {
  const relativePage = `docs/site/use/${path.relative(useRoot, filePath).split(path.sep).join('/')}`;
  const markdown = fs.readFileSync(filePath, 'utf8');
  for (const match of markdown.matchAll(/<!--\s*operator-task:\s*([a-z0-9-]+)\s*-->/gu)) {
    assert.equal(discoveredTasks.has(match[1]), false, `duplicate operator-task marker: ${match[1]}`);
    discoveredTasks.set(match[1], relativePage);
  }
  for (const match of markdown.matchAll(/<!--\s*operator-variant:\s*([a-z0-9-]+)\/([a-z0-9-]+)\s*-->/gu)) {
    const identity = `${match[1]}/${match[2]}`;
    assert.equal(discoveredVariants.has(identity), false, `duplicate operator-variant marker: ${identity}`);
    discoveredVariants.set(identity, relativePage);
  }

  for (const body of shellFences(markdown)) {
    if (body.includes('assert_cluster_binding() {')) continue;
    const hasRawClusterCommand = body.split('\n').some((line) =>
      /^\s*(?:sudo\s+)?(?:kubectl|helm|\.\/scripts\/deploy\.sh)\b/u.test(line));
    if (!hasRawClusterCommand) continue;
    const firstCommand = body.split('\n').find((line) => line.trim() && !line.trim().startsWith('#'))?.trim();
    assert.equal(firstCommand, 'assert_cluster_binding',
      `${relativePage}: cluster-capable fenced block must begin with assert_cluster_binding or use only bound wrappers`);
  }
}

const quickstart = fs.readFileSync(path.join(useRoot, 'quickstart.md'), 'utf8');
assert.equal((quickstart.match(/npm ci --ignore-scripts/gu) ?? []).length, 1,
  'quickstart must contain the single canonical npm ci invocation');
for (const required of [
  '## Locked Dependency Installation', 'package-lock.sha256', 'registry.txt',
  'npm-ci.stdout.txt', 'npm-ci.stderr.txt', 'npm-ci.exit-status.txt',
  'deletes and recreates `node_modules`', 'disposable checkout',
]) assert.ok(quickstart.includes(required), `canonical npm ci contract omits ${required}`);
for (const name of ['install.md', 'demo-delivery.md', 'plugins.md', 'maintenance.md']) {
  const markdown = fs.readFileSync(path.join(useRoot, name), 'utf8');
  assert.ok(markdown.includes('(quickstart.md#locked-dependency-installation)'),
    `${name}: npm dependency use must link the canonical safety contract`);
  assert.equal(/npm ci --ignore-scripts/u.test(markdown), false,
    `${name}: npm ci must not duplicate the canonical safety contract`);
}

const siteRoot = path.join(root, 'docs/site');
const checkedSiteRoot = process.env.OPERATOR_TASK_SITE_ROOT
  ? path.resolve(process.env.OPERATOR_TASK_SITE_ROOT) : siteRoot;
const executionRoot = process.env.OPERATOR_TASK_EXECUTION_ROOT
  ? path.resolve(process.env.OPERATOR_TASK_EXECUTION_ROOT) : root;
const executionPackage = JSON.parse(fs.readFileSync(path.join(executionRoot, 'package.json'), 'utf8'));
function commandUsesNpmCi(command, visited = new Set()) {
  if (/\bnpm\s+ci\b/u.test(command)) return true;
  for (const match of command.matchAll(/\bnpm\s+(?:--silent\s+)?run\s+([a-zA-Z0-9:_-]+)/gu)) {
    const name = match[1];
    if (visited.has(`npm:${name}`)) continue;
    visited.add(`npm:${name}`);
    if (commandUsesNpmCi(executionPackage.scripts?.[name] ?? '', visited)) return true;
  }
  for (const match of command.matchAll(/\b(?:bash|sh)\s+([a-zA-Z0-9_./-]+\.sh)\b/gu)) {
    const relative = match[1].replace(/^\.\//u, '');
    if (visited.has(`shell:${relative}`)) continue;
    visited.add(`shell:${relative}`);
    const scriptPath = path.join(executionRoot, relative);
    if (fs.existsSync(scriptPath) && commandUsesNpmCi(fs.readFileSync(scriptPath, 'utf8'), visited)) return true;
  }
  return false;
}
for (const filePath of markdownFiles(checkedSiteRoot)) {
  const relativePage = path.relative(root, filePath).split(path.sep).join('/');
  const markdown = fs.readFileSync(filePath, 'utf8');
  for (const body of shellFences(markdown)) {
    if (body.includes('assert_cluster_binding() {')) continue;
    const hasRawClusterCommand = body.split('\n').some((line) =>
      /^\s*(?:sudo\s+)?(?:kubectl|helm|\.\/scripts\/deploy\.sh)\b/u.test(line));
    if (!hasRawClusterCommand) continue;
    const firstCommand = body.split('\n').find((line) => line.trim() && !line.trim().startsWith('#'))?.trim();
    assert.equal(firstCommand, 'assert_cluster_binding',
      `${relativePage}: cluster-capable fenced block must begin with assert_cluster_binding or use only bound wrappers`);
  }
  for (const body of shellFences(markdown)) {
    if (!commandUsesNpmCi(body)) continue;
    if (relativePage === 'docs/site/use/quickstart.md') continue;
    assert.equal(/^\s*npm\s+ci\b/mu.test(body), false,
      `${relativePage}: executable npm ci must use the canonical locked dependency procedure`);
    assert.ok(markdown.includes('quickstart.md#locked-dependency-installation'),
      `${relativePage}: executable command reaches npm ci but does not link the canonical locked dependency procedure`);
    assert.match(markdown, /disposable checkout/iu,
      `${relativePage}: transitive npm ci procedure lacks disposable-checkout ownership`);
    assert.match(markdown, /evidence/iu,
      `${relativePage}: transitive npm ci procedure lacks retained evidence`);
  }
  const prose = markdown.replace(/^\s*(?:`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*(?:`{3,}|~{3,})\s*$/gmu, '');
  if (relativePage !== 'docs/site/use/quickstart.md') {
    assert.equal(/\b(?:run|use|install|complete|before|after)\b[^\n.]*\bnpm ci\b/iu.test(prose), false,
      `${relativePage}: imperative npm ci guidance must link the canonical locked dependency procedure instead`);
  }
}

function slug(heading) {
  return heading.toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

function sections(markdown) {
  const lines = markdown.split('\n');
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+)$/u.exec(lines[index]);
    if (match) headings.push({ index, level: match[1].length, anchor: slug(match[2].trim()) });
  }
  return new Map(headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    return [heading.anchor, lines.slice(heading.index + 1, next?.index ?? lines.length).join('\n').trim()];
  }));
}

assert.deepEqual(registry.requiredProcedureFields, REQUIRED_PROCEDURE_FIELDS,
  'requiredProcedureFields must name the complete executable procedure contract');

const byId = new Map();
const canonicalAuthorities = new Map();
const checkedClusterBindingPages = new Set();
for (const task of registry.tasks) {
  assert.equal(typeof task.taskId, 'string', 'each operator task needs taskId');
  assert.equal(byId.has(task.taskId), false, `duplicate operator taskId: ${task.taskId}`);
  byId.set(task.taskId, task);
  assert.equal(discoveredTasks.get(task.taskId), task.canonical.split('#')[0],
    `${task.taskId}: authored marker must be on its canonical page`);
  assert.match(task.canonical, /^docs\/site\/use\/[a-z0-9_./-]+\.md#[a-z0-9-]+$/, `${task.taskId}: canonical authority must be a docs/site/use Markdown path with an anchor`);
  assert.equal(canonicalAuthorities.has(task.canonical), false, `${task.taskId}: duplicate canonical authority ${task.canonical}`);
  canonicalAuthorities.set(task.canonical, task.taskId);

  assert.ok(Array.isArray(task.implementationAuthorities) && task.implementationAuthorities.length > 0,
    `${task.taskId}: implementationAuthorities must be a non-empty array`);
  for (const authority of task.implementationAuthorities) {
    assert.equal(typeof authority, 'string', `${task.taskId}: implementation authority must be a repository path`);
    assert.ok(!path.isAbsolute(authority) && !authority.split('/').includes('..'),
      `${task.taskId}: implementation authority must stay inside the repository: ${authority}`);
    assert.ok(fs.existsSync(path.join(root, authority)),
      `${task.taskId}: implementation authority does not exist: ${authority}`);
  }

  const [relativePage, anchor] = task.canonical.split('#');
  const pagePath = path.join(root, relativePage);
  assert.ok(fs.existsSync(pagePath), `${task.taskId}: canonical page does not exist: ${relativePage}`);
  const markdown = fs.readFileSync(pagePath, 'utf8');
  const headings = markdown.split('\n').filter((line) => /^#{1,6}\s+/.test(line)).map((line) => line.replace(/^#{1,6}\s+/, '').trim());
  const slugs = headings.map(slug);
  assert.ok(slugs.includes(anchor), `${task.taskId}: canonical anchor does not resolve: ${task.canonical}`);

  if (!checkedClusterBindingPages.has(relativePage)
    && /^\s*(?:kubectl|helm|\.\/scripts\/deploy\.sh)\b/mu.test(markdown)) {
    checkedClusterBindingPages.add(relativePage);
    if (relativePage === 'docs/site/use/install.md') {
      for (const required of [
        '## Bind Cluster Authority', 'export KUBECONFIG="<kubeconfig-path>"',
        'kubectl config use-context "$EXPECTED_CONTEXT"', 'assert_cluster_binding()',
        'bound_kubectl()', 'bound_helm()', 'bound_deploy()',
        'EXPECTED_CLUSTER_SERVER', 'EXPECTED_KUBE_SYSTEM_UID',
      ]) assert.ok(markdown.includes(required),
        `${task.taskId}: install cluster binding omits ${required}`);
    } else {
      assert.ok(markdown.includes('(install.md#bind-cluster-authority)'),
        `${task.taskId}: cluster-capable canonical page must link the dedicated cluster binding authority`);
      for (const required of [
        /same bound\s+shell/iu,
        /read-only\s+`KUBECONFIG`/u,
        /every shown\s+`<context>` must equal `EXPECTED_CONTEXT`/u,
        /`assert_cluster_binding`\s+immediately before each command block/u,
        /never fall back to the\s+default\s+kubeconfig/iu,
      ]) assert.match(markdown, required,
        `${task.taskId}: cluster-capable canonical page lacks the fail-closed bound-shell contract`);
    }
  }

  assert.ok(task.procedure && typeof task.procedure === 'object' && !Array.isArray(task.procedure),
    `${task.taskId}: procedure evidence map is required`);
  assert.deepEqual(Object.keys(task.procedure).sort(), [...REQUIRED_PROCEDURE_FIELDS].sort(),
    `${task.taskId}: procedure evidence map must contain exactly the required fields`);
  for (const field of REQUIRED_PROCEDURE_FIELDS) {
    const references = task.procedure[field];
    assert.ok(Array.isArray(references) && references.length > 0,
      `${task.taskId}.${field}: at least one section reference is required`);
    const bodies = [];
    for (const reference of references) {
      assert.match(reference, /^docs\/site\/use\/[a-z0-9_./-]+\.md#[a-z0-9-]+$/u,
        `${task.taskId}.${field}: invalid section reference ${reference}`);
      const [referencePage, referenceAnchor] = reference.split('#');
      assert.equal(referencePage, relativePage,
        `${task.taskId}.${field}: procedure evidence must remain on canonical page ${relativePage}`);
      const referenceMarkdown = fs.readFileSync(path.join(root, referencePage), 'utf8');
      const body = sections(referenceMarkdown).get(referenceAnchor);
      assert.ok(body !== undefined, `${task.taskId}.${field}: section anchor does not resolve: ${reference}`);
      assert.ok(body.length >= 40, `${task.taskId}.${field}: section is too thin to support the procedure claim: ${reference}`);
      bodies.push(body);
    }
    assert.match(bodies.join('\n'), SEMANTIC_REQUIREMENTS.get(field),
      `${task.taskId}.${field}: referenced sections do not contain the required procedure semantics`);
  }

  for (const variant of task.variants ?? []) {
    const identity = `${task.taskId}/${variant.variantId}`;
    assert.equal(discoveredVariants.get(identity), relativePage,
      `${identity}: authored variant marker must be on the canonical page`);
    assert.ok(['supported', 'unsupported', 'conditional'].includes(variant.supportState),
      `${identity}: invalid supportState`);
    assert.equal(typeof variant.startState, 'string', `${identity}: startState is required`);
    for (const field of ['steps', 'observations', 'stopConditions', 'cleanup', 'evidence']) {
      assert.ok(Array.isArray(variant[field]) && variant[field].length > 0,
        `${identity}.${field}: at least one section reference is required`);
      for (const reference of variant[field]) {
        assert.ok(task.procedure.orderedSteps.includes(reference)
          || task.procedure.expectedObservations.includes(reference)
          || task.procedure.stopConditions.includes(reference)
          || task.procedure.failureDistinction.includes(reference)
          || task.procedure.recoveryRollback.includes(reference)
          || task.procedure.cleanup.includes(reference)
          || task.procedure.evidence.includes(reference),
        `${identity}.${field}: ${reference} is not registered in the task procedure map`);
      }
    }
  }
  if (task.taskId === 'run-control') {
    const recoveryDocumentation = fs.readFileSync(path.join(root, relativePage), 'utf8');
    for (const outcome of task.recoveryOutcomes ?? []) {
      assert.ok(recoveryDocumentation.includes(`\`${outcome.code}\``),
        `${outcome.code}: canonical recovery documentation does not name the exact outcome`);
      assert.ok(task.implementationAuthorities.includes(outcome.implementationAuthority),
        `${outcome.code}: implementation authority is not registered on run-control`);
    }
  }
}

for (const taskId of REQUIRED_TASK_IDS) {
  assert.ok(byId.has(taskId), `required lifecycle task is missing: ${taskId}`);
}
assert.equal(registry.tasks.length, REQUIRED_TASK_IDS.length,
  'operator task registry must contain exactly the complete canonical task set');
assert.deepEqual([...byId.keys()].sort(), [...REQUIRED_TASK_IDS].sort(),
  'operator task registry IDs differ from the complete canonical task set');
const registeredVariants = registry.tasks.flatMap((task) =>
  (task.variants ?? []).map((variant) => `${task.taskId}/${variant.variantId}`)).sort();
function assertRegistrationParity(taskMarkers, variantMarkers) {
  assert.deepEqual([...taskMarkers.keys()].sort(), [...byId.keys()].sort(),
    'operator-task markers and registry registrations differ');
  assert.deepEqual([...variantMarkers.keys()].sort(), registeredVariants,
    'operator-variant markers and registry registrations differ');
}
assertRegistrationParity(discoveredTasks, discoveredVariants);
for (const [capability, taskId] of REQUIRED_LIFECYCLE_COVERAGE) {
  assert.equal(registry.tasks.filter((task) => task.taskId === taskId).length, 1, `${capability}: lifecycle coverage must resolve to exactly one canonical task (${taskId})`);
}

console.log(`Operator task registry is valid (${registry.tasks.length} unique tasks; ${REQUIRED_LIFECYCLE_COVERAGE.size} required lifecycle capabilities).`);
