import fs from 'node:fs';
import path from 'node:path';
import type {
  AdapterActivationContext,
  AdapterInvocation,
  AdapterInstance,
} from '@kubeclaw/plugin-sdk';
import { RevisionReader } from './revision-reader.ts';
import { readRepositoryFile } from './repository-file.ts';


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
  const result = readRepositoryFile(root, request.resource.canonicalId, maxFileBytes);
  if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
  return result;
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
  if (fs.lstatSync(configured).isSymbolicLink() || fs.realpathSync(configured) !== path.resolve(configured)) throw new Error('REPOSITORY_PATH_FORBIDDEN');
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
