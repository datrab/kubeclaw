import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const seconds = (start, end) => Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
export function buildCacheMetrics(log) {
  const cached = new Set(), exports = new Map();
  let build = 0;
  for (const line of log.split('\n')) {
    // Each BuildKit invocation restarts its step IDs, even on the same builder.
    // A toolchain miss and the runtime build share one Actions job log.
    if (/#0 building with /u.test(line)) build++;
    const key = id => `${build}:${id}`;
    const hit = line.match(/#(\d+) CACHED\b/u);
    if (hit) cached.add(key(hit[1]));
    const begin = line.match(/#(\d+) exporting (?:to GitHub Actions Cache|cache to registry)/u);
    if (begin) exports.set(key(begin[1]), { build, kind: line.includes('GitHub') ? 'gha' : 'registry', seconds: null });
    const done = line.match(/#(\d+) DONE ([\d.]+)s/u);
    if (done && exports.has(key(done[1]))) exports.get(key(done[1])).seconds = Number(done[2]);
  }
  return { cachedSteps: cached.size, cacheExports: [...exports.values()] };
}
export function timingReport(run, jobs) {
  const complete = jobs.filter(job => job.completed_at && job.conclusion !== 'skipped' && job.name !== 'CI timings');
  return {
    run: run.html_url, commit: run.head_sha, attempt: run.run_attempt,
    conclusion: run.conclusion ?? 'in_progress',
    // This is elapsed time to the last finished workload, not a sum of parallel jobs.
    workloadSeconds: complete.length ? seconds(run.run_started_at, new Date(Math.max(...complete.map(job => Date.parse(job.completed_at)))).toISOString()) : 0,
    jobs: complete.map(job => ({ id: job.id, name: job.name, conclusion: job.conclusion,
      startOffsetSeconds: seconds(run.run_started_at, job.started_at),
      seconds: seconds(job.started_at, job.completed_at),
      steps: (job.steps ?? []).filter(step => step.started_at && step.completed_at && step.conclusion !== 'skipped')
        .map(step => ({ name: step.name, seconds: seconds(step.started_at, step.completed_at), conclusion: step.conclusion })),
    })),
  };
}
export async function collectTimings(repository, runId, token, request = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/u.test(repository) || !/^\d+$/u.test(String(runId))) throw new Error('Invalid CI source');
  const headers = { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const get = async resource => {
    const response = await request(`https://api.github.com/repos/${repository}/${resource}`, { headers, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`CI API returned ${response.status}`);
    return response;
  };
  const run = await (await get(`actions/runs/${runId}`)).json();
  const jobs = [];
  for (let page = 1; ; page++) {
    const data = await (await get(`actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`)).json();
    jobs.push(...data.jobs);
    if (data.jobs.length < 100) break;
  }
  const report = timingReport(run, jobs);
  for (const job of report.jobs.filter(job => /Build & Verify|Build the image/u.test(job.name))) {
    try { job.buildCache = buildCacheMetrics(await (await get(`actions/jobs/${job.id}/logs`)).text()); }
    catch (error) { job.cacheMetricsUnavailable = error.message; } // no fabricated zero hits
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await collectTimings(process.env.GITHUB_REPOSITORY, process.argv[2] ?? process.env.GITHUB_RUN_ID, process.env.GITHUB_TOKEN);
  fs.mkdirSync('dist/ci-timings', { recursive: true });
  fs.writeFileSync('dist/ci-timings/timings.json', `${JSON.stringify(report, null, 2)}\n`);
  const slow = [...report.jobs].sort((a, b) => b.seconds - a.seconds).slice(0, 12);
  const summary = `### CI elapsed and setup timings\nWorkload elapsed: ${report.workloadSeconds}s. Current attempt only; parallel durations are not added.\n\n`
    + slow.map(job => `- ${job.name}: ${job.seconds}s (started +${job.startOffsetSeconds}s)`
      + (job.buildCache ? `; cached steps ${job.buildCache.cachedSteps}, cache export ${job.buildCache.cacheExports.map(e => `build ${e.build} ${e.kind}: ${e.seconds ?? 'unknown'}s`).join(', ')}` : '')).join('\n') + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
}
