import fs from 'fs';
import os from 'os';
import path from 'path';

export function createTempManager() {
  let _dir = null;
  const manager = {
    init() {
      _dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-pipeline-'));
      process.on('exit', () => manager.cleanup());
      return _dir;
    },
    file(prefix, moduleId = '', ext = '.tmp') {
      if (!_dir) manager.init();
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      return path.join(_dir, `${prefix}-${moduleId}-${ts}-${rand}${ext}`);
    },
    cleanup() {
      if (_dir && fs.existsSync(_dir)) {
        try {
          fs.rmSync(_dir, { recursive: true, force: true });
        } catch { /* non-critical */ }
      }
    },
    get dir() { return _dir; },
  };
  return manager;
}
