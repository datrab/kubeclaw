// Native MCP transport adapter. OpenClaw launches this directly, without a shell.
// Discovery, schemas and authorization come from the central HTTPS MCP; no Kube API.
import { callMcp } from './client.mjs';

const active = new Map();
const methods = new Set(['initialize', 'ping', 'tools/list', 'tools/call']);
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

async function dispatch(line) {
  let message;
  try { message = JSON.parse(line); }
  catch { fail(null, -32700, 'Invalid JSON'); return; }
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    fail(null, -32600, 'Invalid MCP request'); return;
  }
  const { id, method, params } = message;
  if (id === undefined) {
    if (method === 'notifications/cancelled') active.get(params?.requestId)?.abort();
    return;
  }
  if (!(typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)))) {
    fail(null, -32600, 'Invalid request ID'); return;
  }
  if (!methods.has(method)) { fail(id, -32601, 'Method not supported'); return; }
  if (active.has(id) || active.size >= 8) { fail(id, -32000, 'MCP adapter busy'); return; }
  const controller = new AbortController();
  active.set(id, controller);
  try {
    const result = await callMcp(method, params ?? {}, process.env, {
      signal: controller.signal, preserveToolErrors: true,
    });
    send({ jsonrpc: '2.0', id, result });
  } catch (error) {
    // Never replay a failed call: exec may already have had remote effects.
    fail(id, -32000, `${error.message}; remote effects unconfirmed; do not automatically retry exec`);
  } finally { active.delete(id); }
}

// Bound input before parsing; stdout is exclusively newline-delimited JSON-RPC.
let pending = Buffer.alloc(0);
for await (const chunk of process.stdin) {
  pending = Buffer.concat([pending, chunk]);
  let newline;
  while ((newline = pending.indexOf(10)) !== -1) {
    if (newline > 262144) throw new Error('MCP input exceeds limit');
    const line = pending.subarray(0, newline).toString('utf8').trim();
    pending = pending.subarray(newline + 1);
    if (line) void dispatch(line);
  }
  if (pending.length > 262144) throw new Error('MCP input exceeds limit');
}
for (const controller of active.values()) controller.abort();
