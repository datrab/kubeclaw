// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { assertSafePathSegment } from './paths.ts';

declare const process: {
  on(event: 'exit', listener: () => void): void;
};

export function createTempManager() {
  let _dir: string | null = null;
  const manager = {
    init() {
      _dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-pipeline-'));
      process.on('exit', () => manager.cleanup());
      return _dir;
    },
    file(prefix: string, moduleId = '', ext = '.tmp') {
      if (!_dir) manager.init();
      const safePrefix = assertSafePathSegment(prefix, 'temp file prefix');
      const safeModuleId = assertSafePathSegment(moduleId, 'temp file module id', { allowEmpty: true });
      const safeExt = assertSafePathSegment(ext, 'temp file extension', { allowEmpty: true });
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return path.join(_dir, `${safePrefix}-${safeModuleId}-${ts}-${rand}${safeExt}`);
    },
    cleanup() {
      if (_dir && fs.existsSync(_dir)) {
        try {
          fs.rmSync(_dir, { recursive: true, force: true });
        } catch (_error) { /* non-critical */ }
      }
    },
    get dir() { return _dir; },
  };
  return manager;
}
