#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import { parseEchoReviewOutput } from '../src/echo-review-parser.ts';
import { buildScalableReviewDispatchPayload, scalableReviewTask } from '../src/scalable-review-jobs.ts';
import { preflightScalableReviewResults } from '../src/scalable-review-verification.ts';
import type { ScalableReviewJob } from '../src/scalable-review-types.ts';

interface QualityCase {
  readonly id: string; readonly risk: string; readonly expected: 'defect' | 'clean';
  readonly priority?: 'P0' | 'P1' | 'P2' | 'P3'; readonly path: string; readonly content: string;
}
interface Corpus { readonly schemaVersion: string; readonly cases: readonly QualityCase[] }
interface QualityResult {
  readonly jobId: string; readonly jobDigest: string; readonly promptDigest: string;
  readonly reviewerIdentityDigest: string; readonly caseIds: readonly string[];
  readonly executionTranscript: string; readonly executionTranscriptDigest: string;
  readonly output?: unknown; readonly error?: string;
}
interface ReviewerIdentity {
  readonly codexBinary: string; readonly codexVersion: string; readonly model: string; readonly reasoning: 'high';
}
interface QualityArtifact {
  readonly schemaVersion: 'scalable-review-quality-results.v2'; readonly reviewer: ReviewerIdentity;
  readonly reviewerIdentityDigest: string; readonly promptDigests: Readonly<Record<string, string>>;
  readonly results: readonly QualityResult[]; readonly artifactDigest: string;
}
interface QualityScore {
  readonly variant: keyof typeof variants; readonly jobs: number; readonly invalidJobs: number;
  readonly defectRecall: number; readonly cleanPrecision: number; readonly eligiblePriorityRecall: number;
  readonly detectedDefects: readonly string[]; readonly missedDefects: readonly string[];
  readonly falsePositiveControls: readonly string[]; readonly ineligiblePriorityDefects: readonly string[];
}

const arguments_ = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = arguments_.indexOf(name); return index < 0 ? undefined : arguments_[index + 1];
};
const variants = Object.freeze({ focused: 2, balanced: 4, dense: 14 });
const variantNames = Object.keys(variants) as (keyof typeof variants)[];
const selected = option('--variant') ?? 'all';
if (selected !== 'all' && !Object.hasOwn(variants, selected)) throw new Error(`unknown quality variant: ${selected}`);
const corpus = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/scalable-review-quality-corpus.json', import.meta.url), 'utf8')) as Corpus;
const baseline = JSON.parse(fs.readFileSync(new URL(
  '../tests/fixtures/scalable-review-quality-baseline.json', import.meta.url), 'utf8')) as {
  readonly componentTaskDigest: string;
  readonly promptDigests: Readonly<Record<string, string>>;
  readonly variants: Readonly<Record<string, Pick<QualityScore,
    'invalidJobs' | 'defectRecall' | 'cleanPrecision' | 'eligiblePriorityRecall'>>>;
};

