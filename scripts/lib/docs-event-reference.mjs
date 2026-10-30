/** Exact syntax is data, never Markdown markup or an evaluated runtime value. */
const literal = (value) => `<code>${String(value).replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;')
  .replaceAll('\r', '&#13;').replaceAll('\n', '&#10;')
  .replace(/[\\`*_\[\]]/gu, (character) => `&#${character.codePointAt(0)};`)}</code>`;
// A complete standalone source snippet is code, not prose. Keep source bytes
// visible without evaluating them or weakening the unchanged language checker.
const sourceBlock = (value) => {
  const text = String(value);
  const runs = [...text.matchAll(/`+/gu)].map((match) => match[0].length);
  const fence = '`'.repeat(Math.max(3, ...runs.map((length) => length + 1)));
  return `${fence}text\n${text}\n${fence}`;
};
const prose = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('|', '&#124;').replaceAll('\n', ' ')
  .replace(/[\\`*_\[\]]/gu, '\\$&');
const sourceLink = (file, line = 1) => {
  const encoded = file.split('/').map((part) => encodeURIComponent(part)
    .replace(/[!'()*]/gu, (character) => `%${character.codePointAt(0).toString(16).toUpperCase()}`)).join('/');
  return `[${literal(file)}:${line}](../../../${encoded}#L${line})`;
};
const anchor = (source) => `${sourceLink(source.path, source.line)} (SHA-256 ${literal(source.sourceSha256)})`;
const roles = new Set(['producer', 'transformer', 'validator', 'consumer', 'declaration',
  'retained', 'upstream', 'diagnostic', 'supporting-record']);

/** Every schema keyword/value survives, including unknown vocabularies. JSON
 * Pointer scope retains required/conditional/ref semantics without inventing
 * unconditional field requirements or recursively expanding reference cycles. */
export function schemaKeywordRows(document) {
  const rows = [];
  const visit = (value, pointer) => {
    if (value === null || typeof value !== 'object') {
      rows.push({ pointer, value: JSON.stringify(value) });
      return;
    }
    const entries = Object.entries(value);
    rows.push({ pointer, value: Array.isArray(value) ? `array (${entries.length} entries)` : `object (${entries.length} entries)` });
    for (const [key, child] of entries) visit(child, `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`);
  };
  visit(document, '');
  return rows;
}

export function renderEventReference(inventory) {
  if (inventory.schemaVersion !== 'event-contract-reference.v1') throw new Error('EVENT_REFERENCE_VERSION_UNSUPPORTED');
  const families = [...inventory.families].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(families.map((entry) => entry.id)).size !== families.length) throw new Error('EVENT_REFERENCE_DUPLICATE_FAMILY');
  const lines = ['<!-- BEGIN GENERATED EVENT CONTRACT REFERENCE -->',
    '## Generated source contract reference', '',
    'Source contracts and configured paths do not prove live delivery. Declaration, construction, validation and consumption are separate facts.', '',
    `Primary executable/delivered Source vector SHA-256: ${literal(inventory.sourceSetSha256)}.`, ''];
  if (inventory.combinedSourceVectorSha256) lines.push(`Combined primary and supplementary authority vector SHA-256: ${literal(inventory.combinedSourceVectorSha256)}.`, '');
  for (const input of inventory.supportingSourceVector ?? []) lines.push(`Supplementary authority ${sourceLink(input.path)} — SHA-256 ${literal(input.sha256)}.`, '');
  if (inventory.activation?.observers.length) {
    lines.push('### Delivered observer registrations', '', prose(inventory.activation.meaning), '',
      '| Plugin / registration | Delivered roles | Module / export | Exact subscriptions | Policy | Source |', '| --- | --- | --- | --- | --- | --- |');
    for (const entry of inventory.activation.observers) {
      const registration = entry.registration;
      lines.push(`| ${literal(entry.pluginId + '/' + registration.id)} | ${literal(JSON.stringify(entry.deliveredRoles))} | ${literal(entry.modulePath)} / ${literal(registration.export)} | ${literal(JSON.stringify(registration.subscriptions))} | ${literal(JSON.stringify({ delivery: registration.delivery, ordering: registration.ordering, failurePolicy: registration.failurePolicy, requiredCapabilities: registration.requiredCapabilities, checkpointSchema: registration.checkpointSchema }))} | ${literal(entry.path)}; SHA-256 ${literal(entry.sourceSha256)} |`);
    }
    lines.push('', '### Delivered adapter declarations', '',
      'These declarations do not select a live provider. The source-bound activation and capability-invocation roles below retain that condition.', '',
      '| Plugin / registration | Delivered roles | Module / export | Exact declared capability/activation record | Source |', '| --- | --- | --- | --- | --- |');
    for (const entry of inventory.activation.adapters) lines.push(`| ${literal(entry.pluginId + '/' + entry.registration.id)} | ${literal(JSON.stringify(entry.deliveredRoles))} | ${literal(entry.modulePath)} / ${literal(entry.registration.export)} | ${literal(JSON.stringify(entry.registration))} | ${literal(entry.path)}; SHA-256 ${literal(entry.sourceSha256)} |`);
    lines.push('');
  }
  for (const family of families) {
    lines.push(`### ${prose(family.id)}`, '', prose(family.boundary), '',
      `Version/discriminator (exact source syntax): ${family.version === null ? 'No common version asserted for this mechanism; inspect its record-specific declarations and constructions.' : literal(family.version)}`, '',
      '| Role | Exact source | Qualification / condition |', '| --- | --- | --- |');
    for (const role of family.roles) {
      if (!roles.has(role.role)) throw new Error(`EVENT_REFERENCE_UNKNOWN_ROLE:${role.role}`);
      lines.push(`| ${prose(role.role)} | ${anchor(role.source)} | ${prose(role.condition)} |`);
    }
    for (const declaration of family.declarations ?? []) {
      lines.push('', `**Declared payload ${literal(declaration.name)}** — ${anchor(declaration.source)}`, '',
        '| Member | Presence | Exact declared type / syntax |', '| --- | --- | --- |');
      for (const heritage of declaration.heritage ?? []) lines.push(`| (heritage) | Follow dependent declaration below | ${literal(heritage)} |`);
      for (const parameter of declaration.typeParameters ?? []) lines.push(`| (type parameter) | Declared parameter / constraint | ${literal(parameter)} |`);
      if (declaration.type) lines.push(`| (type alias) | See exact expression | ${literal(declaration.type.expression)} |`);
      for (const member of declaration.members) lines.push(`| ${literal(member.name ?? member.syntax)} | ${member.optional ? 'Optional' : 'No optional marker'} | ${literal(member.type?.expression ?? member.expression)} |`);
    }
    for (const value of family.typeValues ?? []) lines.push('',
      `**Referenced initializer ${literal(value.name)}** — ${anchor(value.source)}`, '',
      sourceBlock(value.expression), '', 'This is source initializer syntax, not evaluated runtime data.');
    for (const call of family.selectedCalls ?? []) {
      lines.push('', `**${prose(call.role)} call ${literal(call.expression)}** — ${anchor(call.source)}`, '',
        prose(call.condition), '', '| Argument index | Exact expression |', '| --- | --- |');
      call.arguments.forEach((argument, index) => lines.push(`| ${index} | ${literal(argument)} |`));
    }
    for (const declaration of family.goDeclarations ?? []) lines.push('',
      `**Go construction / callback declaration** — ${anchor(declaration.source)}`, '',
      sourceBlock(declaration.expression), '', prose(declaration.meaning));
    for (const script of family.embeddedScripts ?? []) {
      lines.push('', `**Embedded browser source** — ${anchor(script.origin)}`, '',
        prose(script.coordinateMeaning), '');
      for (const object of script.objects) {
        lines.push(`Cooked-script span ${object.source.scriptStart}–${object.source.scriptEnd}; construction candidate, not automatically an event.`, '',
          '| Field / spread | Exact expression |', '| --- | --- |');
        for (const field of object.fields) lines.push(`| ${literal(field.name ?? field.kind)} | ${literal(field.expression)} |`);
        lines.push('');
      }
    }
    for (const constructor of family.constructors ?? []) {
      lines.push('', `**Object construction candidate (not automatically an emitted event)** — ${anchor(constructor.source)}`, '',
        '| Field / spread | Exact expression (not evaluated data) |', '| --- | --- |');
      for (const field of constructor.fields) lines.push(`| ${literal(field.name ?? field.kind)} | ${literal(field.expression)} |`);
    }
    for (const schema of family.schemas ?? []) {
      lines.push('', `**Schema ${sourceLink(schema.path)}** — SHA-256 ${literal(schema.sha256)}`, '',
        'Pointers retain their original schema scope. A required list in one conditional branch is not a universal requirement. Reference targets remain separate definitions.', '',
        '| JSON Pointer | Exact value / container |', '| --- | --- |');
      for (const row of schemaKeywordRows(schema.document)) lines.push(`| ${literal(row.pointer)} | ${literal(row.value)} |`);
    }
    for (const limit of family.limits) lines.push('', `Boundary: ${prose(limit)}`);
    lines.push('');
  }
  lines.push('<!-- END GENERATED EVENT CONTRACT REFERENCE -->', '');
  return lines.join('\n');
}

export function replaceEventReference(page, generated) {
  const start = '<!-- BEGIN GENERATED EVENT CONTRACT REFERENCE -->';
  const end = '<!-- END GENERATED EVENT CONTRACT REFERENCE -->';
  const a = page.indexOf(start); const b = page.indexOf(end);
  if (a < 0 && b < 0) return `${page.trimEnd()}\n\n${generated}`;
  if (a < 0 || b < a || page.indexOf(start, a + start.length) >= 0 || page.indexOf(end, b + end.length) >= 0) throw new Error('EVENT_REFERENCE_MARKERS_INVALID');
  return page.slice(0, a) + generated.trimEnd() + page.slice(b + end.length);
}
