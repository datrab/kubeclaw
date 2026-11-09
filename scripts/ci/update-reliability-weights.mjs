import fs from 'node:fs';
// Download successful reliability-timings-* artifacts into one directory first.
// Updating scheduling weights never changes which files selectTests includes.
const inputs = process.argv.slice(2);
if (!inputs.length) throw new Error('Pass measured per-shard timing JSON artifacts');
const values = new Map();
for (const input of inputs) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (data.schemaVersion !== 1 || !data.files || typeof data.files !== 'object') throw new Error('Invalid timing artifact');
  for (const [file, record] of Object.entries(data.files)) {
    if (!/^[\w.-]+\.test\.(mts|mjs)$/u.test(file) || record.success !== true || !Number.isFinite(record.seconds) || record.seconds <= 0) throw new Error(`Invalid/failed file measurement: ${file}`);
    const samples = values.get(file) ?? []; samples.push(record.seconds); values.set(file, samples);
  }
}
const seconds = Object.fromEntries([...values].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([file, samples]) => {
  samples.sort((a, b) => a - b);
  return [file, Math.max(0.001, Math.round(samples[Math.floor(samples.length / 2)] * 1000) / 1000)];
}));
if (!Object.keys(seconds).length) throw new Error('No successful measured files');
console.log(JSON.stringify({ schemaVersion: 1, method: 'Median successful per-file Node test:summary durations', seconds }, null, 2));