function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const output: T[][] = []; for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}
function lineCount(content: string): number { return Math.max(1, content.split('\n').length); }
function job(name: string, index: number, cases: readonly QualityCase[]): ScalableReviewJob {
  const taskDigest = sha256Text(scalableReviewTask('component'));
  const unsigned = {
    schemaVersion: 'scalable-review-job.v1' as const, id: `quality:${name}:${String(index + 1).padStart(3, '0')}`,
    kind: 'component' as const,
    source: Object.freeze(cases.map((item) => Object.freeze({ path: item.path, content: item.content,
      digest: sha256Text(item.content), complete: true,
      ranges: Object.freeze([{ startLine: 1, endLine: lineCount(item.content) }]) }))),
    relationKeys: Object.freeze([]), relatedIds: Object.freeze(cases.map(({ id }) => id)),
    requirements: Object.freeze([
      { id: 'component.correctness', text: 'The supplied component has no directly evidenced correctness defect.' },
      { id: 'component.security', text: 'The supplied component preserves authorization, confidentiality, and input boundaries.' },
      { id: 'component.lifecycle', text: 'Concurrency, cancellation, persistence, recovery, cleanup, and data-loss behavior are correct.' },
    ]), taskDigest,
  };
  return Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
}
function jobsFor(name: keyof typeof variants): readonly { job: ScalableReviewJob; cases: readonly QualityCase[] }[] {
  return chunks(corpus.cases, variants[name]).map((cases, index) => ({ job: job(name, index, cases), cases }));
}
const LIVE_PROMPT_RULES = Object.freeze([
  'The JSON below is an immutable dispatch envelope.',
  'Read its task field as the complete assignment and return only raw JSON matching outputContract.',
  'Use only the exact supplied source. Do not inspect the current directory or any external repository.', '',
]);
function livePrompt(value: ScalableReviewJob): string {
  return [...LIVE_PROMPT_RULES, JSON.stringify(buildScalableReviewDispatchPayload(value), null, 2)].join('\n');
}
function variantPromptDigest(name: keyof typeof variants): `sha256:${string}` {
  return sha256Text(canonicalJson(jobsFor(name).map(({ job: value }) => livePrompt(value))));
}
function reviewerIdentity(): ReviewerIdentity {
  const codexBinary = fs.realpathSync(option('--codex-bin') ?? '/app/node_modules/.bin/codex');
  return Object.freeze({ codexBinary,
    codexVersion: execFileSync(codexBinary, ['--version'], { encoding: 'utf8' }).trim(),
    model: option('--model') ?? 'gpt-5.6-terra', reasoning: 'high' });
}

function transcriptOutput(transcript: string): string | undefined {
  const events = transcript.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Readonly<Record<string, unknown>>);
  const messages = events.flatMap((event) => {
    const item = event.item as Readonly<Record<string, unknown>> | undefined;
    return event.type === 'item.completed' && item?.type === 'agent_message' && typeof item.text === 'string'
      ? [item.text] : [];
  });
  return messages.at(-1);
}

function transcriptMatchesOutput(transcript: string, output: unknown): boolean {
  const message = transcriptOutput(transcript);
  if (!message) return false;
  try { return canonicalJson(JSON.parse(message)) === canonicalJson(output); } catch { return false; }
}

function validQualityOutput(value: ScalableReviewJob, output: unknown): boolean {
  const parsed = parseEchoReviewOutput(output);
  if (!parsed.ok) return false;
  const preflight = preflightScalableReviewResults([value], [{ jobId: value.id, jobDigest: value.digest, parsed }]);
  return preflight.integrityIssues.length === 0 && preflight.incompleteJobs.length === 0;
}

