exec((__import__('pathlib').Path(__file__).parent/'edit.py').read_text().split("write(C+'buster-security-scan.ts'")[0])
write('tests/fixtures/test-gate/scan-command-api.mjs', '''/** Actual executable, stdio and filesystem boundary; modeled Trivy JSON/DB bytes.
 * Original native Trivy and authentic advisory database tests remain separate. */
import fs from 'node:fs';
import path from 'node:path';

export function scanCommandApi(root) {
  const log = path.join(root, 'scan-commands.jsonl');
  const control = path.join(root, 'scan-control.json');
  const executable = path.join(root, 'trivy-local');
  const cache = path.join(root, 'cache');
  const source = fs.readFileSync(new URL('./scan-command-program.cjs', import.meta.url), 'utf8');
  fs.writeFileSync(executable, `#!${process.execPath}\\nconst fixture = ${JSON.stringify({ log, control })};\\n${source}`, { mode: 0o700, flag: 'wx' });
  const seed = (settings = {}) => fs.writeFileSync(control, JSON.stringify(settings));
  const databases = ({ ageMs = 1000, javaAgeMs = ageMs, bytes = 64, padding = 0 } = {}) => {
    for (const [directory, file, version, age] of [['db', 'trivy.db', 2, ageMs], ['java-db', 'trivy-java.db', 1, javaAgeMs]]) {
      const folder = path.join(cache, directory); fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, file), Buffer.alloc(bytes, version));
      fs.writeFileSync(path.join(folder, 'metadata.json'), JSON.stringify({ Version: version,
        UpdatedAt: new Date(Date.now() - age).toISOString(), NextUpdate: new Date(Date.now() + 86400000).toISOString(), padding: 'x'.repeat(padding) }));
    }
  };
  seed(); databases();
  return { executable, cache, seed, databases, calls: () => fs.existsSync(log)
    ? fs.readFileSync(log, 'utf8').trim().split('\\n').filter(Boolean).map(line => JSON.parse(line)) : [] };
}
''')
write('tests/fixtures/test-gate/scan-command-program.cjs', '''const fs = require('node:fs');
const path = require('node:path');
const settings = JSON.parse(fs.readFileSync(fixture.control, 'utf8'));
const args = process.argv.slice(2);
const auth = process.env.DOCKER_CONFIG
  ? JSON.parse(fs.readFileSync(path.join(process.env.DOCKER_CONFIG, 'config.json'), 'utf8')) : null;
fs.appendFileSync(fixture.log, JSON.stringify({ pid: process.pid, args, auth,
  path: process.env.PATH, home: process.env.HOME, cache: process.env.TRIVY_CACHE_DIR }) + '\\n');
if (settings.outputBytes) process.stdout.write('x'.repeat(settings.outputBytes));
else {
  const raw = 'finding'.repeat(1000);
  const result = { Target: args.at(-1), Vulnerabilities: [{ VulnerabilityID: 'CVE-2026-1', PkgName: 'fixture', Title: raw }],
    Misconfigurations: [{ ID: 'AVD-1', Title: raw, Message: raw, Resolution: raw }] };
  const output = JSON.stringify({ SchemaVersion: 2, Results: [result] });
  if (settings.helper) {
    const result = require('node:child_process').spawnSync('scanner-policy-helper', [], { encoding: 'utf8' });
    if (result.status !== 0 || result.stdout !== settings.helper) throw new Error('SELECTED_PATH_NOT_USED');
  }
  if (settings.delayMs) setTimeout(() => process.stdout.write(output), settings.delayMs);
  else process.stdout.write(output);
}
''')
