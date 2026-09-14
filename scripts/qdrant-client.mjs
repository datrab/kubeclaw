import https from 'node:https';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';

export function qdrantClient({ url, caFile, keyFile, timeoutMs = 600000 }) {
  const origin = new URL(url);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('QDRANT_HTTPS_ORIGIN_REQUIRED');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) throw new Error('QDRANT_TIMEOUT_INVALID');
  // Reopen files for every request: projected Secret replacement must be observed.
  const request = (pathname, method = 'GET', body) => {
    if (!pathname.startsWith('/') || pathname.startsWith('//')) throw new Error('QDRANT_PATH_INVALID');
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    if (!/^[A-Za-z0-9._~-]{32,512}$/.test(key)) throw new Error('QDRANT_API_KEY_REQUIRED');
    const ca = fs.readFileSync(caFile);
    const data = body === undefined ? undefined : JSON.stringify(body);
    return openResponse(new URL(pathname, origin), { method, ca, rejectUnauthorized: true,
      signal: AbortSignal.timeout(timeoutMs), headers: { 'api-key': key, ...(data === undefined ? {} : { 'content-type': 'application/json' }) } }, data);
  };
  return {
    async json(pathname, method, body) {
      const response = await request(pathname, method, body);
      const chunks = []; let bytes = 0;
      for await (const chunk of response) {
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) { response.destroy(); throw new Error('QDRANT_RESPONSE_TOO_LARGE'); }
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (payload.status !== 'ok' && !payload.version) throw new Error('QDRANT_RESULT_NOT_OK');
      return payload;
    },
    async download(pathname, file, maximumBytes) {
      const response = await request(pathname);
      const hash = createHash('sha256'); let size = 0;
      const measure = new Transform({ transform(chunk, encoding, done) {
        size += chunk.length;
        if (size > maximumBytes) { done(new Error('QDRANT_SNAPSHOT_TOO_LARGE')); return; }
        hash.update(chunk); done(null, chunk);
      } });
      await pipeline(response, measure, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }));
      const fd = fs.openSync(file, 'r');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      return { sha256: hash.digest('hex'), size };
    },
  };
}

function openResponse(url, options, data) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, response => {
      if (response.statusCode !== 200) {
        response.destroy(); reject(new Error(`QDRANT_HTTP_${response.statusCode}`)); return;
      }
      resolve(response);
    });
    request.on('error', reject);
    request.end(data);
  });
}
