import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A stateless schema projection for dependency claims, not a second configuration
// inventory. Keep predicates beside fields; their presence is not unconditional.
export function dependencySchemaFacts(schema, schemaFile) {
  const fields = [];
  const predicates = [];
  const diagnostics = new Set();
  const documents = new Map();
  const active = new Set();
  const annotationKeys = ['type', 'enum', 'const', 'default', 'format', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'writeOnly', 'readOnly', 'deprecated', 'description'];
  const initialBase = schemaFile ? pathToFileURL(path.resolve(schemaFile)).href : 'urn:plugin-inline-schema';
  documents.set(initialBase, schema);
  function reference(ref, document, base) {
    let url;
    try { url = new URL(ref, base); } catch { diagnostics.add(`Invalid schema reference ${ref} at ${base}`); return; }
    const fragment = url.hash.slice(1);
    url.hash = '';
    let targetDocument = document;
    if (url.href !== base.split('#')[0]) {
      if (documents.has(url.href)) targetDocument = documents.get(url.href);
      else if (url.protocol === 'file:' && fs.existsSync(fileURLToPath(url))) {
        try { targetDocument = JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8')); documents.set(url.href, targetDocument); }
        catch { diagnostics.add(`Unreadable schema reference ${ref} at ${base}`); return; }
      } else { diagnostics.add(`Unresolved schema reference ${ref} at ${base}`); return; }
    }
    let target = targetDocument;
    if (fragment.startsWith('/')) {
      try { for (const part of fragment.split('/').slice(1)) target = target?.[decodeURIComponent(part).replaceAll('~1', '/').replaceAll('~0', '~')]; }
      catch { target = undefined; }
    } else if (fragment) {
      const candidates = [];
      function anchors(value) {
        if (!value || typeof value !== 'object') return;
        if (value.$anchor === fragment || value.$dynamicAnchor === fragment) candidates.push(value);
        for (const child of Object.values(value)) if (child && typeof child === 'object') anchors(child);
      }
      anchors(targetDocument);
      target = candidates.length === 1 ? candidates[0] : undefined;
    }
    if (typeof target !== 'boolean' && (!target || typeof target !== 'object')) { diagnostics.add(`Unresolved schema reference ${ref} at ${base}`); return; }
    return { target, document: targetDocument, base: url.href };
  }
  function visit(value, field = '', conditions = [], document = schema, base = initialBase, location = '#') {
    if (typeof value === 'boolean') { predicates.push({ path: field || '$', conditions, keyword: 'boolean schema', value, location, base }); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    if (active.has(value)) { predicates.push({ path: field || '$', conditions, keyword: 'recursive schema boundary', value: value.$ref ?? location, location, base }); return; }
    active.add(value);
    if (value.$id) {
      try { base = new URL(value.$id, base).href; documents.set(base, value); document = value; }
      catch { diagnostics.add(`Invalid schema identifier ${value.$id} at ${location}`); }
    }
    if (value.$dynamicRef || value.$recursiveRef) diagnostics.add(`Dynamic schema reference requires scope resolution: ${value.$dynamicRef ?? value.$recursiveRef} at ${base}${location}`);
    if (value.$ref) {
      const resolved = reference(value.$ref, document, base);
      if (resolved) visit(resolved.target, field, conditions, resolved.document, resolved.base, value.$ref);
    }
    const constraints = Object.fromEntries(annotationKeys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
    if (field) fields.push({ path: field, conditions, constraints, location, base });
    for (const keyword of ['required', 'dependentRequired', 'propertyNames', 'additionalProperties', 'unevaluatedProperties', 'contains', 'minContains', 'maxContains']) {
      if (Object.hasOwn(value, keyword)) predicates.push({ path: field || '$', conditions, keyword, value: value[keyword], location, base });
    }
    for (const [name, child] of Object.entries(value.properties ?? {})) visit(child, field ? `${field}.${name}` : name, conditions, document, base, `${location}/properties/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`);
    for (const [pattern, child] of Object.entries(value.patternProperties ?? {})) visit(child, `${field}{key matches ${JSON.stringify(pattern)}}`, conditions, document, base, `${location}/patternProperties/${pattern}`);
    for (const keyword of ['additionalProperties', 'unevaluatedProperties']) if (value[keyword] && typeof value[keyword] === 'object') visit(value[keyword], `${field}{key}`, conditions, document, base, `${location}/${keyword}`);
    if (value.items !== undefined) {
      if (Array.isArray(value.items)) value.items.forEach((child, index) => visit(child, `${field}[${index}]`, conditions, document, base, `${location}/items/${index}`));
      else visit(value.items, `${field}[]`, conditions, document, base, `${location}/items`);
    }
    (value.prefixItems ?? []).forEach((child, index) => visit(child, `${field}[${index}]`, conditions, document, base, `${location}/prefixItems/${index}`));
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) (value[keyword] ?? []).forEach((child, index) => {
      const predicate = `${keyword}[${index}] at ${field || '$'}: ${JSON.stringify(child)}`;
      predicates.push({ path: field || '$', conditions, keyword, value: child, location: `${location}/${keyword}/${index}`, base });
      visit(child, field, keyword === 'allOf' ? conditions : [...conditions, predicate], document, base, `${location}/${keyword}/${index}`);
    });
    if (value.if !== undefined) {
      predicates.push({ path: field || '$', conditions, keyword: 'if', value: value.if, location: `${location}/if`, base });
      visit(value.if, field, [...conditions, 'conditional test (does not impose a field requirement)'], document, base, `${location}/if`);
      if (value.then !== undefined) visit(value.then, field, [...conditions, `if ${JSON.stringify(value.if)}`], document, base, `${location}/then`);
      if (value.else !== undefined) visit(value.else, field, [...conditions, `unless ${JSON.stringify(value.if)}`], document, base, `${location}/else`);
    }
    if (value.not !== undefined) {
      predicates.push({ path: field || '$', conditions, keyword: 'not', value: value.not, location: `${location}/not`, base });
      visit(value.not, field, [...conditions, `forbidden matching schema ${JSON.stringify(value.not)}`], document, base, `${location}/not`);
    }
    for (const [name, child] of Object.entries(value.dependentSchemas ?? {})) visit(child, field, [...conditions, `when ${field ? `${field}.` : ''}${name} is present`], document, base, `${location}/dependentSchemas/${name}`);
    for (const [name, child] of Object.entries(value.dependencies ?? {})) {
      if (Array.isArray(child)) predicates.push({ path: field || '$', conditions: [...conditions, `when ${name} is present`], keyword: 'required', value: child, location: `${location}/dependencies/${name}`, base });
      else visit(child, field, [...conditions, `when ${name} is present`], document, base, `${location}/dependencies/${name}`);
    }
    if (value.additionalItems !== undefined) visit(value.additionalItems, `${field}[]`, conditions, document, base, `${location}/additionalItems`);
    if (value.contains && typeof value.contains === 'object') visit(value.contains, `${field}[]`, [...conditions, 'contains matching item'], document, base, `${location}/contains`);
    active.delete(value);
  }
  visit(schema);
  return { fields, predicates, diagnostics: [...diagnostics].sort() };
}
