#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const DEFAULT_REPORT = 'docs/archive/clawpatch/2026-06-01-clawpatch-pipeline-review.json';
const DEFAULT_AUTOREVIEW =
  'python /home/node/.openclaw/agents/main/agent/codex-home/skills/autoreview/scripts/autoreview';

const args = parseArgs(process.argv.slice(2));
const state = {
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  mode: args.dryRun ? 'dry-run' : 'run',
  status: 'starting',
  pid: process.pid,
  sourceRoot: '',
  worktree: '',
  branch: '',
  total: 0,
  currentIndex: 0,
  currentFinding: null,
  statusFile: '',
  successes: [],
  failures: [],
};

main().catch((error) => {
  if (state.statusFile) {
    if (state.status !== 'failed') state.failures.push({ error: error.message });
    updateStatus({ status: 'failed', failures: state.failures });
  }
  loud(`PIPELINE LIGHT FAILED\n${error.stack || error.message}`);
  process.exit(1);
});

async function main() {
  failIfBypassSandbox();

  const sourceRoot = gitRoot(process.cwd());
  const statusFile = resolveStatusFile(sourceRoot);
  if (args.status) {
    printStatus(statusFile);
    return;
  }

  updateStatus({
    sourceRoot,
    statusFile,
  });
  assertClean(sourceRoot, 'source checkout must be clean before creating fix worktree');

  const reportPath = path.resolve(sourceRoot, args.report);
  const findings = loadCuratedFindings(reportPath, args);
  if (findings.length === 0) throw new Error('No curated keep/fix findings found.');

  const runId = timestamp();
  const worktree = path.resolve(
    args.worktreeDir || path.join(sourceRoot, '..', `kubeclaw-clawpatch-light-${runId}`),
  );
  const branch = `${args.branchPrefix}-${runId}`;

  loud(`Starting clawpatch pipeline light: ${findings.length} findings`);
  loud(`Worktree: ${worktree}`);
  loud(`Branch: ${branch}`);
  loud(`Status file: ${statusFile}`);

  updateStatus({
    status: args.dryRun ? 'dry_run_planned' : 'creating_worktree',
    total: findings.length,
    worktree,
    branch,
    currentIndex: 0,
    currentFinding: null,
  });

  if (args.dryRun) {
    printDryRunPlan({ sourceRoot, reportPath, findings, worktree, branch, statusFile });
    return;
  }

  runChecked(['git', 'worktree', 'add', '-b', branch, worktree, args.base], { cwd: sourceRoot });

  try {
    for (const [index, finding] of findings.entries()) {
      updateStatus({
        status: 'fixing',
        currentIndex: index + 1,
        currentFinding: findingSummary(finding),
      });
      await processFinding(worktree, finding);
    }

    updateStatus({ status: 'complete', currentFinding: null });
    notify(
      `clawpatch pipeline light complete\n` +
        `Findings fixed: ${state.successes.length}\n` +
        `Branch: ${branch}\n` +
        `Worktree: ${worktree}\n` +
        `No push was performed.`,
      'success',
    );
  } catch (error) {
    state.failures.push({ error: error.message });
    updateStatus({
      status: 'failed',
      failures: state.failures,
    });
    notify(
      `clawpatch pipeline light stopped\n` +
        `${error.message}\n` +
        `Succeeded before stop: ${state.successes.length}\n` +
        `Worktree left for inspection: ${worktree}`,
      'failure',
    );
    throw error;
  }
}

function diffNetAddedLines(repo) {
  const out = runCapture(['git', 'diff', '--numstat', 'HEAD'], { cwd: repo }).stdout;
  let added = 0;
  let deleted = 0;

  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [a, d] = line.split('\t');
    if (a !== '-') added += Number(a) || 0;
    if (d !== '-') deleted += Number(d) || 0;
  }

  return Math.max(0, added - deleted);
}

function notify(message, level = 'info') {
  loud(message);

  if (!args.notifyCommand) return;

  const result = runShell(args.notifyCommand, {
    cwd: process.cwd(),
    env: {
      ...safeEnv(),
      PIPELINE_LIGHT_MESSAGE: message,
      PIPELINE_LIGHT_LEVEL: level,
    },
  });

  if (result.status !== 0) {
    loud(`notify command failed:\n${result.stderr || result.stdout}`);
  }
}

