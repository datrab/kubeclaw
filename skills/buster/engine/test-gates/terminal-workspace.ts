import fs from 'node:fs';
import path from 'node:path';

// Only reproducible input copies are disposable. Do not remove workspace,
// scratch, evidence, artifacts, observability, durable job records or logs.
export async function cleanupTerminalWorkspace(jobRoot: string): Promise<void> {
  for (const relative of ['repository.tar.gz', 'workspace/repository', 'workspace/test-provider-snapshots']) {
    await fs.promises.rm(path.join(jobRoot, relative), { recursive: true, force: true });
  }
}
