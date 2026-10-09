import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { markdownInlineLinks, markdownReferenceLinks } from '../lib/docs-markdown-anchors.mjs';

const sourceRoot = path.resolve(import.meta.dirname, '../..');

function write(root, relative, value) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function run(root) {
  return execFileSync('node', ['scripts/docs-check-refs.mjs'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

test('resolves full, collapsed, shortcut, and image reference links only from real definitions', () => {
  const links = markdownReferenceLinks([
    '[Full text][target] [Collapsed][] [Shortcut] ![Diagram][flow]',
    '',
    '[target]: full.md',
    '[collapsed]: collapsed.md "Optional title"',
    '[shortcut]: shortcut.md',
    '[flow]: flow.svg',
    '[multiline]:',
    '  multiline.md',
    '[Multiline][multiline]',
    '[zero-indent]:',
    'zero.md',
    '[Zero][zero-indent]',
    '- [list-definition]:',
    '  list.md',
    '- [List][list-definition]',
    '> [quote-definition]:',
    '> quote.md',
    '> [Quote][quote-definition]',
    '[angle-definition]: <angle.md>',
    '[Angle reference][angle-definition]',
    '',
    '```md',
    '[fenced]: missing-fenced.md',
    '```',
    '[fenced]',
    '',
    '> ```md',
    '> [quoted-code]: missing-quoted-code.md',
    '> ```',
    '[quoted-code]',
    '',
    '    [indented]: missing-indented.md',
    '[indented]',
    '',
    '<div>',
    '[raw]: missing-raw.md',
    '</div>',
    '',
    '[raw]',
    '',
  ].join('\n'));
  assert.deepEqual(links.map(({ destination, image }) => [destination, image]), [
    ['full.md', false],
    ['collapsed.md', false],
    ['shortcut.md', false],
    ['flow.svg', true],
    ['multiline.md', false],
    ['zero.md', false],
    ['list.md', false],
    ['quote.md', false],
    ['angle.md', false],
  ]);
});

test('parses balanced inline destinations without accepting a decoy prefix', () => {
  assert.deepEqual(markdownInlineLinks([
    '[Guide](guide_(v2).md)',
    '[Missing](exists(missing).md)',
    '\\[schema\\](?:not-a-link)',
    '<span title="[not-a-link](missing.md) [ref][bad]">x</span>',
    '[bad]: missing-ref.md',
    '[Angle](<missing-angle.md>)',
  ].join('\n')).map((link) => link.destination),
  ['guide_(v2).md', 'exists(missing).md', '<missing-angle.md>']);
});

test('docs-check-refs validates reference destinations and their fragments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-doc-refs-'));
  write(root, 'scripts/docs-check-refs.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/docs-check-refs.mjs'), 'utf8'));
  write(root, 'scripts/lib/docs-markdown-anchors.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/lib/docs-markdown-anchors.mjs'), 'utf8'));
  write(root, 'package.json', '{}\n');
  fs.symlinkSync(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  fs.symlinkSync('/etc/passwd', path.join(root, 'outside-link'));
  write(root, 'docs/site/index.md', [
    '[Full][full] [Collapsed][] [Shortcut] ![Diagram][diagram]',
    '',
    '[full]: missing-full.md',
    '[collapsed]: missing-collapsed.md',
    '[shortcut]: missing-shortcut.md#expected-section',
    '[diagram]: missing-image.svg',
    '[multiline]:',
    '  missing-multiline.md',
    '[Multiline][multiline]',
    '[Absolute](/etc/passwd)',
    '[Escape](../../../outside.md)',
    '[Balanced](exists(missing).md)',
    '[Escaped](guide_\\(v2\\).md)',
    '[Symlink](../../outside-link)',
    '[Broken fragment](fragment.md#real#missing)',
    '[Angle inline](<missing-angle-inline.md>)',
    '[angle-ref]: <missing-angle-reference.md>',
    '[Angle reference][angle-ref]',
    '',
    '```md',
    '[code-only]: missing-code.md',
    '```',
    '[code-only]',
    '',
    '<div>',
    '[html-only]: missing-html.md',
    '</div>',
    '',
    '[html-only]',
    '',
  ].join('\n'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Docs Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'docs-test@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });

  assert.throws(() => run(root), (error) => {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    return ['missing-full.md', 'missing-collapsed.md', 'missing-shortcut.md', 'missing-image.svg',
      'missing-multiline.md', 'absolute local path', 'outside the repository', 'exists(missing).md',
      'symbolic link', 'real#missing', 'missing-angle-inline.md', 'missing-angle-reference.md']
      .every((name) => output.includes(name))
      && !output.includes('missing-code.md') && !output.includes('missing-html.md');
  });

  write(root, 'docs/site/missing-full.md', '# Full\n');
  write(root, 'docs/site/missing-collapsed.md', '# Collapsed\n');
  write(root, 'docs/site/missing-shortcut.md', 'Expected section\n================\n');
  write(root, 'docs/site/missing-image.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(root, 'docs/site/missing-multiline.md', '# Multiline\n');
  write(root, 'docs/site/exists(missing).md', '# Balanced\n');
  write(root, 'docs/site/guide_(v2).md', '# Escaped\n');
  write(root, 'docs/site/fragment.md', '# Real\n');
  write(root, 'docs/site/missing-angle-inline.md', '# Inline angle\n');
  write(root, 'docs/site/missing-angle-reference.md', '# Reference angle\n');
  const indexPath = path.join(root, 'docs/site/index.md');
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8')
    .replace('[Absolute](/etc/passwd)\n', '').replace('[Escape](../../../outside.md)\n', '')
    .replace('[Symlink](../../outside-link)\n', '').replace('#real#missing', '#real'));
  assert.match(run(root), /docs reference check passed/u);
});

test('docs-check-refs starts and validates in a SHA-256 Git repository', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-doc-refs-sha256-'));
  try { execFileSync('git', ['init', '-q', '--object-format=sha256'], { cwd: root }); }
  catch {
    context.diagnostic('Git does not support SHA-256 repositories; fixture skipped');
    return;
  }
  write(root, 'scripts/docs-check-refs.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/docs-check-refs.mjs'), 'utf8'));
  write(root, 'scripts/lib/docs-markdown-anchors.mjs', fs.readFileSync(
    path.join(sourceRoot, 'scripts/lib/docs-markdown-anchors.mjs'), 'utf8'));
  write(root, 'package.json', '{}\n');
  write(root, 'docs/site/index.md', '# SHA-256 fixture\n');
  fs.symlinkSync(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  execFileSync('git', ['config', 'user.name', 'Docs Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'docs-test@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  assert.match(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }), /^[0-9a-f]{64}\n$/u);
  assert.match(run(root), /docs reference check passed/u);
});
