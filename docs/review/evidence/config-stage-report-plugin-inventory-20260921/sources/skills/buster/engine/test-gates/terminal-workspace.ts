import fs from 'node:fs';
import path from 'node:path';
import type { FileHandle } from 'node:fs/promises';

// Only reproducible input copies are disposable. Do not remove workspace,
// scratch, evidence, artifacts, observability, durable job records or logs.
export async function cleanupTerminalWorkspace(jobRoot: string): Promise<void> {
  // The caller must already prove quiescence, including all fixture lifetimes.
  // Pin directory inodes: lstat followed by rm on the original pathname would
  // follow a substituted parent. Never reopen that pathname after validation.
  if (process.platform !== 'linux') throw new Error('BUSTER_TERMINAL_WORKSPACE_LINUX_REQUIRED');
  const job = await openDirectoryPath(jobRoot);
  if (!job) return;
  let workspace: FileHandle | null = null;
  try {
    workspace = await openDirectory(`${descriptorPath(job)}/workspace`);
    await fs.promises.rm(`${descriptorPath(job)}/repository.tar.gz`, { recursive: true, force: true });
    if (workspace) {
      for (const name of ['repository', 'test-provider-snapshots']) {
        await fs.promises.rm(`${descriptorPath(workspace)}/${name}`, { recursive: true, force: true });
      }
    }
  } finally {
    try { await workspace?.close(); } finally { await job.close(); }
  }
}

function descriptorPath(directory: FileHandle): string {
  return `/proc/self/fd/${directory.fd}`;
}

async function openDirectory(directory: string): Promise<FileHandle | null> {
  try {
    return await fs.promises.open(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    if (code === 'ELOOP' || code === 'ENOTDIR') throw new Error('BUSTER_TERMINAL_WORKSPACE_PARENT_INVALID', { cause: error });
    throw error;
  }
}

async function openDirectoryPath(directory: string): Promise<FileHandle | null> {
  // Opening only the leaf with O_NOFOLLOW still follows intermediate symlinks.
  // Walk from / through pinned descriptors so every supplied ancestor is checked.
  let current = await openDirectory('/');
  try {
    for (const component of path.resolve(directory).split(path.sep).filter(Boolean)) {
      if (!current) return null;
      const next = await openDirectory(`${descriptorPath(current)}/${component}`);
      await current.close(); current = next;
    }
    const result = current; current = null; return result;
  } finally { await current?.close(); }
}
