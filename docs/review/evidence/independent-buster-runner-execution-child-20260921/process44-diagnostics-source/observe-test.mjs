import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
const spec=JSON.parse(fs.readFileSync(new URL('./spec.json',import.meta.url),'utf8'));
registerHooks({load(url,context,next){const result=next(url,context);if(url!==pathToFileURL(spec.file).href)return result;
let source=String(result.source);if(createHash('sha256').update(source).digest('hex')!==spec.sha256)throw Error('DIAGNOSTIC_SOURCE_MISMATCH');
for(const [from,to] of spec.pairs){if(source.split(from).length!==2)throw Error('DIAGNOSTIC_ANCHOR_MISMATCH');source=source.replace(from,to);}
console.error('DIAGNOSTIC_EXACT_SOURCE_APPLIED',spec.sha256);return {...result,source};}});
