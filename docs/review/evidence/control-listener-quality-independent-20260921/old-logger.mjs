import {registerHooks} from 'node:module';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const old=fs.readFileSync(new URL('./source/skills/prism/server/control-server.ts',import.meta.url),'utf8');
if(createHash('sha256').update(old).digest('hex')!=='5d2f664e02f966f0e7e7ce1d65d29bfd24fd28708040b416a8e469e6caf6ef5d')throw new Error('OLD_LOGGER_SNAPSHOT_MISMATCH');
registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);return url.endsWith('/skills/prism/server/control-server.ts')?{...result,source:old}:result;}});
