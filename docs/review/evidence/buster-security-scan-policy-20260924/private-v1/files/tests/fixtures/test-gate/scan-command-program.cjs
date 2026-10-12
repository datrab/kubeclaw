const fs = require('node:fs');
const path = require('node:path');
const settings = JSON.parse(fs.readFileSync(fixture.control, 'utf8'));
const args = process.argv.slice(2);
const auth = process.env.DOCKER_CONFIG
  ? JSON.parse(fs.readFileSync(path.join(process.env.DOCKER_CONFIG, 'config.json'), 'utf8')) : null;
fs.appendFileSync(fixture.log, JSON.stringify({ pid: process.pid, args, auth,
  path: process.env.PATH, home: process.env.HOME, cache: process.env.TRIVY_CACHE_DIR }) + '\n');
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
