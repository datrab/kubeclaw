import assert from 'node:assert/strict';

// Corrected-meaning links never relabel immutable historical fact links.
export function semanticEvidenceLinks(context, sources) {
  if (!context || !sources?.length) return '';
  assert.match(context.revision, /^[a-f0-9]{40}$/u);
  return sources.flatMap(source => {
    const input = context.inputs.find(input => input.path === source.path);
    assert(input && input.revision === context.revision, 'RETAINED_MEANING_SOURCE_NOT_AUTHENTICATED');
    const end = source.endLine ?? source.line;
    assert(Number.isSafeInteger(source.line) && source.line >= 1
      && Number.isSafeInteger(end) && end >= source.line && end <= input.lines,
    'RETAINED_MEANING_SOURCE_RANGE_INVALID');
    const links = [];
    for (let line = source.line; line <= end; line += 60) {
      const last = Math.min(end, line + 59);
      links.push('[`' + source.path + ':' + line + '-' + last + '`](https://github.com/datrab/kubeclaw/blob/'
        + context.revision + '/' + source.path + '#L' + line + '-L' + last + ')');
    }
    return links;
  }).join('<br>');
}

export function retainedSemanticNotice(context) {
  assert.match(context.revision, /^[a-f0-9]{40}$/u);
  return `> Corrected meanings are a finite source-bound semantic view at \`${context.revision}\`. Links labeled “Current meaning evidence” support those explanations only. Selected values, original source coordinates, producer observations and qualification states remain historical. This is not current discovery, a live runtime result or renewed producer/API qualification.\n\n`;
}
