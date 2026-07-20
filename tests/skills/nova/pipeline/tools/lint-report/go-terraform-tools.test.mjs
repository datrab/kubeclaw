import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerGoTools, registerTerraformTools } from '../../../../../../skills/nova/pipeline/tools/lint-report/go-terraform-tools.ts';

function executable(file, source) {
  fs.writeFileSync(file, `#!/usr/bin/env node\n${source}\n`);
  fs.chmodSync(file, 0o755);
}

function withPath(binDir, run) {
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`;
  try { return run(); } finally { process.env.PATH = originalPath; }
}

function toolContext(root, tool, targets) {
  const goModules = targets.filter(target => target.endsWith('go.mod'));
  const providerMirror = path.join(root, 'terraform-provider-mirror');
  fs.mkdirSync(providerMirror, { recursive: true });
  return {
    repoRoot: root,
    changedFilesRequested: false,
    changedFiles: [],
    policyProject: {
      root: '.',
      go: { modules: goModules.map(mod_file => ({ mod_file, packages: ['./...'], build_tags: [], allowed_import_prefixes: ['example.test/project'] })) },
      terraform: { roots: targets.filter(target => !target.endsWith('go.mod')), provider_mirror: providerMirror },
    },
    policy: { global_exclusions: [] },
    tool: { timeout_ms: 1000, arguments: ['./...'], targets: goModules.length ? goModules.map(modFile => path.dirname(modFile) || '.') : targets, include: goModules.length ? ['**/*.go'] : ['**/*.tf'], exclude: [], config_path: path.join(root, '.tflint.hcl') },
  };
}

test('Go adapters report canonical format, vet, staticcheck, and vulnerability findings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-lint-tools-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'cmd'));
  fs.writeFileSync(path.join(root, 'go.mod'), 'module example.test/project\n\ngo 1.22\n');
  fs.writeFileSync(path.join(root, 'cmd', 'main.go'), 'package main\n');
  executable(path.join(bin, 'gofmt'), `process.stdout.write(process.argv.at(-1) + '\\n');`);
  executable(path.join(bin, 'go'), `if (process.argv[2] === 'list') process.stdout.write(JSON.stringify({ImportPath:'example.test/project/cmd',Imports:['fmt','forbidden.example/pkg']}, null, 2)); else { process.stderr.write('./cmd/main.go:2:3: vet problem\\n'); process.exitCode = 1; }`);
  executable(path.join(bin, 'gocyclo'), `process.stdout.write('12 main run cmd/main.go:5:1\\n'); process.exitCode = 1;`);
  executable(path.join(bin, 'staticcheck'), `process.stdout.write(JSON.stringify({code:'SA1000',severity:'error',location:{file:'cmd/main.go',line:3,column:4},message:'static problem'}) + '\\n'); process.exitCode = 1;`);
  executable(path.join(bin, 'govulncheck'), `process.stdout.write(JSON.stringify({config:{scan_mode:'source'}}, null, 2) + '\\n' + JSON.stringify({finding:{osv:'GO-TEST-0001',trace:[{position:{filename:'cmd/main.go',line:4,column:5}}]}}, null, 2) + '\\n');`);

  withPath(bin, () => {
    const tools = [];
    registerGoTools(tool => tools.push(tool));
    const ctx = toolContext(root, null, ['go.mod']);
    assert.equal(tools.find(tool => tool.id === 'gofmt').run({ ...ctx, tool: { ...ctx.tool, arguments: [] } }).findings[0].code, 'go-format');
    assert.equal(tools.find(tool => tool.id === 'go-vet').run(ctx).findings[0].code, 'go-vet');
    assert.equal(tools.find(tool => tool.id === 'gocyclo').run({ ...ctx, tool: { ...ctx.tool, arguments: ['-over', '10'] } }).findings[0].code, 'go-complexity');
    assert.equal(tools.find(tool => tool.id === 'go-imports').run(ctx).findings[0].code, 'go-import-boundary');
    assert.equal(tools.find(tool => tool.id === 'staticcheck').run(ctx).findings[0].code, 'SA1000');
    assert.equal(tools.find(tool => tool.id === 'govulncheck').run(ctx).findings[0].code, 'GO-TEST-0001');
  });
});

test('gocyclo unrecognized failures cannot become clean evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gocyclo-failure-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, 'go.mod'), 'module example.test/project\n');
  executable(path.join(bin, 'gocyclo'), `process.stderr.write('analysis failed'); process.exitCode=2;`);
  const tools = [];
  registerGoTools(tool => tools.push(tool));
  const ctx = toolContext(root, null, ['go.mod']);
  ctx.tool.arguments = ['-over', '10'];
  assert.throws(
    () => withPath(bin, () => tools.find(tool => tool.id === 'gocyclo').run(ctx)),
    error => error?.code === 'gocyclo-parse-failed',
  );
});

test('full Go formatting honors canonical generated and tool exclusions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-format-exclusions-'));
  const bin = path.join(root, 'bin');
  const calls = path.join(root, 'calls.txt');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'cmd'));
  fs.mkdirSync(path.join(root, 'generated'));
  fs.writeFileSync(path.join(root, 'go.mod'), 'module example.test/project\n');
  fs.writeFileSync(path.join(root, 'cmd', 'main.go'), 'package main\n');
  fs.writeFileSync(path.join(root, 'generated', 'client.go'), 'package generated\n');
  executable(path.join(bin, 'gofmt'), `require('fs').writeFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' '));`);
  const tools = [];
  registerGoTools(tool => tools.push(tool));
  const ctx = toolContext(root, null, ['go.mod']);
  ctx.policy.global_exclusions = ['generated/**'];
  ctx.tool.arguments = [];
  ctx.tool.include = ['**/*.go'];
  ctx.tool.exclude = [];
  withPath(bin, () => tools.find(tool => tool.id === 'gofmt').run(ctx));
  assert.match(fs.readFileSync(calls, 'utf8'), /cmd\/main\.go/);
  assert.doesNotMatch(fs.readFileSync(calls, 'utf8'), /generated\/client\.go/);
});

test('govulncheck operational failures cannot become clean evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'govulncheck-failure-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, 'go.mod'), 'module example.test/project\n');
  executable(path.join(bin, 'govulncheck'), `process.stdout.write(JSON.stringify({config:{scan_mode:'source'}})); process.stderr.write('database unavailable'); process.exitCode=1;`);
  const tools = [];
  registerGoTools(tool => tools.push(tool));
  const ctx = toolContext(root, null, ['go.mod']);
  assert.throws(
    () => withPath(bin, () => tools.find(tool => tool.id === 'govulncheck').run(ctx)),
    error => error?.code === 'govulncheck-execution-failed',
  );
});

test('partial go list JSON cannot hide an incomplete import scan', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-imports-failure-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(root, 'go.mod'), 'module example.test/project\n');
  executable(path.join(bin, 'go'), `process.stdout.write(JSON.stringify({ImportPath:'example.test/project/ok',Imports:['fmt']})); process.stderr.write('another package failed'); process.exitCode=1;`);
  const tools = [];
  registerGoTools(tool => tools.push(tool));
  const ctx = toolContext(root, null, ['go.mod']);
  assert.throws(
    () => withPath(bin, () => tools.find(tool => tool.id === 'go-imports').run(ctx)),
    error => error?.code === 'go-imports-execution-failed',
  );
});

test('Terraform validation initializes isolated provider data without plan or apply', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-validate-tool-'));
  const bin = path.join(root, 'bin');
  const terraformRoot = path.join(root, 'infra');
  const calls = path.join(root, 'calls.txt');
  fs.mkdirSync(bin);
  fs.mkdirSync(terraformRoot);
  fs.writeFileSync(path.join(terraformRoot, 'main.tf'), 'terraform {}\n');
  executable(path.join(bin, 'terraform'), `const fs=require('fs'); const cli=fs.readFileSync(process.env.TF_CLI_CONFIG_FILE,'utf8'); fs.appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ')+' data='+process.env.TF_DATA_DIR+' cli='+cli.replace(/\\n/g,'|')+'\\n'); if (process.argv.includes('validate')) process.stdout.write(JSON.stringify({format_version:'1.0',valid:true,error_count:0,warning_count:0,diagnostics:[]}));`);

  const tools = [];
  registerTerraformTools(tool => tools.push(tool));
  const validate = tools.find(tool => tool.id === 'terraform-validate');
  const ctx = toolContext(root, null, ['infra']);
  assert.throws(() => validate.run(ctx), error => error?.code === 'terraform-lockfile-missing');
  fs.writeFileSync(path.join(terraformRoot, '.terraform.lock.hcl'), '# committed provider selections\n');

  withPath(bin, () => assert.equal(validate.run(ctx).errors, 0));
  const invoked = fs.readFileSync(calls, 'utf8').trim();
  assert.match(invoked, /-chdir=.*infra init -backend=false -get=false -input=false -lockfile=readonly -no-color data=\/tmp\/terraform-lint-data-/);
  assert.match(invoked, /-chdir=.*infra validate -json data=\/tmp\/terraform-lint-data-/);
  assert.match(invoked, /provider_installation \{|filesystem_mirror \{|terraform-provider-mirror/);
  assert.doesNotMatch(invoked, /direct \{/);
  assert.doesNotMatch(invoked, /\b(plan|apply)\b/);
  assert.equal(fs.existsSync(path.join(terraformRoot, '.terraform')), false);
});

test('Terraform formatting checks only roots affected by changed files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-format-scope-'));
  const bin = path.join(root, 'bin');
  const calls = path.join(root, 'calls.txt');
  fs.mkdirSync(bin);
  for (const name of ['one', 'two']) {
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, 'main.tf'), 'terraform {}\n');
  }
  executable(path.join(bin, 'terraform'), `require('fs').appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ')+'\\n');`);
  const tools = [];
  registerTerraformTools(tool => tools.push(tool));
  const ctx = toolContext(root, null, ['one', 'two']);
  ctx.changedFilesRequested = true;
  ctx.changedFiles = ['two/main.tf'];
  withPath(bin, () => tools.find(tool => tool.id === 'terraform-fmt').run(ctx));
  assert.match(fs.readFileSync(calls, 'utf8'), /-chdir=.*two fmt -check -recursive/);
  assert.doesNotMatch(fs.readFileSync(calls, 'utf8'), /-chdir=.*one/);
});