function loud(message) {
  console.error(`\n[pipeline-light] ${message}`);
}

function updateStatus(patch) {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() });
  if (!state.statusFile) return;
  fs.mkdirSync(path.dirname(state.statusFile), { recursive: true });
  fs.writeFileSync(state.statusFile, JSON.stringify(state, null, 2) + '\n');
}

function resolveStatusFile(sourceRoot) {
  if (args.statusFile) return path.resolve(sourceRoot, args.statusFile);
  const gitPath = runCapture(['git', 'rev-parse', '--git-path', 'clawpatch-light/status.json'], {
    cwd: sourceRoot,
  }).stdout.trim();
  return path.resolve(sourceRoot, gitPath);
}

function printStatus(statusFile) {
  if (!fs.existsSync(statusFile)) {
    console.log(`No clawpatch pipeline light status file found at ${statusFile}`);
    return;
  }
  const current = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  const finding = current.currentFinding
    ? `${current.currentFinding.id} - ${current.currentFinding.title}`
    : 'none';
  console.log(
    [
      `status: ${current.status}`,
      `mode: ${current.mode}`,
      `updated_at: ${current.updatedAt}`,
      `progress: ${current.currentIndex}/${current.total}`,
      `current: ${finding}`,
      `successes: ${(current.successes || []).length}`,
      `failures: ${(current.failures || []).length}`,
      `branch: ${current.branch || 'n/a'}`,
      `worktree: ${current.worktree || 'n/a'}`,
      `status_file: ${statusFile}`,
    ].join('\n'),
  );
}

