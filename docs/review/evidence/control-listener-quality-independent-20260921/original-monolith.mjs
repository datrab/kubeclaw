import {registerHooks} from 'node:module';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../control-route-quality-20260921/control-server.before.ts',import.meta.url),'utf8');
registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);return url.endsWith('/skills/prism/server/control-server.ts')?{...result,source}:result;}});
