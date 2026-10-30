#!/usr/bin/env node
/** Render the maintained, source-bound diagnostic families; not a code-discovery engine. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name));
const data = JSON.parse(read('docs/config/common-error-catalogue.json'));
const check = process.argv.includes('--check');
const prose = value => String(value).split(/([A-Za-z0-9./-]*_[A-Za-z0-9_./-]*[A-Za-z0-9_/-])/gu).map((part, index) => index % 2 ? '`' + part + '`' : part.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*\[\]|]/gu, c => `&#${c.codePointAt(0)};`)).join('').replaceAll('\n', ' ');
const literalCell = value => `<code>${String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\\`*_\[\]]/gu, c => `&#${c.codePointAt(0)};`).replaceAll('\r', '&#13;').replaceAll('\n', '&#10;')}</code>`;
const fence = value => { const runs = String(value).match(/`+/gu) ?? []; const mark = '`'.repeat(Math.max(3, ...runs.map(x => x.length + 1))); return `${mark}text\n${value}\n${mark}`; };
const anchor = value => value.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const metadata = title => [`# ${title}`, '', 'Status: generated source-backed reference', 'Audience: operator, developer, maintainer', 'Owner: documentation automation', 'Evidence: docs/config/common-error-catalogue.json; scripts/docs-common-error-catalogue.mjs', 'Applies to: current workspace-owned diagnostic families; source-bound descriptions, not execution evidence', 'Last verified: generation checks the declared source digests', 'Generator: scripts/docs-common-error-catalogue.mjs', '', '<!-- BEGIN GENERATED: common error catalogue -->', ''];
const sections = new Map(data.sections.map(s => [s.id, s]));
const ids = new Set();
for (const entry of data.entries) {
  if (ids.has(entry.id) || !sections.has(entry.section)) throw new Error(`CATALOGUE_ID_INVALID:${entry.id}`);
  ids.add(entry.id);
  for (const key of ['id', 'title', 'identity', 'kind', 'trigger', 'effect', 'retry', 'safeAction', 'retainedData', 'consumer']) if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(`CATALOGUE_FIELD_MISSING:${entry.id}:${key}`);
  if (!entry.sources?.length) throw new Error(`CATALOGUE_SOURCE_MISSING:${entry.id}`);
  for (const identity of [...(entry.observedIdentities ?? []), ...(entry.declaredOnlyIdentities ?? [])]) {
    if (typeof identity.identity !== 'string' || !identity.identity.trim() || !['error.code', 'Error.message'].includes(identity.carrier) || !entry.sources.some(source => source.path === identity.source?.path && source.sha256 === identity.source.sha256)) throw new Error(`CATALOGUE_IDENTITY_SOURCE_INVALID:${entry.id}`);
  }
  for (const source of entry.sources) {
    const absolute = path.resolve(root, source.path);
    if (!absolute.startsWith(root + path.sep) || !Number.isInteger(source.line) || source.line < 1) throw new Error(`CATALOGUE_SOURCE_INVALID:${entry.id}`);
    const bytes = read(source.path);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error(`CATALOGUE_SOURCE_DRIFT:${source.path}`);
    if (source.line > bytes.toString('utf8').split('\n').length) throw new Error(`CATALOGUE_LINE_INVALID:${source.path}`);
  }
  for (const identity of [...(entry.observedIdentities ?? []), ...(entry.declaredOnlyIdentities ?? [])]) {
    if (!Number.isInteger(identity.source.line) || identity.source.line < 1 || identity.source.line > read(identity.source.path).toString('utf8').split('\n').length) throw new Error(`CATALOGUE_IDENTITY_LINE_INVALID:${entry.id}`);
    if (identity.messageExpression != null && typeof identity.messageExpression !== 'string') throw new Error(`CATALOGUE_IDENTITY_MESSAGE_INVALID:${entry.id}`);
  }
}
const outputs = new Map();
const hub = metadata('Common error catalogue');
hub.push('Use the exact code, constructor or message text to search this catalogue. Start with the first owning boundary, not the last wrapper error.', '', prose(data.scope), '', '## Choose the owning component', '', '| Component | Diagnostic families |', '| --- | --- |');
for (const section of data.sections) hub.push(`| [${section.title}](common-errors-${section.id}.md) | ${data.entries.filter(e => e.section === section.id).length} |`);
hub.push('', '## Use a diagnostic safely', '', '1. Preserve the first diagnostic, cause chain, target and run/attempt identity. Remove credentials before sharing evidence.', '2. Check the representation: an exception message, typed code, returned reason, HTTP status and process exit are different fields. A control outcome is not necessarily a failure.', '3. Read the trigger and effect together. A timeout or failed acknowledgement does not prove that the external action did not occur.', '4. Follow the owning retry and reconciliation rule. Do not bypass trust, claims, replay protection or unresolved cleanup to clear an error.', '', '## Scope and maintenance', '', prose(data.sourceLinks), '', 'Source examples are representative construction sites, not an exhaustive vocabulary or evidence that an operation ran. Dependency messages and data-dependent suffixes can vary. Family counts describe this index, not acceptance criteria.', '', 'The catalogue data contains the maintained meaning and source bindings. Run `node scripts/docs-common-error-catalogue.mjs` to render it and `node scripts/docs-common-error-catalogue.mjs --check` to check output and declared source drift. A source change requires checking its actual meaning before updating a binding.', '', 'For existing detailed procedures, use [diagnostic routing](errors.md), [configuration errors](configuration-errors.md), [Buster error codes](buster-error-codes.md), and [diagnosis](../use/diagnose.md).', '', '<!-- END GENERATED: common error catalogue -->', '');
outputs.set('docs/site/reference/common-errors.md', hub.join('\n'));
for (const section of data.sections) {
  const entries = data.entries.filter(e => e.section === section.id);
  const lines = metadata(section.title + ' — error catalogue');
  lines.push('[All component families](common-errors.md) · [Diagnostic routing](errors.md)', '', 'Search for the exact diagnostic or constructor. Each entry distinguishes its identity from effects and recovery; source links are representative, not a complete call graph.', '', '## Families', '');
  const anchors = new Set();
  for (const e of entries) { const id = anchor(e.id); if (anchors.has(id)) throw new Error(`CATALOGUE_ANCHOR_COLLISION:${id}`); anchors.add(id); lines.push(`- [${prose(e.title)}](#${id})`); }
  for (const e of entries) {
    lines.push('', `<a id="${anchor(e.id)}"></a>`, '', `## ${prose(e.title)}`, '', `**Representation:** ${prose(e.kind)}`, '', `**Identity / construction:** ${prose(e.identity)}`);
    for (const [key, label] of [['trigger','Trigger'], ['effect','Effect'], ['retry','Retry boundary'], ['safeAction','Safe next action'], ['retainedData','Retained evidence'], ['consumer','Consumer / translation']]) lines.push('', `**${label}:** ${prose(e[key])}`);
    if (e.observedIdentities?.length) {
      lines.push('', '### Find a specific diagnostic', '', 'A message and a code are different fields. Values below come from owning source constructions, not a closed dependency vocabulary. Source substitutions remain symbolic; use the family handling rules above.', '', '| Field | Diagnostic | Message pattern / condition | Owning source |', '| --- | --- | --- | --- |');
      for (const identity of e.observedIdentities) {
        const source = identity.source;
        lines.push(`| ${literalCell(identity.carrier)} | ${literalCell(identity.identity)} | ${identity.messageExpression ? literalCell(identity.messageExpression) : 'Use the family construction rule above.'}${identity.identityRule ? '<br>' + prose(identity.identityRule) : ''} | [${source.path}:${source.line}](../../../${source.path}#L${source.line}) |`);
      }
    }
    if (e.declaredOnlyIdentities?.length) {
      lines.push('', '**Declared vocabulary without an identified own construction:**');
      for (const identity of e.declaredOnlyIdentities) lines.push('', `${literalCell(identity.identity)} — ${prose(identity.identityRule)}`);
    }
    if (e.diagnostics?.length) {
      lines.push('', '### Render diagnostics and guards', '', 'Each expression shows the diagnostic text and value argument. Enclosing controls constrain when it runs; helper calls retain their supplied context.');
      for (const diagnostic of e.diagnostics) {
        lines.push('', `**Template line ${diagnostic.line}:**`, '', fence(diagnostic.expression));
        if (diagnostic.guards.length) { lines.push('', '**Enclosing controls:**'); for (const guard of diagnostic.guards) lines.push('', fence(guard)); }
      }
    }
    if (e.examples?.length) { lines.push('', '**Representative source constructions (not executed by this reference):**'); for (const example of e.examples) lines.push('', fence(example)); }
    lines.push('', '**Owning / consuming source:**', '');
    for (const s of e.sources) lines.push(`- [${s.path}:${s.line}](../../../${s.path}${s.path.endsWith('.md') ? '' : '#L' + s.line})`);
  }
  lines.push('', '<!-- END GENERATED: common error catalogue -->', '');
  outputs.set(`docs/site/reference/common-errors-${section.id}.md`, lines.join('\n'));
}
for (const [name, content] of outputs) {
  if (check) { if (!fs.existsSync(path.join(root, name)) || read(name).toString('utf8') !== content) throw new Error(`CATALOGUE_OUTPUT_DRIFT:${name}`); }
  else fs.writeFileSync(path.join(root, name), content);
}
console.log(JSON.stringify({ check, families: data.entries.length, pages: outputs.size, sourceBindingsChecked: true }));
