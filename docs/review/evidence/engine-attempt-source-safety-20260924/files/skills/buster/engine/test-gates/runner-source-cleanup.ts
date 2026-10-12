import fs from 'node:fs';
import type { RunnerProviderState } from './runner-provider-state.ts';

/** Track real settlement, including work which outlives a worker phase deadline. */
export async function trackRunnerSourceWork<T>(state: RunnerProviderState, work: () => Promise<T>): Promise<T> {
  state.activeSourceWork += 1;
  try { return await work(); }
  finally { state.activeSourceWork -= 1; }
}

/** This is local deletion authority, not a durable recovery or quota receipt. */
export async function cleanupRunnerSources(state: RunnerProviderState,
  paths: { readonly attemptRepository: string; readonly stagingBase: string },
  authority: { readonly completedCallback: boolean; readonly retainedFixtureActive: boolean }): Promise<boolean> {
  if (!authority.completedCallback || state.activeSourceWork !== 0) return false;
  const providerDisposed = state.instance?.disposalConfirmed === true || state.loadWork === null;
  // A retained fixture still owns its repository. Host staging has no remaining producer or reader.
  if (!providerDisposed && !authority.retainedFixtureActive) return false;
  await fs.promises.rm(paths.stagingBase, { recursive: true, force: true });
  if (!state.retainFixture) await fs.promises.rm(paths.attemptRepository, { recursive: true, force: true });
  return true;
}
