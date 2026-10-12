import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRegister, synchronize, renderRegister } from '../review/remediation-register.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = 'docs/review/remediation';
const original = JSON.parse(readFileSync(resolve(root, dir, 'register.json')));
const identities = JSON.parse(readFileSync(resolve(root, 'scripts/review/remediation-identities.json')));
const clone = () => structuredClone(original);

test('all historical and integration identities and real evidence resolve; actual generated files match', () => {
  assert.equal(original.findings.length, 154);
  assert.equal(original.additional_integration_findings.length, 5);
  validateRegister(original, identities, root);
  synchronize(root);
});
for (const [name, mutate, error] of [
  ['missing historical ID', r => r.findings.pop(), /fehlende oder unbekannte ID/],
  ['substituted historical ID with unchanged total', r => { r.findings[0].id = 'FAKE'; }, /fehlende oder unbekannte ID/],
  ['duplicate ID', r => { r.findings[1].id = r.findings[0].id; }, /Doppelte ID/],
  ['missing integration ID', r => r.additional_integration_findings.pop(), /fehlende oder unbekannte ID/],
  ['wrong status sum', r => r.progress_counts.verifiziert++, /Statussumme/],
  ['wrong family sum', r => r.counts.pipeline++, /Familiensumme/],
  ['unknown status', r => { r.findings[0].status = 'done'; }, /Statussumme|unbekannter Status/],
  ['missing original evidence', r => { delete r.findings[0].source_review; }, /Originalbeleg fehlt/],
  ['unresolvable original commit', r => { r.findings[0].source_review = 'https://github.com/datrab/kubeclaw/blob/0000000000000000000000000000000000000000/missing.md'; }, /Command failed/],
  ['unresolvable original path', r => { r.findings[0].source_review = r.findings[0].source_review.replace(/\/blob\/([a-f0-9]{40})\/.+$/, '/blob/$1/missing-original-report.md'); }, /Command failed/],
  ['missing implementation evidence', r => { r.findings[0].verification_evidence = []; }, /Belegverweis fehlt/],
  ['missing evidence file', r => { r.findings[0].verification_evidence = ['implementation/does-not-exist.md']; }, /ENOENT/],
  ['missing evidence object report', r => { r.findings[0].verification_evidence = [{ summary: 'passes' }]; }, /Belegverweis fehlt/],
  ['unresolvable commit evidence', r => { r.findings[0].verification_evidence = ['https://github.com/datrab/kubeclaw/blob/0000000000000000000000000000000000000000/missing.md']; }, /Command failed/],
  ['missing integration evidence', r => { delete r.additional_integration_findings[0].report; }, /Belegverweis fehlt/],
]) test(name, () => { const r = clone(); mutate(r); assert.throws(() => validateRegister(r, identities, root), error); });

