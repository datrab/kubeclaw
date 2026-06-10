import fs from 'fs';
import path from 'path';
import { ensureDir } from './lifecycle-audit-lib.mjs';

export function installFakeRedis(runtimeRoot) {
  const packageSource = `
	function counters() {
	  return globalThis.__fakeRedisCounters ||= Object.create(null);
	}
function calls() {
  return globalThis.__fakeRedisCalls ||= [];
}
class FakeRedis {
  constructor(options = {}) {
    this.options = options;
    this.status = 'ready';
    this._pendingXreadRejects = [];
  }
  on() {}
  async incr(key) {
    const store = counters();
    store[key] = (store[key] || 0) + 1;
    calls().push({ op: 'incr', key, value: store[key] });
    return store[key];
  }
  async xadd(...args) {
    calls().push({ op: 'xadd', args });
    return '1-0';
  }
  async xread(...args) {
    calls().push({ op: 'xread', args });
    const streamIndex = args.indexOf('STREAMS');
    const stream = streamIndex >= 0 ? args[streamIndex + 1] : null;
    const entriesByStream = globalThis.__fakeRedisXreadEntries ||= Object.create(null);
    const queued = stream ? (entriesByStream[stream] ||= []) : [];
    if (queued.length > 0) return [[stream, [queued.shift()]]];
    return new Promise((_resolve, reject) => {
      this._pendingXreadRejects.push(reject);
    });
  }
  async expire(...args) {
    calls().push({ op: 'expire', args });
    return 1;
  }
  multi() {
    const ops = [];
    const chain = {
      xadd: (...args) => { ops.push({ op: 'xadd', args }); return chain; },
      expire: (...args) => { ops.push({ op: 'expire', args }); return chain; },
      exec: async () => { calls().push(...ops); return ops; },
    };
    return chain;
  }
  disconnect() {
    calls().push({ op: 'disconnect' });
    for (const reject of this._pendingXreadRejects.splice(0)) reject(new Error('connection is closed'));
  }
  async quit() { this.disconnect(); }
	}
	module.exports = FakeRedis;
	`;
  for (const nodeModulesRoot of [
    path.join(runtimeRoot, 'node_modules'),
    path.join(runtimeRoot, 'app', 'node_modules'),
    path.join(runtimeRoot, 'app', 'skills', 'node_modules'),
  ]) {
    const nodeModulesDir = ensureDir(path.join(nodeModulesRoot, 'ioredis'));
    fs.writeFileSync(path.join(nodeModulesDir, 'index.js'), packageSource);
    fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{"name":"ioredis","main":"index.js"}');
  }
}

export function xaddEvents(prefix) {
  const calls = globalThis.__fakeRedisCalls || [];
  return calls
    .filter((entry) => entry.op === 'xadd' && String(entry.args?.[0] || '').startsWith(prefix))
    .map((entry) => {
      const dataIndex = entry.args.indexOf('data');
      return JSON.parse(entry.args[dataIndex + 1]);
    });
}

export async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
