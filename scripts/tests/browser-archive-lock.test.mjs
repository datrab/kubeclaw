import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { browsers, browserLock, downloadArchive, installBrowsers, validateInstalledMetadata } from '../browser-archive-lock.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-lock-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bytes = Buffer.from('explicit installer boundary fixture, not browser proof');
  const entries = browsers.map(name => ({ name, url: `https://cdn.playwright.dev/builds/${name}.zip`, directory: `${name.replaceAll('-', '_')}-1`, executable: 'bin/browser', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
  const manifest = { browserArchives: { amd64: entries, arm64: structuredClone(entries) } };
  const packages = { packages: { 'node_modules/playwright-core': { version: '1.62.1' } } };
  const lock = browserLock(manifest, packages);
  const metadata = { version: '1.62.1', archives: entries };
  const calls = [];
  const download = async (url, file) => { calls.push(url); fs.writeFileSync(file, bytes); };
  const extract = async (_file, { dir }) => { fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); fs.writeFileSync(path.join(dir, 'bin/browser'), bytes); };
  return { root, bytes, entries, manifest, packages, lock, metadata, calls, download, extract, destination: path.join(root, 'browsers') };
}

test('BA01 lock requires complete architecture and archive identities', t => {
  const f = fixture(t);
  delete f.manifest.browserArchives.arm64;
  assert.throws(() => browserLock(f.manifest, f.packages), /Both browser architectures/);
});

test('BA02 installed package and registry drift rejected before download', async t => {
  const f = fixture(t);
  for (const metadata of [{ ...f.metadata, version: '1.0.0' }, { ...f.metadata, archives: f.entries.map(e => ({ ...e, url: `${e.url}?mutable` })) }]) {
    await assert.rejects(installBrowsers(f.lock, metadata, 'amd64', 'buster', f.destination, f.extract, f.download));
  }
  assert.equal(f.calls.length, 0);
});

for (const property of ['size', 'sha256']) test(`BA03 corrupt ${property} fails before extraction or publication`, async t => {
  const f = fixture(t);
  f.entries[0][property] = property === 'size' ? f.bytes.length + 1 : '0'.repeat(64);
  let extracted = false;
  await assert.rejects(installBrowsers(f.lock, f.metadata, 'amd64', 'buster', f.destination, async () => { extracted = true; }, f.download), /integrity mismatch/);
  assert.equal(extracted, false);
  assert.equal(fs.existsSync(f.destination), false);
  assert.equal(fs.existsSync(`${f.destination}.installing`), false);
});

test('BA04 existing destinations and dangling symlinks preserved', async t => {
  const f = fixture(t);
  for (const symlink of [false, true]) {
    if (symlink) fs.symlinkSync(path.join(f.root, 'absent'), f.destination);
    else fs.mkdirSync(f.destination);
    await assert.rejects(installBrowsers(f.lock, f.metadata, 'amd64', 'buster', f.destination, f.extract, f.download), /must be absent/);
    assert.equal(fs.lstatSync(f.destination).isSymbolicLink(), symlink);
    fs.rmSync(f.destination, { recursive: true });
  }
  assert.equal(f.calls.length, 0);
});

test('BA04 only one concurrent installer may publish', async t => {
  const f = fixture(t);
  const results = await Promise.allSettled([1, 2].map(() => installBrowsers(f.lock, f.metadata, 'amd64', 'buster', f.destination, f.extract, f.download)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'EEXIST').length, 1);
  assert.equal(fs.readdirSync(f.destination).length, 5);
});

test('BA05 prism publishes three verified directories with permissions and original markers', async t => {
  const f = fixture(t);
  await installBrowsers(f.lock, f.metadata, 'amd64', 'prism', f.destination, f.extract, f.download);
  assert.equal(f.calls.length, 3);
  for (const directory of fs.readdirSync(f.destination)) {
    assert.equal(fs.statSync(path.join(f.destination, directory, 'bin/browser')).mode & 0o777, 0o755);
    assert.equal(fs.readFileSync(path.join(f.destination, directory, 'INSTALLATION_COMPLETE')).length, 0);
  }
});


test('BA02 real CLI rejects authored/generated drift before loading downloader', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.root, 'scripts'));
  fs.mkdirSync(path.join(f.root, 'docker'));
  fs.copyFileSync(fileURLToPath(new URL('../browser-archive-lock.mjs', import.meta.url)), path.join(f.root, 'scripts/browser-archive-lock.mjs'));
  fs.writeFileSync(path.join(f.root, 'versions.json'), JSON.stringify(f.manifest));
  fs.writeFileSync(path.join(f.root, 'package-lock.json'), JSON.stringify(f.packages));
  fs.writeFileSync(path.join(f.root, 'docker/browser-archives.lock.json'), JSON.stringify({ ...f.lock, playwrightVersion: '1.0.0' }));
  const result = spawnSync(process.execPath, [path.join(f.root, 'scripts/browser-archive-lock.mjs'), '--install', process.arch === 'x64' ? 'amd64' : 'arm64', 'buster', f.destination], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Generated browser lock differs/);
  assert.equal(fs.existsSync(f.destination), false);
});

