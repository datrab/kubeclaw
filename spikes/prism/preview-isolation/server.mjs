import http from "node:http";

const parent = `<!doctype html><meta charset="utf-8"><title>Prism isolation spike</title>
<div id="events"></div>
<iframe id="preview" sandbox="allow-scripts" src="http://127.0.0.1:4174/preview"></iframe>
<script>
const frame = document.querySelector('#preview');
const events = document.querySelector('#events');
let sequence = 0;
window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow) return;
  const message = event.data;
  if (!message || message.protocol !== 'prism-preview.v1' || message.sessionId !== 'test-session') return;
  if (!Number.isSafeInteger(message.sequence) || message.sequence <= sequence) return;
  sequence = message.sequence;
  events.dataset.last = message.type;
  events.dataset.payload = JSON.stringify(message.payload);
});
window.loadPreview = (documentData) => frame.contentWindow.postMessage({
  protocol: 'prism-preview.v1', sessionId: 'test-session', sequence: 1,
  type: 'preview.load', payload: documentData
}, '*');
</script>`;

const preview = `<!doctype html><meta charset="utf-8"><title>Preview</title>
<script>
const allowed = new Set(['preview.load', 'preview.reset']);
let sequence = 0;
const send = (type, payload = {}) => parent.postMessage({
  protocol: 'prism-preview.v1', sessionId: 'test-session', sequence: ++sequence, type, payload
}, '*');
addEventListener('message', (event) => {
  const message = event.data;
  if (event.source !== parent || !message || message.protocol !== 'prism-preview.v1' ||
      message.sessionId !== 'test-session' || !allowed.has(message.type) ||
      !Number.isSafeInteger(message.sequence) || message.sequence < 1 ||
      JSON.stringify(message).length > 8192) return;
  if (message.type === 'preview.load') {
    const text = String(message.payload?.text ?? '').slice(0, 1000);
    document.body.replaceChildren(Object.assign(document.createElement('button'), {
      textContent: text, id: 'node', type: 'button'
    }));
    document.querySelector('#node').onclick = () => send('preview.node.selected', {
      nodeId: 'node', box: document.querySelector('#node').getBoundingClientRect().toJSON()
    });
    send('preview.rendered');
  }
});
send('preview.ready');
</script>`;

const start = (port, body, csp) => http.createServer((request, response) => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}).listen(port, "127.0.0.1");

const parentServer = start(4173, parent, "default-src 'self'; frame-src http://127.0.0.1:4174; script-src 'unsafe-inline'");
const previewServer = start(4174, preview, "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
const stop = () => { parentServer.close(); previewServer.close(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
