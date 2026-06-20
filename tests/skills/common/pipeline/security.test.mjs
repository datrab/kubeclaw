import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSubprocessEnv, resolveScopedPath, validateAllowedPath } from '../../../../skills/common/pipeline/security.ts';

test('subprocess env overrides must be explicitly allowlisted', () => {
  assert.throws(
    () => buildSubprocessEnv({ OPENAI_API_KEY: 'secret' }, { sourceEnv: {} }),
    /not allowlisted/,
  );

  const defaultEnv = buildSubprocessEnv(
    { GIT_EDITOR: 'true' },
    { sourceEnv: { PATH: '/usr/bin' } },
  );
  assert.equal(defaultEnv.GIT_EDITOR, 'true');

  const env = buildSubprocessEnv(
    {
      PATH: '/custom/bin',
      CUSTOM_SAFE_FLAG: 'enabled',
      HOME: null,
    },
    {
      sourceEnv: {
        PATH: '/usr/bin',
        HOME: '/home/test',
        OPENAI_API_KEY: 'source-secret',
      },
      allowlist: ['PATH', 'HOME', 'CUSTOM_SAFE_FLAG'],
    },
  );

  assert.deepEqual(env, {
    PATH: '/custom/bin',
    CUSTOM_SAFE_FLAG: 'enabled',
  });
});

test('scoped path helpers reject symlinks that escape the allowed directory', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'security-scope-'));
  const allowedDir = path.join(tempRoot, 'allowed');
  const outsideDir = path.join(tempRoot, 'outside');
  fs.mkdirSync(allowedDir);
  fs.mkdirSync(outsideDir);
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');
  fs.symlinkSync(outsideDir, path.join(allowedDir, 'link'));

  assert.throws(
    () => resolveScopedPath('link/secret.txt', { baseDir: allowedDir, scopeDir: allowedDir }),
    /escapes allowed scope/,
  );
  assert.throws(
    () => validateAllowedPath(path.join(allowedDir, 'link', 'secret.txt'), 'test.path', {
      allowedPrefixes: [allowedDir],
    }),
    /not in allowed prefixes/,
  );
  assert.throws(
    () => validateAllowedPath(path.join(allowedDir, 'link', 'new.txt'), 'test.writePath', {
      allowedPrefixes: [allowedDir],
    }),
    /not in allowed prefixes/,
  );
});
