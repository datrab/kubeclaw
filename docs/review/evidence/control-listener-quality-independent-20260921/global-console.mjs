import {registerHooks} from 'node:module';
registerHooks({load(url,context,nextLoad){const result=nextLoad(url,context);if(!url.endsWith('/skills/prism/server/control-server.ts'))return result;const source=String(result.source);if(!source.includes('diagnostics.error('))throw new Error('TARGET_MISSING');return {...result,source:source.replace('diagnostics.error(','console.error(')};}});
