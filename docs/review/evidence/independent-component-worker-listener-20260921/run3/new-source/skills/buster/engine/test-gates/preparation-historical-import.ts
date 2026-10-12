import fs from 'node:fs/promises';
import path from 'node:path';
import type { PreparationExecutionOptions } from './preparation-execution.ts';
import { assertHistoricalAncestors } from './preparation-historical-ledger.ts';

/** Startup gate while the external maintained stop-receipt producer/verifier is
 * being integrated. A clean store has no V1 dependency. Never parse legacy JSON
 * or silently start the service with an unimported historical store. */
export async function runHistoricalImport(_execution: PreparationExecutionOptions, stateRoot: string): Promise<void> {
  if (process.getuid?.() !== 0) throw new Error('BUSTER_HISTORICAL_ROOT_REQUIRED');
  await assertHistoricalAncestors(stateRoot);
  const directory = await fs.lstat(stateRoot);
  if (!directory.isDirectory() || await fs.realpath(stateRoot) !== stateRoot) throw new Error('BUSTER_HISTORICAL_PATH_INVALID');
  try {
    const records = path.join(stateRoot, 'records');
    const stat = await fs.lstat(records);
    if (!stat.isDirectory() || await fs.realpath(records) !== records) throw new Error('BUSTER_HISTORICAL_PATH_INVALID');
    // Even an unknown/partially initialized legacy directory cannot be treated
    // as a clean store. The owned importer, not this parent, decides its content.
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error('BUSTER_HISTORICAL_STOP_AUTHORITY_REQUIRED');
}
