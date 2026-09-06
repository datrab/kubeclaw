import assert from 'node:assert/strict';
import fs from 'node:fs';
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo || !token) throw new Error('Read-only GitHub identity required to verify release provenance');
async function get(url, accept = 'application/vnd.github+json') {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Release evidence unavailable: HTTP ${response.status}`);
  return response;
}
for (const family of ['runtime', 'ops']) {
  const file = `releases/${family}-images.json`;
  if (!fs.existsSync(file)) continue;
  const selected = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const field of ['sourceRunId', 'sourceRunAttempt']) if (!Number.isSafeInteger(selected[field]) || selected[field] < 1) throw new Error(`Release ${field} required`);
  const run = await (await get(`https://api.github.com/repos/${repo}/actions/runs/${selected.sourceRunId}/attempts/${selected.sourceRunAttempt}`)).json();
  const expectedPath = family === 'runtime' ? '.github/workflows/build-images.yaml' : '.github/workflows/build-ops-mcp.yaml';
  if (run.conclusion !== 'success' || run.head_branch !== 'main' || run.head_sha !== selected.commit || run.path !== expectedPath || !['push', 'workflow_dispatch'].includes(run.event)) throw new Error('Release source is not a successful matching main build attempt');
  const tag = `${family}-images-${selected.sourceRunId}-${selected.sourceRunAttempt}`;
  const release = await (await get(`https://api.github.com/repos/${repo}/releases/tags/${tag}`)).json();
  if (release.target_commitish !== selected.commit) throw new Error('Receipt release is bound to another commit');
  const assets = release.assets.filter(asset => asset.name === `${family}-images.json`);
  if (assets.length !== 1 || assets[0].size > 65536) throw new Error('Missing or oversized persistent image receipt');
  const bytes = Buffer.from(await (await get(`https://api.github.com/repos/${repo}/releases/assets/${assets[0].id}`, 'application/octet-stream')).arrayBuffer());
  if (bytes.length > 65536) throw new Error('Oversized image receipt');
  assert.deepEqual(selected, JSON.parse(bytes.toString('utf8')), 'Selected digests do not match the preserved successful-build receipt');
  console.log(`${family}: selected digests match successful source run ${selected.sourceRunId}/${selected.sourceRunAttempt}`);
}
