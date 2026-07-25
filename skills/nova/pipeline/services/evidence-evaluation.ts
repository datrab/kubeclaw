import fs from 'node:fs';
import path from 'node:path';
import {
  artifactPaths,
  canonicalFingerprint,
} from '../portable-artifacts.ts';
import { evidenceConfig, readJsonLines } from './evidence-utils.ts';

function sameEvaluationFact(item: any, fact: any) {
  return item.dimension === fact.dimension
    && item.work_id === fact.work_id
    && item.attempt === fact.attempt
    && item.fingerprint === fact.fingerprint
    && canonicalFingerprint(item.value) === canonicalFingerprint(fact.value);
}

function emitGitEvidence(config: any, record: any) {
  const {
    value,
    work_id: workId,
    attempt,
  } = record;
  void Promise.resolve(config._emitCanonicalEvidence(
    'git.evidence',
    {
      repository: value.repository ?? 'unknown',
      branch: value.branch ?? null,
      starting_commit: value.starting_commit ?? null,
      final_commit: value.final_commit ?? null,
      dirty: value.dirty ?? null,
      files_touched: value.files_touched ?? [],
      diff_stat: value.diff_stat ?? null,
      diff_reference: value.diff_reference ?? null,
      module_id: workId,
      attempt,
    },
    {
      sourceEventId:
        `git/${workId ?? 'run'}/${attempt ?? 0}/${value.final_commit ?? 'unknown'}`,
    }
  ));
}

function emitEvaluationFact(config: any, record: any) {
  if (typeof config?._emitCanonicalEvidence !== 'function') return;
  const workId = record.work_id;
  const sourceFingerprint =
    record.fingerprint ?? canonicalFingerprint(record.value);
  void Promise.resolve(config._emitCanonicalEvidence(
    'evaluation.fact',
    {
      dimension: record.dimension,
      value: record.value,
      fingerprint: record.fingerprint,
      module_id: workId,
      attempt: record.attempt,
    },
    {
      sourceEventId:
        `evaluation/${record.dimension}/${workId ?? 'run'}/${record.attempt ?? 0}/${sourceFingerprint}`,
    }
  ));
  if (record.dimension === 'git.workspace') {
    emitGitEvidence(config, record);
  }
}

export function appendEvaluationFact(config: any, fact: any) {
  const file = artifactPaths(evidenceConfig(config)).evaluation;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const {
    dimension,
    fingerprint = null,
    work_id: workId = null,
    attempt = null,
    ...value
  } = fact;
  const comparable = {
    dimension,
    fingerprint,
    work_id: workId,
    attempt,
    value,
  };
  const prior = readJsonLines(file).find((item) =>
    sameEvaluationFact(item, comparable)
  );
  if (prior) return prior;
  const record = {
    schema_version: 'evaluation_fact.v1',
    recorded_at: new Date().toISOString(),
    run_id: config._runId ?? config.run_id,
    project: config.project,
    work_id: workId,
    attempt,
    dimension,
    value,
    fingerprint,
  };
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  emitEvaluationFact(config, record);
  return record;
}
