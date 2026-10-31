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
    const file = inventory('event-contracts'), data = read(file);
    const add = domain('event-contract', file, 'scripts/docs-event-contracts.mjs', ['npm run docs:events:check'],
      'Identify the payload/version authority, then follow its qualified producer, transformation, validation and consumer conditions before changing or replaying a record.',
      'Source-qualified event mechanisms, dependent payload declarations, schema authorities and actual selected call relationships. Configuration and declarations do not prove live delivery; external payloads remain explicitly limited.');
    const target = `${reference('events')}#generated-source-contract-reference`;
    for (const family of data.families) {
      for (const [index, role] of family.roles.entries()) add([family.id, 'role', index], role.source.path, target, role);
      for (const [index, declaration] of family.declarations.entries()) add([family.id, 'declaration', index], declaration.path, target, declaration);
      for (const [index, schema] of family.schemas.entries()) add([family.id, 'schema', index], schema.path, target, schema);
      for (const [index, call] of family.selectedCalls.entries()) add([family.id, 'call', index], call.source.path, target, call);
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
    const add = domain('workflow', file, 'scripts/docs-inventory.mjs', ['npm run docs:inventory:check'],
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
    const file = inventory('configuration-helm-values'), data = read(file);
    const add = domain('configuration-value', file, 'scripts/docs-configuration-inventory.mjs --configuration-reference-only', ['node scripts/docs-configuration-inventory.mjs --configuration-reference-only --check'],
      'Before you change a configuration field, find its source document and nested field identity. Then read its receiver, precedence, and failure boundary.',
      'This scope includes all document fields in the recursive configuration-values inventory. It includes no other document fields. It keeps each document index and field path.');
    for (const file of data.files) for (const document of file.documents) for (const field of document.fields) {
      add([document.index, field.path], file.path, reference('configuration'), field);
    }
  }
  {
    const file = inventory('configuration-schemas'), data = read(file);
    const add = domain('configuration-schema', file, 'scripts/docs-configuration-inventory.mjs --configuration-reference-only', ['node scripts/docs-configuration-inventory.mjs --configuration-reference-only --check'],
      'Find the registered schema or compact swarm field. Read its declared validation/defaults and runtime consumer behavior. Do not use one as the other.',
      'This scope includes registered schema fields and compact swarm fields in the inventory. It includes no other fields. Field identities keep paths and branch identities.');
    for (const schema of [...data.files, data.swarm]) for (const field of schema.fields) {
      add([field.path, JSON.stringify(field.branches ?? [])], schema.path, `${reference('plugin-configuration')}#${schema === data.swarm ? 'compact-swarm-configuration' : 'registered-schemas'}`, field);
    }
  }
  {
    const file = inventory('configuration-runtime-inputs'), data = read(file);
    const add = domain('operator-cli', file, 'scripts/docs-configuration-inventory.mjs --configuration-reference-only', ['node scripts/docs-configuration-inventory.mjs --configuration-reference-only --check', 'npm run docs:drift:cli:check'],
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
    unmappedScope: 'Owning source-discovery selectors remain finite. The authority matrix adds only explicitly admitted configuration/schema/CLI/diagnostic/package/role/operator and platform-policy identities plus named SUR manual-review routes. Neither that relation nor a manual route proves semantic completeness, generated freshness, an unknown public launch or runtime execution outside the owning qualified boundary.',
    domains,
    authorityMatrix: buildAuthorityMatrix(root, pages, domains, additionalAuthorityRecords(root, pages, read), read),
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

// The existing authored SUR roster is a finite navigation contract, not a
// repository-discovery algorithm. Inventory adapters must assign identities
// explicitly; a filename, directory or platform-group name is not an exclusion.
const surfaceFamilyCounts = Object.freeze({
  CTL: 7, SPC: 6, CFG: 8, API: 11, COM: 4, DAT: 6,
  TEL: 3, SEC: 7, DEP: 10, OPT: 5, OPS: 6, EXT: 11,
});
export const requiredSurfaceFamilies = Object.freeze(Object.entries(surfaceFamilyCounts)
  .flatMap(([group, count]) => Array.from({ length: count }, (_, index) =>
    `SUR-${group}-${String(index + 1).padStart(2, '0')}`)));
const authorityPolicyFields = Object.freeze(['recordKind', 'primaryMechanicalAuthority', 'inventory',
  'generator', 'checks', 'consumerBoundary', 'scopeLimit', 'classification', 'classificationBasis',
  'freshness', 'authorityKind']);

// These are relation invariants. They neither qualify a new inventory nor
// execute its source-freshness check. Actual adapter meanings remain subject to
// affected Source review and the named owning checks.
// Finite reviewed selector relevance, independent of generated typed records.
// An unrelated inventory cannot be offered as a manual-only disposition.
export const manualAuthorityInventoryScopes = {
  "SUR-CTL-01": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-CTL-02": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-CTL-03": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-CTL-04": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-CTL-05": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-CTL-06": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-CTL-07": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-SPC-01": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-SPC-02": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-SPC-03": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-SPC-04": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-SPC-05": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-SPC-06": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-CFG-01": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-02": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-03": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-04": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-05": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-06": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-07": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-CFG-08": [
    "docs/generated/inventory/configuration-families.json"
  ],
  "SUR-API-01": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-02": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-03": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-04": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-05": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-06": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-API-07": [
    "docs/generated/inventory/event-contracts.json",
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-08": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-09": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-API-10": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/workflows.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-API-11": [
    "docs/generated/inventory/platform-surfaces.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-COM-01": [
    "docs/generated/inventory/event-contracts.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-COM-02": [
    "docs/generated/inventory/event-contracts.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-COM-03": [
    "docs/generated/inventory/event-contracts.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-COM-04": [
    "docs/generated/inventory/event-contracts.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DAT-01": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DAT-02": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DAT-03": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DAT-04": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DAT-05": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DAT-06": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-TEL-01": [
    "docs/generated/inventory/event-contracts.json"
  ],
  "SUR-TEL-02": [
    "docs/generated/inventory/event-contracts.json"
  ],
  "SUR-TEL-03": [
    "docs/generated/inventory/event-contracts.json"
  ],
  "SUR-SEC-01": [
    "docs/generated/inventory/configuration-runtime-inputs.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-SEC-02": [
    "docs/generated/inventory/configuration-runtime-inputs.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-SEC-03": [
    "docs/generated/inventory/configuration-runtime-inputs.json",
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-SEC-04": [
    "docs/generated/inventory/configuration-runtime-inputs.json"
  ],
  "SUR-SEC-05": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-SEC-06": [
    "docs/generated/inventory/workflows.json",
    "packaging/runtime/package-ownership.json"
  ],
  "SUR-SEC-07": [
    "docs/generated/inventory/configuration-families.json",
    "docs/generated/inventory/plugin-system.json"
  ],
  "SUR-DEP-01": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-02": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-03": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-04": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-05": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-06": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-07": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-08": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-09": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-DEP-10": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-OPT-01": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-OPT-02": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-OPT-03": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-OPT-04": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-OPT-05": [
    "docs/generated/inventory/platform-surfaces.json"
  ],
  "SUR-OPS-01": [
    "docs/operator-tasks.json"
  ],
  "SUR-OPS-02": [
    "docs/operator-tasks.json"
  ],
  "SUR-OPS-03": [
    "docs/operator-tasks.json"
  ],
  "SUR-OPS-04": [
    "docs/operator-tasks.json"
  ],
  "SUR-OPS-05": [
    "docs/operator-tasks.json"
  ],
  "SUR-OPS-06": [
    "docs/operator-tasks.json"
  ],
  "SUR-EXT-01": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-02": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-03": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-04": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-05": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-06": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-07": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-08": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-09": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-10": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ],
  "SUR-EXT-11": [
    "docs/generated/inventory/plugin-system.json",
    "docs/generated/inventory/sdk-reference.json"
  ]
};

// Keep declared docs-generate ownership separate from the bounded inventory.
export function generatedPageFreshnessChecks(page, configurationPages, generatedReferencePages, configurationRevision) {
  if (page === 'docs/site/reference/configuration.md') {
    assert(/^[0-9a-f]{40}$/u.test(configurationRevision ?? ''), 'configuration hub lacks its reviewed source/inventory revision');
    return [
    'node scripts/docs-configuration-inventory.mjs --configuration-reference-only --check',
    `node scripts/docs-generate.mjs --only configuration-hub --revision ${configurationRevision} --check`,
    ];
  }
  return configurationPages.has(page) || generatedReferencePages.has(page)
    ? ['npm run docs:generate:check'] : [];
}

export function assertAuthorityMatrix(matrix) {
  assert.equal(matrix.schemaVersion, 'source-authority-matrix.v1');
  if (matrix.authorityPolicies) for (const [key, policy] of Object.entries(matrix.authorityPolicies)) {
    assert.equal(key, digest(policy), 'authority-matrix policy identity differs from its complete fields');
    assert(Object.keys(policy).every(field => authorityPolicyFields.includes(field)),
      'authority-matrix policy cannot replace identity, source, target or fact binding');
  }
  const resolvedRecords = matrix.records.map(record => {
    if (!matrix.authorityPolicies) return record;
    const policy = matrix.authorityPolicies[record.policyRef];
    assert(policy && authorityPolicyFields.every(field => !Object.hasOwn(record, field)),
      `authority-matrix orphan or overridden authority policy: ${record.normalizedIdentity}`);
    return { ...policy, ...record };
  });
  const families = new Map();
  for (const family of matrix.families) {
    assert(requiredSurfaceFamilies.includes(family.id), `authority-matrix unknown SUR family: ${family.id}`);
    assert(!families.has(family.id), `authority-matrix duplicate SUR family: ${family.id}`);
    assert(family.title && family.canonicalTarget && family.owner,
      `authority-matrix incomplete SUR family: ${family.id}`);
    families.set(family.id, family);
  }
  assert.deepEqual([...families.keys()].sort(), [...requiredSurfaceFamilies].sort(),
    'authority-matrix missing SUR family; reconcile the complete finite roster');
  const records = new Map();
  const primaries = new Map();
  const sourceSnapshots = new Map();
  const represented = new Set();
  for (const record of resolvedRecords) {
    const label = record.normalizedIdentity;
    assert(typeof label === 'string' && label.length, 'authority-matrix missing normalized identity');
    assert(!records.has(label), `authority-matrix duplicate identity/primary authority: ${label}`);
    assert(families.has(record.surFamily), `authority-matrix ambiguous or missing SUR assignment: ${label}`);
    assert(typeof record.sourceAuthority === 'string' && record.sourceAuthority.length,
      `authority-matrix orphan source authority: ${label}`);
    for (const field of ['consumerBoundary', 'canonicalTarget', 'owner', 'scopeLimit']) {
      assert(typeof record[field] === 'string' && record[field].trim(),
        `authority-matrix missing ${field}: ${label}`);
    }
    assert(Array.isArray(record.checks) && record.checks.length
      && record.checks.every(check => typeof check === 'string' && check.trim()),
    `authority-matrix absent check/review route: ${label}`);
    if (record.recordKind === 'manual-review-route') {
      assert.equal(record.primaryMechanicalAuthority, false,
        `authority-matrix manual route cannot become a mechanical authority: ${label}`);
      assert.equal(record.generator, null,
        `authority-matrix manual route cannot claim generated freshness: ${label}`);
      assert.equal(record.freshness, 'manual-review-required',
        `authority-matrix manual route cannot claim source completeness: ${label}`);
    } else if (record.recordKind === 'projection-reference') {
      assert.equal(record.primaryMechanicalAuthority, false);
      assert(typeof record.primaryIdentity === 'string' && record.primaryIdentity.length,
        `authority-matrix projection lacks its one primary identity: ${label}`);
    } else {
      assert(['source-bound-fact', 'authored-source-declaration'].includes(record.recordKind),
        `authority-matrix unknown record role: ${label}`);
      assert.equal(record.primaryMechanicalAuthority, true);
      if (record.recordKind === 'authored-source-declaration') {
        assert.equal(record.generator, null, `authority-matrix authored declaration invents a generator: ${label}`);
        assert.equal(record.freshness, 'owning-source-check-required');
      } else assert(typeof record.generator === 'string' && record.generator.trim(),
        `authority-matrix absent owning generator: ${label}`);
      assert(typeof record.inventory === 'string' && record.inventory.trim(),
        `authority-matrix absent owning inventory: ${label}`);
      assert(typeof record.factsSha256 === 'string' && /^[0-9a-f]{64}$/u.test(record.factsSha256),
        `authority-matrix missing complete fact binding: ${label}`);
      primaries.set(label, record);
    }
    if (record.classification !== 'public') {
      assert(typeof record.classification === 'string' && record.classification.trim()
        && typeof record.classificationBasis === 'string' && record.classificationBasis.trim(),
      `authority-matrix unqualified nonpublic/declaration disposition: ${label}`);
    }
    records.set(label, record);
    represented.add(record.surFamily);
    if (record.sourceBindingSha256) {
      assert(/^[0-9a-f]{64}$/u.test(record.sourceBindingSha256),
        `authority-matrix invalid source snapshot binding: ${label}`);
      const previous = sourceSnapshots.get(record.sourceAuthority);
      assert(!previous || previous === record.sourceBindingSha256,
        `authority-matrix source snapshot disagreement: ${record.sourceAuthority}; refresh only its owning qualified inventory`);
      sourceSnapshots.set(record.sourceAuthority, record.sourceBindingSha256);
    }
  }
  for (const record of records.values()) if (record.recordKind === 'projection-reference') {
    const primary = primaries.get(record.primaryIdentity);
    assert(primary && primary.sourceAuthority === record.sourceAuthority,
      `authority-matrix orphan or competing primary authority: ${record.normalizedIdentity}`);
  }
  // The availability join is retained independently of the rendered records:
  // removing a typed relation must not silently turn it into a manual family.
  for (const family of families.values()) {
    const available = family.authorityAvailability;
    assert(available && Array.isArray(available.typedIdentities),
      `authority-matrix missing typed-authority availability disposition: ${family.id}`);
    const actual = resolvedRecords.filter(record => record.recordKind !== 'manual-review-route' && record.surFamily === family.id)
      .map(record => record.normalizedIdentity).sort();
    assert.deepEqual(available.typedIdentities, actual,
      `authority-matrix available typed authority cannot be replaced by manual route: ${family.id}`);
    if (actual.length) {
      assert.equal(available.disposition, 'named-admitted-typed-authorities');
      const actualInventories = [...new Set(resolvedRecords.filter(record => record.recordKind !== 'manual-review-route'
        && record.surFamily === family.id).map(record => record.inventory))].sort();
      assert.deepEqual(available.selectedInventories, actualInventories,
        `authority-matrix assigned inventory set differs: ${family.id}`);
    } else {
      assert.equal(available.disposition, 'no-admitted-typed-inventory-for-high-level-surface');
      assert.deepEqual(available.selectedInventories, manualAuthorityInventoryScopes[family.id],
        `authority-matrix unrelated selected inventory in manual disposition: ${family.id}`);
      assert(typeof available.reason === 'string' && available.reason.trim()
        && Array.isArray(available.selectedInventories) && available.selectedInventories.length,
        `authority-matrix manual-only family lacks bounded inventory disposition: ${family.id}`);
    }
  }
  assert.deepEqual([...represented].sort(), [...families.keys()].sort(),
    'authority-matrix SUR family has neither typed identities nor an explicit manual route');
  const inverse = new Map();
  for (const record of records.values()) {
    if (!inverse.has(record.canonicalTarget)) inverse.set(record.canonicalTarget, []);
    inverse.get(record.canonicalTarget).push(record.normalizedIdentity);
  }
  const expected = [...inverse].sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([canonicalTarget, identities]) => ({ canonicalTarget, identities: identities.sort() }));
  assert.deepEqual(matrix.inverse, expected, 'authority-matrix stale or missing inverse identity relation');
  return matrix;
}

function compactAuthorityMatrix(matrix) {
  assertAuthorityMatrix(matrix);
  const policies = new Map();
  const records = matrix.records.map(record => {
    const policy = Object.fromEntries(authorityPolicyFields.filter(field => Object.hasOwn(record, field))
      .map(field => [field, record[field]]));
    const policyRef = digest(policy);
    policies.set(policyRef, policy);
    return { ...Object.fromEntries(Object.entries(record).filter(([field]) =>
      !authorityPolicyFields.includes(field))), policyRef };
  });
  return assertAuthorityMatrix({ ...matrix,
    authorityPolicies: Object.fromEntries([...policies].sort(([a], [b]) => a.localeCompare(b, 'en'))), records });
}

export function buildAuthorityMatrix(root, pages, domains, additionalRecords = [], read = file =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))) {
  const pageByPath = new Map(pages.map(page => [page.page, page]));
  const anchorCache = new Map();
  const targetPage = target => {
    const [name, anchor] = target.split('#');
    const page = pageByPath.get(name);
    assert(page?.owner, `authority-matrix missing canonical page/owner: ${target}`);
    assert(!anchor || markdownAnchors(path.join(root, name), anchorCache).has(anchor),
      `authority-matrix invalid canonical anchor: ${target}`);
    return page;
  };
  const text = fs.readFileSync(path.join(root, 'docs/site/product-surfaces.md'), 'utf8');
  const families = [];
  const records = [];
  for (const line of text.split('\n')) {
    if (!/^\| SUR-/u.test(line)) continue;
    const cells = line.split(' | ').map(cell => cell.replace(/^\|\s*|\s*\|$/gu, '').trim());
    assert.equal(cells.length, 5, 'authority-matrix malformed authored SUR row');
    const [familyId, title, reading, historicalSource] = cells;
    const firstLink = /\]\(([^)]+)\)/u.exec(reading)?.[1];
    assert(firstLink && !firstLink.includes('://'), `authority-matrix missing reader route: ${familyId}`);
    const [relativePage, anchor] = firstLink.split('#');
    const canonicalTarget = path.posix.normalize(`docs/site/${relativePage}`) + (anchor ? `#${anchor}` : '');
    const page = targetPage(canonicalTarget);
    assert(page.sourceDependencies.length && page.checks.length,
      `authority-matrix manual boundary has no owning source/review route: ${familyId}`);
    families.push({ id: familyId, title, canonicalTarget, owner: page.owner });
    records.push({
      normalizedIdentity: id('manual-family', familyId), surFamily: familyId,
      recordKind: 'manual-review-route', primaryMechanicalAuthority: false,
      sourceAuthority: page.sourceDependencies.join('; '), canonicalTarget, owner: page.owner,
      consumerBoundary: 'Authored high-level surface; review the named current source and actual consumer before changing its explanation.',
      scopeLimit: 'A named review route, not generated source freshness, discovery completeness or runtime evidence. Historical links remain navigation only.',
      classification: 'authored-high-level-surface',
      classificationBasis: 'Explicit SUR roster and canonical guide review boundary; not a filename-based exclusion.',
      historicalLocator: historicalSource, generator: null, freshness: 'manual-review-required',
      checks: [`Independent affected Source/Reader/Quality review of ${canonicalTarget}`, ...page.checks],
    });
  }
  const domainFamilies = {
    sdk: 'SUR-API-02', 'sdk-support': 'SUR-API-02', 'event-contract': 'SUR-API-04',
    workflow: 'SUR-API-11', plugin: 'SUR-EXT-11',
    'configuration-value': 'SUR-CFG-06', 'configuration-schema': 'SUR-API-03',
    'operator-cli': 'SUR-API-01',
  };
  const platformFamilies = {
    dependencies: 'SUR-DEP-08', dependencySignals: 'SUR-DEP-08', resources: 'SUR-DEP-08',
    secretReferences: 'SUR-CFG-07', endpoints: 'SUR-API-09', outboundConnections: 'SUR-API-09',
    stores: 'SUR-API-08', events: 'SUR-API-04', opsTools: 'SUR-OPT-04',
  };
  const platform = read('docs/generated/inventory/platform-surfaces.json');
  const platformRecords = new Map();
  for (const group of Object.keys(platformFamilies)) for (const item of platform[group]) {
    const key = id('platform', item.source, group, item.value, item.profile ?? '',
      item.consumer ?? '', item.evidenceLocation ?? '', item.consumerPath ?? '');
    platformRecords.set(key, item);
  }
  const schemas = read('docs/generated/inventory/configuration-schemas.json');
  const inlineSchemas = new Map(schemas.files.filter(schema => schema.path.includes('#'))
    .map(schema => [schema.path, schema]));
  for (const domain of domains) for (const surface of domain.surfaces) {
    const family = domain.domain === 'platform'
      ? platformFamilies[decodeURIComponent(surface.sourceId.split(':')[2])]
      : domainFamilies[domain.domain];
    assert(family, `authority-matrix inventory needs an explicit SUR assignment: ${surface.sourceId}`);
    targetPage(surface.target);
    const source = path.resolve(root, surface.source);
    let authorityKind = 'physical-source';
    let classification = 'inventory-scoped-declaration-or-source-relation';
    let classificationBasis = `${domain.inventory}: ${domain.scope}`;
    let consumerBoundary = domain.scope;
    let bound = !path.isAbsolute(surface.source) && source.startsWith(`${path.resolve(root)}${path.sep}`)
      && fs.existsSync(source);
    if (domain.domain === 'platform') {
      const item = platformRecords.get(surface.sourceId);
      assert(item && digest(item) === surface.factsSha256,
        `authority-matrix platform relation differs from its actual native record: ${surface.sourceId}`);
      consumerBoundary = JSON.stringify({ consumer: item.consumer ?? item.consumerPath ?? null,
        classification: item.classification ?? null, activationState: item.activationState ?? null,
        activationCondition: item.activationCondition ?? null, scope: domain.scope });
      if (!bound && platform.sourceScopes.renderedProfiles.includes(item.profile)
        && item.source === `${item.profile}:rendered-output` && item.evidenceLocation === 'rendered-output') {
        bound = true;
        authorityKind = 'native-rendered-profile';
        classification = 'selected-render-declaration-not-live-deployment';
        classificationBasis = consumerBoundary;
      }
      // An exact native fixture disposition, not a name/prefix exemption. Keep
      // the fixture in the index without treating it as an active product fact.
      if (!bound && item.source === 'helm:fixture/buster-runtime-registry'
        && item.profile === 'helm:buster' && platform.sourceScopes.renderedProfiles.includes(item.profile)
        && item.activationState === 'fixture-only' && item.evidenceLocation === 'render-fixture'
        && ['render-fixture:environment-signal', 'render-fixture:endpoint'].includes(item.classification)
        && item.activationCondition) {
        bound = true;
        authorityKind = 'native-render-fixture';
        classification = 'fixture-only';
        classificationBasis = consumerBoundary;
      }
    }
    if (!bound && domain.domain === 'configuration-schema') {
      const schema = inlineSchemas.get(surface.source);
      const registration = schema?.registrationEvidence.find(evidence =>
        `${evidence.manifest}#${evidence.pointer}` === surface.source);
      if (registration && !path.isAbsolute(registration.manifest)
        && fs.existsSync(path.join(root, registration.manifest))) {
        bound = true;
        authorityKind = 'registered-inline-json-schema';
        classification = 'registered-schema-declaration';
        classificationBasis = JSON.stringify({ registration, sourceDigest: schema.sourceDigest,
          sourceClass: schema.sourceClass, scope: domain.scope });
      }
    }
    assert(bound, `authority-matrix orphan source: ${surface.sourceId}`);
    records.push({
      normalizedIdentity: surface.sourceId, surFamily: family,
      recordKind: 'source-bound-fact', primaryMechanicalAuthority: true,
      sourceAuthority: surface.source, inventory: domain.inventory, generator: domain.generator,
      canonicalTarget: surface.target, owner: surface.owner, checks: domain.checks,
      consumerBoundary, scopeLimit: domain.scope, authorityKind,
      classification, classificationBasis,
      factsSha256: surface.factsSha256,
    });
  }
  for (const record of additionalRecords) {
    targetPage(record.canonicalTarget);
    records.push(record);
  }
  records.sort((a, b) => a.normalizedIdentity.localeCompare(b.normalizedIdentity, 'en'));
  const inverse = new Map();
  for (const record of records) {
    if (!inverse.has(record.canonicalTarget)) inverse.set(record.canonicalTarget, []);
    inverse.get(record.canonicalTarget).push(record.normalizedIdentity);
  }
  // This is retained, independently reviewed assignment metadata. The owner
  // must never rewrite it from the current records: input removal/reassignment
  // must fail before a manual review route can conceal the missing identity.
  const assignmentPath = 'docs/config/source-authority-family-assignments.json';
  const assignments = read(assignmentPath);
  assert.equal(assignments.schemaVersion, 'finite-sur-authority-assignments.v1');
  assert.deepEqual(assignments.families.map(family => family.id).sort(), [...requiredSurfaceFamilies].sort(),
    'authority-matrix assignment manifest must retain the exact finite SUR roster');
  const byFamily = new Map(assignments.families.map(family => [family.id, family.authorityAvailability]));
  for (const family of families) family.authorityAvailability = structuredClone(byFamily.get(family.id));
  return compactAuthorityMatrix({
    schemaVersion: 'source-authority-matrix.v1',
    assignmentManifest: { path: assignmentPath, sha256: digest(assignments) },
    authority: 'Relations between explicitly admitted inventory identities and reader/review ownership. Owning freshness checks and independent semantic qualification remain required.',
    families, records,
    inverse: [...inverse].sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([canonicalTarget, identities]) => ({ canonicalTarget, identities: identities.sort() })),
  });
}

// Fixed existing-data adapters only. In particular, CLI candidate declarations
// retain their actual ownership/support limits, and configuration projection
// positions are not relabeled as unique schema branch identities.
export function additionalAuthorityRecords(root, pages, read = file =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))) {
  const pageByPath = new Map(pages.map(page => [page.page, page]));
  const records = [];
  const add = (identity, family, source, target, facts, policy) => {
    const page = pageByPath.get(target.split('#')[0]);
    assert(page?.owner, `authority-matrix additional adapter lacks reader owner: ${identity}`);
    const carrier = source.split('#')[0];
    assert(!path.isAbsolute(carrier) && !carrier.split('/').includes('..')
      && fs.existsSync(path.join(root, carrier)), `authority-matrix additional orphan source: ${identity}`);
    records.push({ normalizedIdentity: identity, surFamily: family, sourceAuthority: source,
      canonicalTarget: target, owner: page.owner, recordKind: 'source-bound-fact',
      primaryMechanicalAuthority: true, factsSha256: digest(facts), ...policy });
  };
  const configurationFile = 'docs/generated/inventory/configuration-families.json';
  const configuration = read(configurationFile);
  const familyRoutes = new Map(configuration.families.map(family => [family.id, family.route]));
  const schemaFile = 'docs/generated/inventory/schema-field-drift.json';
  const schemas = read(schemaFile);
  const schemaPaths = new Set(schemas.schemas.map(schema => schema.path));
  const configurationSources = new Set();
  const configurationFamilies = {
    platform: 'SUR-CFG-03', project: 'SUR-CFG-01', 'execution-graph': 'SUR-CFG-02',
    'published-project-pair': 'SUR-CFG-01', 'registered-plugin': 'SUR-CFG-04',
    'test-provider': 'SUR-CFG-04', 'worker-resources': 'SUR-CFG-05',
    'deployment-values': 'SUR-CFG-06', 'compact-profile': 'SUR-CFG-05',
    'host-routing': 'SUR-CFG-04', 'process-environment': 'SUR-CFG-07',
    'native-host-policy': 'SUR-CFG-08', 'lint-policy': 'SUR-SPC-06',
    'owned-cli-maintenance': 'SUR-API-01', 'durable-storage': 'SUR-API-08',
  };
  for (const [index, fact] of configuration.facts.entries()) {
    assert(configurationFamilies[fact.family], `authority-matrix unknown configuration family: ${fact.family}`);
    const route = fact.reference ?? (fact.kind === 'direct-source-boundary' ? familyRoutes.get(fact.family) : null);
    const relativeTarget = /\]\(([^)]+)\)/u.exec(route)?.[1];
    assert(relativeTarget && !relativeTarget.includes('://'), 'authority-matrix configuration view lacks its reader route');
    const target = path.posix.normalize(`docs/site/reference/${relativeTarget}`);
    const primaryIdentity = schemaPaths.has(fact.source)
      ? id('schema-document', fact.source) : id('configuration-source-boundary', fact.source);
    if (!schemaPaths.has(fact.source) && !configurationSources.has(fact.source)) {
      add(primaryIdentity, configurationFamilies[fact.family], fact.source, reference('configuration'),
        { source: fact.source, sourceSha256: fact.sourceSha256 }, {
          inventory: configurationFile,
          generator: 'scripts/docs-configuration-inventory.mjs --configuration-reference-only',
          checks: ['node scripts/docs-configuration-inventory.mjs --configuration-reference-only --check'],
          sourceBindingSha256: fact.sourceSha256,
          consumerBoundary: 'Source identity anchor only. The separate ordered views retain their actual consumer and conditional/default limits.',
          classification: 'qualified-configuration-source-boundary',
          classificationBasis: 'Existing native configuration source identity and digest; not every internal algorithm.',
          scopeLimit: 'Byte-bound source identity, not an independently inferred runtime value, schema branch or execution grant.',
        });
      configurationSources.add(fact.source);
    }
    add(id('configuration-view', fact.family, fact.source, fact.kind, fact.setting, index),
      configurationFamilies[fact.family], fact.source, target, fact, {
        recordKind: 'projection-reference', primaryMechanicalAuthority: false, primaryIdentity,
        sourceBindingSha256: fact.sourceSha256,
        inventory: configurationFile,
        generator: 'scripts/docs-configuration-inventory.mjs --configuration-reference-only',
        checks: ['node scripts/docs-configuration-inventory.mjs --configuration-reference-only --check'],
        consumerBoundary: JSON.stringify({ consumer: fact.consumer, role: fact.consumerRole ?? null }),
        classification: 'qualified-ordered-configuration-view',
        classificationBasis: `Existing qualified family ${fact.family}; native ordered projection position is part of the identity, not semantic qualification by itself.`,
        scopeLimit: 'Ordered qualified projection, not a unique JSON-schema branch pointer. Repeated/conditional views remain distinct. Read the owning schema/consumer reference for applicability and defaults; no effective value or execution is inferred.',
      });
  }
  const semanticReaders = new Map(schemas.authorityCoverage.records.map(record => [record.schema, record]));
  for (const schema of schemas.schemas) {
    const role = semanticReaders.get(schema.path);
    const policy = {
      inventory: schemaFile, generator: 'scripts/docs-schema-fields.mjs --reference',
      checks: ['node scripts/docs-schema-fields.mjs --check --reference'],
      consumerBoundary: role ? JSON.stringify({ readerKind: role.readerKind, consumers: role.consumers,
        defaults: role.defaultBehavior, selection: role.selectionAndFailureBoundary })
        : 'Declaration/property index only; actual validator and consumer authority is the linked schema reference, not this pointer index.',
      classification: schema.status,
      sourceBindingSha256: schema.sha256,
      classificationBasis: `${schemaFile}: explicit source-bound status and SHA-256, not filename inference.`,
      scopeLimit: 'Whole JSON declaration and literal properties-key pointers. Not validation, ref resolution, branch applicability, default insertion or runtime activation.',
    };
    add(id('schema-document', schema.path), 'SUR-API-03', schema.path, schema.referenceRoute, schema, policy);
    for (const property of schema.properties) add(id('schema-property', schema.path, property.pointer),
      'SUR-API-03', schema.path, schema.referenceRoute, property, policy);
  }
  const errorsFile = 'docs/config/common-error-catalogue.json';
  for (const entry of read(errorsFile).entries) {
    assert(entry.sources.length && entry.consumer, `authority-matrix diagnostic lacks its qualified source/consumer: ${entry.id}`);
    add(id('diagnostic-family', entry.id), 'SUR-API-05', entry.sources[0].path,
      reference(`common-errors-${entry.section}`), entry, {
        inventory: errorsFile, generator: 'scripts/docs-common-error-catalogue.mjs',
        checks: ['npm run docs:errors:check'], consumerBoundary: entry.consumer,
        classification: 'source-qualified-diagnostic-family',
        classificationBasis: 'Existing catalogue sources, dynamic/literal identity and trigger/effect/consumer contract.',
        scopeLimit: 'Literal or explicitly dynamic diagnostic family; linked source vector and consumer limits apply. Not every dependency message or observed incident.',
      });
  }
  const cliFile = 'docs/generated/inventory/cli-surfaces.json';
  const cli = read(cliFile);
  for (const source of cli.sources) {
    const policy = {
      inventory: cliFile, generator: 'scripts/docs-inventory.mjs --cli',
      checks: ['node scripts/docs-inventory.mjs --cli --check'],
      consumerBoundary: source.ownership.boundary,
      classification: source.ownership.kind,
      sourceBindingSha256: source.sourceBinding.sha256,
      classificationBasis: JSON.stringify(source.ownership),
      scopeLimit: 'Native source declarations only. Candidate/private/delegated/test/history states and the source record\'s unresolved/adapter limits remain explicit; no supported invocation, generic executable or runtime capability follows.',
    };
    add(id('cli-source-declaration', source.path), 'SUR-API-01', source.path, reference('cli'), source, policy);
    for (const kind of ['commands', 'subcommands', 'options', 'positionals', 'defaults', 'exits']) {
      for (const [index, declaration] of source[kind].entries()) add(id('cli-declaration', source.path,
        kind, declaration.name ?? declaration.expression ?? '', declaration.scope ?? '',
        declaration.startByte ?? declaration.line ?? '', index), 'SUR-API-01', source.path,
      reference('cli'), declaration, policy);
    }
  }
  for (const declaration of cli.launchGraph.declarations) add(id('manifest-command-declaration',
    declaration.virtualSource.manifest, declaration.virtualSource.jsonPointer), 'SUR-API-01',
  declaration.virtualSource.manifest, reference('cli'), declaration, {
    inventory: cliFile, generator: 'scripts/docs-inventory.mjs --cli',
    checks: ['node scripts/docs-inventory.mjs --cli --check'],
    consumerBoundary: declaration.supportBoundary,
    classification: declaration.originOwnership.kind,
    classificationBasis: JSON.stringify(declaration.originOwnership),
    scopeLimit: 'Virtual manifest JSON-pointer declaration, not a physical shell span or a public/supported launch grant.',
  });
  const tasksFile = 'docs/generated/inventory/operator-tasks.json';
  const taskFamilies = {
    'install-preflight': 'SUR-OPS-01', 'start-readiness-observe': 'SUR-OPS-02',
    'run-control': 'SUR-OPS-02', 'symptom-diagnosis': 'SUR-OPS-03', 'backup-restore': 'SUR-OPS-04',
    'upgrade-rollback': 'SUR-OPS-05', rotation: 'SUR-OPS-05', 'capacity-retention': 'SUR-OPS-05',
    'plugin-lifecycle': 'SUR-OPS-05', decommission: 'SUR-OPS-05', 'prism-studio': 'SUR-SPC-03',
    'demo-delivery': 'SUR-OPS-06', 'worker-trust': 'SUR-DEP-09',
  };
  for (const task of read(tasksFile).tasks) {
    assert(taskFamilies[task.taskId], `authority-matrix operator task needs an explicit SUR assignment: ${task.taskId}`);
    add(id('operator-procedure', task.taskId), taskFamilies[task.taskId],
    'docs/operator-tasks.json', task.canonical, task, {
      inventory: tasksFile, generator: 'scripts/generate-operator-task-registry.mjs',
      checks: ['npm run docs:operator-tasks:check'],
      consumerBoundary: JSON.stringify({ start: task.supportedStartState,
        implementationAuthorities: task.implementationAuthorities, limits: task.productLimits }),
      classification: 'qualified-operator-procedure-route',
      classificationBasis: 'Existing operator task registry and named implementation authorities.',
      scopeLimit: 'Procedure/source relationship, not successful deployment, recovery or real-operator exercise.',
    });
  }
  const ownershipFile = 'packaging/runtime/package-ownership.json';
  const authoredPolicy = {
    recordKind: 'authored-source-declaration', generator: null, freshness: 'owning-source-check-required',
    inventory: ownershipFile, checks: ['node scripts/check-runtime-role-manifests.mjs'],
    consumerBoundary: 'Declared runtime assembly/package membership; the actual packaging and role checks govern consistency.',
    classification: 'authored-runtime-membership-declaration',
    classificationBasis: 'Explicit package ownership and role manifests, not package author attribution.',
    scopeLimit: 'Authored mechanical membership declaration. No operational owner, activation, image or deployment outcome is inferred.',
  };
  for (const pkg of read(ownershipFile).packages) add(id('runtime-package', pkg.id), 'SUR-CTL-06',
    ownershipFile, 'docs/site/understand/deployment-and-trust.md', pkg, authoredPolicy);
  // This is the exact already-declared role directory, not a repository walk.
  for (const name of fs.readdirSync(path.join(root, 'packaging/runtime/roles')).sort()) {
    assert(name.endsWith('.json'), `authority-matrix unexpected runtime role member: ${name}`);
    const source = `packaging/runtime/roles/${name}`;
    add(id('runtime-role', name), 'SUR-EXT-09', source,
      'docs/site/reference/worker-profiles-and-roles.md', read(source), { ...authoredPolicy, inventory: source });
  }
  const platformFile = 'docs/generated/inventory/platform-surfaces.json';
  const platform = read(platformFile);
  const platformPolicy = {
    inventory: platformFile, generator: 'scripts/docs-platform-surface-inventory.mjs',
    checks: ['npm run docs:ap09:platform-inventory:check'],
    classification: 'qualified-platform-source-relation',
    classificationBasis: 'Existing source-qualified platform exposure and store-policy/caller selectors, outside the original nine-group join.',
    scopeLimit: 'Only the native selected exposure or policy/source/caller relation. Not arbitrary network reachability, operational ownership or a successful retention/deployment action.',
  };
  for (const item of platform.networkExposures) add(id('network-exposure', item.source,
    item.value, item.routeKind ?? ''), 'SUR-API-09', item.source,
  'docs/site/understand/communication.md#endpoint-catalogue', item, {
    ...platformPolicy, consumerBoundary: JSON.stringify({ kind: item.kind,
      backendService: item.backendService ?? null, activationState: item.activationState }),
  });
  const policyAuthorities = new Map();
  for (const policy of platform.storePolicies) for (const authority of policy.authorities) {
    const qualified = id(policy.id, authority.id);
    assert(!policyAuthorities.has(qualified), `authority-matrix duplicate store authority: ${qualified}`);
    policyAuthorities.set(qualified, { authority, policy });
    add(id('store-policy-authority', policy.id, authority.id), 'SUR-API-08', authority.source,
      policy.explanation, authority, { ...platformPolicy,
        consumerBoundary: JSON.stringify({ policy: policy.id, role: authority.role,
          selector: authority.selector, pathBoundary: policy.pathMeaning,
          failureBoundary: policy.failureBoundary }),
      });
  }
  for (const instance of platform.additionalStoreInstances) {
    const ids = [...instance.sourceAuthorityIds, ...instance.callerAuthorityIds];
    const bindings = ids.flatMap(identity => {
      const matches = instance.policyFamilies.map(policy => policyAuthorities.get(id(policy, identity))).filter(Boolean);
      assert(matches.length,
        `authority-matrix orphan store instance/source/caller policy: ${instance.id} ${identity}`);
      return matches;
    });
    assert(bindings.length, `authority-matrix store instance has no qualified authority: ${instance.id}`);
    const first = bindings[0];
    add(id('store-instance-projection', instance.id), 'SUR-API-08', first.authority.source,
      first.policy.explanation, instance, { ...platformPolicy,
        recordKind: 'projection-reference', primaryMechanicalAuthority: false,
        primaryIdentity: id('store-policy-authority', first.policy.id, first.authority.id),
        consumerBoundary: JSON.stringify({ publicBoundary: instance.publicBoundary,
          sourceAuthorityIds: instance.sourceAuthorityIds, callerAuthorityIds: instance.callerAuthorityIds }),
        scopeLimit: 'Qualified path/caller composition: all named authority and caller bindings remain necessary. The primary locator does not replace that vector or establish every internal temporary file.',
        authorityVector: bindings.map(({ authority }) => ({ id: authority.id, source: authority.source,
          selector: authority.selector, sourceSha256: authority.sourceSha256 })),
      });
  }
  return records;
}