function printDryRunPlan({ sourceRoot, reportPath, findings, worktree, branch, statusFile }) {
  const preview = findings.slice(0, 10).map((finding, index) => {
    return `${index + 1}. ${finding.id} [${finding.severity}] ${finding.title}`;
  });
  console.log(
    [
      'clawpatch pipeline light dry run',
      `source_root: ${sourceRoot}`,
      `report: ${reportPath}`,
      `findings: ${findings.length}`,
      `base: ${args.base}`,
      `planned_branch: ${branch}`,
      `planned_worktree: ${worktree}`,
      `status_file: ${statusFile}`,
      `clawpatch_state_dir: ${args.clawpatchStateDir || 'default'}`,
      `clawpatch_extra_state_dirs: ${args.clawpatchExtraStateDirs.length || 0}`,
      `clawpatch_root_subdir: ${args.clawpatchRootSubdir || 'repo root'}`,
      `validation: ${args.validationCommand || 'none'}`,
      `autoreview: ${args.autoreviewCommand}`,
      `max_fix_cycles: ${args.maxFixCycles}`,
      `max_changed_files: ${args.maxChangedFiles}`,
      `max_net_added_lines: ${args.maxNetAddedLines}`,
      '',
      'first findings:',
      ...preview,
      findings.length > preview.length ? `... ${findings.length - preview.length} more` : '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );
}

function findingSummary(finding) {
  return {
    id: finding.id,
    title: finding.title,
    severity: finding.severity,
  };
}

function clawpatchCommand(worktree, commandArgs, findingId = '') {
  const argv = ['clawpatch'];
  const root = args.clawpatchRootSubdir
    ? path.join(worktree, args.clawpatchRootSubdir)
    : worktree;
  argv.push('--root', root);
  const stateDir = stateDirForFinding(findingId);
  if (stateDir) {
    argv.push('--state-dir', stateDir);
  }
  argv.push(...commandArgs);
  return argv;
}

function configuredStateDirs() {
  return [args.clawpatchStateDir, ...args.clawpatchExtraStateDirs]
    .filter(Boolean)
    .map((dir) => path.resolve(dir));
}

function stateDirForFinding(findingId) {
  const stateDirs = configuredStateDirs();
  if (stateDirs.length === 0 || !findingId) return stateDirs[0] || '';

  const match = stateDirs.find((dir) => {
    return fs.existsSync(path.join(dir, 'findings', `${findingId}.json`));
  });
  if (!match) {
    throw new Error(
      `No configured Clawpatch state contains finding ${findingId}. Checked: ${stateDirs.join(', ')}`,
    );
  }
  return match;
}

function gitRoot(cwd) {
  return runCapture(['git', 'rev-parse', '--show-toplevel'], { cwd }).stdout.trim();
}

function runChecked(argv, options = {}) {
  const result = run(argv, options);
  if (result.status !== 0) {
    throw new Error(`Command failed: ${argv.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function runCapture(argv, options = {}) {
  const result = run(argv, options);
  if (result.status !== 0) {
    throw new Error(`Command failed: ${argv.join(' ')}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function run(argv, options = {}) {
  return spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
}

function runShellChecked(command, options = {}) {
  const result = runShell(command, options);
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command}\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function runShell(command, options = {}) {
  return spawnSync(command, [], {
    cwd: options.cwd,
    env: options.env || process.env,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
}

function safeEnv() {
  const env = { ...process.env };
  if (isBypassSandbox(env.CLAWPATCH_CODEX_SANDBOX)) {
    throw new Error('Refusing to run with CLAWPATCH_CODEX_SANDBOX=bypass/none');
  }
  delete env.CLAWPATCH_CODEX_SANDBOX;
  return env;
}

function failIfBypassSandbox() {
  if (isBypassSandbox(process.env.CLAWPATCH_CODEX_SANDBOX)) {
    throw new Error('Refusing to run with CLAWPATCH_CODEX_SANDBOX=bypass/none');
  }
}

function isBypassSandbox(value) {
  const normalized = String(value || '').trim();
  return normalized === 'bypass' || normalized === 'none';
}

function parseArgs(raw) {
  const parsed = {
    report: DEFAULT_REPORT,
    base: 'HEAD',
    branchPrefix: 'clawpatch/light',
    worktreeDir: '',
    statusFile: '',
    clawpatchStateDir: process.env.CLAWPATCH_STATE_DIR || '',
    clawpatchExtraStateDirs: (process.env.CLAWPATCH_EXTRA_STATE_DIRS || '')
      .split(path.delimiter)
      .filter(Boolean),
    clawpatchRootSubdir: process.env.CLAWPATCH_ROOT_SUBDIR || '',
    validationCommand: process.env.PIPELINE_LIGHT_VALIDATE || '',
    notifyCommand: process.env.PIPELINE_LIGHT_NOTIFY_CMD || '',
    autoreviewCommand: process.env.AUTOREVIEW_CMD || DEFAULT_AUTOREVIEW,
    codexBin: process.env.CODEX_BIN || 'codex',
    maxFixCycles: 3,
    maxChangedFiles: 30,
    maxNetAddedLines: 250,
    limit: 0,
    startAt: '',
    severity: '',
    dryRun: false,
    status: false,
  };

  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    const next = () => {
      i += 1;
      if (i >= raw.length) throw new Error(`Missing value for ${arg}`);
      return raw[i];
    };

    if (arg === '--report') parsed.report = next();
    else if (arg === '--base') parsed.base = next();
    else if (arg === '--branch-prefix') parsed.branchPrefix = next();
    else if (arg === '--worktree-dir') parsed.worktreeDir = next();
    else if (arg === '--status-file') parsed.statusFile = next();
    else if (arg === '--clawpatch-state-dir') parsed.clawpatchStateDir = next();
    else if (arg === '--clawpatch-extra-state-dir') parsed.clawpatchExtraStateDirs.push(next());
    else if (arg === '--clawpatch-root-subdir') parsed.clawpatchRootSubdir = next();
    else if (arg === '--validation-command') parsed.validationCommand = next();
    else if (arg === '--notify-command') parsed.notifyCommand = next();
    else if (arg === '--autoreview-command') parsed.autoreviewCommand = next();
    else if (arg === '--codex-bin') parsed.codexBin = next();
    else if (arg === '--max-fix-cycles') parsed.maxFixCycles = Number(next());
    else if (arg === '--max-changed-files') parsed.maxChangedFiles = Number(next());
    else if (arg === '--max-net-added-lines') parsed.maxNetAddedLines = Number(next());
    else if (arg === '--limit') parsed.limit = Number(next());
    else if (arg === '--start-at') parsed.startAt = next();
    else if (arg === '--severity') parsed.severity = next();
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--status') parsed.status = true;
    else if (arg === '-h' || arg === '--help') {
      console.log(helpText());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function helpText() {
  return `
Usage:
  node scripts/clawpatch-pipeline-light.mjs [options]

Options:
  --report <path>                 Curated clawpatch report JSON
  --base <ref>                    Base ref for the fix worktree, default HEAD
  --worktree-dir <path>           Worktree path, default sibling temp dir
  --branch-prefix <name>          Branch prefix, default clawpatch/light
  --dry-run                       Check inputs and print the planned run without creating a worktree
  --status                        Print the latest status file and exit
  --status-file <path>            Status file path, default git-path clawpatch-light/status.json
  --clawpatch-state-dir <path>    Optional Clawpatch state dir to pass to fix/status commands
  --clawpatch-extra-state-dir <path>
                                  Additional state dir; repeat for merged reports from multiple runs
  --clawpatch-root-subdir <path>  Optional Clawpatch root inside each fix worktree, e.g. skills
  --validation-command <command>  Optional validation command
  --notify-command <command>      Optional shell command; receives PIPELINE_LIGHT_MESSAGE
  --autoreview-command <command>  Autoreview helper command
  --codex-bin <path>              Codex binary for review-fix cycles
  --max-fix-cycles <n>            Default 3
  --max-changed-files <n>         Default 30
  --max-net-added-lines <n>       Default 250, set 0 to disable
  --start-at <finding-id>         Resume from finding id
  --limit <n>                     Process only n findings
  --severity <high|medium|low>    Optional severity filter

Example:
  PIPELINE_LIGHT_VALIDATE='tests/verification/run-fast-verification.sh' \\
  node scripts/clawpatch-pipeline-light.mjs --limit 1
`;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function commitTitle(value) {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 90);
}

function shq(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function guardDirtyDiff(repo, finding) {
  const files = changedFiles(repo);
  if (files.length === 0) {
    throw new Error(
      `clawpatch produced no changes for ${finding.id}${clawpatchPatchAttemptSummary(finding.id)}`,
    );
  }

  const denied = files.filter((file) => {
    return (
      file.startsWith('.git/') ||
      file.startsWith('.worktrees/') ||
      file.startsWith('.clawpatch-light/') ||
      file.startsWith('node_modules/') ||
      file.startsWith('docs/archive/clawpatch/')
    );
  });

  if (denied.length > 0) {
    throw new Error(`Denied changed paths for ${finding.id}: ${denied.join(', ')}`);
  }

  if (files.length > args.maxChangedFiles) {
    throw new Error(
      `Too many changed files for ${finding.id}: ${files.length} > ${args.maxChangedFiles}\n` +
        files.join('\n'),
    );
  }

  const netAdded = diffNetAddedLines(repo);
  if (args.maxNetAddedLines > 0 && netAdded > args.maxNetAddedLines) {
    throw new Error(
      `Patch grew too much for ${finding.id}: net +${netAdded} lines > ${args.maxNetAddedLines}. ` +
        'Keep fixes simpler or raise --max-net-added-lines intentionally.',
    );
  }

  loud(`Changed files for ${finding.id}:\n${files.map((file) => `- ${file}`).join('\n')}`);
}

function clawpatchPatchAttemptSummary(findingId) {
  if (configuredStateDirs().length === 0) return '';

  const stateDir = stateDirForFinding(findingId);
  const findingPath = path.join(stateDir, 'findings', `${findingId}.json`);
  const findingRecord = readJsonFile(findingPath);
  const patchIds = Array.isArray(findingRecord?.linkedPatchAttemptIds)
    ? findingRecord.linkedPatchAttemptIds
    : [];
  const patchId = patchIds[patchIds.length - 1];
  if (!patchId) return '';

  const patchPath = path.join(stateDir, 'patches', `${patchId}.json`);
  const patchRecord = readJsonFile(patchPath);
  if (!patchRecord) return `\nLatest clawpatch patch attempt: ${patchId}`;

  const filesChanged = Array.isArray(patchRecord.filesChanged) ? patchRecord.filesChanged.length : 0;
  const details = [
    '',
    `Latest clawpatch patch attempt: ${patchId}`,
    `patch_status: ${patchRecord.status || 'unknown'}`,
    `files_changed: ${filesChanged}`,
  ];
  if (patchRecord.plan) details.push(`plan: ${patchRecord.plan}`);
  return `\n${details.join('\n')}`;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function loadCuratedFindings(reportPath, options) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const byId = new Map((report.items || []).map((item) => [item.id, item]));
  const orderedIds = [];

  for (const batch of report.triage_decisions || []) {
    for (const decision of batch.decisions || []) {
      if (decision.disposition === 'keep' && decision.action === 'fix') {
        orderedIds.push(decision.id);
      }
    }
  }

  const ids = orderedIds.length > 0 ? orderedIds : (report.items || []).map((item) => item.id);
  const seen = new Set();
  let findings = ids
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((id) => byId.get(id))
    .filter(Boolean);

  if (options.severity) {
    findings = findings.filter((finding) => finding.severity === options.severity);
  }

  if (options.startAt) {
    const index = findings.findIndex((finding) => finding.id === options.startAt);
    if (index < 0) throw new Error(`--start-at finding not found: ${options.startAt}`);
    findings = findings.slice(index);
  }

  if (options.limit > 0) {
    findings = findings.slice(0, options.limit);
  }

  return findings;
}

function assertClean(repo, message) {
  const status = runCapture(['git', 'status', '--porcelain=v1'], { cwd: repo }).stdout.trim();
  if (status) {
    throw new Error(`${message}\n${status}`);
  }
}

function changedFiles(repo) {
  const tracked = runCapture(['git', 'diff', '--name-only', 'HEAD'], { cwd: repo }).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const untracked = runCapture(['git', 'ls-files', '--others', '--exclude-standard'], { cwd: repo }).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

function runCodexReviewFix(worktree, finding, review, cycle) {
  const out = path.join(
    worktree,
    '.clawpatch-light',
    'autoreview',
    safeName(finding.id),
    String(cycle),
    'codex-fix.txt',
  );

  const prompt = [
    'You are repairing a dirty diff produced by clawpatch fix for one curated finding.',
    '',
    `Finding ID: ${finding.id}`,
    `Finding title: ${finding.title}`,
    '',
    'Rules:',
    '- Fix only the actionable autoreview issues below.',
    '- Keep the patch minimal.',
    '- Do not broaden the scope.',
    '- Do not push.',
    '- Do not commit.',
    '- Do not use sandbox bypass.',
    '- Prefer deleting/simplifying over adding abstractions.',
    '',
    'Autoreview output:',
    review.text.slice(0, 30000),
  ].join('\n');

  const result = spawnSync(
    args.codexBin,
    ['exec', '--cd', worktree, '--sandbox', 'workspace-write', '--output-last-message', out, '-'],
    {
      input: prompt,
      encoding: 'utf8',
      env: safeEnv(),
      maxBuffer: 1024 * 1024 * 50,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `Codex review-fix cycle ${cycle} failed for ${finding.id}\n` +
        `${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }
}

async function processFinding(worktree, finding) {
  assertClean(worktree, `worktree must be clean before finding ${finding.id}`);

  updateStatus({ status: 'clawpatch_fix', currentFinding: findingSummary(finding) });
  notify(`Fixing ${finding.id}\n${finding.title}`, 'start');

  runChecked(clawpatchCommand(worktree, ['fix', '--finding', finding.id], finding.id), {
    cwd: worktree,
    env: safeEnv(),
  });

  guardDirtyDiff(worktree, finding);

  if (args.validationCommand) {
    updateStatus({ status: 'validation', currentFinding: findingSummary(finding) });
    runShellChecked(args.validationCommand, { cwd: worktree, env: safeEnv() });
  }

  updateStatus({ status: 'autoreview', currentFinding: findingSummary(finding) });
  let review = runAutoreview(worktree, finding, 0);
  let cycle = 0;

  while (!review.clean && cycle < args.maxFixCycles) {
    cycle += 1;
    updateStatus({
      status: 'autoreview_fix_cycle',
      currentFinding: findingSummary(finding),
      reviewCycle: cycle,
    });
    notify(
      `Autoreview found issues for ${finding.id}; starting fix cycle ${cycle}/${args.maxFixCycles}`,
      'review_issues',
    );

    runCodexReviewFix(worktree, finding, review, cycle);
    cleanupReviewArtifacts(worktree);
    guardDirtyDiff(worktree, finding);

    if (args.validationCommand) {
      updateStatus({ status: 'validation', currentFinding: findingSummary(finding), reviewCycle: cycle });
      runShellChecked(args.validationCommand, { cwd: worktree, env: safeEnv() });
    }

    updateStatus({ status: 'autoreview', currentFinding: findingSummary(finding), reviewCycle: cycle });
    review = runAutoreview(worktree, finding, cycle);
  }

  if (!review.clean) {
    throw new Error(
      `Autoreview still found actionable issues after ${args.maxFixCycles} fix cycles for ${finding.id}`,
    );
  }

  cleanupReviewArtifacts(worktree);
  guardDirtyDiff(worktree, finding);

  updateStatus({ status: 'committing', currentFinding: findingSummary(finding), reviewCycle: cycle });
  runChecked(['git', 'add', '-A'], { cwd: worktree });
  runChecked(
    [
      'git',
      'commit',
      '-m',
      `fix(clawpatch): ${commitTitle(finding.title)}`,
      '-m',
      `Finding: ${finding.id}`,
      '-m',
      'Source: curated clawpatch triage',
    ],
    { cwd: worktree },
  );

  state.successes.push(finding.id);
  updateStatus({ status: 'committed', successes: state.successes, currentFinding: findingSummary(finding) });
  notify(`Fixed and committed ${finding.id}\n${finding.title}`, 'success');
}

function cleanupReviewArtifacts(worktree) {
  fs.rmSync(path.join(worktree, '.clawpatch-light'), { recursive: true, force: true });
}

function runAutoreview(worktree, finding, cycle) {
  const dir = path.join(
    worktree,
    '.clawpatch-light',
    'autoreview',
    safeName(finding.id),
    String(cycle),
  );
  fs.mkdirSync(dir, { recursive: true });

  const promptFile = path.join(dir, 'prompt.md');
  const datasetFile = path.join(dir, 'dataset.json');
  const outputFile = path.join(dir, 'review.txt');
  const jsonFile = path.join(dir, 'review.json');

  fs.writeFileSync(
    promptFile,
    [
      `Review the dirty diff for clawpatch finding ${finding.id}.`,
      '',
      `Finding title: ${finding.title}`,
      '',
      'Only report concrete bugs, regressions, safety issues, missing tests, or over-complicated fixes introduced by this diff.',
      'Reject speculative broad rewrites.',
      'The desired style is the smallest correct fix; code should not grow unless the bug genuinely needs it.',
      'Do not suggest pushing.',
    ].join('\n'),
  );

  fs.writeFileSync(
    datasetFile,
    JSON.stringify(
      {
        finding,
        changed_files: changedFiles(worktree),
        diff_stat: runCapture(['git', 'diff', '--stat', 'HEAD'], { cwd: worktree }).stdout,
      },
      null,
      2,
    ),
  );

  const command =
    `${args.autoreviewCommand} --mode local ` +
    `--prompt-file ${shq(promptFile)} ` +
    `--dataset ${shq(datasetFile)} ` +
    `--output ${shq(outputFile)} ` +
    `--json-output ${shq(jsonFile)}`;

  const result = runShell(command, { cwd: worktree, env: safeEnv() });
  const text = fs.existsSync(outputFile)
    ? fs.readFileSync(outputFile, 'utf8')
    : result.stdout + result.stderr;

  return {
    clean: result.status === 0,
    status: result.status,
    text,
    outputFile,
    jsonFile,
  };
}
