import { parseSourceRootArgs, walkFiles } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-nova-agent-prompt-runner-facades' });
import assert from 'assert';
import path from 'path';

const { sourceRoot } = parseSourceRootArgs();
const jsFacades = walkFiles(path.join(sourceRoot, 'skills/nova/pipeline'), (absPath) => absPath.endsWith('.js'));
assert.deepEqual(jsFacades, [], 'Nova agent/prompt/runner compatibility facades must be deleted; import TypeScript owners directly');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 'zero-nova-agent-prompt-runner-js-facades' }));