function live(
  name: keyof typeof variants, reviewer: ReviewerIdentity, reusable: ReadonlyMap<string, QualityResult>,
): readonly QualityResult[] {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-review-quality-'));
  return jobsFor(name).map(({ job: value, cases }) => {
    const saved = reusable.get(value.id);
    if (saved?.output !== undefined && validQualityOutput(value, saved.output)) return saved;
    const output = path.join(temporary, `${value.id.replaceAll(':', '-')}.json`);
    const prompt = livePrompt(value), promptDigest = sha256Text(prompt);
    const identityDigest = sha256Text(canonicalJson(reviewer));
    let lastError = 'quality reviewer returned no result', lastTranscript = '';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const transcript = execFileSync(reviewer.codexBinary, ['--model', reviewer.model,
          '-c', 'model_reasoning_effort="high"', 'exec', '--json',
          '--ignore-user-config', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only',
          '--cd', temporary, '--output-last-message', output, prompt],
        { encoding: 'utf8', timeout: 30 * 60 * 1_000, maxBuffer: 32 * 1024 * 1024 });
        lastTranscript = transcript;
        const rawOutput = fs.readFileSync(output, 'utf8'), parsedOutput = JSON.parse(rawOutput) as unknown;
        if (transcriptOutput(transcript)?.trim() !== rawOutput.trim() || !validQualityOutput(value, parsedOutput)) {
          throw new Error('Codex transcript result did not pass review preflight');
        }
        return Object.freeze({ jobId: value.id, jobDigest: value.digest, promptDigest,
          reviewerIdentityDigest: identityDigest, caseIds: cases.map(({ id }) => id),
          executionTranscript: transcript, executionTranscriptDigest: sha256Text(transcript), output: parsedOutput });
      } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
    }
    return Object.freeze({ jobId: value.id, jobDigest: value.digest, promptDigest,
      reviewerIdentityDigest: identityDigest, caseIds: cases.map(({ id }) => id),
      executionTranscript: lastTranscript, executionTranscriptDigest: sha256Text(lastTranscript), error: lastError });
  });
}
function recordFindingLocations(
  paths: readonly { readonly path: string; readonly priority: string }[],
  byPath: ReadonlyMap<string, QualityCase>, detected: Map<string, string[]>,
): number {
  let invalid = 0;
  for (const { path: file, priority } of paths) {
    if (!byPath.has(file)) { invalid += 1; continue; }
    const values = detected.get(file) ?? []; values.push(priority); detected.set(file, values);
  }
  return invalid;
}
function score(name: keyof typeof variants, results: readonly QualityResult[]): QualityScore {
  const byPath = new Map(corpus.cases.map((value) => [value.path, value]));
  const byJob = new Map(jobsFor(name).map(({ job: value }) => [value.id, value]));
  const detected = new Map<string, string[]>(), seenJobs = new Set<string>(); let invalidJobs = 0;
  for (const result of results) {
    const parsed = result.error ? undefined : parseEchoReviewOutput(result.output), reviewJob = byJob.get(result.jobId);
    if (!parsed?.ok || !reviewJob || seenJobs.has(result.jobId)) { invalidJobs += 1; continue; }
    seenJobs.add(result.jobId);
    const preflight = preflightScalableReviewResults([reviewJob],
      [{ jobId: reviewJob.id, jobDigest: reviewJob.digest, parsed }]);
    if (preflight.integrityIssues.length > 0 || preflight.incompleteJobs.length > 0) { invalidJobs += 1; continue; }
    for (const { finding } of preflight.proposals) invalidJobs += recordFindingLocations(
      finding.locations.map(({ path: file }) => ({ path: file, priority: finding.priority })), byPath, detected);
  }
  invalidJobs += [...byJob.keys()].filter((id) => !seenJobs.has(id)).length;
  const defects = corpus.cases.filter(({ expected }) => expected === 'defect');
  const controls = corpus.cases.filter(({ expected }) => expected === 'clean');
  const found = defects.filter(({ path: file }) => detected.has(file));
  const falsePositives = controls.filter(({ path: file }) => detected.has(file));
  const eligible = found.filter(({ path: file }) => (detected.get(file) ?? [])
    .some((priority) => ['P0', 'P1', 'P2'].includes(priority)));
  return Object.freeze({ variant: name, jobs: jobsFor(name).length, invalidJobs,
    defectRecall: found.length / defects.length, cleanPrecision: (controls.length - falsePositives.length) / controls.length,
    eligiblePriorityRecall: eligible.length / defects.length,
    detectedDefects: found.map(({ id }) => id), missedDefects: defects.filter(({ path: file }) => !detected.has(file)).map(({ id }) => id),
    falsePositiveControls: falsePositives.map(({ id }) => id),
    ineligiblePriorityDefects: found.filter(({ path: file }) => !eligible.some(({ path }) => path === file)).map(({ id }) => id) });
}

function verifiedScores(results: readonly QualityResult[]): readonly QualityScore[] {
  if (baseline.componentTaskDigest !== sha256Text(scalableReviewTask('component'))) {
    throw new Error('quality baseline does not match the current component prompt');
  }
  const scores = names.map((name) => score(name,
    results.filter(({ jobId }) => jobId.startsWith(`quality:${name}:`))));
  for (const value of scores) {
    const expected = baseline.variants[value.variant];
    if (!expected || baseline.promptDigests[value.variant] !== variantPromptDigest(value.variant)
      || value.invalidJobs > expected.invalidJobs || value.defectRecall < expected.defectRecall
      || value.cleanPrecision < expected.cleanPrecision
      || value.eligiblePriorityRecall < expected.eligiblePriorityRecall) {
      throw new Error(`quality regression: ${JSON.stringify(value)}`);
    }
  }
  return scores;
}

