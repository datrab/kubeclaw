#!/usr/bin/env node
// Independent manifest-to-reader comparison. Declarations are not effective grants.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const page = 'docs/site/reference/capabilities.md';
const kinds = { stages: 'Nova grant', observers: 'Nova grant', adapters: 'Nova grant', testProviders: 'Buster runtime', reportAdapters: 'Report adapter (no grant namespace)' };
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : entry.isFile() && entry.name === 'plugin.json' ? [target] : [];
  });
}
function identities(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(id => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]*$/u.test(id)) || new Set(value).size !== value.length) throw new Error('unsupported capability declaration');
  return [...value].sort();
}
try {
  const expected = new Map();
  for (const file of walk(path.join(root, 'skills'))) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof manifest.id !== 'string' || !manifest.id) throw new Error(`missing plugin identity: ${file}`);
    for (const [kind, namespace] of Object.entries(kinds)) {
      const registrations = manifest[kind] ?? [];
      if (!Array.isArray(registrations)) throw new Error(`invalid registration list: ${file}`);
      for (const registration of registrations) {
        const id = `${manifest.id}:${registration.id}`;
        if (typeof registration.id !== 'string' || !registration.id || expected.has(id)) throw new Error(`missing/duplicate registration identity: ${id}`);
        expected.set(id, [namespace, identities(registration.requiredCapabilities), identities(registration.providesCapabilities)]);
      }
    }
  }
  if (!expected.size) throw new Error('empty pipeline registration discovery');
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const start = '## Registration Capability Declarations\n';
  const end = '## Platform Grants Are Not Swarm Roles\n';
  if (markdown.split(start).length !== 2 || markdown.split(end).length !== 2) throw new Error('missing/duplicate declaration section');
  const actual = new Map();
  const parseList = cell => {
    if (cell === 'None.') return [];
    if (!/^`[^`]+`(?:, `[^`]+`)*$/u.test(cell)) throw new Error('unsupported reader declaration list');
    return identities([...cell.matchAll(/`([^`]+)`/gu)].map(match => match[1]));
  };
  for (const line of markdown.split(start)[1].split(end)[0].split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Namespace') && !line.startsWith('| ---'))) {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 5 || !/^`[^`]+`$/u.test(cells[1])) throw new Error('unsupported reader declaration row');
    const id = cells[1].slice(1, -1);
    if (actual.has(id)) throw new Error(`duplicate reader registration: ${id}`);
    actual.set(id, [cells[0], parseList(cells[2]), parseList(cells[3])]);
  }
  const changed = [...new Set([...expected.keys(), ...actual.keys()])].filter(id => JSON.stringify(expected.get(id)) !== JSON.stringify(actual.get(id)));
  if (changed.length) {
    console.error(`DOC_DRIFT_CAPABILITY: ${page}: registration namespace/required/provided mismatch: ${changed.join(', ')}`);
    process.exitCode = 1;
  } else console.log(`All ${expected.size} discovered pipeline registration capability declarations match ${page}; not installed-registry or deployment proof.`);
} catch (error) { console.error(`Capability registration input/tool error: ${error.message}`); process.exitCode = 2; }
