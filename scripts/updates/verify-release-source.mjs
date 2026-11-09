import { retainedBaseline } from './retained-baseline.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateCodeReceipt } from './code-release.mjs';
import { componentSource, validSource } from './runtime-components.mjs';
import { validateReleaseReceipt } from './deployment-release.mjs';

// A mixed selection remains a complete published receipt. Every retained slot
// additionally resolves to its original successful run, receipt and asset.
export async function verifyReleaseSources({ root = process.cwd(), repo, token, fetchImpl = fetch, baselineDirectory }) {
  if (!repo || !token) throw new Error('Read-only GitHub identity required to verify release provenance');
  async function get(route, accept = 'application/vnd.github+json') {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/${route}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: accept }, signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`Release evidence unavailable: HTTP ${response.status}`);
    return response;
  }
  const baseline = retainedBaseline(root, baselineDirectory);
  const sources = new Map();
  async function sourceReceipt(family, source) {
    if (!validSource(source)) throw new Error('Release source identity required');
    const key = JSON.stringify([family, source]);
    if (sources.has(key)) return sources.get(key);
    const run = await (await get(`actions/runs/${source.sourceRunId}/attempts/${source.sourceRunAttempt}`)).json();
    const expectedPath = family === 'ops' ? '.github/workflows/build-ops-mcp.yaml' : '.github/workflows/build-images.yaml';
    if (run.conclusion !== 'success' || run.head_branch !== 'main' || run.head_sha !== source.commit
      || run.head_repository?.full_name !== repo || run.path !== expectedPath
      || !['push', 'workflow_dispatch'].includes(run.event)) throw new Error('Release source is not a successful matching main build attempt');
    const prefix = family === 'code' ? 'code-bundles' : `${family}-images`;
    const release = await (await get(`releases/tags/${prefix}-${source.sourceRunId}-${source.sourceRunAttempt}`)).json();
    if (release.target_commitish !== source.commit) throw new Error('Receipt release is bound to another commit');
    const name = family === 'code' ? 'runtime-code.json' : `${family}-images.json`;
    const assets = release.assets.filter(asset => asset.name === name);
    if (assets.length !== 1 || assets[0].size > 65536) throw new Error('Missing or oversized persistent receipt');
    const bytes = await (await get(`releases/assets/${assets[0].id}`, 'application/octet-stream')).text();
    if (Buffer.byteLength(bytes) > 65536) throw new Error('Oversized receipt');
    const receipt = JSON.parse(bytes);
    if (receipt.commit !== source.commit || receipt.sourceRunId !== source.sourceRunId || receipt.sourceRunAttempt !== source.sourceRunAttempt) throw new Error('Receipt source identity mismatch');
    if (family === 'code') validateCodeReceipt(receipt); else validateReleaseReceipt(receipt, family);
    const result = { receipt, release };
    sources.set(key, result);
    return result;
  }
  function ancestor(source, selected) {
    execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', source.commit, selected.commit], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  for (const family of ['code', 'runtime', 'ops']) {
    const file = path.join(root, `releases/${family === 'code' ? 'runtime-code' : `${family}-images`}.json`);
    if (!baseline?.[family] && !fs.existsSync(file)) continue;
    const selected = baseline?.[family] ?? JSON.parse(fs.readFileSync(file, 'utf8'));
    const source = { commit: selected.commit, sourceRunId: selected.sourceRunId, sourceRunAttempt: selected.sourceRunAttempt };
    const published = await sourceReceipt(family, source);
    assert.deepEqual(selected, published.receipt, 'Selection does not match the preserved successful-source receipt');
    for (const [name, value] of Object.entries(family === 'code' ? selected.bundles : selected.images)) {
      const origin = componentSource(selected, name, family === 'code' ? 'bundle' : 'image');
      ancestor(origin, selected);
      const original = await sourceReceipt(family, origin);
      assert.deepEqual(componentSource(original.receipt, name, family === 'code' ? 'bundle' : 'image'), origin, 'Component source must resolve to the original producing run');
      if (family === 'code') {
        // The source field is a selection annotation; original legacy receipts
        // express the same identity in their top-level fields.
        const { source: _selectedSource, ...bundle } = value;
        const { source: _originalSource, ...originalBundle } = original.receipt.bundles[name];
        assert.deepEqual(bundle, originalBundle, 'Retained bundle differs from original source');
        const matches = original.release.assets.filter(asset => asset.name === `${name}-${origin.commit}.tgz`);
        if (matches.length !== 1 || matches[0].browser_download_url !== value.url || matches[0].digest !== `sha256:${value.sha256}`) throw new Error('Code asset digest mismatch');
      } else assert.equal(value, original.receipt.images[name], 'Selected image differs from original build');
    }
    console.log(`${family}: verified selection and component sources ${source.sourceRunId}/${source.sourceRunAttempt}`);
  }
}
if (process.argv[1] === import.meta.filename) {
  await verifyReleaseSources({ repo: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, baselineDirectory: process.env.GITOPS_RETAINED_BASELINE });
}
