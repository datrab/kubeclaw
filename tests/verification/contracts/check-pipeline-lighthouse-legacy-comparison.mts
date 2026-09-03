import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const legacyRevision = '096372424';
const legacyPath = 'skills/buster/plugins/buster-suite-runtime/src/runtime/suites/perf.ts';
const legacy = execFileSync('git', ['show', `${legacyRevision}:${legacyPath}`], { encoding: 'utf8' });
for (const marker of [
  'static_port: 9999', 'server_port: 3000', "path: '/'", 'timeout: 60', 'suiteDeadlineMs', 'suiteAbortSignal',
  'buildSubprocessEnv()', '--only-categories=performance,accessibility,best-practices,seo', 'config.thresholds',
  'category missing from report', 'evidence-only', '.lighthouse-report-', 'fs.renameSync', 'output_path', 'toolErrorVerdict',
]) assert.match(legacy, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), `legacy fact absent: ${marker}`);
const provider = fs.readFileSync('skills/buster/plugins/lighthouse/src/provider.js', 'utf8');
const schema = fs.readFileSync('skills/buster/plugins/lighthouse/schemas/config.schema.json', 'utf8');
assert.doesNotMatch(schema, /output_path/u);
assert.match(provider, /LIGHTHOUSE_CATEGORY_MISSING/u); assert.match(provider, /LIGHTHOUSE_METRIC_MISSING/u);
assert.match(provider, /performance-report-representative/u); assert.match(provider, /config\.purpose === 'performance'/u);
console.log(JSON.stringify({ ok: true, phase: 'lighthouse-legacy-comparison', legacyRevision, oldFacts: 15 }));
