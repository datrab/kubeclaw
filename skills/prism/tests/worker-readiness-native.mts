import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createTcpServer, type Socket } from "node:net";
import { once } from "node:events";
import { Pool } from "pg";
import { WorkerNonceDatabase, type WorkerDependencyDiagnostic } from "../server/worker-readiness.ts";

import { nativeWorkerHarness } from './native/worker-harness.mts';

test("actual HMAC HTTP admission fails closed on native pg startup timeout; bootstrap remains available", async t => {
  const sockets = new Set<Socket>();
  const blackhole = createTcpServer(socket => { sockets.add(socket); socket.on("data", () => {}); socket.on("close", () => sockets.delete(socket)); });
  blackhole.listen(0, "127.0.0.1"); await once(blackhole, "listening");
  const address = blackhole.address(); assert(address && typeof address !== "string");
  const diagnostics: WorkerDependencyDiagnostic[] = [];
  const database = new WorkerNonceDatabase(`postgresql://fixture:private@127.0.0.1:${address.port}/fixture`, 100, event => diagnostics.push(event));
  const server = await nativeWorkerHarness(t, { mode: "hmac", secret: "secret", database });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const http = server.address(); assert(http && typeof http !== "string");
  const base = `http://127.0.0.1:${http.port}`;
  try {
    for (const path of ["/health", "/bootstrap"]) assert.equal((await fetch(base + path)).status, 200);
    const started = performance.now();
    const responses = await Promise.all(Array.from({ length: 16 }, (_, i) => fetch(base + (i % 2 ? "/ready" : "/v1/attempts"), i % 2 ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })));
    for (const response of responses) { assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private|postgresql|ECONN/); }
    assert(performance.now() - started < 2000);
    assert.equal(database.pendingConnections, 0); assert.equal(database.openConnections, 0);
    assert(diagnostics.some(event => event.phase === "admission" && event.code === "ADMISSION_LIMIT"));
    assert(diagnostics.some(event => event.phase === "connect" && event.code === "PG_CONNECT_TIMEOUT"));
    assert(diagnostics.every(event => event.durationMs >= 0 && event.active <= 4 && event.pending === 0));
    assert.doesNotMatch(JSON.stringify(diagnostics), /private|postgresql|fixture|127\.0\.0\.1/);
  } finally {
    await database.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => blackhole.close(() => resolve()));
  }
});

test("SPIFFE operational readiness has no unused database dependency; actual admission still authenticates", async t => {
  const server = await nativeWorkerHarness(t, { mode: "spiffe", trustedControlSpiffeId: "spiffe://fixture/control" });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + "/ready")).status, 200);
    const response = await fetch(base + "/v1/attempts", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(response.status, 422);
    assert.match(await response.text(), /WORKER_TRUST_PEER_MISSING/);
    const authenticated = await fetch(base + "/v1/attempts", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-client-cert": "URI=spiffe://fixture/control" }, body: "{}" });
    assert.equal(authenticated.status, 422);
    assert.doesNotMatch(await authenticated.text(), /WORKER_TRUST|PRISM_NONCE_DATABASE/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

