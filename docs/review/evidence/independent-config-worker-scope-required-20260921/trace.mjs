import fs from 'node:fs';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
const files = new Map();
registerHooks({load(url, context, next) {
 const result=next(url, context);
 if(url.startsWith('file:')) { const path=fileURLToPath(url); files.set(path,crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')); }
 return result;
}});
await import('./probe.mjs');
fs.writeFileSync(new URL('./loaded-runtime.json',import.meta.url),JSON.stringify(Object.fromEntries(files),null,2)+'\n');
