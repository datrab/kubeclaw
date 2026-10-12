import fs from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { retireWaitValue } from '../../../../scripts/retire-wait-value.mjs';

const [mode, raw] = process.argv.slice(2), scope = JSON.parse(raw);
if (mode === 'before-rename' || mode === 'after-rename') {
  const rename = fs.rename;
  const target = path.join(scope.intent.waitRoot, 'records/store.json');
  fs.rename = async (source, destination) => {
    const selected = destination === target;
    if (selected && mode === 'before-rename') { process.send(mode); await once(process, 'message'); }
    const result = await rename(source, destination);
    if (selected && mode === 'after-rename') { process.send(mode); await once(process, 'message'); }
    return result;
  };
}
process.send('started');
try {
  process.send({ result: await retireWaitValue(scope) });
  process.disconnect();
} catch (error) {
  process.send({ error: error.message });
  process.exitCode = 1;
  process.disconnect();
}
