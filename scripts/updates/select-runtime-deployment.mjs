import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { validateCodeReceipt, selectedCode } from './code-release.mjs';
import { inputDigest, isDeploymentInput } from './runtime-inputs.mjs';
import { validateReleaseReceipt } from './deployment-release.mjs';

const root = process.cwd(), repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
const id = process.env.SOURCE_RUN_ID, attempt = process.env.SOURCE_RUN_ATTEMPT;
if (!repo || !token || !/^[1-9][0-9]*$/u.test(id ?? '') || !/^[1-9][0-9]*$/u.test(attempt ?? '')) throw new Error('SOURCE_RUN_REQUIRED');
async function api(route, optional = false, binary = false) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${route}`, { headers: {
    Authorization: `Bearer ${token}`, Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
  }, signal: AbortSignal.timeout(60000) });
  if (optional && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`SOURCE_EVIDENCE_HTTP_${response.status}`);
  return response;
}
const run = await (await api(`actions/runs/${id}/attempts/${attempt}`)).json();
if (run.conclusion !== 'success' || run.path !== '.github/workflows/build-images.yaml' || run.head_branch !== 'main'
  || !['push', 'workflow_dispatch'].includes(run.event) || run.head_repository.full_name !== repo) throw new Error('SUCCESSFUL_MAIN_SOURCE_REQUIRED');
async function receipt(tag, name, optional = false) {
  const response = await api(`releases/tags/${tag}`, optional);
  if (!response) return undefined;
  const release = await response.json();
  if (release.target_commitish !== run.head_sha) throw new Error('SOURCE_RELEASE_COMMIT_MISMATCH');
  const assets = release.assets.filter(item => item.name === name);
  if (assets.length !== 1 || assets[0].size > 65536) throw new Error('SOURCE_RECEIPT_REQUIRED');
  const bytes = await (await api(`releases/assets/${assets[0].id}`, false, true)).text();
  if (Buffer.byteLength(bytes) > 65536) throw new Error('SOURCE_RECEIPT_TOO_LARGE');
  const value = JSON.parse(bytes);
  if (value.commit !== run.head_sha || value.sourceRunId !== Number(id) || value.sourceRunAttempt !== Number(attempt)) throw new Error('SOURCE_RECEIPT_IDENTITY_MISMATCH');
  return { value, release };
}
const published = await receipt(`code-bundles-${id}-${attempt}`, 'runtime-code.json', true);
if (!published) { console.log('No deployment inputs published; nothing to promote.'); process.exit(0); }
const code = validateCodeReceipt(published.value);
for (const [role, bundle] of Object.entries(code.bundles)) {
  const assets = published.release.assets.filter(item => item.name === `${role}-${code.commit}.tgz`);
  if (assets.length !== 1 || assets[0].browser_download_url !== bundle.url || assets[0].digest !== `sha256:${bundle.sha256}`) throw new Error('PUBLISHED_BUNDLE_DIGEST_MISMATCH');
}
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
git(['merge-base', '--is-ancestor', run.head_sha, 'HEAD']);
const head = git(['rev-parse', 'HEAD']);
if (inputDigest(root, head, isDeploymentInput) !== inputDigest(root, run.head_sha, isDeploymentInput)) {
  console.log('Newer deployment inputs are on main; refusing a stale rollout.'); process.exit(0);
}
const priorFile = 'releases/runtime-code.json';
if (fs.existsSync(priorFile)) {
  const prior = validateCodeReceipt(JSON.parse(fs.readFileSync(priorFile, 'utf8')));
  if (isDeepStrictEqual(prior, code)) { console.log('Already selected.'); process.exit(0); }
  git(['merge-base', '--is-ancestor', prior.commit, code.commit]);
  if (prior.commit === code.commit && (prior.sourceRunId > code.sourceRunId
    || (prior.sourceRunId === code.sourceRunId && prior.sourceRunAttempt > code.sourceRunAttempt))) throw new Error('OLDER_SOURCE_ATTEMPT');
}
const built = await receipt(`runtime-images-${id}-${attempt}`, 'runtime-images.json', true);
if (!built && !fs.existsSync('releases/runtime-images.json')) throw new Error('INITIAL_IMAGE_BUILD_REQUIRED');
const images = validateReleaseReceipt(built?.value ?? JSON.parse(fs.readFileSync('releases/runtime-images.json', 'utf8')), 'runtime');
fs.mkdirSync('releases', { recursive: true });
fs.writeFileSync(priorFile, JSON.stringify(code, null, 2) + '\n');
selectedCode(root, images);
if (built) fs.writeFileSync('releases/runtime-images.json', JSON.stringify(images, null, 2) + '\n');
fs.appendFileSync(process.env.GITHUB_OUTPUT, `selected=true\ndirectory=releases/gitops/runtime-${id}-${attempt}\n`);
