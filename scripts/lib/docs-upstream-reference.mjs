import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { markdownAnchorEntries } from './docs-markdown-anchors.mjs';

// Byte-preserved incoming documents resolve in their original pinned Git tree,
// not in the relocated archive or today's reader tree. No missing-link exemption.
export function upstreamReferenceResolver(root) {
  const manifestPath = path.join(root, 'docs/blueprint/upstream-main-20261017/manifest.json');
  if (!fs.existsSync(manifestPath)) return () => false;
  const entries = new Map();
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const objectFormat = git('rev-parse', '--show-object-format').toString().trim();
  if (!['sha1', 'sha256'].includes(objectFormat)) throw new Error('unsupported upstream Git object format');
  const objectId = new RegExp(`^[0-9a-f]{${objectFormat === 'sha256' ? 64 : 40}}$`, 'u');
  const safePath = value => typeof value === 'string' && value !== ''
    && !value.includes('\\') && !value.includes('\0') && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value && !value.startsWith('../');
  function object(revision, target) {
    if (target === '.') return { type: 'tree', blob: git('rev-parse', `${revision}^{tree}`).toString().trim() };
    const record = git('ls-tree', '-z', revision, '--', target).toString();
    const match = /^(100644|100755|040000) (blob|tree) ([0-9a-f]{40,64})\t([^\0]+)\0$/u.exec(record);
    if (!match || match[4] !== target) throw new Error(`missing or unsafe upstream target ${revision}:${target}`);
    return { type: match[2], blob: match[3] };
  }
  for (const entry of JSON.parse(fs.readFileSync(manifestPath, 'utf8')).inputs) {
    if (!objectId.test(entry.upstreamRevision)
      || !safePath(entry.upstreamPath) || !safePath(entry.retainedPath)
      || !entry.retainedPath.startsWith('docs/blueprint/upstream-main-20261017/')) {
      throw new Error('invalid upstream provenance entry');
    }
    if (git('cat-file', '-t', entry.upstreamRevision).toString().trim() !== 'commit') {
      throw new Error('upstream provenance revision must identify a commit object');
    }
    if (entries.has(entry.retainedPath)) throw new Error('duplicate upstream provenance entry');
    let cursor = root;
    for (const component of entry.retainedPath.split('/')) {
      cursor = path.join(cursor, component);
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('symlink in retained upstream path');
    }
    const info = object(entry.upstreamRevision, entry.upstreamPath);
    const bytes = git('cat-file', 'blob', info.blob);
    if (info.type !== 'blob' || info.blob !== entry.gitBlob
      || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256
      || !bytes.equals(fs.readFileSync(path.join(root, entry.retainedPath)))) {
      throw new Error(`upstream provenance byte mismatch: ${entry.retainedPath}`);
    }
    entries.set(entry.retainedPath, entry);
  }
  return (filePath, target, fragment) => {
    const entry = entries.get(path.relative(root, filePath).split(path.sep).join('/'));
    if (!entry) return false;
    const normalized = target ? path.posix.normalize(path.posix.join(path.posix.dirname(entry.upstreamPath), target)) : entry.upstreamPath;
    // ls-tree with a trailing slash enumerates children instead of the tree entry.
    const original = normalized.replace(/\/+$/u, '');
    if (!safePath(original)) throw new Error('upstream link escapes original repository');
    const info = object(entry.upstreamRevision, original);
    if (target.endsWith('/') && info.type !== 'tree') throw new Error('upstream directory link targets a file');
    if (fragment && original.endsWith('.md')) {
      let decoded;
      try { decoded = decodeURIComponent(fragment); } catch { throw new Error('invalid upstream anchor encoding'); }
      const anchors = new Set(markdownAnchorEntries(git('cat-file', 'blob', info.blob).toString('utf8')).map(item => item.anchor));
      if (!anchors.has(decoded)) throw new Error(`missing upstream Markdown anchor: ${original}#${decoded}`);
    }
    return true;
  };
}
