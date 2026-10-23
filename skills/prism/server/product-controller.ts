import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
import type { ProductConfig } from '../control/product-decisions.ts';
export class ProductControllerError extends Error {
  readonly code: string | undefined;
  constructor(status: number | undefined, body: Buffer) {
    const value = body.toString('utf8').trim();
    const code = /^DEMO_PRODUCT_[A-Z_]{1,100}$/u.test(value) ? value : undefined;
    super(code ?? `product controller response ${status}`); this.code = code;
  }
}
export async function productController(config: ProductConfig, path: string, body: unknown, timeoutMs: number, maximumResponseBytes: number, maximumTokenCharacters: number): Promise<unknown> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) throw new Error('valid product controller timeout required');
  if (!Number.isSafeInteger(maximumResponseBytes) || maximumResponseBytes < 1) throw new Error('valid product controller response limit required');
  if (!Number.isSafeInteger(maximumTokenCharacters) || maximumTokenCharacters < 1) throw new Error('valid product controller token limit required');
  const [ca, token] = await Promise.all([readFile(config.caFile), readFile(config.tokenFile, 'utf8')]);
  if (!token.trim() || token.length > maximumTokenCharacters || /[\r\n]/u.test(token.trim())) throw new Error('invalid product controller transport token');
  const bytes = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const outgoing = request(new URL(path, config.controller), {method: 'POST', ca, rejectUnauthorized: true,
      signal: AbortSignal.timeout(timeoutMs), headers: {authorization: `Bearer ${token.trim()}`, 'content-type': 'application/json', 'content-length': bytes.length}}, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maximumResponseBytes) response.destroy(new Error('product controller response too large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) { reject(new ProductControllerError(response.statusCode, Buffer.concat(chunks))); return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
      });
    });
    outgoing.on('error', reject); outgoing.end(bytes);
  });
}
