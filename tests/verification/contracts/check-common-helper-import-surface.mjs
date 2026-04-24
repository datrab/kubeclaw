import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) out.push(abs);
  }
  return out;
}

const { sourceRoot } = parseArgs();
const facadePaths = [
  'skills/nova/pipeline/agents/runtime.js',
  'skills/nova/pipeline/agents/lifecycle.js',
  'skills/nova/pipeline/agents/acp-monitor.js',
  'skills/nova/pipeline/integrations/gateway.js',
  'skills/nova/pipeline/lifecycle-state.js',
  'skills/buster/pipeline/agents/runtime.js',
  'skills/buster/pipeline/agents/lifecycle.js',
  'skills/buster/pipeline/agents/acp-monitor.js',
  'skills/buster/pipeline/integrations/gateway.js',
  'skills/buster/pipeline/lifecycle-state.js',
];

for (const relPath of facadePaths) {
  assert.equal(fs.existsSync(path.join(sourceRoot, relPath)), false, `${relPath} should not remain as a same-name repo compatibility facade`);
}

const skillFiles = [
  ...walk(path.join(sourceRoot, 'skills/nova')),
  ...walk(path.join(sourceRoot, 'skills/buster')),
];
const forbiddenSpecifiers = [
  "'../agents/runtime.js'",
  '"../agents/runtime.js"',
  "'../agents/lifecycle.js'",
  '"../agents/lifecycle.js"',
  "'../agents/acp-monitor.js'",
  '"../agents/acp-monitor.js"',
  "'../integrations/gateway.js'",
  '"../integrations/gateway.js"',
  "'../lifecycle-state.js'",
  '"../lifecycle-state.js"',
  "'./pipeline/agents/runtime.js'",
  '"./pipeline/agents/runtime.js"',
  "'./pipeline/agents/lifecycle.js'",
  '"./pipeline/agents/lifecycle.js"',
  "'./pipeline/agents/acp-monitor.js'",
  '"./pipeline/agents/acp-monitor.js"',
  "'./pipeline/integrations/gateway.js'",
  '"./pipeline/integrations/gateway.js"',
  "'./pipeline/lifecycle-state.js'",
  '"./pipeline/lifecycle-state.js"',
];

for (const filePath of skillFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const specifier of forbiddenSpecifiers) {
    assert.equal(source.includes(specifier), false, `${path.relative(sourceRoot, filePath)} should not import ${specifier}`);
  }
}

const summarySource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/summary.js'), 'utf8');
const moduleRunnerSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/runners/module-runner.js'), 'utf8');
const orchestrationSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.js'), 'utf8');
const pollingSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/services/polling.js'), 'utf8');
const busterPipelineSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/buster-pipeline.js'), 'utf8');
const busterPipelineHelpersSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/buster-pipeline-helpers.js'), 'utf8');
const busterRateLimitSource = fs.readFileSync(path.join(sourceRoot, 'skills/buster/pipeline/services/rate-limit.js'), 'utf8');
const pipelineReadme = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/README.md'), 'utf8');

assert.equal(summarySource.includes("../../../common/pipeline/agents/runtime.js"), true, 'Nova summary should import the shared common runtime owner directly');
assert.equal(summarySource.includes("../../../common/pipeline/agents/lifecycle.js"), true, 'Nova summary should import the shared common lifecycle owner directly');
assert.equal(moduleRunnerSource.includes("../../../common/pipeline/agents/runtime.js"), true, 'module-runner should import the shared common runtime owner directly');
assert.equal(moduleRunnerSource.includes("../../../common/pipeline/agents/lifecycle.js"), true, 'module-runner should import the shared common lifecycle owner directly');
assert.equal(moduleRunnerSource.includes("../../../common/pipeline/lifecycle-state.js"), true, 'module-runner should import the shared common lifecycle-state owner directly');
assert.equal(orchestrationSource.includes("../../../common/pipeline/integrations/gateway.js"), true, 'orchestration should import the shared common gateway owner directly');
assert.equal(pollingSource.includes("../../../common/pipeline/agents/acp-monitor.js"), true, 'polling should import the shared common ACP monitor owner directly');
assert.equal(pollingSource.includes("../../../common/pipeline/integrations/gateway.js"), true, 'polling should import the shared common gateway owner directly');
assert.equal(busterPipelineSource.includes("../common/pipeline/agents/acp-monitor.js"), true, 'buster-pipeline should import the shared common ACP monitor owner directly');
assert.equal(busterPipelineSource.includes("../common/pipeline/agents/lifecycle.js"), true, 'buster-pipeline should import the shared common lifecycle owner directly');
assert.equal(busterPipelineSource.includes("../common/pipeline/integrations/gateway.js"), true, 'buster-pipeline should import the shared common gateway owner directly');
assert.equal(busterPipelineHelpersSource.includes("../common/pipeline/lifecycle-state.js"), true, 'buster-pipeline helpers should import the shared common lifecycle-state owner directly');
assert.equal(busterRateLimitSource.includes("../../../common/pipeline/agents/acp-monitor.js"), true, 'Buster rate-limit should import the shared common ACP monitor owner directly');
assert.equal(pipelineReadme.includes('repo/test-only compatibility facades'), false, 'pipeline README should stop describing same-name repo compatibility facades as the active source-tree pattern');
assert.equal(pipelineReadme.includes('import those shared owners directly'), true, 'pipeline README should describe direct imports of shared owners');

console.log(JSON.stringify({ ok: true, checked: 35 }));
