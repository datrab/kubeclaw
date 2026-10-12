import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { canonicalJson, parseRuntimeWorkspace, runtimeWorkspaceOwnerFile, type AttemptIdentity, type RuntimeWorkspaceReference } from '@kubeclaw/plugin-sdk';
import { canonicalExistingDirectory } from './values.ts';

export function recordWorkspaceOwner(reference: RuntimeWorkspaceReference): void {
  const location = path.join(reference.workspaceRoot, runtimeWorkspaceOwnerFile(reference.workspacePath));
  fs.mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
  canonicalExistingDirectory(path.dirname(location), 'workspaceOwnerRoot');
  const temporary = `${location}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    try { fs.writeFileSync(descriptor, `${canonicalJson(reference)}\n`); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, location);
  } catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  const directory = fs.openSync(path.dirname(location), fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

export function verifyWorkspaceOwner(value: unknown, owner: AttemptIdentity, workspaceRoot: string): RuntimeWorkspaceReference {
  const ref = parseRuntimeWorkspace(value, owner);
  if (ref.workspaceRoot !== workspaceRoot) throw new Error('GIT_WORKSPACE_ROOT_MISMATCH');
  const location = path.join(workspaceRoot, runtimeWorkspaceOwnerFile(ref.workspacePath));
  canonicalExistingDirectory(path.dirname(location), 'workspaceOwnerRoot');
  const descriptor = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > 32_768) throw new Error('GIT_WORKSPACE_OWNER_INVALID');
    if (canonicalJson(JSON.parse(fs.readFileSync(descriptor, 'utf8'))) !== canonicalJson(ref)) throw new Error('GIT_WORKSPACE_OWNER_MISMATCH');
  } finally { fs.closeSync(descriptor); }
  return ref;
}
