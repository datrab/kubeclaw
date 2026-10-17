import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdownLinkTargets } from '../docs-check.mjs';

test('local link scan ignores fenced DNS syntax, code and comments but retains real links', () => {
  const source = [
    '[before](before.md)',
    '```bash',
    '[[ $name =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]',
    '[not a link](missing-backtick.md)',
    '```',
    '~~~text',
    '[not a link](missing-tilde.md)',
    '~~~',
    '<!-- [comment](missing-comment.md) -->',
    '`[inline](missing-inline.md)`',
    '[after](real-missing.md#heading)',
    String.raw`\[a-z\](?:not-a-link)`,
  ].join('\n');
  assert.deepEqual(markdownLinkTargets(source), ['before.md', 'real-missing.md#heading']);
});

test('an unclosed fence consumes remaining code, while its preceding real link is kept', () => {
  assert.deepEqual(markdownLinkTargets('[real](real.md)\n```bash\n[code](not-real.md)'), ['real.md']);
});
