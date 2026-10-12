import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = 'docs/review/remediation';
const statuses = ['verifiziert', 'in Bearbeitung', 'implementiert', 'offen'];
const start = '<!-- remediation:current:start -->';
const end = '<!-- remediation:current:end -->';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
function requireThat(condition, message) { if (!condition) throw new Error(message); }
const cell = value => String(value ?? '').replaceAll('|', '&#124;').replaceAll('\n', '<br>');

export function countsFor(findings) {
  return Object.fromEntries(statuses.map(status => [status, findings.filter(f => f.status === status).length]));
}
function evidenceReferences(finding) {
  return (finding.verification_evidence ?? []).flatMap(e => typeof e === 'string' ? [e] : [e.report, ...(Array.isArray(e.raw) ? e.raw : e.raw ? [e.raw] : [])]);
}
function evidencePath(reference) {
  return reference.startsWith('docs/') ? reference : `${directory}/${reference}`;
}
export function validateRegister(register, identities, root, { checkCounts = true } = {}) {
  const all = [...register.findings, ...register.additional_integration_findings];
  requireThat(new Set(all.map(f => f.id)).size === all.length, 'Doppelte ID');
  for (const [name, findings] of [['historical', register.findings], ['integration', register.additional_integration_findings]]) {
    requireThat(JSON.stringify(findings.map(f => f.id).sort()) === JSON.stringify([...identities[name]].sort()), `${name}: fehlende oder unbekannte ID`);
  }
  const families = Object.fromEntries(Object.keys(register.counts).map(family => [family, register.findings.filter(f => f.family === family).length]));
  requireThat(Object.values(families).reduce((a, b) => a + b, 0) === register.findings.length, 'Unbekannte Befundfamilie');
  requireThat(Object.keys(families).every(k => families[k] === register.counts[k]), 'Falsche Familiensumme');
  if (checkCounts) {
    const counts = countsFor(register.findings);
    requireThat(Object.keys(register.progress_counts).length === statuses.length && statuses.every(s => counts[s] === register.progress_counts[s]), 'Falsche Statussumme');
  }
  const packages = new Map(register.work_packages.map(p => [p.id, p]));
  const assignments = register.work_packages.flatMap(p => p.finding_ids);
  requireThat(assignments.length === register.findings.length && new Set(assignments).size === assignments.length, 'Fehlende/doppelte Paketzuordnung');
  const resolvedCommits = new Set();
  for (const f of all) {
    requireThat(statuses.includes(f.status), `${f.id}: unbekannter Status`);
    const historical = register.findings.includes(f);
    if (historical) {
      requireThat(packages.get(f.work_package)?.finding_ids.includes(f.id), `${f.id}: falsche Paketzuordnung`);
      requireThat(nonempty(f.source_finding_text) && f.source_finding_text.includes(f.id), `${f.id}: historischer Originalbefund fehlt`);
      requireThat(/^https:\/\/github\.com\/datrab\/kubeclaw\/blob\/[a-f0-9]{40}\//.test(f.source_review ?? ''), `${f.id}: commitfester Originalbeleg fehlt`);
    }
    const references = historical ? evidenceReferences(f) : [f.report];
    if (f.status !== 'offen') requireThat(references.length > 0, `${f.id}: Belegverweis fehlt`);
    for (const reference of historical ? [f.source_review, ...references] : references) {
      requireThat(nonempty(reference), `${f.id}: Belegverweis fehlt`);
      if (reference.startsWith('https://')) {
        const match = /^https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([a-f0-9]{40})\/(.+)$/.exec(reference);
        requireThat(match, `${f.id}: nicht commitfester externer Beleg`);
        const object = `${match[1]}:${match[2]}`;
        if (!resolvedCommits.has(object)) {
          requireThat(execFileSync('git', ['show', object], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().length > 0, `${f.id}: leerer historischer Beleg`);
          resolvedCommits.add(object);
        }
        continue;
      }
      const path = resolve(root, evidencePath(reference));
      requireThat(!relative(root, path).startsWith('..'), `${f.id}: Beleg außerhalb des Repositories`);
      const stat = statSync(path);
      requireThat(stat.isDirectory() ? readdirSync(path).length > 0 : stat.isFile() && readFileSync(path, 'utf8').trim().length > 0, `${f.id}: leerer oder ungültiger Beleg ${reference}`);
    }
    if (f.status === 'verifiziert') {
      if (historical) requireThat(nonempty(f.verification_status), `${f.id}: Verifikationsentscheidung fehlt`);
    }
  }
  requireThat(nonempty(register.completion_policy), 'Lokale/Live-Abschlussgrenze fehlt');
}
function summary(register) {
  const c = countsFor(register.findings);
  return `**${c.verifiziert}/${register.findings.length} lokal verifiziert, ${register.findings.length - c.verifiziert} unvollständig** (${c.implementiert} teilweise implementiert, ${c['in Bearbeitung']} in Bearbeitung, ${c.offen} offen). Zusätzlich ${register.additional_integration_findings.length} separat geführte Integrationsbefunde.\n\nQuelle: [register.json](register.json); je ID: [Register](register.md). ${register.completion_policy}\n\nPflege und Prüfung: [Registerverfahren](implementation/register-consistency-20260920.md).`;
}
function links(f) {
  return evidenceReferences(f).map((ref, i) => `[${i + 1}](${ref.startsWith('docs/') ? relative(directory, ref) : ref})`).join(', ') || 'Keine Implementierungsnachweise';
}
export function renderRegister(register) {
  const lines = ['# Vollständiges Behebungsregister', '', '<!-- Generiert durch scripts/review/remediation-register.mjs; register.json bearbeiten. -->', '', summary(register), '', 'Status: `offen` = unbehandelt; `in Bearbeitung` = laufende Arbeit; `implementiert` = teilweise bzw. lokal noch nicht abgeschlossen; `verifiziert` = lokale Abschlussentscheidung nach D12. Diese Darstellung prüft Konsistenz und Belegverweise, nicht die fachliche Richtigkeit historischer Abschlüsse.', '', '## Historische Befunde', '', '| Kennung | Schwere | Befund | Paket | Status | Originalbericht | Implementierungsnachweise | Prüfbereich / nächste Arbeit |', '|---|---|---|---|---|---|---|---|'];
  for (const f of register.findings) lines.push(`| ${f.id} | ${cell(f.severity)} | ${cell(f.title)} | [${f.work_package}](work-packages.md#${f.work_package.toLowerCase()}) | ${f.status} | [Original](${f.source_review}) | ${links(f)} | ${cell([f.verification_scope, f.next_action].filter(Boolean).join(' '))} |`);
  lines.push('', '## Zusätzliche Integrationsbefunde', '', '| Kennung | Status | Nachweis | Prüfbereich / Grenzen |', '|---|---|---|---|');
  for (const f of register.additional_integration_findings) lines.push(`| ${f.id} | ${f.status} | [Nachweis](${f.report}) | ${cell(f.scope)} |`);
  lines.push('', '## Zielentscheidungen mit Auswirkungen auf historische Lösungsvorschläge', '', 'Originalbefunde bleiben unverändert. Die Hinweise schließen keinen Befund ohne Nachweis.', '');
  for (const f of register.findings) for (const note of f.decision_notes ?? []) lines.push(`- **${f.id}:** ${note}`);
  return lines.join('\n') + '\n';
}
export function synchronize(root, write = false) {
  const path = resolve(root, directory, 'register.json');
  const register = JSON.parse(readFileSync(path, 'utf8'));
  const identities = JSON.parse(readFileSync(resolve(root, 'scripts/review/remediation-identities.json'), 'utf8'));
  validateRegister(register, identities, root, { checkCounts: !write });
  const outputs = new Map([[resolve(root, directory, 'register.md'), renderRegister(register)]]);
  for (const name of ['progress.md', 'handoff.md']) {
    const target = resolve(root, directory, name);
    const text = readFileSync(target, 'utf8');
    requireThat(text.split(start).length === 2 && text.split(end).length === 2 && text.indexOf(start) < text.indexOf(end), `${name}: eindeutige Generierungsmarker fehlen`);
    outputs.set(target, text.slice(0, text.indexOf(start) + start.length) + '\n' + summary(register) + '\n' + text.slice(text.indexOf(end)));
  }
  // Validate everything before writing. Never infer or modify finding statuses.
  if (write) {
    register.progress_counts = countsFor(register.findings);
    writeFileSync(path, JSON.stringify(register, null, 2) + '\n');
    for (const [target, content] of outputs) writeFileSync(target, content);
  } else {
    for (const [target, content] of outputs) requireThat(readFileSync(target, 'utf8') === content, `Registerdrift: ${relative(root, target)}; mit --write regenerieren`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireThat(process.argv.slice(2).every(arg => ['--write', '--check'].includes(arg)) && process.argv.length <= 3, 'Aufruf: node scripts/review/remediation-register.mjs [--check|--write]');
    synchronize(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), process.argv.includes('--write'));
    console.log('Register konsistent: historische IDs, Integrationsbefunde, Status, Summen und Belegverweise. Keine fachliche Neuabnahme.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
