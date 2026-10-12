import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { definitions, installDatabases, fileIdentity } from '../trivy-database-lock.mjs';

test('TD12: actual pinned databases install and the actual pinned scanner finds a vulnerable dependency offline', async t => {
  assert(process.env.TRIVY_NATIVE_EXECUTABLE, 'TRIVY_NATIVE_EXECUTABLE must name the actual selected scanner');
  assert(process.env.TRIVY_NATIVE_INPUTS, 'TRIVY_NATIVE_INPUTS must name the --resolve output directory');
  const scanner = path.resolve(process.env.TRIVY_NATIVE_EXECUTABLE);
  const inputs = path.resolve(process.env.TRIVY_NATIVE_INPUTS);
  const lock = JSON.parse(fs.readFileSync(new URL('../../docker/trivy-databases.lock.json', import.meta.url), 'utf8'));
  const version = execFileSync(scanner, ['--version'], { encoding: 'utf8' }).match(/^Version: (.+)$/mu)?.[1];
  assert.equal(version, lock.scannerVersion);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-lock-native-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, 'cache');
  // Transport is replaced by the actual downloaded OCI bytes. Production
  // manifest, archive, extraction and file integrity checks still run.
  await installDatabases(lock, cache, version, repository => {
    const kind = Object.keys(definitions).find(key => definitions[key].repository === repository);
    return (type, reference, output) => {
      if (type === 'manifests') {
        assert.equal(reference, lock.databases[kind].manifest.digest);
        return fs.readFileSync(path.join(inputs, `${kind}-manifest.json`));
      }
      assert.equal(type, 'blobs'); assert.equal(reference, lock.databases[kind].layer.digest);
      fs.copyFileSync(path.join(inputs, `${kind}.tar.gz`), output);
    };
  });
  const project = path.join(root, 'project'); fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'offline-vulnerability-probe', version: '1.0.0', dependencies: { lodash: '4.17.20' } }));
  fs.writeFileSync(path.join(project, 'package-lock.json'), JSON.stringify({ name: 'offline-vulnerability-probe', version: '1.0.0', lockfileVersion: 1,
    dependencies: { lodash: { version: '4.17.20', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz' } } }));
  const report = JSON.parse(execFileSync(scanner, ['fs', '--cache-dir', cache, '--scanners', 'vuln', '--format', 'json',
    '--skip-db-update', '--skip-java-db-update', '--offline-scan', '--skip-version-check', '--disable-telemetry', project],
  { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1', NO_PROXY: '' } }));
  const findings = (report.Results ?? []).flatMap(result => result.Vulnerabilities ?? []);
  assert(findings.some(finding => finding.PkgName === 'lodash' && finding.InstalledVersion === '4.17.20' && finding.VulnerabilityID),
    'real advisory lookup must return a vulnerability for the deliberately vulnerable fixture');
  for (const [kind, definition] of Object.entries(definitions)) {
    for (const [name, identity] of Object.entries(lock.databases[kind].files)) {
      assert.deepEqual(await fileIdentity(path.join(cache, definition.directory, name)), identity, 'scanner must not rewrite pinned inputs');
    }
  }
  console.log(JSON.stringify({ scannerVersion: version, findings: findings.map(({ VulnerabilityID, PkgName, InstalledVersion }) => ({ VulnerabilityID, PkgName, InstalledVersion })), databaseIdentities: lock.databases }));
});
