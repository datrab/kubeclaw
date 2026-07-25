import { parseSourceRootArgs, walkFiles } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-nova-service-facades' });
import assert from 'assert';
import path from 'path';


const { sourceRoot } = parseSourceRootArgs();
const jsFacades = walkFiles(path.join(sourceRoot, 'skills/nova/pipeline/services'), (absPath) => absPath.endsWith('.js'));
assert.deepEqual(jsFacades, [], 'Nova service compatibility facades must be deleted; import TypeScript owners directly');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-nova-service-js-facades' }));