function fixture(t) {
  const temp = mkdtempSync(resolve(tmpdir(), 'remediation-register-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  mkdirSync(resolve(temp, dir), { recursive: true });
  mkdirSync(resolve(temp, 'scripts/review'), { recursive: true });
  for (const name of ['register.json', 'register.md', 'progress.md', 'handoff.md']) writeFileSync(resolve(temp, dir, name), readFileSync(resolve(root, dir, name)));
  for (const path of ['.git', `${dir}/implementation`, `${dir}/resume`, 'docs/review/evidence']) symlinkSync(resolve(root, path), resolve(temp, path));
  writeFileSync(resolve(temp, 'scripts/review/remediation-identities.json'), JSON.stringify(identities));
  return temp;
}
for (const [name, file, mutate] of [
  ['status drift', 'register.md', s => s.replace('| verifiziert |', '| offen |')],
  ['missing Markdown ID', 'register.md', s => s.replace('PCR-AGENT-CONTRACT-001', 'MISSING')],
  ['missing Markdown evidence', 'register.md', s => s.replace('[1](implementation/contracts-2.md)', 'none')],
  ['wrong register sum', 'register.md', s => s.replace(/\*\*(\d+)\/154 lokal verifiziert/, (_, count) => `**${Number(count) + 1}/154 lokal verifiziert`)],
  ['wrong progress sum', 'progress.md', s => s.replace(/\*\*(\d+)\/154 lokal verifiziert/, (_, count) => `**${Number(count) + 1}/154 lokal verifiziert`)],
  ['wrong handoff sum', 'handoff.md', s => s.replace(/\*\*(\d+)\/154 lokal verifiziert/, (_, count) => `**${Number(count) + 1}/154 lokal verifiziert`)],
]) test(name, t => {
  const temp = fixture(t); const path = resolve(temp, dir, file);
  const before = readFileSync(path, 'utf8'); const after = mutate(before);
  assert.notEqual(after, before, 'negative control must actually modify input');
  writeFileSync(path, after);
  assert.throws(() => synchronize(temp), /Registerdrift/);
  assert.equal(readFileSync(path, 'utf8'), after, 'check mode never repairs drift');
});
test('generation repairs only counters/views, preserves every finding and historical checkpoint, and is idempotent', t => {
  const temp = fixture(t); const path = resolve(temp, dir, 'register.json');
  const r = clone(); r.progress_counts.verifiziert = 0;
  writeFileSync(path, JSON.stringify(r));
  const histories = ['progress.md', 'handoff.md'].map(name => readFileSync(resolve(temp, dir, name), 'utf8').split('<!-- remediation:current:end -->')[1]);
  synchronize(temp, true);
  const generated = JSON.parse(readFileSync(path));
  assert.deepEqual(generated.findings, original.findings);
  assert.deepEqual(generated.additional_integration_findings, original.additional_integration_findings);
  assert.deepEqual(generated, original);
  assert.deepEqual(['progress.md', 'handoff.md'].map(name => readFileSync(resolve(temp, dir, name), 'utf8').split('<!-- remediation:current:end -->')[1]), histories);
  const first = ['register.json', 'register.md', 'progress.md', 'handoff.md'].map(name => readFileSync(resolve(temp, dir, name), 'utf8'));
  synchronize(temp, true); synchronize(temp);
  assert.deepEqual(['register.json', 'register.md', 'progress.md', 'handoff.md'].map(name => readFileSync(resolve(temp, dir, name), 'utf8')), first);
});
test('malformed source prevents generation without touching generated files', t => {
  const temp = fixture(t); const r = clone(); r.findings.pop();
  writeFileSync(resolve(temp, dir, 'register.json'), JSON.stringify(r));
  const before = readFileSync(resolve(temp, dir, 'register.md'), 'utf8');
  assert.throws(() => synchronize(temp, true), /fehlende oder unbekannte ID/);
  assert.equal(readFileSync(resolve(temp, dir, 'register.md'), 'utf8'), before);
});
test('unresolvable original prevents generation without touching any register files', t => {
  const temp = fixture(t); const r = clone();
  r.findings[0].source_review = 'https://github.com/datrab/kubeclaw/blob/0000000000000000000000000000000000000000/missing.md';
  writeFileSync(resolve(temp, dir, 'register.json'), JSON.stringify(r));
  const files = ['register.json', 'register.md', 'progress.md', 'handoff.md'];
  const before = files.map(name => readFileSync(resolve(temp, dir, name), 'utf8'));
  assert.throws(() => synchronize(temp, true), /Command failed/);
  assert.deepEqual(files.map(name => readFileSync(resolve(temp, dir, name), 'utf8')), before);
});
test('all individual source statuses are rendered, not inferred from available evidence', () => {
  const r = clone(); const finding = r.findings.find(f => f.status === 'offen');
  finding.verification_evidence = r.findings[0].verification_evidence;
  const line = renderRegister(r).split('\n').find(line => line.startsWith(`| ${finding.id} |`));
  assert.match(line, /\| offen \|/);
  assert.match(line, /contracts-2.md/);
});
