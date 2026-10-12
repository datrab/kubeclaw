import { registerHooks } from 'node:module';
const start = performance.now();
let loads = 0;
let resolutions = 0;
let loadMs = 0;
let resolveMs = 0;
let lastModule = null;
const report = phase => process.stderr.write(`DIAGNOSTIC ${JSON.stringify({ phase, elapsedMs: performance.now() - start, loads, resolutions, loadMs, resolveMs, lastModule, cpu: process.cpuUsage(), rss: process.memoryUsage().rss, context: process.env.NODE_TEST_CONTEXT ?? null })}\n`);
report('bootstrap');
registerHooks({
  resolve(specifier, context, next) {
    const before = performance.now(); const result = next(specifier, context); resolutions++; resolveMs += performance.now() - before; return result;
  },
  load(url, context, next) {
    const before = performance.now(); const result = next(url, context); loads++; loadMs += performance.now() - before; lastModule = url; return result;
  },
});
setInterval(() => report('tick'), 1000).unref();
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = function (...args) { report('first-stdout'); return write(...args); };
