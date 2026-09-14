import test from "node:test";
import assert from "node:assert/strict";
import { createServer as createTcpServer, type Socket } from "node:net";
import { once } from "node:events";
import { Pool } from "pg";
import { WorkerNonceDatabase, type WorkerDependencyDiagnostic } from "../server/worker-readiness.ts";

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
