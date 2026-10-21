import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import YAML from 'yaml';

// Exact packaging byte transport, not an interpreter, module loader, or an
// API apply consumer. A resource-shaped copied asset needs its own receiving
// contract and is deliberately outside this finite inert-copy admission.
const builder = 'scripts/build-runtime-role-bundle.mjs';
const pins = {
  [builder]: '0e20765fdcc03f09b884aba805e6733f42e63c494d39a11827b2fda5c9bd6ef9',
  'scripts/check-runtime-role-manifests.mjs': '521f14214afa42f7651ef81eca689f206cf3bc63c1c9edeb2376037dfba7d80c',
  'scripts/package-agent-skill-bundle.sh': 'dc4cc8626b5b303d2c28085bab83adf090932b4f31b0b4355a6dc188ac0a562c',
  'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs': '9cf81c81f0fa85ea740e578d6a3e10bcf86c7d85dec3c1ea287f3e7bab7d9fab',
  'packaging/runtime/package-ownership.json': '0723d0a55eba3fdcc6c041132616db3330c3397db6a24f1d0abbf874bd28cab8',
  'packaging/runtime/external-capabilities.json': '83655fee6c449cf01c4d28482758bbbbfcbd4afd81a3c89dd15b0554747b345b',
  'packaging/runtime/roles/nova.json': '1c9de75dde812cb7ac118cfc074aa3a57bef7f428b789f11e9051ea713f0dc23',
  'packaging/runtime/roles/buster.json': 'a049283b5964eba52cc3b4b71c356bc0e4ae441483d7aadf8c0eb88aed26d6dc',
  'packaging/runtime/roles/prism.json': '8723f462ad3597f2f1bfd2dd6f1028274c3a442af6c4485c1ae3597c12c4b3fe',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const qualifiedCopies = new WeakSet();
const firstPartyExclusions = ['dist', 'node_modules', 'tests', 'test-results', 'playwright-report', '.playwright'];
const dependencyExclusions = ['node_modules', 'test', 'tests', '.github'];
const observer = 'skills/common/plugins/openclaw-agent-observer';
const generated = observer + '/src/generated/agent-observability';
const canonical = 'contracts/agent-observability/v1/src';
const packageName = name => typeof name === 'string' && /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu.test(name) && !name.split('/').some(part => part === '.' || part === '..');

export function runtimeBundleCopyCustody(root, source, bytes) {
  if (source !== builder || hash(bytes) !== pins[builder]) return null;
  // Incomplete synthetic sources retain the original unknown role. Presence of
  // the selection authority activates full, fail-closed acquisition.
  if (!fs.existsSync(path.join(root, 'packaging/runtime/package-ownership.json'))) return null;
  const fail = detail => assert.fail(`API_PRODUCT_RUNTIME_BUNDLE_COPY_UNQUALIFIED: ${builder}; ${detail}`);
  if (fs.realpathSync(root) !== path.resolve(root)) fail('noncanonical root');
  const facts = new Map(), directories = new Map(), authorities = new Set(Object.keys(pins)), safePaths = new Map();
  function safe(relative, directory = false, optional = false) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.posix.isAbsolute(relative) || path.posix.normalize(relative) !== relative || relative.split('/').includes('..')) fail('unsafe source: ' + relative);
    const key = `${directory}:${relative}`;
    if (safePaths.has(key)) return safePaths.get(key);
    const parent = path.posix.dirname(relative);
    if (parent !== '.' && !safe(parent, true, optional)) return null;
    const absolute = path.join(root, relative);
    let status;
    try { status = fs.lstatSync(absolute); } catch (error) {
      if (optional && error.code === 'ENOENT') return null;
      fail(relative + '; missing source: ' + error.code);
    }
    if (status.isSymbolicLink() || fs.realpathSync(absolute) !== path.resolve(absolute)) fail('aliased source: ' + relative);
    if (directory ? !status.isDirectory() : !status.isFile()) fail('wrong source kind: ' + relative);
    safePaths.set(key, absolute);
    return absolute;
  }
  function read(relative) {
    const absolute = safe(relative), content = fs.readFileSync(absolute);
    facts.set(relative, [hash(content), fs.statSync(absolute).mode & 0o777]);
    return content;
  }
  function json(relative) {
    try { return JSON.parse(read(relative)); } catch (error) { fail(relative + '; invalid manifest: ' + error.message); }
  }
  function members(relative, optional = false) {
    const absolute = safe(relative, true, optional);
    if (!absolute) { directories.set(relative, null); return []; }
    const entries = fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    directories.set(relative, entries.map(entry => [entry.name, entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other']));
    return entries;
  }
  for (const [relative, expected] of Object.entries(pins)) if (hash(read(relative)) !== expected) fail(relative + '; reviewed producer/caller/selection authority changed');
  const ownership = json('packaging/runtime/package-ownership.json');
  const packages = new Map(ownership.packages.map(entry => [entry.id, entry]));
  const catalog = new Map();
  for (const base of ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins', 'skills/prism/plugins']) {
    for (const entry of members(base, true)) {
      if (!entry.isDirectory()) continue;
      const manifest = `${base}/${entry.name}/plugin.json`;
      if (!safe(manifest, false, true)) continue;
      const value = json(manifest);
      if (typeof value.id !== 'string' || catalog.has(value.id)) fail(manifest + '; missing/duplicate plugin identity');
      catalog.set(value.id, path.posix.dirname(manifest));
      authorities.add(manifest);
    }
  }
  const internal = new Set();
  function nodePackage(relative, required = false) {
    const file = relative + '/package.json';
    if (!safe(file, false, true)) {
      if (required) fail(file + '; missing required package manifest');
      return null;
    }
    const value = json(file);
    if (value.name !== undefined && !packageName(value.name)) fail(file + '; unsafe package identity');
    authorities.add(file);
    return value;
  }
  for (const entry of ownership.packages) if (entry.bundle.kind === 'node-package') {
    const value = nodePackage(entry.source, true);
    if (!packageName(value.name)) fail(entry.source + '; missing package name');
    internal.add(value.name);
  }
  for (const relative of catalog.values()) { const value = nodePackage(relative); if (value?.name) internal.add(value.name); }
  function selected(relativeRoot, excluded) {
    const selected = [];
    function visit(relative) {
      for (const entry of members(relative ? `${relativeRoot}/${relative}` : relativeRoot)) {
        if (entry.isDirectory() && excluded.includes(entry.name)) continue;
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) fail(relativeRoot + '/' + child + '; copied symlink');
        if (entry.isDirectory()) visit(child);
        else if (entry.isFile() && !entry.name.endsWith('.tsbuildinfo')) selected.push({ relative: child, source: `${relativeRoot}/${child}` });
        else if (!entry.isFile()) fail(relativeRoot + '/' + child + '; unsupported copied entry');
      }
    }
    visit('');
    return selected;
  }
  const selections = [], resourceCandidates = [];
  let structuredFiles = 0;
  const inspected = new Set();
  function inert(file, target) {
    if (inspected.has(file)) return;
    const content = read(file);
    inspected.add(file);
    if (content.includes(0)) return; // copied binary, never imported/executed
    const text = content.toString('utf8');
    function inspect(value) {
      if (Array.isArray(value)) { value.forEach(inspect); return; }
      if (!value || typeof value !== 'object') return;
      if (typeof value.apiVersion === 'string' && typeof value.kind === 'string') resourceCandidates.push(`${file} -> ${target}`);
      // A root List is already resource-shaped; do not invent nested schema
      // examples as emitted or applied resources.
    }
    if (/\.json$/u.test(file)) {
      structuredFiles++;
      let value;
      try { value = JSON.parse(text); } catch {
        // These actual dependency files are JSONC configuration, not opaque
        // broken JSON granted immunity. Parse comments/trailing commas inertly.
        if (!/(?:^|\/)tsconfig(?:-[a-z0-9-]+)?\.json$|\/\.vscode\/(?:launch|tasks)\.json$/iu.test(file)) fail(file + '; malformed copied JSON');
        const parsed = ts.parseConfigFileTextToJson(file, text);
        if (parsed.error) fail(file + '; malformed copied JSONC');
        value = parsed.config;
      }
      inspect(value);
    } else if (/\.ya?ml$/u.test(file)) {
      structuredFiles++;
      const documents = YAML.parseAllDocuments(text);
      if (documents.some(document => document.errors.length)) fail(file + '; malformed copied YAML');
      for (const document of documents) inspect(document.toJS());
    } else {
      // Detect actual structured text independently of YAML key order and
      // leading comments. Do not search arbitrary source/Markdown examples
      // and pretend their nested values are emitted resource documents.
      const leading = text.replace(/^(?:(?:\s*(?:#[^\n]*|\/\/[^\n]*|---|%YAML[^\n]*)?\r?\n)|(?:\s*\/\*[\s\S]*?\*\/))*/u, '');
      const shaped = /^\s*(?:[\[{]|-\s+|(?:[A-Za-z_][\w.-]*|["'][^"']+["'])\s*:)/u.test(leading);
      if (/(?:\bapiVersion\s*:|["']apiVersion["']\s*:)/u.test(text) && /(?:\bkind\s*:|["']kind["']\s*:)/u.test(text)) {
        const documents = YAML.parseAllDocuments(text);
        if (documents.some(document => document.errors.length)) {
          if (shaped) fail(file + ' -> ' + target + '; ambiguous resource-shaped copied text');
        } else {
          // A scalar first document must not hide a later resource document.
          for (const document of documents) inspect(document.toJS());
        }
      }
    }
  }
  for (const role of ['nova', 'buster', 'prism']) {
    const manifest = json(`packaging/runtime/roles/${role}.json`), written = new Set(), queue = [], installed = new Set();
    function destination(target) {
      if (!target || target.includes('\\') || path.posix.normalize(target) !== target || path.posix.isAbsolute(target) || target.split('/').includes('..') || written.has(target)) fail(role + '; escaping/colliding target: ' + target);
      written.add(target);
    }
    function collect(relative) {
      const value = nodePackage(relative);
      if (!value) return;
      for (const name of Object.keys(value.dependencies ?? {})) { if (!packageName(name)) fail(relative + '; unsafe dependency'); if (!internal.has(name)) queue.push(name); }
      for (const name of Object.keys(value.optionalDependencies ?? {})) {
        if (!packageName(name)) fail(relative + '; unsafe optional dependency');
        if (!internal.has(name)) {
          const present = safe(`node_modules/${name}/package.json`, false, true);
          // Record absence as well as bytes: installation later changes digest.
          directories.set(`optional:${name}`, Boolean(present));
          if (present) queue.push(name);
        }
      }
    }
    function copy(origin, id, relativeRoot, targetRoot, excluded = firstPartyExclusions) {
      let files = selected(relativeRoot, excluded);
      if (origin === 'extension') {
        // Exact sync-contract default CLI source replaces this subtree before
        // selection. Model the copy of canonical bytes without running it.
        files = files.filter(file => !file.source.startsWith(generated + '/'));
        files.push(...selected(canonical, []).map(file => ({ source: file.source, relative: 'src/generated/agent-observability/' + file.relative })));
      }
      for (const file of files) {
        const target = `${targetRoot}/${file.relative}`;
        destination(target); inert(file.source, target);
        selections.push([role, origin, id, file.source, target]);
      }
    }
    for (const id of manifest.packages) {
      const entry = packages.get(id);
      if (!entry) fail(role + '; unknown package: ' + id);
      if (entry.bundle.kind === 'entrypoint') { read(`${entry.source}/${manifest.entrypoint.path}`); continue; }
      if (!['node-package', 'assets'].includes(entry.bundle.kind)) fail(role + '; unknown package kind');
      collect(entry.source);
      const value = entry.bundle.kind === 'node-package' ? nodePackage(entry.source, true) : null;
      const target = value ? `skills/packages/${id}` : entry.bundle.target;
      copy('package', id, entry.source, target);
      if (value) destination(`skills/node_modules/${value.name}`);
    }
    for (const id of manifest.plugins) {
      const relative = catalog.get(id);
      if (!relative) fail(role + '; unknown plugin: ' + id);
      collect(relative); copy('plugin', id, relative, 'skills/plugins/' + path.posix.basename(relative));
      const value = nodePackage(relative);
      if (value && !packageName(value.name)) fail(relative + '; missing plugin package name');
      if (value) destination('skills/node_modules/' + value.name);
    }
    for (const id of manifest.extensions) {
      if (id !== 'kubeclaw-agent-observer') fail(role + '; unknown extension');
      collect(observer); copy('extension', id, observer, 'skills/plugins/openclaw-agent-observer');
    }
    while (queue.length) {
      const name = queue.shift(); if (installed.has(name)) continue; installed.add(name);
      const relative = 'node_modules/' + name;
      nodePackage(relative, true); copy('dependency', name, relative, 'skills/node_modules/' + name, dependencyExclusions); collect(relative);
    }
    destination('skills/' + manifest.entrypoint.output); destination('manifest.json');
  }
  if (resourceCandidates.length) fail(resourceCandidates.join('; ') + '; resource-shaped copied asset has no receiving contract');
  const sources = [...facts].sort(([a], [b]) => a.localeCompare(b));
  const custody = Object.freeze({
    source: builder, line: 91, sink: 'native-file-writer-call', expression: 'fs.readFileSync(source)',
    role: 'non-api', basis: 'reviewed-inert-runtime-bundle-copy',
    inputDigest: hash(JSON.stringify([sources, [...directories].sort(([a], [b]) => a.localeCompare(b)), selections])),
    selectedFiles: inspected.size, structuredFiles, copyEdges: selections.length,
    origins: Object.freeze(['package', 'plugin', 'extension', 'dependency']),
    authoritySources: Object.freeze([...authorities].sort()),
    runtimeImportsAuthorized: false, runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
    assemblyPrerequisitesAuthorized: false,
  });
  qualifiedCopies.add(custody);
  return custody;
}

export function runtimeBundleCopyRole(role, custody) {
  if (!custody || !qualifiedCopies.has(custody) || role.role !== 'unknown' || role.line !== custody.line || role.sink !== custody.sink || role.expression !== custody.expression) return role;
  return { ...role, role: custody.role, basis: custody.basis, copyCustody: custody,
    dependencies: [...new Set([...(role.dependencies ?? []), ...custody.authoritySources])] };
}
