import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const requireReader = createRequire(new URL('../../scripts/docs-reader/renderer.mjs', import.meta.url));
const MarkdownIt = requireReader('markdown-it');

test('every native external-dependency registration renders in eight named columns', () => {
  const run = command => execFileSync(process.execPath,
    [path.join(root, 'scripts/docs-publication.mjs'), command],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const matrix = run('operator-matrix');
  const authority = JSON.parse(run('dependency-report'));
  const markdown = new MarkdownIt({ html: true });
  const tokens = markdown.parse(matrix, {});
  const heading = tokens.findIndex(token => token.type === 'inline'
    && token.content === 'Per-registration external dependency matrix');
  assert.notEqual(heading, -1);
  const tableStart = tokens.findIndex((token, index) => index > heading && token.type === 'table_open');
  assert.notEqual(tableStart, -1, 'the dependency matrix must be a table, not literal pipe prose');
  const tableEnd = tokens.findIndex((token, index) => index > tableStart && token.type === 'table_close');
  const table = tokens.slice(tableStart, tableEnd + 1);
  const headers = table.flatMap((token, index) => token.type === 'th_open' ? [table[index + 1].content] : []);
  assert.deepEqual(headers, ['Package registration', 'External service', 'Endpoint authority fields',
    'Capabilities', 'Secret-reference fields', 'Data owner', 'Reachability check', 'Failure effect']);
  const bodyStart = table.findIndex(token => token.type === 'tbody_open');
  assert.notEqual(bodyStart, -1);
  const rows = [];
  for (let index = bodyStart; index < table.length; index++) {
    if (table[index].type !== 'tr_open') continue;
    const cells = [];
    while (++index < table.length && table[index].type !== 'tr_close') {
      if (table[index].type === 'td_open') cells.push(table[index + 1]);
    }
    assert.equal(cells.length, 8, 'each registration retains all eight dependency relationships');
    for (const cell of cells) assert.ok(cell.content.trim(), 'no named dependency column may disappear');
    const registration = cells[0].children?.find(token => token.type === 'code_inline')?.content;
    assert.ok(registration, 'the first column must identify the registration');
    rows.push(registration);
  }
  assert.equal(new Set(rows).size, rows.length, 'registrations must not collapse or duplicate');
  assert.deepEqual(rows.sort(), authority.records.map(record => record.id).sort(),
    'rendering must preserve the complete native registration selection');
});