test('BA06 both production Dockerfiles replace unverified archive installation', () => {
  for (const [file, role] of [['buster-runtime', 'buster'], ['prism-worker', 'prism']]) {
    const source = fs.readFileSync(new URL(`../../docker/Dockerfile.${file}`, import.meta.url), 'utf8');
    assert.match(source, /COPY docker\/browser-archives.lock.json/);
    assert.match(source, /COPY scripts\/browser-archive-lock.mjs/);
    assert.match(source, new RegExp(`browser-archive-lock.mjs --install "\\$TARGETARCH" ${role} /ms-playwright`));
    assert.match(source, /playwright\/cli.js install-deps/);
    assert.doesNotMatch(source, /playwright\/cli.js install(?: |$)/);
  }
});


test('BA07 unavailable dbazure route uses exact registry mirror within the same budget', async t => {
  const f = fixture(t), calls = [];
  const url = 'https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/1011/ffmpeg-linux.zip';
  t.mock.method(globalThis, 'fetch', async (source, options) => {
    calls.push({ source, signal: options.signal });
    if (calls.length === 1) throw new TypeError('explicit unavailable DNS fixture');
    const response = new Response(f.bytes);
    Object.defineProperty(response, 'url', { value: source });
    return response;
  });
  const archive = path.join(f.root, 'archive.zip');
  await downloadArchive(url, archive);
  assert.deepEqual(calls.map(call => call.source), [url, 'https://cdn.playwright.dev/builds/ffmpeg/1011/ffmpeg-linux.zip']);
  assert.equal(calls[0].signal, calls[1].signal);
  assert.deepEqual(fs.readFileSync(archive), f.bytes);
});

test('BA07 unrelated routes do not gain arbitrary mirror retries', async t => {
  const f = fixture(t), calls = [];
  t.mock.method(globalThis, 'fetch', async source => { calls.push(source); throw new Error('explicit network failure'); });
  const url = 'https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip';
  await assert.rejects(downloadArchive(url, path.join(f.root, 'archive.zip')), /explicit network failure/);
  assert.deepEqual(calls, [url]);
});

test('BA07 mirror bytes still fail the original pinned integrity gate before extraction', async t => {
  const f = fixture(t);
  f.entries[0].url = 'https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/1/chromium.zip';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async source => {
    calls.push(source);
    if (calls.length === 1) throw new TypeError('explicit unavailable DNS fixture');
    const response = new Response(Buffer.alloc(f.bytes.length, 0));
    Object.defineProperty(response, 'url', { value: source });
    return response;
  });
  let extracted = false;
  await assert.rejects(installBrowsers(f.lock, f.metadata, 'amd64', 'buster', f.destination,
    async () => { extracted = true; }), /integrity mismatch/);
  assert.equal(calls.length, 2);
  assert.equal(extracted, false);
  assert.equal(fs.existsSync(f.destination), false);
  assert.equal(fs.existsSync(`${f.destination}.installing`), false);
});
