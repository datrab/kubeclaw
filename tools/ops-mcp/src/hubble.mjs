import { spawn } from 'node:child_process';
import { boundedUtf8 } from './diagnostics.mjs';

export const MAX_RAW_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 192 * 1024;
let active = 0;

export function queryWindow({ startTime, endTime }, now = Date.now()) {
  const end = endTime ? Date.parse(endTime) : now;
  const start = startTime ? Date.parse(startTime) : end - 5 * 60_000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 15 * 60_000) {
    throw new Error('Choose startTime < endTime with at most 15 minutes per query. Older absolute windows are allowed.');
  }
  return { startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString() };
}

export function classify(response) {
  if (response.lost_events || response.lostEvents) return { warning: { type: 'lost_events', detail: response.lost_events ?? response.lostEvents } };
  if (response.node_status || response.nodeStatus) return { warning: { type: 'node_status', detail: response.node_status ?? response.nodeStatus } };
  if (response.flow) return { flow: response.flow };
  if (response.verdict && (response.source || response.destination)) return { flow: response };
  return { warning: { type: 'unknown_event' } };
}

export async function getHubbleFlows(args, summarize, {
  binary = process.env.HUBBLE_BIN ?? '/usr/local/bin/hubble',
  server = process.env.HUBBLE_SERVER ?? 'hubble-relay.cilium.svc.cluster.local:4245',
  timeout = 12_000,
} = {}) {
  if (active >= 2) throw new Error('Two Hubble queries are already active; retry after they finish.');
  const window = queryWindow(args);
  const command = ['observe', '--server', server, '--output', 'json', '--last', String(args.limit + 1),
    '--since', window.startTime, '--until', window.endTime, '--namespace', args.namespace];
  if (args.pod) command.push('--pod', `${args.namespace}/${args.pod}`);
  if (args.verdict) command.push('--verdict', args.verdict);
  if (args.node) command.push('--node-name', args.node);
  active++;
  try {
    return await new Promise((resolve, reject) => {
      let child;
      try { child = spawn(binary, command, { env: { PATH: process.env.PATH, HOME: '/tmp' }, stdio: ['ignore', 'pipe', 'pipe'] }); }
      catch (error) { reject(error); return; }
      let pending = Buffer.alloc(0), rawBytes = 0, stderr = '', matched = 0, outputBytes = 0;
      let flows = [], warnings = [], reasons = new Set(), seen = 0;
      const warn = item => {
        reasons.add('relay_observation');
        if (warnings.length < 20) warnings.push(boundedUtf8(JSON.stringify(item), 2048).text);
      };
      const stop = reason => { reasons.add(reason); child.kill('SIGKILL'); };
      const timer = setTimeout(() => stop('timeout'), timeout);
      const processLine = line => {
        if (!line.trim()) return;
        let event;
        try { event = classify(JSON.parse(line)); } catch { reasons.add('invalid_json'); return; }
        if (event.warning) { warn(event.warning); return; }
        seen++;
        const flow = event.flow;
        const peers = [flow.source, flow.destination];
        if (!peers.some(p => p?.namespace === args.namespace && (!args.pod || (p.pod_name ?? p.podName) === args.pod))) return;
        if (args.verdict && flow.verdict !== args.verdict) return;
        matched++;
        const compact = summarize({ flow });
        if (typeof compact.summary === 'string') {
          const bounded = boundedUtf8(compact.summary, 8192);
          compact.summary = bounded.text;
          compact.summaryTruncated = bounded.truncated;
          if (bounded.truncated) reasons.add('summary_byte_limit');
        }
        flows.push(compact);
        flows.sort((a, b) => String(a.time).localeCompare(String(b.time)));
        if (flows.length > args.limit) { flows.shift(); reasons.add('flow_limit'); }
        outputBytes = Buffer.byteLength(JSON.stringify(flows));
        while (outputBytes > MAX_OUTPUT_BYTES && flows.length) {
          flows.shift(); reasons.add('output_byte_limit'); outputBytes = Buffer.byteLength(JSON.stringify(flows));
        }
      };
      const consume = (chunk, isError) => {
        const remaining = MAX_RAW_BYTES - rawBytes;
        rawBytes += Math.min(remaining, chunk.length);
        const accepted = chunk.subarray(0, Math.max(0, remaining));
        if (isError) stderr = boundedUtf8(stderr + accepted.toString('utf8'), 4096).text;
        else {
          pending = Buffer.concat([pending, accepted]);
          let newline;
          while ((newline = pending.indexOf(10)) >= 0) {
            processLine(pending.subarray(0, newline).toString('utf8'));
            pending = pending.subarray(newline + 1);
          }
        }
        if (chunk.length >= remaining) stop('raw_byte_limit');
      };
      child.stdout.on('data', chunk => consume(chunk, false));
      child.stderr.on('data', chunk => consume(chunk, true));
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (pending.length) {
          if (code === 0 && !reasons.has('raw_byte_limit')) processLine(pending.toString('utf8'));
          else reasons.add('partial_record');
        }
        if (stderr.trim()) { reasons.add('relay_stderr'); warnings.push(stderr); }
        if (code !== 0) reasons.add('cli_failed');
        // Relay requests are per peer. Saturation can hide records even after exact pod filtering.
        if (seen >= args.limit + 1) reasons.add('peer_result_limit_possible');
        resolve({
          requestedWindow: window, namespace: args.namespace, pod: args.pod ?? null, node: args.node ?? null,
          verdict: args.verdict ?? null, limit: args.limit, rawBytesRead: rawBytes, matched,
          status: reasons.size ? 'partial' : 'ok', historicalCompleteness: 'unknown',
          reasons: [...reasons], warnings, cliExitCode: code, cliSignal: signal,
          returnedWindow: { first: flows[0]?.time ?? null, last: flows.at(-1)?.time ?? null },
          continuation: { strategy: 'Split the requested window, query an older window, or narrow pod/node. No lossless cursor; identical timestamps may still saturate a query.', ...window },
          retention: 'Only available peer ring buffers; overwritten flows cannot be recovered. Empty results do not prove coverage or absence of drops.',
          flows,
        });
      });
    });
  } finally { active--; }
}
