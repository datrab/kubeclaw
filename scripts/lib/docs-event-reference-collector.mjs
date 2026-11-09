import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { collectDeclaredTypeGraph, collectRecordConstructors, collectSchemaGraph,
  selectDeclaredTypeClosure, collectLocalPackageTypeBindings, collectEmbeddedScriptSyntax,
  collectOwnedCallSyntax, collectGoDeclarationBodies } from './docs-event-contracts.mjs';

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const roleNames = new Set(['producer', 'transformer', 'validator', 'consumer', 'declaration',
  'retained', 'upstream', 'diagnostic', 'supporting-record']);

/** Bind qualified semantic relationships to freshly collected mechanical facts.
 * A selector anchors an editorial role; it never automatically proves that role.
 * Exact source identity comes from the complete census, not registry hash pins.
 */
export function collectBoundEventReference(root, census, bindings) {
  if (bindings.schemaVersion !== 'event-reference-bindings.v1') throw new Error('EVENT_BINDINGS_VERSION_UNSUPPORTED');
  const sources = new Map(census.sources.map((source) => [source.path, source]));
  // Semantic authorities such as a shipped contract README are explicit
  // supplementary inputs, not executable-source discovery exemptions.
  for (const source of bindings.supportingInputs ?? []) {
    if (sources.has(source.path) || source.path.startsWith('docs/')) throw new Error(`EVENT_SUPPORTING_INPUT_INVALID:${source.path}`);
    sources.set(source.path, source);
  }
  const ids = new Set();
  const read = (file) => {
    const source = sources.get(file);
    if (!source) throw new Error(`EVENT_BINDING_SOURCE_NOT_IN_CENSUS:${file}`);
    const base = fs.realpathSync(root); const absolute = path.join(base, file);
    if (!fs.lstatSync(absolute).isFile() || !fs.realpathSync(absolute).startsWith(base + path.sep)) throw new Error(`EVENT_BINDING_SOURCE_BOUNDARY:${file}`);
    const raw = fs.readFileSync(absolute);
    if (hash(raw) !== source.sha256 || raw.length !== source.bytes) throw new Error(`EVENT_BINDING_SOURCE_CHANGED_DURING_COLLECTION:${file}`);
    return new TextDecoder('utf-8', { fatal: true }).decode(raw);
  };
  for (const source of sources.values()) read(source.path);
  const scriptPaths = census.sources.map((source) => source.path)
    .filter((file) => /\.(?:[cm]?[jt]sx?)$/u.test(file));
  const packageBindings = collectLocalPackageTypeBindings(root, census);
  const declarations = collectDeclaredTypeGraph(root, scriptPaths);
  const activation = { roles: [], plugins: [], observers: [], adapters: [],
    meaning: 'Delivered manifest registrations only. Configuration, grants, module loading and exact subscription matching still control activation; no live provider is inferred.' };
  if (bindings.activation) {
    const catalog = new Map();
    for (const source of census.sources) {
      const directory = path.posix.dirname(path.posix.dirname(source.path));
      if (!source.path.endsWith('/plugin.json') || !bindings.activation.pluginCatalogRoots.includes(directory)) continue;
      const manifest = JSON.parse(read(source.path));
      if (typeof manifest.id !== 'string' || catalog.has(manifest.id)) throw new Error(`EVENT_PLUGIN_CATALOG_ID_INVALID:${source.path}`);
      catalog.set(manifest.id, { manifest, source });
    }
    const delivered = new Map();
    for (const file of bindings.activation.roleManifests) {
      const role = JSON.parse(read(file));
      if (typeof role.role !== 'string' || !Array.isArray(role.plugins)) throw new Error(`EVENT_ROLE_MANIFEST_INVALID:${file}`);
      activation.roles.push({ path: file, sourceSha256: sources.get(file).sha256, role: role.role, plugins: role.plugins });
      for (const id of role.plugins) {
        if (!catalog.has(id)) throw new Error(`EVENT_DELIVERED_PLUGIN_NOT_FOUND:${file}:${id}`);
        if (!delivered.has(id)) delivered.set(id, []);
        delivered.get(id).push(role.role);
      }
    }
    for (const [id, deliveredRoles] of [...delivered.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const { manifest, source } = catalog.get(id);
      const origin = { path: source.path, sourceSha256: source.sha256 };
      activation.plugins.push({ pluginId: id, deliveredRoles, ...origin });
      for (const [key, output] of [['observers', activation.observers], ['adapters', activation.adapters]]) {
        if (manifest[key] !== undefined && !Array.isArray(manifest[key])) throw new Error(`EVENT_REGISTRATIONS_NOT_ARRAY:${source.path}:${key}`);
        for (const registration of manifest[key] ?? []) output.push({ pluginId: id, deliveredRoles, ...origin,
          registration, modulePath: path.posix.join(path.posix.dirname(source.path), registration.module) });
      }
    }
  }
  const families = bindings.families.map((binding) => {
    if (!binding.id || ids.has(binding.id)) throw new Error(`EVENT_BINDING_DUPLICATE_OR_EMPTY_ID:${binding.id}`);
    ids.add(binding.id);
    const roles = binding.roles.flatMap((role) => {
      if (!roleNames.has(role.role) || !role.selector || !role.condition) throw new Error(`EVENT_BINDING_ROLE_INVALID:${binding.id}`);
      const text = read(role.path); const matches = [];
      for (let start = text.indexOf(role.selector); start >= 0; start = text.indexOf(role.selector, start + role.selector.length)) {
        matches.push({ role: role.role, condition: role.condition, selector: role.selector,
          source: { path: role.path, sourceSha256: sources.get(role.path).sha256,
            start, end: start + role.selector.length, line: text.slice(0, start).split('\n').length } });
      }
      if (!matches.length) throw new Error(`EVENT_BINDING_SELECTOR_MISSING:${binding.id}:${role.path}:${role.selector}`);
      if (role.locations) {
        const selected = role.locations.map((location) => {
          const onLine = matches.filter((match) => match.source.line === location.line);
          const match = onLine[location.occurrence ?? 0];
          if (!match) throw new Error(`EVENT_BINDING_OCCURRENCE_MISSING:${binding.id}:${role.path}:${location.line}`);
          return match;
        });
        if (!selected.length || new Set(selected.map((match) => match.source.start)).size !== selected.length) throw new Error(`EVENT_BINDING_OCCURRENCES_INVALID:${binding.id}`);
        return selected;
      }
      if (matches.length !== 1) throw new Error(`EVENT_BINDING_ROLE_AMBIGUOUS:${binding.id}:${role.path}:${role.selector}`);
      return matches;
    });
    const roots = binding.types ?? [];
    for (const entry of roots) read(entry.path);
    const closure = roots.length ? selectDeclaredTypeClosure(root, declarations, packageBindings, roots)
      : { declarations: [], values: [], edges: [], limits: [] };
    for (const file of binding.constructorSources ?? []) read(file);
    for (const file of binding.schemas ?? []) read(file);
    const schemas = collectSchemaGraph(root, binding.schemas ?? []);
    const constructors = collectRecordConstructors(root, binding.constructorSources ?? []);
    for (const file of binding.embeddedSources ?? []) read(file);
    const embedded = collectEmbeddedScriptSyntax(root, binding.embeddedSources ?? []);
    if (embedded.incomplete.length || embedded.scripts.some((script) => script.status !== 'parsed-static-script')) throw new Error(`EVENT_EMBEDDED_PARSER_REQUIRED:${binding.id}`);
    const callSyntax = collectOwnedCallSyntax(root, binding.constructorSources ?? []);
    const selectedCalls = (binding.calls ?? []).flatMap((selection) => {
      read(selection.path);
      const matches = callSyntax.filter((call) => call.source.path === selection.path && call.expression === selection.expression);
      if (!matches.length) throw new Error(`EVENT_PAYLOAD_CALL_SELECTOR_MISSING:${binding.id}:${selection.path}:${selection.expression}`);
      const selected = selection.locations ? selection.locations.map((location) => {
        const call = matches.filter((entry) => entry.source.line === location.line)[location.occurrence ?? 0];
        if (!call) throw new Error(`EVENT_PAYLOAD_CALL_OCCURRENCE_MISSING:${binding.id}:${selection.path}:${location.line}`);
        return call;
      }) : matches;
      if (!selected.length || new Set(selected.map((call) => call.source.start)).size !== selected.length) throw new Error(`EVENT_PAYLOAD_CALL_OCCURRENCES_INVALID:${binding.id}`);
      if (!selection.role || !selection.condition) throw new Error(`EVENT_PAYLOAD_CALL_ROLE_REQUIRED:${binding.id}`);
      return selected.map((call) => ({ ...call, role: selection.role, condition: selection.condition }));
    });
    for (const selection of binding.goDeclarations ?? []) read(selection.path);
    const goDeclarations = collectGoDeclarationBodies(root, binding.goDeclarations ?? []);
    const resolveVersion = (authority) => {
    let version = null;
    if (authority !== null) {
      if (!authority || !authority.path) throw new Error(`EVENT_VERSION_AUTHORITY_REQUIRED:${binding.id}`);
      read(authority.path);
      if (authority.kind === 'type-member') {
        const declared = closure.declarations.filter((entry) => entry.path === authority.path && entry.name === authority.name);
        const members = declared.flatMap((entry) => entry.members.filter((member) => (member.staticName ?? member.name) === authority.member));
        if (members.length !== 1 || !members[0].type) throw new Error(`EVENT_VERSION_MEMBER_AMBIGUOUS_OR_MISSING:${binding.id}`);
        version = members[0].type.expression;
      } else if (authority.kind === 'constructor-field') {
        const text = read(authority.path);
        const matches = constructors.filter((entry) => entry.source.path === authority.path
          && entry.enclosingFunction && authority.enclosingSelector
          && text.slice(entry.enclosingFunction.start, entry.enclosingFunction.end).startsWith(authority.enclosingSelector))
          .flatMap((entry) => entry.fields.filter((field) => (field.staticName ?? field.name) === authority.field));
        const expressions = [...new Set(matches.map((field) => field.expression))];
        if (expressions.length !== 1) throw new Error(`EVENT_VERSION_CONSTRUCTOR_AMBIGUOUS_OR_MISSING:${binding.id}`);
        version = expressions[0];
      } else if (authority.kind === 'embedded-field') {
        const expressions = [...new Set(embedded.scripts.filter((script) => script.origin.path === authority.path)
          .flatMap((script) => script.calls.filter((call) => call.expression === authority.callExpression)
            .flatMap((call) => script.objects.filter((object) => object.source.scriptStart >= call.source.scriptStart
              && object.source.scriptEnd <= call.source.scriptEnd)
              .flatMap((object) => object.fields.filter((field) => (field.staticName ?? field.name) === authority.field).map((field) => field.expression)))))];
        if (!expressions.length) throw new Error(`EVENT_VERSION_EMBEDDED_FIELD_MISSING:${binding.id}`);
        version = expressions.join(' | ');
      } else if (authority.kind === 'schema-pointer') {
        const selected = schemas.documents.find((entry) => entry.path === authority.path);
        if (!selected || typeof authority.pointer !== 'string' || !authority.pointer.startsWith('/')) throw new Error(`EVENT_VERSION_SCHEMA_POINTER_INVALID:${binding.id}`);
        let value = selected.document;
        for (const segment of authority.pointer.slice(1).split('/')) {
          const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
          if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`EVENT_VERSION_SCHEMA_POINTER_MISSING:${binding.id}`);
          value = value[key];
        }
        if (value === null || !['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`EVENT_VERSION_SCHEMA_NOT_SCALAR:${binding.id}`);
        version = JSON.stringify(value);
      } else throw new Error(`EVENT_VERSION_AUTHORITY_UNSUPPORTED:${binding.id}`);
    }
    return version;
    };
    const versionAuthorities = binding.versionAuthorities ?? [binding.versionAuthority];
    const versions = versionAuthorities.map((authority) => ({ label: authority?.label ?? binding.id,
      expression: resolveVersion(authority), path: authority?.path ?? null }));
    const version = versions.map((entry) => entry.expression).filter((entry) => entry !== null).join('; ') || null;
    // Objects in an owning source remain construction candidates. Attaching a
    // file to a family does not turn all its object literals into emitted events.
    return { id: binding.id, boundary: binding.boundary, version, versions,
      roles, declarations: closure.declarations, typeValues: closure.values,
      typeEdges: closure.edges, constructors, selectedCalls, goDeclarations, embeddedScripts: embedded.scripts,
      constructorMeaning: 'All object syntax in selected complete owning sources; emission is established only by separately qualified producer/caller roles.',
      schemas: schemas.documents, schemaReferences: schemas.references,
      limits: [...binding.limits, ...closure.limits, schemas.meaning] };
  });
  // Recheck the physical vector after graph collection, including transitively
  // imported authorities. A change in an unrelated file also invalidates the
  // claim that this inventory belongs to one complete physical source vector.
  for (const source of sources.values()) read(source.path);
  return { schemaVersion: 'event-contract-reference.v1', sourceSetSha256: census.sourceSetSha256,
    families, packageBindings, activation, scopeStatus: 'BOUND_SEMANTIC_RELATIONSHIPS_REQUIRE_INDEPENDENT_WHOLE_COVERAGE_JUDGMENT',
    sourceSetHashMeaning: 'Primary executable/delivered Source census only; supplementary pinned authorities are separate.',
    primarySourceVector: census.sources.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
    supportingSourceVector: (bindings.supportingInputs ?? []).map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
    combinedSourceVectorSha256: hash(JSON.stringify([...sources.values()].map(({ path, sha256, bytes }) => ({ path, sha256, bytes })))) };
}
