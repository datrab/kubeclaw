#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = 'docs/status/open-issues.json';
const output = 'docs/site/status/open-issues.md';
const identityFile = path.join(root, 'docs/status/finding-identities.json');
const requiredText = ['id', 'origin', 'title', 'severity', 'status', 'problem', 'impact', 'current_state', 'live_validation'];
const requiredLists = ['components', 'remaining_work', 'reproduction', 'acceptance_criteria'];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const loadIdentities = () => JSON.parse(fs.readFileSync(identityFile, 'utf8'));

export function originalFindingIds(identities = loadIdentities()) {
  const ids = identities.original_findings.map(item => item.id);
  if (identities.schema_version !== 1 || ids.length !== 154 || new Set(ids).size !== 154) {
    throw new Error('Stable finding identities must contain 154 unique original IDs');
  }
  return new Set(ids);
}

export function validateStatus(data, identities = loadIdentities()) {
  const originalIds = originalFindingIds(identities);
  if (data.schema_version !== 1 || !Array.isArray(data.issues)) throw new Error('Unsupported issue register schema');
  if (!validDate(data.updated_at) || !/^[a-f0-9]{40}$/u.test(data.source_baseline ?? '')) throw new Error('Dated immutable source baseline required');
  if (typeof data.purpose !== 'string' || !data.purpose.trim() || typeof data.verification_policy !== 'string' || !data.verification_policy.trim()) throw new Error('Register purpose and verification policy required');
  const ids = new Set();
  for (const issue of data.issues) {
    for (const field of requiredText) {
      if (typeof issue[field] !== 'string' || !issue[field].trim()) throw new Error(`${issue.id}: missing ${field}`);
    }
    if (ids.has(issue.id)) throw new Error(`Duplicate issue: ${issue.id}`);
    ids.add(issue.id);
    if (originalIds.has(issue.id) !== (issue.origin === 'original-154')) throw new Error(`${issue.id}: original membership/counts mismatch`);
    if (!Object.hasOwn(data.status_semantics, issue.status)) throw new Error(`${issue.id}: status has no defined semantics`);
    if (!['open', 'in-progress', 'partially-implemented'].includes(issue.status)) throw new Error(`${issue.id}: closed finding belongs in closure provenance`);
    for (const field of requiredLists) {
      if (!Array.isArray(issue[field]) || !issue[field].length || issue[field].some(item => typeof item !== 'string' || !item.trim())) {
        throw new Error(`${issue.id}: incomplete ${field}`);
      }
    }
    if (!issue.evidence?.assessment || !Array.isArray(issue.sources) || !issue.sources.length) throw new Error(`${issue.id}: evidence required`);
    for (const ref of issue.sources) {
      const pinned = /^https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[a-f0-9]{40}\//u.test(ref.url);
      const externalRecord = /^https:\/\/github\.com\/datrab\/kubeclaw\/(?:issues\/\d+|actions\/runs\/\d+)(?:[/#?].*)?$/u.test(ref.url);
      if (!pinned && !externalRecord) throw new Error(`${issue.id}: source must be immutable or an explicitly dated issue/run`);
      if (!ref.scope) throw new Error(`${issue.id}: source scope required`);
      if (externalRecord && (!validDate(ref.observed_at) || ref.observed_at > data.updated_at)) throw new Error(`${issue.id}: valid source observation date required`);
      if (pinned && ref.commit && !ref.url.includes(`/blob/${ref.commit}/`)) throw new Error(`${issue.id}: source commit mismatch`);
    }
    if (!Array.isArray(issue.dependencies)) throw new Error(`${issue.id}: dependencies must be explicit`);
  }
  for (const issue of data.issues) {
    for (const id of issue.dependencies) if (!ids.has(id) || id === issue.id) throw new Error(`${issue.id}: unresolved dependency ${id}`);
  }
  const original = data.issues.filter(issue => issue.origin === 'original-154').length;
  const s = data.scope;
  if (s.original_total !== 154 || !s.counting_policy || !Number.isInteger(s.additional_integration_locally_verified) || s.additional_integration_locally_verified < 0 || original !== s.original_incomplete || original + s.original_locally_verified !== s.original_total ||
      data.issues.length !== s.total_open || data.issues.length - original !== s.additional_open) {
    throw new Error('Issue counts do not match their scope');
  }
  const dispositions = new Map(identities.original_findings.map(item => [item.id, item.disposition]));
  const statusNames = { Open: 'open', 'In progress': 'in-progress', 'Implemented; incomplete': 'partially-implemented' };
  for (const [id, disposition] of dispositions) {
    const issue = data.issues.find(entry => entry.id === id);
    if (disposition === 'Locally verified' ? issue !== undefined :
      !Object.hasOwn(statusNames, disposition) || issue?.status !== statusNames[disposition]) {
      throw new Error(`${id}: issue state disagrees with local disposition data`);
    }
  }
  const integrationIds = identities.integration_findings.map(item => item.id);
  if (integrationIds.length !== 5 || new Set(integrationIds).size !== 5 || s.additional_integration_locally_verified !== integrationIds.length) {
    throw new Error('Integration closure counts disagree with stable identity data');
  }
}

const cell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const publicIds = new Map([
  ['DOC-AP03-GITOPS-001', 'GITOPS-REVISION-001'],
  ['DOC-AP04-PREFERENCE-001', 'PRISM-PREFERENCE-001'],
  ['DOC-AP07-PRISM-CHECK-001', 'PRISM-DEPLOY-CHECK-001'],
  ['DOC-AP08-BOUNDARY-CHECK-001', 'PLUGIN-BOUNDARY-001'],
  ['DOC-AP08-EFFECT-RECONCILIATION-002', 'EFFECT-RECONCILIATION-001'],
  ['DOC-AP08-RUNTIME-CHECKS-003', 'RUNTIME-VERIFICATION-001'],
  ['DOC-AP08-PRISM-TOOL-LIMITS-004', 'PRISM-TOOL-LIMITS-001'],
]);
const publicId = id => publicIds.get(id) ?? id;
const anchor = id => publicId(id).toLowerCase();
const list = values => values.map(value => `- ${value}`).join('\n');

export function renderStatus(data) {
  validateStatus(data);
  const s = data.scope;
  const lines = [
    '# Open implementation work', '',
    'Status: generated from the canonical issue register',
    'Audience: maintainer, operator, contributing agent',
    'Owner: platform-maintainers',
    `Evidence: ${source}`,
    `Applies to: source baseline ${data.source_baseline}`,
    `Last verified: ${data.updated_at}, source inspection only; see individual evidence`, '',
    '<!-- Generated by scripts/docs-status.mjs. Edit docs/status/open-issues.json, then run npm run docs:status:generate. -->', '',
    data.purpose, '', data.verification_policy, '',
    `The register contains ${s.total_open} current implementation issues.`, '',
    '[Evidence and acceptance policy](../decisions/acceptance.md) and [live acceptance](acceptance.md) remain separate.', '',
    '## Status meanings', '',
    ...Object.entries(data.status_semantics).map(([status, meaning]) => `- **${status}:** ${meaning}`), '',
    '## Issue index', '', '| ID | Issue | Status |', '| --- | --- | --- |',
    ...data.issues.map(issue => `| [${cell(publicId(issue.id))}](#${anchor(issue.id)}) | ${cell(issue.title)} | ${cell(issue.status)} |`), '',
  ];
  for (const issue of data.issues) {
    const sources = issue.sources.filter(ref => !ref.url.includes('/docs/'));
    lines.push(`## ${publicId(issue.id)}`, '', `**${issue.title}**`, '',
      `Status: ${issue.status}. Severity: ${issue.severity}.`, '',
      '### Problem and impact', '', issue.problem, '', issue.impact, '',
      '### Components and current state', '', list(issue.components), '', issue.current_state, '',
      '### Remaining work', '', list(issue.remaining_work), '',
      '### Reproduction and verification procedure', '', list(issue.reproduction), '',
      '### Completion criteria', '', list(issue.acceptance_criteria), '',
      '### Separate environment acceptance', '', issue.live_validation, '',
      '### Dependencies', '', issue.dependencies.length ? list(issue.dependencies.map(id => `[${id}](#${anchor(id)})`)) : 'No dependency on another entry in this register is established.', '',
      '### Evidence boundary', '', issue.evidence.assessment, '',
      ...Object.entries(issue.evidence).filter(([key]) => ['prior_verification', 'implementation_commit', 'source_run_commit'].includes(key)).map(([key, value]) => `- **${key === 'prior_verification' ? 'recorded verification' : key.replaceAll('_', ' ')}:** ${value === null ? 'Not established.' : typeof value === 'object' ? JSON.stringify(value) : value}`), '',
      '### Sources', '', list(sources.map(ref => `[${ref.path ?? ref.url}](${ref.url}) — ${ref.scope}${ref.observed_at ? ` Observed: ${ref.observed_at}.` : ''}`)), '');
  }
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/docs-status.mjs [--check]');
    const rendered = renderStatus(JSON.parse(fs.readFileSync(path.join(root, source), 'utf8')));
    const target = path.join(root, output);
    if (process.argv.includes('--check')) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== rendered) throw new Error('Open-issues view is stale; run npm run docs:status:generate');
      console.log('Current issue schema, counts, references and generated view agree.');
    } else {
      fs.writeFileSync(target, rendered);
      console.log(`Generated ${output}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
