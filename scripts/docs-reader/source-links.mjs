import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { markdownAnchorEntries } from '../lib/docs-markdown-anchors.mjs';

export function githubSourceTarget(href) {
  const url = new URL(href);
  if (!['github.com', 'www.github.com'].includes(url.hostname)) return null;
  const parts = url.pathname.split('/').slice(1);
  if (!['blob', 'tree'].includes(parts[2])) return null;
  assert(url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port, 'Non-canonical source origin');
  const [owner, repository, , revision, ...encoded] = parts;
  assert(/^[\w.-]+$/u.test(owner) && /^[\w.-]+$/u.test(repository), 'Invalid source repository');
  assert(/^[a-f0-9]{40}$/u.test(revision), `Source link needs a full commit revision: ${href}`);
  const file = decodeURIComponent(encoded.join('/'));
  assert(file && !file.includes('\\') && !file.includes('\0') && !path.posix.isAbsolute(file)
    && file === path.posix.normalize(file) && file !== '..' && !file.startsWith('../'), `Non-canonical source path: ${href}`);
  return { repository: `${owner}/${repository}`, revision, file, view: parts[2], fragment: decodeURIComponent(url.hash.slice(1)) };
}

function checkFragment(target, object) {
  if (!target.fragment) return;
  if (object.text === undefined) {
    object.text = new TextDecoder('utf-8', { fatal: true }).decode(object.bytes);
    object.bytes = undefined;
  }
  const text = object.text;
  const range = /^L(\d+)(?:-L(\d+))?$/u.exec(target.fragment);
  if (range) {
    const lines = object.lineCount ??= text ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0;
    const start = Number(range[1]), end = Number(range[2] ?? range[1]);
    assert(start >= 1 && end >= start && end <= lines, `Source range outside ${target.repository}@${target.revision}:${target.file} (1-${lines}): ${target.fragment}`);
    return;
  }
  assert(/\.md$/iu.test(target.file), `Unsupported source fragment: ${target.fragment}`);
  object.anchors ??= new Set(markdownAnchorEntries(text).map(item => item.anchor));
  assert(object.anchors.has(target.fragment), `Missing source Markdown anchor: ${target.file}#${target.fragment}`);
}

async function readPrimarySource(target) {
  assert.equal(target.view, 'blob', 'Remote directory sources require separate tree verification');
  const file = target.file.split('/').map(encodeURIComponent).join('/');
  const url = `https://raw.githubusercontent.com/${target.repository}/${target.revision}/${file}`;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, `Primary source unavailable: ${url}`);
  assert(Number(response.headers.get('content-length') ?? 0) <= 64 * 1024 * 1024, `Primary source exceeds bound: ${url}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > 64 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error(`Primary source exceeds bound: ${url}`); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// The CLI uses the fixed primary HTTPS reader. The injected reader is only a
// test seam; fixture success never establishes a remote-source observation.
export function sourceLinkVerifier(repositoryRoot, { readRemote = readPrimarySource } = {}) {
  const git = (...args) => execFileSync('git', ['-C', repositoryRoot, '--literal-pathspecs', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const origin = git('remote', 'get-url', 'origin').toString().trim();
  const match = /^(?:git@github\.com:|https:\/\/github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(origin);
  assert(match, 'Source verifier requires a canonical GitHub origin');
  const localRepository = match[1];
  const objects = new Map();
  const commits = new Set();
  const verifiedLinks = new Set();
  const observations = [];
  return {
    async verify(href) {
      const target = githubSourceTarget(href);
      if (!target || verifiedLinks.has(href)) return;
      const key = `${target.repository}@${target.revision}:${target.file}`;
      if (!objects.has(key)) {
        objects.set(key, (async () => {
          let bytes, kind = 'blob', gitObject;
          if (target.repository === localRepository) {
            if (!commits.has(target.revision)) {
              assert.equal(git('cat-file', '-t', target.revision).toString().trim(), 'commit', 'Source revision is not a commit');
              commits.add(target.revision);
            }
            const entry = git('ls-tree', '-z', target.revision, '--', target.file).toString();
            const record = /^(100644|100755|040000) (blob|tree) ([a-f0-9]{40})\t([^\0]+)\0$/u.exec(entry);
            assert(record && record[4] === target.file, `Source is not a tracked regular blob or tree: ${key}`);
            kind = record[2]; gitObject = record[3];
            bytes = kind === 'blob' ? git('cat-file', 'blob', gitObject) : Buffer.alloc(0);
          } else bytes = await readRemote(target);
          observations.push({ repository: target.repository, revision: target.revision, file: target.file, kind, ...(gitObject ? { gitObject } : {}), bytes: bytes.length, ...(kind === 'blob' ? { sha256: crypto.createHash('sha256').update(bytes).digest('hex') } : {}) });
          return { bytes, kind };
        })());
      }
      const object = await objects.get(key);
      assert.equal(target.view, object.kind, `Source view/type mismatch: ${href}`);
      if (object.kind === 'tree') assert(!target.fragment, `Directory source cannot have a line or heading fragment: ${href}`);
      else checkFragment(target, object);
      verifiedLinks.add(href);
    },
    observations: () => ({ uniqueVerifiedLinks: verifiedLinks.size, uniqueSourceObjects: objects.size, primarySources: [...observations].sort((a, b) => `${a.repository}@${a.revision}:${a.file}`.localeCompare(`${b.repository}@${b.revision}:${b.file}`, 'en-US')) }),
  };
}
