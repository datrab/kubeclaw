import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const browsers = ['chromium', 'chromium-headless-shell', 'firefox', 'webkit', 'ffmpeg'];
const platforms = { amd64: 'debian12-x64', arm64: 'debian12-arm64' };
const maximumArchiveBytes = 1024 * 1024 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function browserMetadata(repository, architecture) {
  if (!platforms[architecture]) throw new Error('Unsupported browser architecture');
  const code = `const p=require('node:path');const c=require('./node_modules/playwright-core/lib/coreBundle.js');const pkg=require('./node_modules/playwright-core/package.json');console.log(JSON.stringify({version:pkg.version,archives:${JSON.stringify(browsers)}.map(name=>{const e=c.registry.registry.findExecutable(name);return {name,url:e.downloadURLs[0],directory:p.basename(e.directory),executable:p.relative(e.directory,e.executablePath())}})}));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: repository, encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: platforms[architecture], PLAYWRIGHT_BROWSERS_PATH: '/ms-playwright' } }));
}

function validateArchiveIdentity(entry) {
  if (Object.keys(entry).sort().join() !== 'directory,executable,name,sha256,size,url' || !/^https:\/\/cdn\.playwright\.dev\/[A-Za-z0-9._/-]+\.zip$/.test(entry.url) || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > maximumArchiveBytes || !/^[a-z_]+-\d+$/.test(entry.directory) || !/^[A-Za-z0-9._/-]+$/.test(entry.executable) || entry.executable.split('/').includes('..') || path.isAbsolute(entry.executable)) throw new Error('Invalid browser archive identity');
}

export function browserLock(manifest, packageLock) {
  const version = packageLock.packages?.['node_modules/playwright-core']?.version;
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Missing pinned Playwright version');
  const inputs = manifest.browserArchives;
  if (!inputs || JSON.stringify(Object.keys(inputs).sort()) !== JSON.stringify(Object.keys(platforms).sort())) throw new Error('Both browser architectures required');
  for (const architecture of Object.keys(platforms)) {
    const entries = inputs[architecture];
    if (!Array.isArray(entries) || entries.length !== browsers.length || entries.some((entry, index) => entry.name !== browsers[index])) throw new Error('Incomplete browser archive set');
    for (const entry of entries) {
      validateArchiveIdentity(entry);
    }
  }
  return { schemaVersion: 'browser-archives.v1', playwrightVersion: version, architectures: inputs };
}

export async function downloadArchive(url, target) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000), redirect: 'follow' });
  if (!response.ok || !response.url.startsWith('https://')) throw new Error(`Browser download failed: ${response.status}`);
  let size = 0;
  const limit = new Transform({ transform(chunk, encoding, callback) { size += chunk.length; callback(size > maximumArchiveBytes ? new Error('Browser archive exceeds limit') : null, chunk); } });
  await pipeline(Readable.fromWeb(response.body), limit, fs.createWriteStream(target, { flags: 'wx' }));
}

export async function archiveIdentity(file) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of fs.createReadStream(file)) { size += chunk.length; hash.update(chunk); }
  return { size, sha256: hash.digest('hex') };
}

export function validateInstalledMetadata(lock, metadata, architecture) {
  if (metadata.version !== lock.playwrightVersion) throw new Error('Installed Playwright version differs from lock');
  const entries = lock.architectures[architecture];
  if (!entries || entries.some((entry, index) => ['name', 'url', 'directory', 'executable'].some(key => entry[key] !== metadata.archives[index]?.[key]))) throw new Error('Browser registry differs from locked metadata');
  return entries;
}

export async function installBrowsers(lock, metadata, architecture, role, destination, extract, download = downloadArchive) {
  const entries = validateInstalledMetadata(lock, metadata, architecture);
  if (!['buster', 'prism'].includes(role)) throw new Error('Unknown browser role');
  destination = path.resolve(destination);
  const exists = target => { try { fs.lstatSync(target); return true; } catch (error) { if (error.code !== 'ENOENT') throw error; return false; } };
  if (exists(destination)) throw new Error('Browser destination must be absent');
  const guard = `${destination}.installing`;
  fs.mkdirSync(guard);
  const temporary = path.join(guard, 'browsers');
  fs.mkdirSync(temporary);
  try {
    for (const entry of entries.filter(entry => role === 'buster' || !['firefox', 'webkit'].includes(entry.name))) {
      const archive = path.join(guard, `${entry.name}.zip`);
      await download(entry.url, archive);
      const actual = await archiveIdentity(archive);
      if (actual.size !== entry.size || actual.sha256 !== entry.sha256) throw new Error(`Browser archive integrity mismatch: ${entry.name}`);
      const directory = path.join(temporary, entry.directory);
      await extract(archive, { dir: directory });
      const executable = path.join(directory, entry.executable);
      if (!fs.statSync(executable).isFile()) throw new Error('Browser executable missing');
      fs.chmodSync(executable, 0o755);
      fs.writeFileSync(path.join(directory, 'INSTALLATION_COMPLETE'), '', { flag: 'wx' });
      fs.unlinkSync(archive);
    }
    if (exists(destination)) throw new Error('Browser destination appeared during install');
    fs.renameSync(temporary, destination);
  } finally { fs.rmSync(guard, { recursive: true, force: true }); }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  if (command === '--resolve' && args.length === 1) {
    const output = path.resolve(args[0]); fs.mkdirSync(output);
    const inputs = {};
    for (const architecture of Object.keys(platforms)) {
      const metadata = browserMetadata(root, architecture);
      if (metadata.version !== packageLock.packages['node_modules/playwright-core'].version) throw new Error('Run npm ci before resolving browser archives');
      inputs[architecture] = [];
      for (const entry of metadata.archives) {
        const archive = path.join(output, `${architecture}-${entry.name}.zip`);
        await downloadArchive(entry.url, archive);
        inputs[architecture].push({ ...entry, ...await archiveIdentity(archive) });
        fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify(inputs, null, 2) + '\n');
      }
    }
    fs.writeFileSync(path.join(output, 'browserArchives.json'), JSON.stringify(inputs, null, 2) + '\n');
  } else if (command === '--install' && args.length === 3) {
    const [architecture, role, destination] = args;
    if (process.platform !== 'linux' || architecture !== ({ x64: 'amd64', arm64: 'arm64' })[process.arch]) throw new Error('Browser target must match actual Linux build architecture');
    const expected = browserLock(JSON.parse(fs.readFileSync(path.join(root, 'versions.json'))), packageLock);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'docker/browser-archives.lock.json')));
    if (JSON.stringify(expected) !== JSON.stringify(lock)) throw new Error('Generated browser lock differs from version authority');
    const require = createRequire(import.meta.url);
    const { utils } = require('../node_modules/playwright-core/lib/coreBundle.js');
    await installBrowsers(lock, browserMetadata(root, architecture), architecture, role, destination, utils.extractZip);
  } else throw new Error('Usage: --resolve NEW_DIRECTORY | --install amd64|arm64 buster|prism ABSENT_DIRECTORY');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
