// prompts/buster-instructions.ts — BUSTER.md reader

import fs from 'fs';
import path from 'path';
import { modulePath } from '../core/paths.ts';

export function readBusterInstructions(config: any, moduleDir: any) {
  const p = path.join(modulePath(config, moduleDir), 'BUSTER.md');
  if (!fs.existsSync(p)) throw new Error(`BUSTER.md not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}
