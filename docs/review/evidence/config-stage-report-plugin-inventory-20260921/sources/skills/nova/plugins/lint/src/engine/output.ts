import fs from 'fs';
import path from 'path';

import { VERSION } from './constants.ts';

const lintOutputState: { logPath: string | null } = { logPath: null };

function log(level: any, msg: any, data: any = null) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: 'lint-report',
    msg,
    ...(data !== null && { data }),
  };
  console.error(JSON.stringify(entry));
  if (lintOutputState.logPath) {
    try { fs.appendFileSync(lintOutputState.logPath, `${JSON.stringify(entry)}\n`); } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */ /* non-critical */ }
  }
}

export { log };