export function renderAuthorityMatrixSummary(matrix, text) {
  assertAuthorityMatrix(matrix);
  const start = '<!-- BEGIN GENERATED: source authority matrix -->';
  const end = '<!-- END GENERATED: source authority matrix -->';
  const a = text.indexOf(start), b = text.indexOf(end);
  assert(a >= 0 && b > a && text.indexOf(start, a + start.length) < 0
    && text.indexOf(end, b + end.length) < 0,
  'authority-matrix missing, duplicated or reversed owned summary markers');
  const resolve = record => matrix.authorityPolicies
    ? { ...matrix.authorityPolicies[record.policyRef], ...record } : record;
  const rows = Object.keys(surfaceFamilyCounts).map(group => {
    const families = matrix.families.filter(family => family.id.split('-')[1] === group);
    const records = matrix.records.filter(record => record.surFamily.split('-')[1] === group).map(resolve);
    return `| ${group} | ${families.length} | ${records.filter(record => record.primaryMechanicalAuthority).length} | ${records.filter(record => record.recordKind === 'projection-reference').length} | ${records.filter(record => record.recordKind === 'manual-review-route').length} |`;
  });
  const block = `${start}\n\n## Current source and reader relations\n\nThe [full identity index](reference/generated-documentation-map.json) is under \`sourceSurfaceMap.authorityMatrix\`. Start with a SUR family above or search an exact source path in \`sourceAuthority\`. Each \`normalizedIdentity\` names its SUR family, source authority, canonical reader target and documentation owner. Resolve its \`policyRef\` in \`authorityPolicies\` for the owning inventory, generator or manual route, required check, consumer boundary and classification. Shared policies avoid copying competing ownership rules.\n\nThe separate \`docs/config/source-authority-family-assignments.json\` is reviewed assignment metadata, not another product-fact source; generation never rewrites it. An added, removed or reassigned selected identity requires an explicit affected Source review. Each family also has an \`authorityAvailability\` disposition: named admitted typed identities, or an explicit bounded reason that the selected inventories do not cover that whole high-level surface. A projection retains its actual primary authority even when assigned to a different family. This disposition is not proof of repository-wide source discovery.\n\nFor the reverse direction, find a canonical page/anchor in \`inverse\` and follow its exact identities. Configuration view identities retain the native ordered record position: repeated or conditional projections are not unique schema branch pointers. Open the owning schema/consumer reference for applicability and default behavior.\n\n| SUR group | Families | Source-bound declarations/relations | Projection references | Manual review routes |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nThese are index relations, **not counts of active public runtime features**. Explicit fixture, retained, private, candidate and declaration-only classifications remain in their owning policies. A manual route assigns a named source/consumer review and documentation owner; it does not claim generated freshness, completed semantic review or source-discovery completeness. Historical source links and guide-depth labels in the navigation tables are not current mechanical authorities.\n\nRun the required owning checks before relying on current facts, then the governance check for this complete relation. Neither this join nor a successful structural check proves runtime validation, default insertion, deployment, browser/provider execution or a previously unknown public launch.\n\n${end}`;
  return text.slice(0, a) + block + text.slice(b + end.length);
}
