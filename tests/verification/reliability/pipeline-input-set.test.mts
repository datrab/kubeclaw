import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { hashPipelineInputSet, capturePipelineInputSet } from '../../../skills/common/plugin-runtime/foundation/config/pipeline-input-set.ts';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const member = (relativePath: string, bytes: Buffer) => ({ relativePath, byteLength: bytes.byteLength, sha256: hash(bytes) });
function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-input-set-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'config'));
  const data = Buffer.from('original raw source\n'), empty = Buffer.alloc(0);
  fs.writeFileSync(path.join(root, 'config/a.json'), data); fs.writeFileSync(path.join(root, 'config/empty'), empty);
  const members = [member('config/a.json', data), member('config/empty', empty)];
  return { root, data, members };
}

test('exact approved 376-member inherited v9 input codec, including raw paths/sizes/digests, is conserved', () => {
  const original = JSON.parse(fs.readFileSync(new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/same-entry-agent-role-binding-01/file-set-stand.json', import.meta.url), 'utf8'));
  assert.equal(original.inputMembers.length, 376);
  assert.equal(hashPipelineInputSet(original.inputMembers), original.inputGenerationSha256);
  assert.equal(hashPipelineInputSet([...original.inputMembers].reverse()), original.inputGenerationSha256);
  const mutated = structuredClone(original.inputMembers); mutated[0].byteLength++;
  assert.notEqual(hashPipelineInputSet(mutated), original.inputGenerationSha256);
  // Metadata vector conservation only; public rows are not installed/authentic
  // host/source/grant receipts, nor whole v10 semantic acceptance.
});

test('input codec denies duplicate, escaping, alias and invalid-size/digest descriptors', () => {
  const row = member('config/a', Buffer.from('a'));
  for (const relativePath of ['', '/etc/passwd', '../a', 'config/../a', 'config//a', './a', 'config\\a', 'config/\u0000a', 'config/\ud800']) {
    assert.throws(() => hashPipelineInputSet([{ ...row, relativePath }]), /INPUT_MEMBER_INVALID/);
  }
  assert.throws(() => hashPipelineInputSet([row, { ...row }]), /INPUT_MEMBER_INVALID/);
  assert.throws(() => hashPipelineInputSet([{ ...row, byteLength: Number.MAX_SAFE_INTEGER+1 }]), /INPUT_MEMBER_INVALID/);
  assert.throws(() => hashPipelineInputSet([{ ...row, sha256: 'sha256:'+row.sha256 }]), /INPUT_MEMBER_INVALID/);
});

test('actual full declared input capture preserves exact bytes/empty inputs and immutable snapshots', t => {
  const { root, data, members } = fixture(t);
  const capture = capturePipelineInputSet(root, members); t.after(capture.close);
  assert.equal(capture.inputGenerationSha256, hashPipelineInputSet(members));
  assert.deepEqual(capture.read('config/a.json'), data);
  assert.equal(capture.read('config/empty').byteLength, 0);
  const copy = capture.read('config/a.json'); copy.fill(0);
  assert.deepEqual(capture.read('config/a.json'), data);
  members[0].sha256 = '0'.repeat(64);
  capture.assertCurrent();
  assert.throws(() => capture.read('not-admitted'), /INPUT_NOT_ADMITTED/);
  fs.appendFileSync(path.join(root, 'config/a.json'), 'changed');
  assert.throws(capture.assertCurrent, /INPUT_CHANGED/);
  capture.close(); capture.close();
  assert.throws(() => capture.read('config/a.json'), /CAPTURE_CLOSED/);
  assert.throws(capture.assertCurrent, /CAPTURE_CLOSED/);
});

test('missing, wrong-digest, replaced and symlinked physical inputs deny without repair', t => {
  const { root, data, members } = fixture(t), file = path.join(root, 'config/a.json');
  assert.throws(() => capturePipelineInputSet(root, [member('config/missing', data)]), { code: 'ENOENT' });
  assert.throws(() => capturePipelineInputSet(root, [{ ...members[0], sha256: '0'.repeat(64) }]), /DIGEST_MISMATCH/);
  const capture = capturePipelineInputSet(root, members); t.after(capture.close);
  fs.renameSync(file, `${file}.original`); fs.writeFileSync(file, data);
  assert.throws(capture.assertCurrent, /INPUT_CHANGED/);
  fs.unlinkSync(file); fs.symlinkSync(`${file}.original`, file);
  assert.throws(() => capturePipelineInputSet(root, members), { code: 'ELOOP' });
  assert.deepEqual(fs.readFileSync(`${file}.original`), data, 'no deletion/adoption of retained originals');
  fs.renameSync(path.join(root, 'config'), path.join(root, 'old-config'));
  fs.symlinkSync('old-config', path.join(root, 'config'));
  assert.throws(() => capturePipelineInputSet(root, members));
});
