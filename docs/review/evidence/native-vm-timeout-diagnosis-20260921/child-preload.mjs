import { registerHooks } from 'node:module';
const start = performance.now();
let loads = 0;
let loadMs = 0;
process.stderr.write(`DIAGNOSTIC_BOOT ${JSON.stringify({ context: process.env.NODE_TEST_CONTEXT ?? null })}\n`);
registerHooks({ load(url, context, next) {
  const before = performance.now(); const result = next(url, context); loads++; loadMs += performance.now() - before; return result;
} });
const write = process.stdout.write.bind(process.stdout);
process.stdout.write = function (...args) {
  process.stderr.write(`DIAGNOSTIC_READY ${JSON.stringify({ elapsedMs: performance.now() - start, loads, loadMs })}\n`);
  return write(...args);
};
