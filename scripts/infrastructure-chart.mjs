import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { downloadInfrastructureOciChart } from './infrastructure-oci-chart.mjs';
import { validateInfrastructureChartLock } from './infrastructure-chart-lock.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const maximumBytes = 32 * 1024 * 1024;

export function infrastructureChart(name) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
  const lock = manifest.infrastructureCharts?.[name];
  return validateInfrastructureChartLock(lock);
}


export function verifyInfrastructureChart(name, file) {
  const lock = infrastructureChart(name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size < 1 || stat.size > maximumBytes) throw new Error('INFRASTRUCTURE_CHART_FILE_INVALID');
  const digest = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (digest !== lock.sha256) throw new Error('INFRASTRUCTURE_CHART_DIGEST_MISMATCH');
  // A version tag alone is insufficient: the checked archive also includes its
  // exact packaged dependencies. Never run helm dependency update at deployment.
  const metadata = load(execFileSync('tar', ['-xOf', file, `${lock.name}/Chart.yaml`], { encoding: 'utf8', maxBuffer: maximumBytes }));
  if (metadata.name !== lock.name || metadata.version !== lock.version) throw new Error('INFRASTRUCTURE_CHART_IDENTITY_MISMATCH');
  if (lock.appVersion !== undefined && metadata.appVersion !== lock.appVersion) throw new Error('INFRASTRUCTURE_CHART_APP_VERSION_MISMATCH');
  return { name: lock.name, version: lock.version, appVersion: metadata.appVersion, sha256: digest };
}

export function stageInfrastructureChart(name) {
  const lock = infrastructureChart(name);
  const cache = path.join(os.tmpdir(), `kubeclaw-infrastructure-charts-${process.getuid()}`);
  fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(cache);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    throw new Error('INFRASTRUCTURE_CHART_CACHE_NOT_PRIVATE');
  }
  const file = path.join(cache, `${lock.name}-${lock.version}-${lock.sha256}.tgz`);
  if (!fs.existsSync(file)) {
    const temporary = fs.mkdtempSync(path.join(cache, 'download-'));
    try {
      const download = path.join(temporary, 'chart.tgz');
      if (lock.url.startsWith('oci:')) downloadInfrastructureOciChart(lock.url, download);
      else execFileSync('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https',
        '--proto-redir', '=https', '--max-time', '180', '--max-filesize', String(maximumBytes),
        '--output', download, lock.url], { stdio: ['ignore', 'ignore', 'inherit'] });
      verifyInfrastructureChart(name, download);
      fs.renameSync(download, file);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  verifyInfrastructureChart(name, file);
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [name, file] = process.argv.slice(2);
  if (!name || process.argv.length > 4) throw new Error('Usage: infrastructure-chart.mjs NAME [ARCHIVE_TO_VERIFY]');
  console.log(file ? JSON.stringify(verifyInfrastructureChart(name, file)) : stageInfrastructureChart(name));
}
