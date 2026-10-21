// Minimal MCP client for gateway agents; never reads a Kubernetes credential.
import { request } from 'node:https';
import { readFileSync } from 'node:fs';

export async function callMcp(method, params, environment = process.env) {
  const url = new URL(environment.OPS_MCP_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('OPS_MCP_URL must use HTTPS without embedded credentials');
  const token = readFileSync(environment.OPS_MCP_TOKEN_FILE, 'utf8').trim();
  if (!/^[A-Za-z0-9._~-]{32,512}$/.test(token)) throw new Error('Invalid MCP credential');
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', ca: readFileSync(environment.OPS_MCP_CA_FILE), rejectUnauthorized: true,
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${token}` } }, res => {
      let bytes = 0; const chunks = [];
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) req.destroy(new Error('MCP response exceeds limit')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`MCP HTTP ${res.statusCode}`));
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const result = res.headers['content-type']?.includes('text/event-stream')
            ? text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5))).find(message => message.id === 1)
            : JSON.parse(text);
          if (!result || result.error || result.result?.isError) throw new Error(JSON.stringify(result?.error ?? result?.result ?? 'Invalid MCP response'));
          resolve(result.result);
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('MCP request timed out; remote effects unconfirmed')), 130000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end(body);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const [action, tool, json] = process.argv.slice(2);
    if (action !== 'list' && action !== 'call') throw new Error('Usage: client.mjs list | call <tool> <arguments-json>');
    const result = await callMcp(action === 'list' ? 'tools/list' : 'tools/call', action === 'list' ? {} : { name: tool, arguments: JSON.parse(json) });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
