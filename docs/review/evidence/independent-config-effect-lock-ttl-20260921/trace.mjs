import fs from 'node:fs';
import crypto from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
const output = new URL(`./loaded-${process.pid}.jsonl`, import.meta.url);
registerHooks({load(url,context,next) {
 const result = next(url,context);
 if (url.startsWith('file:')) {
  const file=fileURLToPath(url);
  fs.appendFileSync(output,JSON.stringify({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')})+'\n');
 }
 return result;
}});
