#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : target.endsWith('.md') ? [target] : [];
  });
}
function anchors(text) {
  const found = new Set(); const counts = new Map();
  for (const match of text.replace(/```[^]*?```/gu, '').matchAll(/^#{1,6}\s+(.+?)(?:\s+#+)?$/gmu)) {
    const base = match[1].toLowerCase().replace(/<[^>]+>/gu, '').replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/gu, '-');
    const count = counts.get(base) ?? 0; counts.set(base, count + 1);
    found.add(count ? `${base}-${count}` : base);
  }
  for (const match of text.matchAll(/(?:id|name)=["']([^"']+)["']/gu)) found.add(match[1]);
  return found;
}
const errors = [];
let localLinks = 0; let pinnedLinks = 0; const objects = new Map();
for (const file of walk(path.join(root, 'docs/site/extend'))) {
  const text = fs.readFileSync(file, 'utf8');
  const prose = text.replace(/```[^]*?```/gu, '');
  // Include reference-style definitions as well as inline links.
  const targets = [...prose.replace(/`[^`\n]*`/gu, '').matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)|^\s*\[[^\]]+\]:\s*(\S+)/gmu)].map(m => m[1] ?? m[2]);
  for (const raw of targets) {
    try {
    const url = raw.replace(/^<|>$/gu, '');
    const pinned = url.match(/^https:\/\/github\.com\/datrab\/kubeclaw\/(?:blob|tree)\/([^/]+)\/([^#?]+)(?:#(.*))?$/u);
    if (pinned) {
      const [, revision, target, fragment] = pinned;
      assert.match(revision, /^[a-f0-9]{40}$/u, `${file}: unpinned source ${url}`);
      const key = `${revision}:${decodeURIComponent(target)}`;
      if (!objects.has(key)) objects.set(key, execFileSync('git', ['show', key], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
      const source = objects.get(key);
      if (fragment) {
        const lines = fragment.match(/^L(\d+)(?:-L(\d+))?$/u);
        if (lines) {
          const first = Number(lines[1]); const last = Number(lines[2] ?? lines[1]);
          assert(first > 0 && last >= first && last <= source.trimEnd().split('\n').length, `${file}: invalid source lines ${url}`);
        } else assert(anchors(source).has(decodeURIComponent(fragment)), `${file}: missing pinned anchor ${url}`);
      }
      pinnedLinks++; continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(url)) continue;
    const [target, fragment] = url.split('#');
    const absolute = target ? path.resolve(path.dirname(file), decodeURIComponent(target.split('?')[0])) : file;
    assert(fs.existsSync(absolute), `${file}: missing local target ${url}`);
    if (fragment && absolute.endsWith('.md')) assert(anchors(fs.readFileSync(absolute, 'utf8')).has(decodeURIComponent(fragment)), `${file}: missing local anchor ${url}`);
    localLinks++;
    } catch (error) { errors.push(error.message); }
  }
  for (const block of text.matchAll(/```(?:bash|sh)\n([^]*?)```/gu)) {
    assert(!/^\s*node\s+tests\/verification\/contracts\/plugin-system-v2-observer-expectations\.mjs\s*$/mu.test(block[1]), `${file}: observer helper is not an executable verification`);
  }
}
assert.deepEqual(errors, [], 'Extension reference failures');
console.log(JSON.stringify({ ok: true, localLinks, pinnedLinks, pinnedObjects: objects.size,
  boundary: 'Targets, Markdown anchors and Git source ranges only; claim semantics require reader review.' }));
