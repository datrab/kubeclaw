import fs from 'node:fs';
import {registerHooks} from 'node:module';
const sourceFile = process.env.CONTROL_LOGGER_REFERENCE === 'original'
  ? new URL('./control-server.before.ts', import.meta.url)
  : new URL('./control-server.failed-stderr.before.ts', import.meta.url);
registerHooks({load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (url.endsWith('/skills/prism/server/control-server.ts')) {
    return {...loaded, source: fs.readFileSync(sourceFile, 'utf8')};
  }
  return loaded;
}});
