import fs from 'node:fs';
import path from 'node:path';

// Only reproducible input copies are disposable. Do not remove workspace,
// scratch, evidence, artifacts, observability, durable job records or logs.
export async function cleanupTerminalWorkspace(jobRoot: string): Promise<void> {
  // A terminal caller must already own quiescence. Do not follow a replaced
  // parent into another job or retained evidence, even after execution stopped.
  if (!await realDirectory(jobRoot)) return;
  const workspace = await realDirectory(path.join(jobRoot, 'workspace'));
  for (const relative of ['repository.tar.gz', 'workspace/repository', 'workspace/test-provider-snapshots']) {
    if (!workspace && relative.startsWith('workspace/')) continue;
    await fs.promises.rm(path.join(jobRoot, relative), { recursive: true, force: true });
  }
}

async function realDirectory(directory: string): Promise<boolean> {
  try {
    const stat = await fs.promises.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('BUSTER_TERMINAL_WORKSPACE_PARENT_INVALID');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
