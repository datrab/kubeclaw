import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[2] ?? path.resolve('scripts/updates/release-configuration.mjs');
const { verifyReleaseConfiguration: verify } = await import(pathToFileURL(modulePath));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'independent-alias-'));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const write = (file, data = '{}\n') => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), data); };
const commit = () => { git('add', '.'); git('-c', 'user.name=Reviewer', '-c', 'user.email=review@example.invalid', 'commit', '-qm', 'probe'); return git('rev-parse', 'HEAD'); };
const alias = 'charts/prism/files/config/swarm.schema.json';
const target = '../../../../skills/common/plugin-runtime/foundation/config/swarm.schema.json';
const schema = 'skills/common/plugin-runtime/foundation/config/swarm.schema.json';
try {
  git('init', '-q');
  for (const chart of ['kubeclaw', 'prism', 'ops-pod']) write(`charts/${chart}/values.yaml`);
  for (const role of ['nova', 'buster', 'prism-agent', 'prism']) write(`my-values/${role}-values.yaml`);
  write(schema); fs.mkdirSync(path.dirname(path.join(root, alias)), { recursive: true }); fs.symlinkSync(target, path.join(root, alias));
  const source = commit(); verify(root, source, 'runtime');
  fs.unlinkSync(path.join(root, alias)); fs.symlinkSync('/outside/schema.json', path.join(root, alias));
  const retargeted = commit(); fs.unlinkSync(path.join(root, alias)); fs.symlinkSync(target, path.join(root, alias));
  assert.throws(() => verify(root, retargeted, 'runtime'), /SOURCE_FILE_INVALID/); console.log('PASS committed retarget rejected despite current correct alias');
  git('reset', '--hard', source);
  fs.unlinkSync(path.join(root, schema)); fs.symlinkSync('/outside/schema.json', path.join(root, schema));
  const linked = commit(); fs.unlinkSync(path.join(root, schema)); write(schema);
  assert.throws(() => verify(root, linked, 'runtime'), /SOURCE_FILE_INVALID/); console.log('PASS committed canonical symlink rejected despite current regular target');
  git('reset', '--hard', source);
  fs.unlinkSync(path.join(root, schema)); const missing = commit(); write(schema);
  assert.throws(() => verify(root, missing, 'runtime'), /SOURCE_FILE_INVALID/); console.log('PASS absent committed canonical target rejected despite current target');
  git('reset', '--hard', source);
  for (const directory of ['charts', 'my-values', 'skills']) {
    const moved = path.join(root, `moved-${directory}`);
    fs.renameSync(path.join(root, directory), moved); fs.symlinkSync(moved, path.join(root, directory));
    assert.throws(() => verify(root, source, 'runtime'), /DIRECTORY_REQUIRED|SYMLINK/);
    fs.unlinkSync(path.join(root, directory)); fs.renameSync(moved, path.join(root, directory));
    console.log(`PASS current ${directory} ancestor link rejected`);
  }
  verify(root, source, 'runtime'); console.log('PASS restored original remains accepted');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
