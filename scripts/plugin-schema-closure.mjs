import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Exact source acquisition, not schema validation or runtime/credential authority.
// Only explicitly bound remote IDs may resolve to local files; never fetch URLs.
export function acquireSchemaClosure({ root, source, schema, bindings = {} }) {
  root = path.resolve(root);
  const documents = new Map();
  const diagnostics = new Set();
  const resources = new Map();
  const pending = [];
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  const contained = file => {
    const rel = path.relative(root, file);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Schema source escapes repository');
    const real = fs.realpathSync(file);
    const realRel = path.relative(fs.realpathSync(root), real);
    if (realRel === '..' || realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel)) throw new Error('Schema symlink escapes repository');
  };
  function index(value, base, origin) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && typeof value.$id === 'string') {
      base = new URL(value.$id, base).href;
      if (resources.has(base) && resources.get(base) !== origin) diagnostics.add(`Duplicate schema ID: ${base}`);
      resources.set(base, origin);
    }
    if (!Array.isArray(value)) for (const keyword of ['$ref', '$dynamicRef', '$recursiveRef']) {
      if (typeof value[keyword] === 'string') pending.push({ reference: value[keyword], base, origin });
    }
    // Traverse schema-valued keywords only: defaults/examples/const are data.
    for (const keyword of ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']) {
      const children = value[keyword];
      if (children && typeof children === 'object') for (const child of Object.values(children)) index(child, base, origin);
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
      if (Array.isArray(value[keyword])) for (const child of value[keyword]) index(child, base, origin);
    }
    for (const keyword of ['additionalProperties', 'unevaluatedProperties', 'propertyNames', 'contains', 'not', 'if', 'then', 'else', 'additionalItems', 'unevaluatedItems', 'contentSchema']) index(value[keyword], base, origin);
    if (Array.isArray(value.items)) for (const child of value.items) index(child, base, origin);
    else index(value.items, base, origin);
    for (const child of Object.values(value.dependencies ?? {})) if (!Array.isArray(child)) index(child, base, origin);
  }
  function load(file, inline, isInline = false) {
    file = path.resolve(root, file);
    const key = relative(file) + (isInline ? '#inline' : '');
    if (documents.has(key)) return;
    contained(file);
    const bytes = isInline ? Buffer.from(JSON.stringify(inline)) : fs.readFileSync(file);
    const raw = isInline ? inline : JSON.parse(bytes);
    documents.set(key, { source: relative(file), inline: isInline, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), schema: raw });
    const uri = pathToFileURL(file).href;
    resources.set(uri, key);
    index(raw, uri, key);
  }
  load(source, schema, Object.hasOwn(arguments[0], 'schema'));
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const item = pending[cursor];
    try {
      const url = new URL(item.reference, item.base);
      url.hash = '';
      if (resources.has(url.href)) continue;
      if (Object.hasOwn(bindings, url.href)) {
        load(bindings[url.href]);
        if (!resources.has(url.href)) diagnostics.add(`Bound schema does not declare ID: ${url.href}`);
      } else if (url.protocol === 'file:') load(fileURLToPath(url));
      else diagnostics.add(`Unresolved schema reference: ${url.href} from ${item.origin}`);
    } catch (error) {
      diagnostics.add(`Schema reference ${item.reference} from ${item.origin}: ${error.message}`);
    }
  }
  return { documents: [...documents.values()].sort((a, b) => a.source.localeCompare(b.source) || Number(a.inline) - Number(b.inline)), diagnostics: [...diagnostics].sort(), qualification: 'Exact raw schema/reference source acquisition; fragments and schema semantics are not validated. No network, runtime role or credential authority.' };
}
