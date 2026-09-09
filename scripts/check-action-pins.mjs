import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';

const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
function sourceFiles(root) {
  const files = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0');
  return [...new Set(files)].filter(file => /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(file)
    || /(?:^|\/)action\.ya?ml$/u.test(file));
}
function provenance(root) {
  const value = JSON.parse(fs.readFileSync(path.join(root, '.github/action-pins.json'), 'utf8'));
  if (value.schemaVersion !== 'github-action-pins.v1' || !Array.isArray(value.pins)) throw new Error('ACTION_PIN_PROVENANCE_INVALID');
  for (const pin of value.pins) {
    if (!SHA.test(pin.sha) || !SHA.test(pin.manifestGitBlob) || !HASH.test(pin.manifestSha256)
      || typeof pin.tag !== 'string' || !pin.tag || typeof pin.repo !== 'string'
      || !['action.yml', 'action.yaml'].includes(pin.manifestPath)
      || pin.url.toLowerCase() !== `https://github.com/${pin.repo}/commit/${pin.sha}`.toLowerCase()
      || pin.manifestUrl.toLowerCase() !== `https://github.com/${pin.repo}/blob/${pin.sha}/${pin.manifestPath}`.toLowerCase()) {
      throw new Error('ACTION_PIN_PROVENANCE_INVALID');
    }
  }
  return value.pins;
}
function references(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'uses') output.push(child);
    else references(child, output);
  }
  return output;
}
function checkReference(root, file, ref, pins) {
  if (typeof ref !== 'string') throw new Error(`ACTION_REFERENCE_INVALID:${file}`);
  if (ref.startsWith('./')) {
    if (ref.split('/').includes('..')) throw new Error(`ACTION_LOCAL_PATH_INVALID:${file}`);
    const local = path.join(root, ref);
    if (!fs.existsSync(local)) throw new Error(`ACTION_LOCAL_PATH_MISSING:${file}:${ref}`);
    return;
  }
  if (/^docker:\/\/[^@]+@sha256:[a-f0-9]{64}$/u.test(ref)) return;
  const match = /^([\w-]+\/[\w.-]+)(?:\/(.+))?@([a-f0-9]{40})$/u.exec(ref);
  if (!match) throw new Error(`ACTION_REFERENCE_NOT_IMMUTABLE:${file}:${ref}`);
  const [, repo, actionPath, sha] = match;
  const manifest = actionPath ? `${actionPath}/action.yml` : 'action.yml';
  if (!pins.some(pin => pin.repo.toLowerCase() === repo.toLowerCase() && pin.sha === sha && pin.manifestPath === manifest)) {
    throw new Error(`ACTION_PIN_PROVENANCE_MISSING:${file}:${ref}`);
  }
}
export function verifyActionPins(root = process.cwd()) {
  const pins = provenance(root), files = sourceFiles(root);
  let external = 0, local = 0;
  for (const file of files) {
    const parsed = YAML.parseDocument(fs.readFileSync(path.join(root, file), 'utf8'), { uniqueKeys: true });
    if (parsed.errors.length) throw new Error(`ACTION_YAML_INVALID:${file}:${parsed.errors[0].message}`);
    for (const ref of references(parsed.toJS())) {
      checkReference(root, file, ref, pins);
      if (ref.startsWith('./')) local++; else external++;
    }
  }
  return { files: files.length, external, local };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify({ ok: true, ...verifyActionPins() }));
}
