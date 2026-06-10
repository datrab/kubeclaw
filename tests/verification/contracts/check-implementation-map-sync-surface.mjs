import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-implementation-map-sync-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') {
      args.sourceRoot = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const { sourceRoot } = parseArgs();
const oldLiveMapRoot = path.join(sourceRoot, 'docs/pipeline/implementation-map');
const archiveMapRoot = path.join(sourceRoot, 'docs/archive/legacy-pipeline-implementation-map/implementation-map');

assert.equal(fs.existsSync(oldLiveMapRoot), false, 'implementation maps must not be treated as live public docs');
assert.equal(fs.existsSync(archiveMapRoot), true, 'legacy implementation maps should remain archived as historical source material');
assert.equal(fs.existsSync(path.join(archiveMapRoot, 'README.md')), true, 'legacy implementation-map archive should retain its README');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'legacy-implementation-map-archived' }));
