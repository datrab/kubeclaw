import fs from 'node:fs/promises';
import { FileBusterFixtureJournal } from '../../skills/buster/engine/test-gates/native-fixture-journal.ts';

const [root, admissionFile, checkpoint] = process.argv.slice(2);
if (!root || !admissionFile || !checkpoint) throw new Error('fixture writer arguments required');
const admission = JSON.parse(await fs.readFile(admissionFile, 'utf8'));
const journal = new FileBusterFixtureJournal(root, { maximumRecords: 32, maximumStateBytes: 262144,
  maximumBlobBytes: 65536, maximumTotalBytes: 8388608 });
await journal.reserve(admission);
if (checkpoint === 'teardown') await journal.requestTeardown(admission, 'cancelled');
else if (checkpoint !== 'accepted') throw new Error('unknown fixture checkpoint');
process.stdout.write('durable\n');
setInterval(() => {}, 60000);
