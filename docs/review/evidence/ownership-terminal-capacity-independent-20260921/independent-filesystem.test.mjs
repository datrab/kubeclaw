import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { FileWorkerOwnershipStore } from "../../../../skills/worker/core/worker/ownership-store.ts";
import { NativeWorkerOwnership } from "../../../../skills/worker/core/worker/native-worker-ownership.ts";
import { NativeWorkerResourceScope } from "../../../../skills/worker/core/worker/native-resource-scope.ts";
import { NativeWorkerResourcePool } from "../../../../skills/worker/core/worker/native-resource-pool.ts";
import { canonicalJson } from "../../../../skills/worker/core/worker/digest.ts";

// Independent real-filesystem/locking checks. Explicit metadata-domain values
// and scope-method mocks below are not kernel observations or native-host proof.
const max = Number.MAX_SAFE_INTEGER;
const boot = "12345678-1234-1234-1234-123456789abc";
const host = "x".repeat(256);
const identity = (n) => ({
  workerId: "\u0001".repeat(512),
  attemptId: `${n}${"\u0002".repeat(511)}`,
  claimId: "\u0003".repeat(512),
  generation: max,
  profileDigest: `sha256:${"a".repeat(64)}`,
  attemptSpecDigest: `sha256:${"b".repeat(64)}`,
});
const scopeName = "worker-12345678-1234-1234-1234-123456789abc";
const observation = {
  unit: "linux-tasks",
  cpuTimeMicroseconds: max,
  maximumMemoryBytes: max,
  maximumTasks: max,
  populated: false,
  oomKills: max,
  taskLimitHits: max,
};
const seed = (n) => ({
  identity: identity(n),
  scopeName,
  revision: 1,
  phase: "reserved",
  binding: null,
  diagnosis: null,
  finalObservation: null,
  topology: { kind: "aggregate.v1", children: [] },
});
const document = (records, hostIdentity = null) => ({
  schemaVersion: "worker-ownership-store.v3",
  hostIdentity,
  records,
});
const bytes = (value) => Buffer.byteLength(canonicalJson(value));
// This expected representation deliberately does not call the production bound.
const terminal = (record) => ({
  ...record,
  revision: max,
  phase: "unresolved",
  binding: record.binding ?? {
    scopeName: record.scopeName,
    bootId: boot,
    device: max,
    inode: max,
  },
  diagnosis: "\u0000".repeat(4096),
  finalObservation: observation,
});
async function fixture(t, maximumBytes) {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "independent-terminal-capacity-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return {
    root,
    file: path.join(root, "owners.json"),
    store: new FileWorkerOwnershipStore(root, {
      maximumRecords: 20,
      maximumBytes,
    }),
  };
}

test("independent escaped-identity exact boundary admits, persists maximal lifecycle, reopens; one short rejects", async (t) => {
  const ceiling = bytes(document([terminal(seed(0))], host));
  const f = await fixture(t, ceiling),
    short = await fixture(t, ceiling - 1);
  await assert.rejects(short.store.reserve(identity(0)), /CAPACITY_EXCEEDED/);
  await assert.rejects(fs.stat(short.file), { code: "ENOENT" });
  const reserved = await f.store.reserve(identity(0));
  // Historical high revision is explicit; this avoids billions of transitions.
  let current = { ...reserved, revision: max - 4 };
  await fs.writeFile(f.file, canonicalJson(document([current])));
  await f.store.bindHostIdentity(host, boot);
  current = await f.store.transition(current, "allocated", {
    binding: {
      scopeName: current.scopeName,
      bootId: boot,
      device: max,
      inode: max,
    },
  });
  current = await f.store.transition(current, "quiescing");
  current = await f.store.transition(current, "empty", {
    finalObservation: observation,
  });
  current = await f.store.transition(current, "unresolved", {
    diagnosis: "\u0000".repeat(4096),
  });
  assert.equal((await fs.stat(f.file)).size, ceiling);
  const reopened = new FileWorkerOwnershipStore(f.root, {
    maximumRecords: 20,
    maximumBytes: ceiling,
  });
  assert.deepEqual(await reopened.records(), [current]);
  assert.deepEqual(await reopened.reserve(identity(0)), current);
  await assert.rejects(reopened.reserve(identity(1)), /CAPACITY_EXCEEDED/);
});

