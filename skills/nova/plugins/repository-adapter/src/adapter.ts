import fs from 'node:fs';
import path from 'node:path';
import type {
  AdapterActivationContext,
  AdapterInvocation,
  AdapterInstance,
} from '@kubeclaw/plugin-sdk';
import { repositoryRelativePath, RevisionReader } from './revision-reader.ts';

function repositoryFile(root: string, relative: string): string {
  const candidate = path.resolve(root, repositoryRelativePath(relative));
  if (!candidate.startsWith(`${root}${path.sep}`)) throw new Error('REPOSITORY_PATH_FORBIDDEN');
  let canonical: string;
  try {
    canonical = fs.realpathSync(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('REPOSITORY_FILE_NOT_FOUND');
    throw error;
  }
  if (!canonical.startsWith(`${root}${path.sep}`)) throw new Error('REPOSITORY_PATH_FORBIDDEN');
  if (!fs.statSync(canonical).isFile()) throw new Error('REPOSITORY_NOT_A_FILE');
  return canonical;
}

async function invokeRepository(
  invocation: AdapterInvocation,
  root: string,
  maxFileBytes: number,
  revisions: RevisionReader,
): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal, confidential } = invocation;
  if (!confidential) invocation.fence.assertCurrent();
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  if (request.capability !== 'git.repository.read') {
    throw new Error(`REPOSITORY_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
  }
  const attemptId = request.attempt.attemptId;
  const revisionOperation = REVISION_OPERATIONS[request.operation as keyof typeof REVISION_OPERATIONS];
  if (revisionOperation) return revisionOperation(revisions, request, attemptId);
  if (request.operation !== 'read_text') {
    throw new Error(`REPOSITORY_OPERATION_UNSUPPORTED:${request.capability}:${request.operation}`);
  }
  const file = repositoryFile(root, request.resource.canonicalId);
  const size = fs.statSync(file).size;
  if (size > maxFileBytes) throw new Error(`REPOSITORY_FILE_TOO_LARGE:${size}:${maxFileBytes}`);
  const content = fs.readFileSync(file, 'utf8');
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  return { content, sizeBytes: Buffer.byteLength(content), path: repositoryRelativePath(request.resource.canonicalId) };
}

type RepositoryRequest = AdapterInvocation['request'];
const REVISION_OPERATIONS = {
  freeze_head: (reader: RevisionReader, _request: RepositoryRequest, attemptId: string) => reader.freezeHead(attemptId),
  verify_ancestry: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.verifyAncestry(request.payload, attemptId)
  ),
  changed_manifest: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.changedManifest(request.payload, attemptId)
  ),
  read_revision_text: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.readRevisionText(request.resource.canonicalId, request.payload, attemptId)
  ),
  changed_line_ranges: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.changedLineRanges(request.resource.canonicalId, request.payload, attemptId)
  ),
  list_revision_paths: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.listRevisionPaths(request.payload, attemptId)
  ),
  inventory_revision: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.inventoryRevision(request.payload, attemptId)
  ),
  find_revision_references: (reader: RevisionReader, request: RepositoryRequest, attemptId: string) => (
    reader.findRevisionReferences(request.payload, attemptId)
  ),
} as const;

function positiveInteger(value: unknown, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || Number(resolved) <= 0) throw new Error(`${label} is invalid`);
  return Number(resolved);
}

function activationConfig(context: AdapterActivationContext) {
  const configured = context.config.repositoryRoot;
  if (typeof configured !== 'string' || configured.length === 0) throw new Error('repositoryRoot is required');
  const expectedHead = context.config.expectedHead;
  if (expectedHead !== undefined && typeof expectedHead !== 'string') throw new Error('expectedHead is invalid');
  return {
    root: fs.realpathSync(configured),
    maxFileBytes: positiveInteger(context.config.maxFileBytes, 4 * 1024 * 1024, 'maxFileBytes'),
    maxChangedPaths: positiveInteger(context.config.maxChangedPaths, 2048, 'maxChangedPaths'),
    ...(expectedHead === undefined ? {} : { expectedHead }),
  };
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const { root, maxFileBytes, maxChangedPaths, expectedHead } = activationConfig(context);
  const revisions = new RevisionReader(root, maxFileBytes, maxChangedPaths, expectedHead);
  return {
    async ready() {
      if (!fs.statSync(root).isDirectory()) throw new Error('repositoryRoot is not a directory');
    },
    async invoke(invocation) { return invokeRepository(invocation, root, maxFileBytes, revisions); },
    async shutdown() {},
  };
}
