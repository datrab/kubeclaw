import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fail, isoDate, record, stringList, text } from './policy-validation.js';

function suppressionEntries(baseline: Record<string, any>, today: string): Record<string, any>[] {
  return baseline.groups.flatMap((entry: unknown, index: number) => {
    const field = `baseline.groups[${index}]`;
    const value = record(entry, field);
    const created = isoDate(value.created, `${field}.created`);
    const expires = isoDate(value.expires, `${field}.expires`);
    const approvedOn = isoDate(value.approved_on, `${field}.approved_on`);
    if (expires < today) fail(`${field}.expires`, `expired on ${expires}; remove or renew through explicit approval`);
    if (approvedOn < created) fail(`${field}.approved_on`, 'cannot precede creation date');
    if (expires <= created) fail(`${field}.expires`, 'must be later than creation date');
    const metadata = {
      tool: text(value.tool, `${field}.tool`), owner: text(value.owner, `${field}.owner`),
      reason: text(value.reason, `${field}.reason`), created, expires,
      tracking: text(value.tracking, `${field}.tracking`), approved_by: text(value.approved_by, `${field}.approved_by`), approved_on: approvedOn,
    };
    return stringList(value.fingerprints, `${field}.fingerprints`, { nonEmpty: true }).map((fingerprint: any, fingerprintIndex: any) => {
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) fail(`${field}.fingerprints[${fingerprintIndex}]`, 'required lowercase SHA-256');
      return { ...metadata, fingerprint };
    });
  });
}

function validateBaseline(input: unknown, policyDir: string, today: string): Record<string, any> {
  const baselinePath = path.resolve(policyDir, text(input, 'policy.baseline_path'));
  if (!fs.existsSync(baselinePath)) fail('policy.baseline_path', `does not exist: ${baselinePath}`);
  let source = '';
  let parsed: unknown;
  try { source = fs.readFileSync(baselinePath, 'utf8'); parsed = JSON.parse(source); }
  catch (error: any) { fail('policy.baseline_path', `invalid JSON: ${(error as Error).message}`); }
  const baseline = record(parsed, 'baseline');
  if (baseline.schema_version !== 'pipeline_lint_baseline.v2') fail('baseline.schema_version', 'expected pipeline_lint_baseline.v2');
  if (!Array.isArray(baseline.groups)) fail('baseline.groups', 'required array');
  const entries = suppressionEntries(baseline, today);
  const keys = entries.map((entry: any) => `${entry.tool}:${entry.fingerprint}`);
  if (new Set(keys).size !== keys.length) fail('baseline.groups', 'duplicate tool fingerprints are not allowed');
  return { path: baselinePath, digest: crypto.createHash('sha256').update(source).digest('hex'), entries, entries_by_key: new Map(entries.map((entry: any) => [`${entry.tool}:${entry.fingerprint}`, entry])) };
}

function validateRuleAdmission(input: unknown, tools: Record<string, any>[]): Record<string, any> {
  const admission = record(input, 'policy.rule_admission');
  const historicalCommits = stringList(admission.historical_commits, 'policy.rule_admission.historical_commits', { nonEmpty: true });
  historicalCommits.forEach((commit: any, index: any) => {
    if (!/^[a-f0-9]{40}$/.test(commit)) fail(`policy.rule_admission.historical_commits[${index}]`, 'required full lowercase Git commit SHA');
  });
  if (!Array.isArray(admission.rules) || admission.rules.length === 0) fail('policy.rule_admission.rules', 'required non-empty array');
  const knownTools = new Set(tools.map((tool: any) => tool.id));
  const rules = admission.rules.map((entry: unknown, index: number) => {
    const field = `policy.rule_admission.rules[${index}]`;
    const rule = record(entry, field);
    const tool = text(rule.tool, `${field}.tool`);
    if (!knownTools.has(tool)) fail(`${field}.tool`, `unknown tool '${tool}'`);
    if (!Number.isSafeInteger(rule.historical_changed_sets) || rule.historical_changed_sets < 1) fail(`${field}.historical_changed_sets`, 'required positive integer');
    if (!Number.isSafeInteger(rule.false_positives) || rule.false_positives < 0) fail(`${field}.false_positives`, 'required non-negative integer');
    return { tool, code: text(rule.code, `${field}.code`), principle: text(rule.principle, `${field}.principle`), remediation: text(rule.remediation, `${field}.remediation`), historical_changed_sets: rule.historical_changed_sets, false_positives: rule.false_positives, approved_by: text(rule.approved_by, `${field}.approved_by`), approved_on: isoDate(rule.approved_on, `${field}.approved_on`) };
  });
  const keys = rules.map((rule: any) => `${rule.tool}:${rule.code}`);
  if (new Set(keys).size !== keys.length) fail('policy.rule_admission.rules', 'duplicate tool/rule codes are not allowed');
  return { historical_commits: historicalCommits, rules };
}

export { validateBaseline, validateRuleAdmission };
