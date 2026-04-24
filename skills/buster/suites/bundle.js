// ═══════════════════════════════════════════════════════════════
// Suite: bundle — Build Output Size Check
// ═══════════════════════════════════════════════════════════════
//
// Measures the size and file count of /sandbox/www/ after build.
//
// Two modes based on config:
//   No thresholds configured → INFORMATIONAL: always PASS, size
//     reported as findings for awareness. Typical for module tests.
//   Thresholds configured → ENFORCED: FAIL if size/count exceeds
//     thresholds. Typical for gate tests.
//
// Config (from context.config.bundle):
//   Informational: {} or absent
//   Enforced: { thresholds: { max_size_kb: 5120, max_file_count: 200 } }
//
// Dependencies: build (needs build output, not a running app)

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../verdict-schema.js';
import { validateAllowedPath } from '../../common/pipeline/security.js';

// ── Defaults ────────────────────────────────────────────────────

const DEFAULTS = {
  www_dir: '/sandbox/www',
};

// ── Helpers ─────────────────────────────────────────────────────

let _logSink = null;
function log(msg) {
  console.log(`[SUITE] [BUNDLE] ${msg}`);
  if (_logSink) _logSink({ suite: 'bundle', msg });
}

/**
 * Recursively count files and collect sizes.
 * Returns { count, files: [{ path, size_kb }] }
 */
function scanDir(dir) {
  const files = [];

  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        try {
          const stats = fs.statSync(full);
          files.push({
            path: full.replace(dir + '/', ''),
            size_kb: Math.round(stats.size / 1024),
          });
        } catch {}
      }
    }
  }

  walk(dir);
  return { count: files.length, files };
}

// ── Suite Entry Point ───────────────────────────────────────────

export default async function bundleSuite(context) {
  _logSink = context.logSink || null;
  const startTime  = Date.now();
  const config     = context.config?.bundle || {};
  const wwwDir     = validateAllowedPath(config.www_dir || DEFAULTS.www_dir, 'bundle.www_dir');
  const thresholds = config.thresholds || null; // null = informational, object = enforced
  const enforced   = thresholds !== null;

  // 1. Check if build output exists
  if (!fs.existsSync(wwwDir)) {
    const duration_ms = Date.now() - startTime;
    log(`Build output not found: ${wwwDir} — SKIP`);
    return createSuiteVerdict('bundle', STATUS.SKIP, {
      duration_ms,
      reason: `Build output directory not found: ${wwwDir}`,
    });
  }

  // 2. Get total size via du
  let totalSizeKb = 0;
  try {
    const output = execFileSync('du', ['-sk', wwwDir], { encoding: 'utf8' });
    totalSizeKb = parseInt(String(output).trim().split(/\s+/)[0], 10) || 0;
  } catch (err) {
    log(`du failed: ${err.message}`);
  }

  // 3. Scan files
  const { count: fileCount, files } = scanDir(wwwDir);

  // 4. Top 5 largest files
  const largestFiles = files
    .sort((a, b) => b.size_kb - a.size_kb)
    .slice(0, 5)
    .map(f => `${f.path} (${f.size_kb} KB)`);

  log(`Size: ${totalSizeKb} KB (${fileCount} files) — mode: ${enforced ? 'enforced' : 'informational'}`);

  // 5. Build findings
  const findings    = [];
  let checksFailed  = 0;
  const checksTotal = 2; // size + file count

  if (enforced) {
    // ENFORCED MODE: check against thresholds, can FAIL
    const maxSizeKb = thresholds.max_size_kb;
    const maxFiles  = thresholds.max_file_count;

    if (maxSizeKb != null && totalSizeKb > maxSizeKb) {
      checksFailed++;
      findings.push(createFinding(SEVERITY.SERIOUS,
        `Bundle size ${totalSizeKb} KB exceeds max ${maxSizeKb} KB`,
        { rule: 'max-size' }
      ));
    }

    if (maxFiles != null && fileCount > maxFiles) {
      checksFailed++;
      findings.push(createFinding(SEVERITY.MODERATE,
        `File count ${fileCount} exceeds max ${maxFiles}`,
        { rule: 'max-files' }
      ));
    }
  } else {
    // INFORMATIONAL MODE: report notable sizes, always PASS
    if (totalSizeKb > 5120) {
      findings.push(createFinding(SEVERITY.MODERATE,
        `Bundle size ${totalSizeKb} KB is large (>5 MB)`,
        { rule: 'size-info' }
      ));
    } else if (totalSizeKb > 3072) {
      findings.push(createFinding(SEVERITY.MINOR,
        `Bundle size ${totalSizeKb} KB (>3 MB)`,
        { rule: 'size-info' }
      ));
    }
  }

  const checksPassed = checksTotal - checksFailed;
  const duration_ms  = Date.now() - startTime;
  const status       = (enforced && checksFailed > 0) ? STATUS.FAIL : STATUS.PASS;
  const icon         = status === STATUS.PASS ? '✅' : '⚠️';

  log(`${icon} ${enforced ? 'enforced' : 'informational'}: ${totalSizeKb} KB, ${fileCount} files (${duration_ms}ms)`);

  return createSuiteVerdict('bundle', status, {
    critical: false,
    duration_ms,
    checks_total:  checksTotal,
    checks_passed: checksPassed,
    checks_failed: checksFailed,
    findings,
    metadata: {
      total_size_kb: totalSizeKb,
      file_count:    fileCount,
      largest_files: largestFiles,
      mode:          enforced ? 'enforced' : 'informational',
      ...(enforced ? { thresholds } : {}),
    },
  });
}
