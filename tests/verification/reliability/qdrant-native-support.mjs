import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { load, dump } from 'js-yaml';
import { qdrantClient } from '../../../scripts/qdrant-client.mjs';

export async function unusedPort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export function certificates(directory) {
  const key = path.join(directory, 'tls.key'); const cert = path.join(directory, 'tls.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout', key, '-out', cert], { stdio: 'ignore' });
  return { cert, key, ca_cert: cert };
}

export async function startQdrant(t, binary, directory, tls, keyFile, snapshot, readOnlyKeyFile = keyFile + '.readonly', clusterEnabled = false) {
  fs.mkdirSync(directory, { recursive: true });
  const port = await unusedPort();
  const previous = path.join(directory, 'config.yaml');
  const peerPort = fs.existsSync(previous) ? load(fs.readFileSync(previous, 'utf8')).cluster.p2p.port : await unusedPort();
  const values = load(fs.readFileSync('my-values/infra/qdrant-values.yaml', 'utf8'));
  // Production service/TLS configuration with isolated paths, loopback ports and
  // one real local peer. No fake database, filesystem or protocol handler.
  const config = { ...values.config, telemetry_disabled: true, log_level: 'WARN',
    service: { ...values.config.service, host: '127.0.0.1', http_port: port, grpc_port: await unusedPort() },
    cluster: { enabled: clusterEnabled, p2p: { port: peerPort } }, tls,
    storage: { storage_path: path.join(directory, 'storage'), snapshots_path: path.join(directory, 'snapshots'),
      performance: { max_search_threads: 2, max_optimization_threads: 1 } } };
  fs.writeFileSync(path.join(directory, 'config.yaml'), dump(config));
  const args = ['--config-path', path.join(directory, 'config.yaml')];
  if (clusterEnabled) args.push('--uri', `http://127.0.0.1:${config.cluster.p2p.port}`);
  if (snapshot) args.push('--snapshot', snapshot);
  // Execute the actual production fail-closed guard; only the initializer's
  // filesystem/cluster setup is replaced by the native binary's local arguments.
  const guard = values.args[0].replace('exec ./config/initialize.sh', 'exec "$@"');
  const child = spawn('bash', ['-c', guard, 'qdrant-native', binary, ...args], { cwd: directory,
    env: { ...process.env, QDRANT__SERVICE__API_KEY: fs.readFileSync(keyFile, 'utf8').trim(),
      QDRANT__SERVICE__READ_ONLY_API_KEY: fs.readFileSync(readOnlyKeyFile, 'utf8').trim() }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', bytes => { output = (output + bytes).slice(-16000); });
  child.stderr.on('data', bytes => { output = (output + bytes).slice(-16000); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  };
  t.after(stop);
  const options = { url: `https://127.0.0.1:${port}`, caFile: tls.cert, keyFile, timeoutMs: 10000 };
  const client = qdrantClient(options);
  const deadline = performance.now() + 15000;
  while (true) {
    try { await client.json('/collections'); break; } catch (error) {
      if (child.exitCode !== null || child.signalCode !== null || performance.now() >= deadline) throw new Error(`${error.message}\n${output}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  return { options, client, stop, child };
}

