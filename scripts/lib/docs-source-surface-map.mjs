import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { markdownAnchors, markdownAnchorEntries } from './docs-markdown-anchors.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (...parts) => parts.map(part => encodeURIComponent(String(part))).join(':');
const reference = name => `docs/site/reference/${name}.md`;

// These adapters consume the existing inventories; their owning source-discovery
// checks remain necessary. This is deliberately not another source interpreter.
export function buildSourceSurfaceMap(root, pages, read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))) {
  const domains = [];
  const pageByPath = new Map(pages.map(page => [page.page, page]));
  const seen = new Set();
  const anchors = new Map();
  function targetExists(target) {
    const [page, anchor] = target.split('#');
    assert(pageByPath.has(page), `source-map orphan page: ${target}`);
    assert(!anchor || markdownAnchors(path.join(root, page), anchors).has(anchor), `source-map orphan anchor: ${target}`);
    return page;
  }
  function domain(name, inventory, generator, checks, readerTask, scope) {
    const entry = { domain: name, inventory, generator, checks, readerTask, scope, surfaces: [] };
    assert(readerTask && checks.length, `source-map missing owning metadata: ${name}`);
    domains.push(entry);
    return (parts, source, target, facts) => {
      const sourceId = id(name, source, ...parts);
      assert(source && typeof source === 'string', `source-map missing source: ${sourceId}`);
      assert(!seen.has(sourceId), `source-map duplicate source identity: ${sourceId}`);
      seen.add(sourceId);
      const page = pageByPath.get(targetExists(target));
      assert(page.owner, `source-map missing page owner: ${target}`);
      entry.surfaces.push({ sourceId, source, target, owner: page.owner, factsSha256: digest(facts) });
    };
  }
  const inventory = name => `docs/generated/inventory/${name}.json`;
  {
    const file = inventory('sdk-reference'), data = read(file);
    const add = domain('sdk', file, 'scripts/docs-sdk-reference.mjs', ['node scripts/docs-sdk-reference.mjs --check'],
      data.discoveryScope.readerTask, data.discoveryScope.entrypoints);
    for (const item of data.exports) {
      const target = `${item.generatedPage}#${item.name.toLowerCase()}`;
      add([item.entrypoint, item.name], item.source.source, target, item);
      const occurrences = new Map();
      for (const member of item.members) {
        const key = JSON.stringify([member.source, member.path]);
        const occurrence = occurrences.get(key) ?? 0;
        occurrences.set(key, occurrence + 1);
        add([item.entrypoint, item.name, 'member', member.path, occurrence], member.source, target, member);
      }
      for (const [index, variant] of item.unionVariants.entries()) {
        // The compiler inventory supplies ordered variants, not invented names.
        add([item.entrypoint, item.name, 'variant', index], item.source.source, target, variant);
      }
    }
  }
  {
    const file = inventory('sdk-reference'), data = read(file);
    const page = reference('sdk-exports');
    const text = fs.readFileSync(path.join(root, page), 'utf8');
    const headingAnchors = new Map(markdownAnchorEntries(text)
      .filter(entry => entry.level === 3).map(entry => [entry.start, entry.anchor]));
    const targets = new Map();
    for (const item of data.exports) for (const declaration of item.declarations) {
      const qualified = `${declaration.source}#${declaration.symbol}`;
      const target = `${item.generatedPage}#${item.name.toLowerCase()}`;
      assert(!targets.has(qualified) || targets.get(qualified) === target,
        `source-map ambiguous SDK public declaration: ${qualified}`);
      targets.set(qualified, target);
    }
    for (const item of data.supportTypes) {
      assert.equal(item.publicNamedExport, false, `source-map support declaration is a named export: ${item.qualifiedName}`);
      assert.equal(item.name, item.source.symbol,
        `source-map SDK support heading differs from declaration: ${item.qualifiedName}`);
      assert.equal(item.qualifiedName, `${item.source.source}#${item.source.symbol}`,
        `source-map invalid qualified SDK support identity: ${item.qualifiedName}`);
      const heading = `### ${item.name} — ${item.source.source}\n`;
      const position = text.indexOf(heading);
      assert(position >= 0 && (position === 0 || text[position - 1] === '\n')
        && text.indexOf(heading, position + 1) < 0,
      `source-map missing/ambiguous SDK support heading: ${item.qualifiedName}`);
      const anchor = headingAnchors.get(Buffer.byteLength(text.slice(0, position)));
      assert(anchor, `source-map SDK support heading is not a real heading: ${item.qualifiedName}`);
      assert(!targets.has(item.qualifiedName), `source-map duplicate SDK support identity: ${item.qualifiedName}`);
      targets.set(item.qualifiedName, `${page}#${anchor}`);
    }
    const add = domain('sdk-support', file, 'scripts/docs-sdk-reference.mjs', ['node scripts/docs-sdk-reference.mjs --check'],
      'Before you change a public SDK callback or wrapper contract, find the source-qualified support declaration. Also find its members and referenced declaration.',
      'This scope includes all KubeClaw support declarations that the compiler finds through the public SDK. It also includes their resolved members and qualified local reference edges. It includes no other declarations. These declarations are not named SDK exports.');
    for (const item of data.supportTypes) {
      const target = targets.get(item.qualifiedName);
      add(['declaration', item.qualifiedName], item.source.source, target, item);
      for (const member of item.members) {
        add(['member', item.qualifiedName, member.name], member.source, target, member);
      }
      for (const qualified of item.referencedSupport) {
        const destination = targets.get(qualified);
        assert(destination, `source-map unresolved qualified SDK reference: ${item.qualifiedName} -> ${qualified}`);
        add(['reference', item.qualifiedName, qualified], item.source.source, destination,
          { declaration: item.source, reference: qualified });
      }
    }
  }
  {
    const file = inventory('platform-surfaces'), data = read(file), bindings = read('docs/config/platform-surface-map.json');
    const add = domain('platform', file, 'scripts/docs-platform-surface-inventory.mjs',
      ['npm run docs:ap09:platform-inventory:check', 'npm run docs:ap09:platform-drift:mutations'],
      'Before you change or operate the selected item, find its source occurrence and activation boundary. Also find the platform explanation with authority for the selected item.',
      'This scope includes only the nine platform inventory groups. Names can be the same in different sources. Source-qualified occurrences keep their source identities.');
    for (const group of ['dependencies', 'dependencySignals', 'resources', 'secretReferences', 'endpoints', 'outboundConnections', 'stores', 'events', 'opsTools']) {
      assert(bindings[group], `source-map unmapped platform group: ${group}`);
      for (const item of data[group]) {
        const target = bindings[group].identityTargets[item.value];
        assert(target, `source-map orphan source: platform ${group} ${item.source} ${item.value}`);
        // Signal/profile and consumer distinguish declarations within one source.
        add([group, item.value, item.profile ?? '', item.consumer ?? '', item.evidenceLocation ?? '', item.consumerPath ?? ''], item.source, target, item);
      }
    }
  }
  {
    const file = inventory('workflows'), data = read(file);
    const add = domain('workflow', file, 'scripts/docs-generate.mjs', ['npm run docs:inventory:check', 'npm run docs:generate:check'],
      'Before you change a CI path, find the workflow trigger, job, and command/action authority.',
      'This scope includes all workflow and job records that the workflow inventory finds. It includes no other workflow or job records. It does not include workflow action internals outside these records.');
    for (const workflow of data.workflows) {
      const target = workflow.path === '.github/workflows/docs-checks.yaml'
        ? 'docs/site/extend/documentation-maintenance.md#generate-only-owned-facts-then-check'
        : `${reference('workflows')}#workflows`;
      add(['workflow'], workflow.path, target, workflow);
      for (const job of workflow.jobs) add(['job', job], workflow.path, target, { job });
    }
  }
  {
    const file = inventory('plugin-system'), data = read(file);
    const add = domain('plugin', file, 'scripts/plugin-system-inventory.mjs', ['npm run plugin-system:inventory:check', 'npm run docs:publication:check'],
      'Before you select a package guide or change the package contract, find the package manifest and registration identity.',
      'This scope includes all manifest packages and registrations from the plugin-system inventory. It includes no other packages or registrations. It does not include all implementation files.');
    const packages = new Map(data.packages.map(item => [item.id, item]));
    const catalogue = pkg => `docs/site/extend/plugin-catalogue/${pkg.id}.md`;
    for (const item of data.packages) add(['package', item.id], item.manifest, `${catalogue(item)}#package-reference`, item);
    for (const item of data.registrations) {
      const pkg = packages.get(item.packageId);
      assert(pkg, `source-map orphan registration package: ${item.registrationId}`);
      add(['registration', item.kind, item.registrationId], pkg.manifest, `${catalogue(pkg)}#registration-summary`, item);
    }
  }
  {
    const file = inventory('configuration-values'), data = read(file);
    const add = domain('configuration-value', file, 'scripts/docs-generate.mjs', ['npm run docs:inventory:config:check', 'npm run docs:generate:check', 'npm run docs:drift:config:mutations'],
      'Before you change a configuration field, find its source document and nested field identity. Then read its receiver, precedence, and failure boundary.',
      'This scope includes all document fields in the recursive configuration-values inventory. It includes no other document fields. It keeps each document index and field path.');
    for (const file of data.files) for (const document of file.documents) for (const field of document.fields) {
      add([document.index, field.path], file.path, reference('helm-values'), field);
    }
  }
  {
    const file = inventory('configuration-schemas'), data = read(file);
    const add = domain('configuration-schema', file, 'scripts/docs-generate.mjs', ['npm run docs:inventory:config:check', 'npm run docs:generate:check', 'npm run docs:drift:config:mutations'],
      'Find the registered schema or compact swarm field. Read its declared validation/defaults and runtime consumer behavior. Do not use one as the other.',
      'This scope includes registered schema fields and compact swarm fields in the inventory. It includes no other fields. Field identities keep paths and branch identities.');
    for (const schema of [...data.files, data.swarm]) for (const field of schema.fields) {
      add([field.path, JSON.stringify(field.branches ?? [])], schema.path, `${reference('plugin-configuration')}#${schema === data.swarm ? 'compact-swarm-configuration' : 'registered-schemas'}`, field);
    }
  }
  {
    const file = inventory('configuration-runtime-inputs'), data = read(file);
    const add = domain('operator-cli', file, 'scripts/docs-generate.mjs', ['npm run docs:inventory:config:check', 'npm run docs:drift:cli:check', 'npm run docs:generate:check'],
      'Find the command owner and flag by their identities. Obey the selected operator procedure and argument failure rules.',
      'This scope includes only operator-runtime CLI definitions. Maintainer-verification flags are outside the operator contract.');
    for (const flag of data.cliFlags.filter(item => item.surface === 'operator-runtime')) {
      const target = flag.documentationStatus === 'authored-documentation'
        ? flag.documentationAuthority.replace(/:\d+(?:-\d+)?$/u, '') : `${reference('cli')}#defined-flags`;
      add([flag.name], flag.path, target, flag);
    }
  }
  for (const entry of domains) entry.surfaces.sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en'));
  const exhaustivePages = new Map();
  for (const entry of domains) for (const surface of entry.surfaces) {
    const page = surface.target.split('#')[0];
    if (!exhaustivePages.has(page)) exhaustivePages.set(page, []);
    exhaustivePages.get(page).push(surface.sourceId);
  }
  return {
    authority: 'This map gives only the relation between inventories and reader ownership. Execute the declared inventory checks for source freshness. All these checks must exit with code zero. The inventories give source API information to the map. The map is not a check of semantic completeness.',
    unmappedScope: 'This map gives no coverage result for network exposure details outside the nine platform mapping groups. It gives none for environment/secret/derived-value occurrence ownership or deployed payload fields. It gives none for API/error/capability/contract families outside these adapters.',
    domains,
    pageSources: [...exhaustivePages].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([page, sourceIds]) => ({ page, sourceIds: sourceIds.sort() })),
  };
}

// Compare the complete relationship, not counts or existence-only checks. This
// rejects wrong bindings even when both the old and new target pages exist.
export function assertSourceSurfaceMap(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('source-map stale/orphan source, page, member or owning binding; regenerate only after reviewing the changed inventory and reader target');
  }
}
