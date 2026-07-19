import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildAndPushImage } from '../../../../../skills/buster/pipeline/services/buildkit.ts';

test('BuildKit publishes once and returns immutable digest authority', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildkit-unit-'));
  const dockerfile = path.join(dir, 'Dockerfile');
  fs.writeFileSync(dockerfile, 'FROM docker.io/library/alpine:3.20\n');
  try {
    const result = await buildAndPushImage({
      dockerfile,
      contextDir: dir,
      image: 'registry.local:5001/team/app:run-1',
      timeoutMs: 1000,
      execFileAsync: async (_command, args) => {
        const metadataPath = args[args.indexOf('--metadata-file') + 1];
        fs.writeFileSync(metadataPath, JSON.stringify({ 'containerimage.digest': `sha256:${'a'.repeat(64)}` }));
        assert.ok(args.includes('type=image,name=registry.local:5001/team/app:run-1,push=true,registry.insecure=true'));
        return { stdout: 'built', stderr: '' };
      },
    });
    assert.equal(result.immutableImage, `registry.local:5001/team/app@sha256:${'a'.repeat(64)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