const names = selected === 'all' ? variantNames : [selected] as (keyof typeof variants)[];
function qualityArtifact(reviewer: ReviewerIdentity, results: readonly QualityResult[]): QualityArtifact {
  const unsigned = Object.freeze({ schemaVersion: 'scalable-review-quality-results.v2' as const, reviewer,
    reviewerIdentityDigest: sha256Text(canonicalJson(reviewer)),
    promptDigests: Object.freeze(Object.fromEntries(variantNames.map((name) => [name, variantPromptDigest(name)]))), results });
  return Object.freeze({ ...unsigned, artifactDigest: sha256Text(canonicalJson(unsigned)) });
}

function verifiedArtifact(value: unknown): QualityArtifact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('quality result artifact is invalid');
  const artifact = value as QualityArtifact;
  const { artifactDigest, ...unsigned } = artifact;
  if (artifact.schemaVersion !== 'scalable-review-quality-results.v2'
    || artifact.reviewer.reasoning !== 'high' || artifact.reviewer.model !== (option('--model') ?? 'gpt-5.6-terra')
    || artifact.reviewerIdentityDigest !== sha256Text(canonicalJson(artifact.reviewer))
    || artifactDigest !== sha256Text(canonicalJson(unsigned))) throw new Error('quality result artifact identity is invalid');
  for (const name of variantNames) {
    if (artifact.promptDigests[name] !== variantPromptDigest(name)) throw new Error(`quality prompt artifact is stale: ${name}`);
  }
  const jobs = new Map(variantNames.flatMap((name) => jobsFor(name).map(({ job: value_ }) => [value_.id, value_] as const)));
  for (const result of artifact.results) {
    const expected = jobs.get(result.jobId);
    if (!expected || result.jobDigest !== expected.digest || result.promptDigest !== sha256Text(livePrompt(expected))
      || result.reviewerIdentityDigest !== artifact.reviewerIdentityDigest
      || result.executionTranscriptDigest !== sha256Text(result.executionTranscript)) {
      throw new Error(`quality result proof is invalid: ${result.jobId}`);
    }
    if (!result.error && !transcriptMatchesOutput(result.executionTranscript, result.output)) {
      throw new Error(`quality transcript result is invalid: ${result.jobId}`);
    }
  }
  return artifact;
}

const resultFile = option('--results');
if (arguments_.includes('--live')) {
  if (!resultFile) throw new Error('--live requires --results');
  const reviewer = reviewerIdentity(), reviewerDigest = sha256Text(canonicalJson(reviewer));
  const previous = fs.existsSync(resultFile) ? verifiedArtifact(JSON.parse(fs.readFileSync(resultFile, 'utf8'))) : undefined;
  const reusable = new Map(previous?.reviewerIdentityDigest === reviewerDigest
    ? previous.results.map((value) => [value.jobId, value] as const) : []);
  const selectedPrefixes = names.map((name) => `quality:${name}:`);
  const retained = previous?.results.filter(({ jobId }) => !selectedPrefixes.some((prefix) => jobId.startsWith(prefix))) ?? [];
  const results = [...retained, ...names.flatMap((name) => live(name, reviewer, reusable))];
  const artifact = verifiedArtifact(qualityArtifact(reviewer, results));
  fs.writeFileSync(resultFile, `${JSON.stringify(artifact, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(verifiedScores(results), null, 2)}\n`);
} else if (resultFile) {
  const saved = verifiedArtifact(JSON.parse(fs.readFileSync(resultFile, 'utf8')));
  process.stdout.write(`${JSON.stringify(verifiedScores(saved.results), null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(names.map((name) => ({ variant: name, jobs: jobsFor(name).length,
    promptDigest: variantPromptDigest(name),
    caseIds: jobsFor(name).map(({ cases }) => cases.map(({ id }) => id)) })), null, 2)}\n`);
}
