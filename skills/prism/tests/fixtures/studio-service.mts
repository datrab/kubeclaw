import { publishedControlConfig } from './published-config.mjs';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string'); return address.port;
}
export async function close(server: Server): Promise<void> {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
}
export async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('TEST_CONDITION_TIMEOUT');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
export async function studio(t: TestContext, control: string, controlTimeoutMs = 250, selectedPort?: number, ingressSecret = 'local-test-ingress') {
  const reserve = createServer(); const reserved = await listen(reserve); await close(reserve);
  const port = selectedPort ?? reserved;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-studio-http-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Actual static fixture</title>');
  const fixture = await publishedControlConfig(t, {}, undefined, { port, controlUrl: control, controlTimeoutMs });
  const code = path.join(fixture.root, 'role');
  const moduleUrl = (relative: string) => new URL(relative, `file://${code}/`).href;
  // Isolated child executes the emitted request handler and authenticates real
  // receipts. Fixed /run entrypoint + UID1000 remain the separate image proof.
  const script = `
    import { createServer } from 'node:http';
    import { capturePipelineBootReceipts } from ${JSON.stringify(moduleUrl('skills/packages/plugin-foundation/config/pipeline-boot.mjs'))};
    import { loadStudioConfig } from ${JSON.stringify(moduleUrl('skills/packages/prism-engine/server/studio-config.ts'))};
    import { handleStudioRequest, studioRequestFailed } from ${JSON.stringify(moduleUrl('skills/packages/prism-engine/server/studio-request.ts'))};
    const capture=capturePipelineBootReceipts(${JSON.stringify(path.join(fixture.root,'studio-transport'))},${JSON.stringify(path.join(fixture.root,'generation/system'))},'prism-studio',${JSON.stringify(code)},'/app/prism/skills');
    const options=loadStudioConfig(capture);
    createServer((request,response)=>{void handleStudioRequest(request,response,options).catch(error=>studioRequestFailed(error,response));}).listen(options.port,'127.0.0.1');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, STUDIO_ROOT: root, PRISM_INGRESS_SECRET: ingressSecret }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); }); child.stdout.resume();
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  await until(async () => {
    assert.equal(child.exitCode, null, stderr);
    try { return (await fetch(`${url}/health`)).ok; } catch { return false; }
  });
  async function healthy() {
    assert.equal(child.exitCode, null, stderr);
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.match(await (await fetch(url)).text(), /Actual static fixture/u);
  }
  return { url, healthy, errors: () => stderr, rewritePolicy: (settings: object) => {
    const file=path.join(fixture.author,'components/prism-studio.config.json');
    const value=JSON.parse(fs.readFileSync(file,'utf8'));value.profiles.standard.settings=settings;
    fs.writeFileSync(file,JSON.stringify(value));
  } };
}

