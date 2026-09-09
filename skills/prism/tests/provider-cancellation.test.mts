import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with { type: 'json' };
import { validatePrism, type PrismDocument } from '@kubeclaw/prism-contracts-v1';
import { OpenAICompatibleDesignProvider, PrismEngine } from '../engine/index.ts';

async function endpoint(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'prism-provider-tls-'));
  const key = join(root, 'key.pem'), certificate = join(root, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key,
    '-out', certificate, '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'pipe' });
  const cert = await readFile(certificate, 'utf8');
  const originalCertificates = getCACertificates('default');
  setDefaultCACertificates([...originalCertificates, cert]);
  let contacted!: () => void, closed = false;
  const contact = new Promise<void>(resolve => { contacted = resolve; });
  const server = createServer({ key: await readFile(key), cert }, (req, res) => {
    req.resume();
    res.on('close', () => { closed = true; });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{'); contacted();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    setDefaultCACertificates(originalCertificates); await rm(root, { recursive: true, force: true }); });
  const address = server.address(); assert(address && typeof address !== 'string');
  const url = `https://127.0.0.1:${address.port}`;
  return { provider: new OpenAICompatibleDesignProvider({ endpoint: url, embeddingEndpoint: url, apiKey: 'local-only',
    model: 'local-only', embeddingModel: 'local-only', timeoutMs: 5000 }), contact, closed: () => closed };
}

for (const operation of ['ingest', 'propose'] as const) {
  test(`original ${operation} provider cancels an actual TLS response body after headers`, async t => {
    const f = await endpoint(t);
    const owner = new AbortController();
    const engine = new PrismEngine(f.provider);
    const result = operation === 'ingest' ? engine.execute({ contract: 'kubeclaw.prism-design-engine@1', operation: 'ingest',
      input: { text: 'Local embedding cancellation' }, idempotencyKey: 'local' }, { signal: owner.signal })
      : f.provider.propose(validatePrism<PrismDocument>('designDocument', structuredClone(fixture)), 'Local proposal cancellation', owner.signal);
    const rejected = assert.rejects(result, /abort|cancel/u);
    await f.contact;
    owner.abort(new Error('cancel local provider'));
    await rejected;
    for (let index = 0; index < 20 && !f.closed(); index++) await new Promise(resolve => setTimeout(resolve, 10));
    assert(f.closed(), 'real TLS response connection closes after owner abort');
    assert.equal(engine.cacheUsage().inFlight, 0);
  });
}
