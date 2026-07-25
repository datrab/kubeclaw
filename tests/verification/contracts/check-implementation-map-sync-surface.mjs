import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-implementation-map-sync-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';


const { sourceRoot } = parseSourceRootArgs();
const oldLiveMapRoot = path.join(sourceRoot, 'docs/pipeline/implementation-map');
const liveTechnicalMap = path.join(sourceRoot, 'docs/pipeline/technical-implementation-map.md');

assert.equal(fs.existsSync(oldLiveMapRoot), false, 'implementation maps must not be treated as live public docs');
assert.equal(fs.existsSync(path.join(sourceRoot, 'docs/archive')), false, 'deleted historical implementation maps must stay absent');
assert.equal(fs.existsSync(liveTechnicalMap), true, 'the canonical live technical implementation map must remain available');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'canonical-technical-map-only' }));
