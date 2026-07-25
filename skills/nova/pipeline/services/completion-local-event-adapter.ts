import fs from 'fs';
import path from 'path';
import { assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import { adapterErrorMessage, attachExternalAbort } from './event-adapter-support.ts';
import { objectRecord } from '../value-boundary.ts';

function uniquePaths(paths: any = []) {
  return [...new Set((Array.isArray(paths) ? paths : []).filter(Boolean).map((item) => path.resolve(item)))];
}

function nearestExistingDirectory(targetPath: string) {
  let current = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory() ? targetPath : path.dirname(targetPath);
  while (current && !fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return fs.existsSync(current) && fs.statSync(current).isDirectory() ? current : null;
}

function watcherSpec(targetPath: string) {
  const existingDir = nearestExistingDirectory(targetPath);
  if (!existingDir) return { targetPath, watchPath: null, fileName: path.basename(targetPath) };
  const watchPath = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() ? path.dirname(targetPath) : existingDir;
  return { targetPath, watchPath, fileName: path.basename(targetPath) };
}

function relatedPath(candidatePath: string, targetPath: string) {
  const relative = path.relative(path.resolve(candidatePath), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

class LocalEvidenceAdapter {
  eventBus: any;
  evidencePaths: string[];
  identity: any;
  debounceMs: number;
  emitExisting: boolean;
  controller = new AbortController();
  watchers: any[] = [];
  rescanTimers: any[] = [];
  activeWatchKeys = new Set<string>();
  activeRescanKeys = new Set<string>();
  changedPaths = new Set<string>();
  timer: ReturnType<typeof setTimeout> | null = null;
  started = false;
  detachExternalAbort: () => void;

  constructor(opts: any) {
    this.eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'LocalEvidenceEventAdapter eventBus');
    this.evidencePaths = uniquePaths(opts.paths);
    this.identity = objectRecord(opts.identity);
    if (opts.debounceMs === undefined || opts.debounceMs === null) throw new TypeError('LocalEvidenceEventAdapter requires debounceMs');
    this.debounceMs = Number(opts.debounceMs);
    if (!Number.isFinite(this.debounceMs) || this.debounceMs < 0) throw new TypeError('LocalEvidenceEventAdapter debounceMs must be a non-negative number');
    this.emitExisting = opts.emitExisting === true;
    this.detachExternalAbort = attachExternalAbort(this.controller, opts.signal, (reason: any) => this.stop(reason));
  }

  clearDebounce() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(targetPath: string) {
    if (this.controller.signal.aborted) return;
    this.changedPaths.add(targetPath);
    this.clearDebounce();
    this.timer = setTimeout(() => this.emitChanged(), this.debounceMs);
  }

  emitChanged() {
    this.timer = null;
    if (this.controller.signal.aborted || this.changedPaths.size === 0) return;
    const paths = [...this.changedPaths];
    this.changedPaths.clear();
    this.eventBus.emit({ type: 'local.evidence.updated', source: 'local_fs', identity: this.identity, payload: { paths, watched_paths: this.evidencePaths, debounce_ms: this.debounceMs } });
  }

  stop(reason: any = 'stopped') {
    if (!this.controller.signal.aborted) this.controller.abort(reason);
    this.clearDebounce();
    this.changedPaths.clear();
    for (const watcher of this.watchers.splice(0)) {
      try { watcher.close(); } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): watcher may already be closed. */ }
    }
    for (const timer of this.rescanTimers.splice(0)) clearInterval(timer);
    this.activeWatchKeys.clear();
    this.activeRescanKeys.clear();
    this.detachExternalAbort();
  }

  startRescan(spec: any) {
    if (this.activeRescanKeys.has(spec.targetPath)) return;
    this.activeRescanKeys.add(spec.targetPath);
    const interval = setInterval(() => this.rescan(spec), Math.max(10, Math.min(this.debounceMs, 250)));
    this.rescanTimers.push(interval);
  }

  rescan(spec: any) {
    if (this.controller.signal.aborted) return;
    const next = watcherSpec(spec.targetPath);
    if (next.watchPath && next.watchPath !== spec.watchPath) this.startWatcher(next);
    if (fs.existsSync(spec.targetPath)) this.schedule(spec.targetPath);
  }

  startWatcher(spec: any) {
    if (!fs.existsSync(spec.targetPath)) this.startRescan(spec);
    if (!spec.watchPath) return this.emitWarning('watch_path_missing', spec.targetPath);
    const key = `${spec.targetPath}\0${spec.watchPath}`;
    if (this.activeWatchKeys.has(key)) return;
    try {
      const watcher = fs.watch(spec.watchPath, (_eventType, fileName) => this.handleWatchEvent(spec, fileName));
      watcher.on?.('error', (error: any) => this.emitFatal('watcher_error', spec.targetPath, error));
      this.activeWatchKeys.add(key);
      this.watchers.push(watcher);
      if (this.emitExisting && fs.existsSync(spec.targetPath)) this.schedule(spec.targetPath);
    } catch (error: any) {
      this.emitWarning(error?.code === 'ENOSPC' ? 'watcher_limit_reached' : 'watcher_start_failed', spec.targetPath, error);
    }
  }

  handleWatchEvent(spec: any, fileName: any) {
    const changedName = fileName ? String(fileName) : null;
    const changedPath = changedName ? path.resolve(spec.watchPath, changedName) : null;
    if (changedPath && changedName !== spec.fileName && changedPath !== spec.targetPath && !relatedPath(changedPath, spec.targetPath)) return;
    this.schedule(spec.targetPath);
    const next = watcherSpec(spec.targetPath);
    if (next.watchPath && next.watchPath !== spec.watchPath) this.startWatcher(next);
  }

  emitWarning(reason: string, targetPath: string, error?: any) {
    this.eventBus.emit({ type: 'local.evidence.warning', source: 'local_fs', identity: this.identity, payload: { adapter: 'local_evidence', reason, path: targetPath, ...(error ? { error: adapterErrorMessage(error) } : {}) } });
  }

  emitFatal(reason: string, targetPath: string, error: any) {
    if (this.controller.signal.aborted) return;
    this.eventBus.emit({ type: 'fatal.error', source: 'system', identity: this.identity, payload: { adapter: 'local_evidence', reason, path: targetPath, error: adapterErrorMessage(error) } });
  }

  start() {
    if (this.started) return { watching: this.watchers.length, paths: this.evidencePaths };
    this.started = true;
    if (!this.controller.signal.aborted) for (const targetPath of this.evidencePaths) this.startWatcher(watcherSpec(targetPath));
    return { watching: this.watchers.length, paths: this.evidencePaths };
  }
}

export function createLocalEvidenceEventAdapter(_config: any, opts: any = {}) {
  const adapter = new LocalEvidenceAdapter(opts);
  return {
    get signal() { return adapter.controller.signal; },
    get watcherCount() { return adapter.watchers.length; },
    start: () => adapter.start(),
    stop: (reason?: any) => adapter.stop(reason),
  };
}
