import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { collectDocumentationDiagrams, validateDiagramSvg } from '../docs-reader/diagrams.mjs';

const source = 'flowchart LR\n A[Input] --> B[Result]\n';
const page = { relative: 'README.md', text: '# Page\n\nOwner: documentation\n\n```mermaid\n' + source + '```\n\nText version: input reaches result.\n' };
const entry = { id: 'diagram-1234567890abcdef', page: 'README.md', index: 0, readerQuestion: 'How does input reach the result?', owner: 'documentation', sourceSha256: crypto.createHash('sha256').update(source).digest('hex') };
const registry = diagrams => ({ schemaVersion: 'kubeclaw-documentation-diagrams.v1', diagrams });

test('diagram discovery binds each selected source to an explicit reader question, owner and source bytes', () => {
  const found = collectDocumentationDiagrams([page], registry([entry]));
  assert.equal(found.length, 1); assert.equal(found[0].code, source);
  for (const invalid of [registry([]), registry([entry, entry]), registry([{ ...entry, owner: 'different owner' }]), registry([{ ...entry, sourceSha256: '0'.repeat(64) }]), registry([{ ...entry, readerQuestion: '' }])]) assert.throws(() => collectDocumentationDiagrams([page], invalid));
  assert.throws(() => collectDocumentationDiagrams([], registry([entry])));
  assert.throws(() => collectDocumentationDiagrams([{ ...page, text: page.text.replace('Text version: input reaches result.', 'No text explanation is present.') }], registry([entry])));
  const example = { relative: 'example.md', text: '# Example\n\nOwner: documentation\n\n````md\n```mermaid\nnot a live diagram\n```\n````\n' };
  assert.equal(collectDocumentationDiagrams([example], registry([])).length, 0);
});

test('static SVG validation rejects active markup, external resources and broken actual presentation references', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><defs><marker id="arrow"><path d="M0 0L2 1"/></marker></defs><path marker-end="url(#arrow)" d="M0 0L20 20"/><text x="10" y="20">Input to result</text></svg>';
  assert.deepEqual(validateDiagramSvg(svg), { width: 400, height: 200 });
  for (const invalid of [svg.replace('</svg>', '<script>alert(1)</script></svg>'), svg.replace('</svg>', '<foreignObject>HTML</foreignObject></svg>'), svg.replace('<text ', '<text onload="alert(1)" '), svg.replace('url(#arrow)', 'url(https://example.test/data)'), svg.replace('url(#arrow)', 'url(#absent)'), svg.replace('<text ', '<text style="fill:url(https://example.test/data)" '), svg.replace('viewBox="0 0 400 200"', 'viewBox="0 0 0 0"'), svg.replace('</svg>', '<path id="arrow"/></svg>')]) assert.throws(() => validateDiagramSvg(invalid));
});
