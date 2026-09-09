import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createTcpServer, type Socket } from "node:net";
import { once } from "node:events";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { PrismEngine, DeterministicDesignProvider } from "../engine/index.ts";
import { WorkerArtifactClient } from "../server/worker-artifacts.ts";
import { createWorkerServer } from "../server/worker-service.ts";
import { WorkerNonceDatabase, checkWorkerNonceTable, type WorkerDependencyDiagnostic } from "../server/worker-readiness.ts";

const engine = new PrismEngine(new DeterministicDesignProvider());
const artifacts = new WorkerArtifactClient(new URL("http://127.0.0.1:1"), "secret", false);

test("actual HMAC HTTP admission fails closed on native pg startup timeout; bootstrap remains available", async () => {
  const sockets = new Set<Socket>();
  const blackhole = createTcpServer(socket => { sockets.add(socket); socket.on("data", () => {}); socket.on("close", () => sockets.delete(socket)); });
  blackhole.listen(0, "127.0.0.1"); await once(blackhole, "listening");
  const address = blackhole.address(); assert(address && typeof address !== "string");
  const diagnostics: WorkerDependencyDiagnostic[] = [];
  const database = new WorkerNonceDatabase(`postgresql://fixture:private@127.0.0.1:${address.port}/fixture`, 100, event => diagnostics.push(event));
  const server = createWorkerServer({ mode: "hmac", secret: "secret", database }, engine, artifacts);
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

test("native connection refusal retains its safe operator system code", async () => {
  const listener = createTcpServer();
  listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const address = listener.address(); assert(address && typeof address !== "string");
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const diagnostics: WorkerDependencyDiagnostic[] = [];
  const database = new WorkerNonceDatabase(`postgresql://fixture:private@127.0.0.1:${address.port}/fixture`, 100, event => diagnostics.push(event));
  try {
    await assert.rejects(database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/);
    assert(diagnostics.some(event => event.phase === "connect" && event.code === "ECONNREFUSED"));
    assert.doesNotMatch(JSON.stringify(diagnostics), /private|postgresql|fixture|127\.0\.0\.1/);
  } finally { await database.close(); }
});

test("SPIFFE operational readiness has no unused database dependency; actual admission still authenticates", async () => {
  const server = createWorkerServer({ mode: "spiffe", trustedControlSpiffeId: "spiffe://fixture/control" }, engine, artifacts);
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

test("original readiness SQL requires the migrated nonce table (PGlite SQL proof only)", async () => {
  const db = new PGlite();
  try {
    await assert.rejects(checkWorkerNonceTable(db), /does not exist/);
    await db.exec("CREATE SCHEMA prism");
    await db.exec(await readFile(new URL("../storage/migrations/003_worker_nonce.sql", import.meta.url), "utf8"));
    await checkWorkerNonceTable(db);
  } finally { await db.close(); }
});

test("native PostgreSQL query cancellation settles and releases its actual pool client", { skip: !process.env.KUBECLAW_PRISM_READINESS_TEST_DATABASE ? "REAL_POSTGRES_DATABASE_REQUIRED (isolated migrated test database)" : false }, async () => {
  const database = new WorkerNonceDatabase(process.env.KUBECLAW_PRISM_READINESS_TEST_DATABASE!, 150);
  const lockPool = new Pool({ connectionString: process.env.KUBECLAW_PRISM_READINESS_TEST_DATABASE, connectionTimeoutMillis: 1000 });
  const locker = await lockPool.connect();
  try {
    await database.check();
    await locker.query("BEGIN");
    await locker.query("LOCK TABLE prism.worker_request_nonce IN ACCESS EXCLUSIVE MODE");
    const signal = new AbortController();
    const pending = database.check(signal.signal);
    const timer = setTimeout(() => signal.abort(), 30);
    try { await assert.rejects(pending, /PRISM_NONCE_DATABASE_UNAVAILABLE/); }
    finally { clearTimeout(timer); }
    assert.equal(database.pendingConnections, 0);
    assert.equal(database.openConnections, 0, "the canceled borrowed client is destroyed");
    await assert.rejects(database.check(), /PRISM_NONCE_DATABASE_UNAVAILABLE/);
    await locker.query("ROLLBACK");
    await database.check();
  } finally { await locker.query("ROLLBACK"); locker.release(); await lockPool.end(); await database.close(); }
});
