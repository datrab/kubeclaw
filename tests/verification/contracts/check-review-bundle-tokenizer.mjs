import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const archive = process.argv[2];
if (!archive) throw new Error('NOVA_BUNDLE_ARCHIVE_REQUIRED');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bundle-tokenizer-'));
try {
  execFileSync('tar', ['-xzf', path.resolve(archive), '-C', temporary]);
  const roots = fs.readdirSync(temporary);
  assert.equal(roots.length, 1);
  const skills = path.join(temporary, roots[0], 'skills');
  // Resolve from each real consumer; the bundle intentionally preserves nested versions.
  const reviewRequire = createRequire(path.join(skills, 'plugins/review/package.json'));
  const runtimeRequire = createRequire(path.join(skills, 'plugins/runtime-dispatch/package.json'));
  for (const resolved of [reviewRequire.resolve('js-tiktoken'), runtimeRequire.resolve('tiktoken/tiktoken_bg.wasm')]) {
    const relative = path.relative(fs.realpathSync(temporary), fs.realpathSync(resolved));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative),
      'tokenizer dependencies must resolve inside the extracted bundle, not the host');
  }
  assert.ok(fs.existsSync(runtimeRequire.resolve('tiktoken/tiktoken_bg.wasm')),
    'the privileged runtime adapter still owns its native tokenizer dependency');
  const { countReviewTextTokens } = await import(pathToFileURL(path.join(skills, 'plugins/review/src/review-prompt-budget.ts')).href);
  for (const encoding of ['o200k_base', 'cl100k_base']) {
    assert.equal(countReviewTextTokens('hello world', encoding), 2);
    assert.throws(() => countReviewTextTokens('<|endoftext|>', encoding));
  }
  console.log(JSON.stringify({ ok: true, boundary: 'assembled-nova-bundle', tokenizer: 'js-tiktoken' }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
