import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, mkdir, rm, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('real nginx protects documents, refuses directory listing and fails closed without credentials', { timeout: 15000 }, async t => {
  assert.ok(process.env.ARCHVIEWER_TEST_NGINX, 'Set ARCHVIEWER_TEST_NGINX to a real nginx binary; no simulated server is accepted');
  const directory = await mkdtemp(join(tmpdir(), 'archviewer-native-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'designs'));
  await mkdir(join(directory, 'logs'));
  await writeFile(join(directory, 'designs', 'architecture.html'), '<h1>Private architecture proof</h1>');
  const password = 'local-proof-password';
  const hash = execFileSync('openssl', ['passwd', '-6', '-stdin'], { input: password + '\n', encoding: 'utf8' }).trim();
  await writeFile(join(directory, 'htpasswd'), `reviewer:${hash}\n`);
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  // Only deployment-specific paths/listeners change. The production locations,
  // authentication, document resolution and listing policy execute unchanged.
  const server = (await readFile('docker/archviewer.nginx.conf', 'utf8'))
    .replace('listen 3456;', `listen 127.0.0.1:${port};`).replace('listen [::]:3456;', '')
    .replace('root /designs;', `root ${directory}/designs;`)
    .replace('/etc/archviewer-auth/htpasswd', `${directory}/htpasswd`);
  await writeFile(join(directory, 'nginx.conf'), `${process.getuid() === 0 ? 'user root root;' : ''}
daemon off; master_process off; pid ${directory}/nginx.pid;
error_log stderr; events {} http { access_log off; ${server} }`);
  const child = spawn(process.env.ARCHVIEWER_TEST_NGINX, ['-p', directory, '-c', join(directory, 'nginx.conf')], { stdio: ['ignore', 'ignore', 'pipe'] });
  let errors = ''; child.stderr.on('data', bytes => { errors += bytes; });
  t.after(async () => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = performance.now() + 5000;
  while (true) {
    try { if ((await fetch(base + '/healthz')).status === 200) break; } catch { /* bounded startup only */ }
    if (child.exitCode !== null || performance.now() >= deadline) throw new Error(`nginx did not start: ${errors}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const auth = value => ({ headers: { authorization: 'Basic ' + Buffer.from(`reviewer:${value}`).toString('base64') } });
  assert.equal((await fetch(base + '/architecture.html')).status, 401);
  assert.equal((await fetch(base + '/architecture.html', auth('wrong'))).status, 401);
  const document = await fetch(base + '/architecture.html', auth(password));
  assert.equal(document.status, 200);
  assert.equal(await document.text(), '<h1>Private architecture proof</h1>');
  const listing = await fetch(base + '/', auth(password));
  assert.equal(listing.status, 403);
  assert.doesNotMatch(await listing.text(), /architecture.html/);
  await unlink(join(directory, 'htpasswd'));
  assert.equal((await fetch(base + '/architecture.html', auth(password))).status, 403);
  assert.equal((await fetch(base + '/healthz')).status, 200);
});
