// Real fixed-UID filesystem slice. This fixture does not claim native cgroup proof.
import fs from 'node:fs/promises';
import { materializeHistoricalImport } from '../../../skills/buster/engine/test-gates/preparation-historical-materialize.ts';
import type { HistoricalBatchContext } from '../../../skills/buster/engine/test-gates/preparation-historical-batch.ts';
const [contextFile, storeFile, sourceRoot] = process.argv.slice(2);
if (!contextFile || !storeFile || !sourceRoot) throw new Error('HISTORICAL_FIXTURE_ARGUMENTS');
const context = JSON.parse(await fs.readFile(contextFile, 'utf8')) as HistoricalBatchContext;
const reservations: unknown[] = [];
const result = await materializeHistoricalImport(await fs.readFile(storeFile), context, sourceRoot,
  async reservation => { reservations.push(reservation); }, new AbortController().signal);
process.stdout.write(JSON.stringify({ result, reservations, uid: process.getuid?.(), gid: process.getgid?.() }));
