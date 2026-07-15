import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSubprocessEnv, resolveScopedPath, tokenizeCommandString, validateAllowedPath } from '../../../../skills/common/pipeline/security.ts';

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

test('subprocess env preserves Kubernetes in-cluster coordinates', () => {
  const env = buildSubprocessEnv({}, {
    sourceEnv: {
      PATH: '/usr/bin',
      KUBERNETES_SERVICE_HOST: '10.43.0.1',
      KUBERNETES_SERVICE_PORT: '443',
      KUBERNETES_SERVICE_PORT_HTTPS: '443',
      KUBERNETES_PORT: 'tcp://10.43.0.1:443',
      KUBERNETES_PORT_443_TCP: 'tcp://10.43.0.1:443',
      KUBERNETES_PORT_443_TCP_ADDR: '10.43.0.1',
      KUBERNETES_PORT_443_TCP_PORT: '443',
      KUBERNETES_PORT_443_TCP_PROTO: 'tcp',
    },
  });

  assert.equal(env.KUBERNETES_SERVICE_HOST, '10.43.0.1');
  assert.equal(env.KUBERNETES_SERVICE_PORT, '443');
  assert.equal(env.KUBERNETES_PORT_443_TCP_ADDR, '10.43.0.1');
});

test('tokenizeCommandString accepts direct argv arrays without shell parsing', () => {
  const command = ['node', '-e', 'console.error("expected"); process.exit(1)'];

  assert.deepEqual(tokenizeCommandString(command, 'unit.test_cmd'), command);
  assert.throws(
    () => tokenizeCommandString(['node', ''], 'unit.test_cmd'),
    /argv entry must be a non-empty string/,
  );
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
