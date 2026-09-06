import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const archive = process.argv[2];
if (!archive) throw new Error('NOVA_BUNDLE_ARCHIVE_REQUIRED');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bundle-tokenizer-'));
try {
  execFileSync('tar', ['-xzf', path.resolve(archive), '-C', temporary]);
  const roots = fs.readdirSync(temporary);
  assert.equal(roots.length, 1);
  const skills = path.join(temporary, roots[0], 'skills');
  assert.ok(fs.existsSync(path.join(skills, 'node_modules/tiktoken/tiktoken_bg.wasm')));
  const { countReviewTextTokens } = await import(pathToFileURL(path.join(skills, 'plugins/review/src/review-prompt-budget.ts')).href);
  for (const encoding of ['o200k_base', 'cl100k_base']) {
    assert.equal(countReviewTextTokens('hello world', encoding), 2);
    assert.throws(() => countReviewTextTokens('<|endoftext|>', encoding));
  }
  console.log(JSON.stringify({ ok: true, boundary: 'assembled-nova-bundle', tokenizer: 'wasm' }));
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