test("independent separate-process contenders cannot spend one owner reservation twice", async (t) => {
  const ceiling = bytes(document([terminal(seed(0))], host));
  const f = await fixture(t, ceiling),
    gate = path.join(f.root, "start");
  const storeURL = new URL(
    "../../../../skills/worker/core/worker/ownership-store.ts",
    import.meta.url,
  ).href;
  const children = [0, 1].map((n) => {
    const source = `import fs from 'node:fs/promises';import {setTimeout} from 'node:timers/promises';import {FileWorkerOwnershipStore} from ${JSON.stringify(storeURL)};process.stdout.write('ready\\n');while(true){try{await fs.stat(process.argv[2]);break;}catch{await setTimeout(10);}}try{await new FileWorkerOwnershipStore(process.argv[1],{maximumRecords:20,maximumBytes:${ceiling}}).reserve(${JSON.stringify(identity(n))});process.stdout.write('accepted\\n');}catch(e){if(!String(e).includes('CAPACITY_EXCEEDED'))throw e;process.stdout.write('capacity\\n');}`;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", source, f.root, gate],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (x) => (output += x));
    child.stderr.on("data", (x) => (error += x));
    t.after(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });
    return {
      child,
      done: once(child, "exit"),
      ready: once(child.stdout, "data"),
      result: () => ({ output, error }),
    };
  });
  await Promise.all(children.map((c) => c.ready));
  await fs.writeFile(gate, "start");
  for (const child of children)
    assert.deepEqual(await child.done, [0, null], child.result().error);
  const results = children.map((c) => c.result().output);
  assert.equal(results.filter((x) => x.includes("accepted")).length, 1);
  assert.equal(results.filter((x) => x.includes("capacity")).length, 1);
  assert.equal((await f.store.records()).length, 1);
});

test("independent child one-short admission preserves disk and exact future binding fits after reopen", async (t) => {
  const base = {
    ...seed(0),
    phase: "running",
    revision: 3,
    binding: { scopeName, bootId: boot, device: 0, inode: 1 },
  };
  const child = {
    name: "helper-12345678-1234-1234-1234-123456789abc",
    limits: { memoryBytes: max, tasks: max },
    binding: null,
  };
  const expected = terminal({
    ...base,
    topology: {
      kind: "aggregate.v1",
      children: [
        {
          ...child,
          binding: {
            scopeName: child.name,
            bootId: boot,
            device: 0,
            inode: max,
          },
        },
      ],
    },
  });
  const ceiling = bytes(document([expected], host));
  for (const short of [false, true]) {
    const f = await fixture(t, ceiling - Number(short));
    await fs.writeFile(f.file, canonicalJson(document([base])));
    const before = await fs.readFile(f.file);
    if (short) {
      await assert.rejects(
        f.store.reserveChild(base, child.name, child.limits),
        /CAPACITY_EXCEEDED/,
      );
      assert.deepEqual(await fs.readFile(f.file), before);
      continue;
    }
    let current = await f.store.reserveChild(base, child.name, child.limits);
    current = await f.store.bindChild(
      current,
      child.name,
      expected.topology.children[0].binding,
    );
    current = { ...current, revision: max - 3 };
    await fs.writeFile(f.file, canonicalJson(document([current])));
    await f.store.bindHostIdentity(host, boot);
    current = await f.store.transition(current, "quiescing");
    current = await f.store.transition(current, "empty", {
      finalObservation: observation,
    });
    current = await f.store.transition(current, "unresolved", {
      diagnosis: "\u0000".repeat(4096),
    });
    assert.equal((await fs.stat(f.file)).size, ceiling);
    assert.deepEqual(
      await new FileWorkerOwnershipStore(f.root, {
        maximumRecords: 20,
        maximumBytes: ceiling,
      }).records(),
      [current],
    );
  }
});

test("independent historical null-host saturation fails supervisor provenance before callback or recovery writes", async (t) => {
  const original = seed(0),
    encoded = canonicalJson(document([original]));
  const f = await fixture(t, Buffer.byteLength(encoded));
  await fs.writeFile(f.file, encoded);
  let entered = false;
  const events = [];
  t.mock.method(NativeWorkerResourceScope, "inventory", () => {
    events.push("inventory");
    return [];
  });
  t.mock.method(NativeWorkerResourcePool.prototype, "verify", () => {
    events.push("pool-verify");
  });
  await assert.rejects(
    NativeWorkerOwnership.supervise(
      {
        store: f.store,
        cgroupRoot: f.root,
        nodeIdentity: host,
        drainTimeoutMs: 1000,
        poolLimits: {
          memoryBytes: 8192,
          tasks: 8,
          cpuQuotaMicroseconds: 1000,
          cpuPeriodMicroseconds: 1000,
        },
      },
      async () => {
        entered = true;
      },
    ),
    /CAPACITY_EXCEEDED/,
  );
  assert.equal(entered, false);
  assert.deepEqual(events, ["inventory", "pool-verify", "inventory"]);
  assert.equal(await fs.readFile(f.file, "utf8"), encoded);
  assert.deepEqual(await f.store.records(), [original]);
  await assert.rejects(f.store.reserve(identity(1)), /CAPACITY_EXCEEDED/);
});
