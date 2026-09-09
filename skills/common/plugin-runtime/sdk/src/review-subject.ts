import { canonicalJson, sha256Text } from './values.ts';
import type { PluginInvocationContext } from './runtime.ts';

export interface ReviewSource {
  readonly projectId: string;
  readonly repositoryRoot: string;
  readonly architectureRef: string;
  readonly paths: readonly string[];
}
export interface ReviewSubject extends ReviewSource {
  readonly runId: string;
  readonly sourceRevision: string;
  readonly architectureRevision: string;
  readonly inputDigest: string;
  readonly files: readonly { readonly path: string; readonly mode: '100644' | '100755'; readonly content: string; readonly digest: string; readonly sizeBytes: number }[];
  readonly digest: string;
}

function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\0\r\n]/u.test(value); }
function revision(value: unknown): value is string { return typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value); }
export function parseReviewSource(value: unknown): ReviewSource {
  const source = value as ReviewSource | null;
  if (!source || !text(source.projectId) || !text(source.repositoryRoot) || !source.repositoryRoot.startsWith('/')
    || !text(source.architectureRef) || !Array.isArray(source.paths) || !source.paths.length || source.paths.length > 128
    || source.paths.some(file => !text(file) || file.startsWith('/') || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..'))
    || new Set(source.paths).size !== source.paths.length) throw new Error('REVIEW_SOURCE_INVALID');
  return { projectId: source.projectId, repositoryRoot: source.repositoryRoot, architectureRef: source.architectureRef, paths: [...source.paths].sort() };
}
export function parseReviewSubject(value: unknown, runId: string): ReviewSubject {
  const subject = value as ReviewSubject;
  const source = parseReviewSource(subject);
  if (subject.runId !== runId || !revision(subject.sourceRevision) || !revision(subject.architectureRevision)
    || typeof subject.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(subject.inputDigest)
    || !Array.isArray(subject.files) || subject.files.length !== source.paths.length) throw new Error('REVIEW_SUBJECT_INVALID');
  for (const [index, file] of subject.files.entries()) {
    if (file.path !== source.paths[index] || !['100644', '100755'].includes(file.mode) || typeof file.content !== 'string'
      || file.sizeBytes !== Buffer.byteLength(file.content) || file.digest !== sha256Text(file.content)) throw new Error('REVIEW_SUBJECT_FILE_INVALID');
  }
  const { digest, ...unsigned } = subject;
  if (sha256Text(canonicalJson(unsigned)) !== digest) throw new Error('REVIEW_SUBJECT_DIGEST_INVALID');
  return subject;
}

async function freeze(context: PluginInvocationContext, source: ReviewSource, ref: string, clean: boolean) {
  const frozen = await context.invoke('git.repository.read', { operation: 'freeze_head',
    resource: { type: 'git.repository.path', canonicalId: '.' },
    payload: { ref, requireClean: clean, repositoryRoot: source.repositoryRoot } });
  if (frozen.repositoryRoot !== source.repositoryRoot || !revision(frozen.head) || typeof frozen.proof !== 'string') throw new Error('REVIEW_REPOSITORY_IDENTITY_INVALID');
  return { head: frozen.head, proof: frozen.proof };
}

export async function captureReviewSubject(sourceInput: unknown, input: unknown, context: PluginInvocationContext): Promise<ReviewSubject> {
  const source = parseReviewSource(sourceInput);
  const current = await freeze(context, source, 'HEAD', true);
  const architecture = await freeze(context, source, source.architectureRef, false);
  const files: ReviewSubject['files'][number][] = [];
  for (const file of source.paths) {
    const read = await context.invoke('git.repository.read', { operation: 'read_revision_text',
      resource: { type: 'git.repository.path', canonicalId: file }, payload: { ...architecture, allowedPrefixes: source.paths, requireRegularFile: true } });
    if (read.head !== architecture.head || read.path !== file || !['100644', '100755'].includes(String(read.mode)) || typeof read.content !== 'string'
      || read.digest !== sha256Text(read.content) || read.sizeBytes !== Buffer.byteLength(read.content)) throw new Error('REVIEW_SOURCE_BYTES_INVALID');
    files.push({ path: file, mode: read.mode as '100644' | '100755', content: read.content, digest: read.digest, sizeBytes: read.sizeBytes });
  }
  const unsigned = { ...source, runId: context.contract.lease.attempt.runId, sourceRevision: current.head,
    architectureRevision: architecture.head, inputDigest: sha256Text(canonicalJson(input)), files };
  const subject = { ...unsigned, digest: sha256Text(canonicalJson(unsigned)) };
  await verifyReviewSubject(subject, context);
  return subject;
}

export async function verifyReviewSubject(value: unknown, context: PluginInvocationContext, expectedSourceRevision?: string): Promise<ReviewSubject> {
  const subject = parseReviewSubject(value, context.contract.lease.attempt.runId);
  const current = await freeze(context, subject, 'HEAD', true);
  const architecture = await freeze(context, subject, subject.architectureRef, false);
  if (current.head !== (expectedSourceRevision ?? subject.sourceRevision) || architecture.head !== subject.architectureRevision) throw new Error('REVIEW_SUBJECT_STALE');
  return subject;
}
