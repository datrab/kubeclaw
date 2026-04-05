// ═══════════════════════════════════════════════════════════════
// Buster Logger — Structured JSON dual-write (stdout + JSONL file)
// ═══════════════════════════════════════════════════════════════
//
// Provides per-task structured logging with sync file writes.
// Each log entry contains: ts, level, tag, msg, module, step,
// task_type, and optional data fields.
//
// Usage:
//   const logger = createLogger({ logPath, module, taskType });
//   logger.step('pre-cleanup');
//   logger.info('SANDBOX', 'Cleanup started');
//   logger.warn('GIT', 'No commit hash provided');
//   logger.error('SPAWN', 'Failed to spawn session', { err: e.message });
//   logger.flush(); // no-op — writes are synchronous

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Create a structured logger that writes JSON entries to stdout and a JSONL file.
 *
 * Log directory is created once on construction (not per entry).
 * File writes use appendFileSync — no buffering, no async I/O in the hot path.
 *
 * @param {object} opts
 * @param {string} [opts.logPath]    - Absolute or relative path to JSONL output file.
 *                                     If omitted, writes to stdout only.
 * @param {string} [opts.module]     - Module identifier (e.g. "06-observability-alignment")
 * @param {string} [opts.taskType]   - Task type (e.g. "module_test")
 * @returns {Logger}
 */
export function createLogger(opts = {}) {
  const { logPath, module: mod = '', taskType = '' } = opts;
  let currentStep = '';

  // Create parent directory once at construction time, not per-entry.
  if (logPath) {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch {
      // If directory creation fails, we still write to stdout.
    }
  }

  function write(level, tag, msg, data) {
    const entry = {
      ts:        new Date().toISOString(),
      level,
      tag,
      msg,
      module:    mod,
      step:      currentStep,
      task_type: taskType,
    };
    if (data !== undefined && data !== null && typeof data === 'object' && Object.keys(data).length > 0) {
      entry.data = data;
    }

    // stdout — human-readable prefix
    console.log(`[BUSTER-ORCH] [${level}] [${tag}] ${msg}`);

    // file — compact JSON line
    if (logPath) {
      try {
        appendFileSync(logPath, JSON.stringify(entry) + '\n');
      } catch {
        // File write failures must never propagate — log to stderr and continue.
        process.stderr.write(`[logger] appendFileSync failed: ${logPath}\n`);
      }
    }
  }

  return {
    /**
     * Log an INFO entry.
     * @param {string} tag   - Short category label (e.g. "SANDBOX", "GIT")
     * @param {string} msg   - Human-readable message
     * @param {object} [data] - Optional structured payload
     */
    info(tag, msg, data)  { write('INFO',  tag, msg, data); },

    /**
     * Log a WARN entry.
     */
    warn(tag, msg, data)  { write('WARN',  tag, msg, data); },

    /**
     * Log an ERROR entry.
     */
    error(tag, msg, data) { write('ERROR', tag, msg, data); },

    /**
     * Set the current step label and emit a STEP log entry.
     * All subsequent entries will include this step name.
     *
     * @param {string} stepName - Step identifier (e.g. "pre-cleanup", "git-sync")
     */
    step(stepName) {
      currentStep = stepName;
      write('STEP', 'STEP', stepName);
    },

    /**
     * No-op. Writes are synchronous — no buffer to flush.
     */
    flush() {},
  };
}