test('TFLint and Trivy Terraform JSON findings are normalized', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-json-tools-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(root, 'infra'));
  fs.writeFileSync(path.join(root, '.tflint.hcl'), 'plugin "terraform" { enabled = true }\n');
  executable(path.join(bin, 'tflint'), `process.stdout.write(JSON.stringify({issues:[{rule:{name:'terraform_unused_declarations',severity:'error'},message:'unused',range:{filename:'main.tf',start:{line:2,column:1}}}]})); process.exitCode=2;`);
  executable(path.join(bin, 'trivy'), `process.stdout.write(JSON.stringify({Results:[{Target:'main.tf',Misconfigurations:[{ID:'AVD-TF-0001',Severity:'HIGH',Title:'unsafe',CauseMetadata:{StartLine:3}}]}]})); process.exitCode=1;`);

  withPath(bin, () => {
    const tools = [];
    registerTerraformTools(tool => tools.push(tool));
    const ctx = toolContext(root, null, ['infra']);
    assert.equal(tools.find(tool => tool.id === 'tflint').run(ctx).findings[0].code, 'terraform_unused_declarations');
    assert.equal(tools.find(tool => tool.id === 'trivy-terraform').run(ctx).findings[0].code, 'AVD-TF-0001');
  });
});

test('a later Terraform root cannot hide its own unrecognized nonzero result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-multi-root-failure-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['one', 'two']) fs.mkdirSync(path.join(root, name));
  fs.writeFileSync(path.join(root, '.tflint.hcl'), 'plugin "terraform" { enabled = true }\n');
  executable(path.join(bin, 'tflint'), `const second=process.argv.some(arg=>arg.includes('/two')); process.stdout.write(JSON.stringify(second ? {issues:[]} : {issues:[{rule:{name:'first',severity:'error'},message:'first root',range:{filename:'main.tf',start:{line:1,column:1}}}]})); process.exitCode=2;`);
  const tools = [];
  registerTerraformTools(tool => tools.push(tool));
  const ctx = toolContext(root, null, ['one', 'two']);
  assert.throws(
    () => withPath(bin, () => tools.find(tool => tool.id === 'tflint').run(ctx)),
    error => error?.code === 'tflint-parse-failed',
  );
});
