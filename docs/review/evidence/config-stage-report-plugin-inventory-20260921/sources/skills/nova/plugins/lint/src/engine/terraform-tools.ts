import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredTargetPaths, findFiles } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { tryParseJson } from './parsers.ts';
import { policyIncludesFile } from './policy.ts';
import { failConfigMissing, failParse, notApplicable } from './report.ts';

function commandOutput(result: any) {
  const output = [result.stdout, result.stderr].find((value: any) => typeof value === 'string' && value.length > 0);
  return typeof output === 'string' ? output : '';
}

function findingsResult(findings: any[]) {
  return {
    errors: findings.filter((finding: any) => finding.severity === 'error').length,
    warnings: findings.filter((finding: any) => finding.severity === 'warning').length,
    findings,
  };
}



function terraformRoots(ctx: any) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return ctx.policyProject.terraform.roots.map((root: any) => path.resolve(projectRoot, root));
}

function affectedTerraformRoots(ctx: any) {
  const roots = terraformRoots(ctx);
  if (!ctx.changedFilesRequested) return roots;
  const changes = ctx.changedFiles.map((file: any) => path.resolve(ctx.repoRoot, file));
  return roots.filter((root: any) => changes.some((change: any) => {
    const relative = path.relative(root, change);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }));
}

function terraformProviderMirror(ctx: any) {
  const mirror = ctx.policyProject.terraform.provider_mirror;
  if (!mirror || !path.isAbsolute(mirror)) failConfigMissing('terraform-provider-mirror-invalid', 'Terraform provider mirror must be an absolute configured path.');
  if (!fs.existsSync(mirror) || !fs.statSync(mirror).isDirectory()) failConfigMissing('terraform-provider-mirror-missing', `Terraform provider mirror does not exist: ${mirror}`);
  return mirror;
}

function writeTerraformCliConfig(dataDir: any, mirror: any) {
  const configPath = path.join(dataDir, 'provider-installation.tfrc');
  fs.writeFileSync(configPath, [
    'disable_checkpoint = true',
    'provider_installation {',
    '  filesystem_mirror {',
    `    path = ${JSON.stringify(mirror)}`,
    '    include = ["*/*/*"]',
    '  }',
    '}',
    '',
  ].join('\n'));
  return configPath;
}


function terraformFmtTool() {
  return {
    id: 'terraform-fmt',
    name: 'terraform fmt',
    binary: 'terraform',
    run: async (ctx: any) => {
      const findings: any[] = [];
      const roots = affectedTerraformRoots(ctx);
      if (roots.length === 0) return notApplicable('No Terraform root is affected by the requested scope.');
      for (const root of roots) {
        const result = requireToolExecution(await safeExec('terraform', [`-chdir=${root}`, 'fmt', '-check', '-recursive'], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'terraform-fmt');
        const files = result.stdout.split('\n').filter(Boolean);
        if (result.exitCode !== 0 && files.length === 0) failParse(ctx, 'terraform-fmt', { error: 'non-zero exit without file names' }, result, root);
        findings.push(...files.map((file: any) => ({ file: path.resolve(root, file), line: null, column: null, severity: 'error', code: 'terraform-format', message: 'Terraform file is not in canonical terraform fmt format.' })));
      }
      return findingsResult(findings);
    },
  };
}

function terraformValidateTool() {
  return {
    id: 'terraform-validate',
    name: 'terraform validate',
    binary: 'terraform',
    run: async (ctx: any) => {
      const findings: any[] = [];
      const providerMirror = terraformProviderMirror(ctx);
      for (const root of terraformRoots(ctx)) await validateTerraformRoot(ctx, root, providerMirror, findings);
      return findingsResult(findings);
    },
  };
}

async function validateTerraformRoot(ctx: any, root: string, providerMirror: string, findings: any[]): Promise<void> {
  const findingsBefore = findings.length;
  const lockfile = path.join(root, '.terraform.lock.hcl');
  if (!fs.existsSync(lockfile)) failConfigMissing('terraform-lockfile-missing', `Terraform root requires a committed provider lockfile: ${lockfile}`);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-lint-data-'));
  try {
    const cliConfig = writeTerraformCliConfig(dataDir, providerMirror);
    const options = { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms, env: { TF_DATA_DIR: dataDir, TF_CLI_CONFIG_FILE: cliConfig } };
    const initialized = requireToolExecution(await safeExec('terraform', [`-chdir=${root}`, 'init', '-backend=false', '-get=false', '-input=false', '-lockfile=readonly', '-no-color'], options), 'terraform-init');
    if (initialized.exitCode !== 0) throw Object.assign(new Error(`terraform init -backend=false failed for ${root}: ${commandOutput(initialized).split('\n')[0] || 'no output'}`), { code: 'terraform-init-failed' });
    const result = requireToolExecution(await safeExec('terraform', [`-chdir=${root}`, 'validate', '-json'], options), 'terraform-validate');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) failParse(ctx, 'terraform-validate', parsed, result, root);
    findings.push(...terraformDiagnostics(parsed.data, root));
    if (!parsed.data?.valid && findings.length === findingsBefore) failParse(ctx, 'terraform-validate', { error: 'invalid result without diagnostics' }, result, root);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

function terraformDiagnostics(data: any, root: string) {
  return (Array.isArray(data?.diagnostics) ? data.diagnostics : []).map((diagnostic: any) => ({
    file: diagnostic.range?.filename ? path.resolve(root, diagnostic.range.filename) : root,
    line: diagnostic.range?.start?.line ?? null, column: diagnostic.range?.start?.column ?? null,
    severity: diagnostic.severity === 'warning' ? 'warning' : 'error', code: 'terraform-validate',
    message: diagnostic.summary ? `${diagnostic.summary}: ${diagnostic.detail || ''}`.trim() : 'Terraform validation finding',
  }));
}

function tflintTool() {
  return {
    id: 'tflint',
    name: 'TFLint',
    binary: 'tflint',
    run: async (ctx: any) => {
      const findings: any[] = [];
      for (const root of terraformRoots(ctx)) findings.push(...await runTflint(ctx, root));
      return findingsResult(findings);
    },
  };
}

async function runTflint(ctx: any, root: string) {
  const result = requireToolExecution(await safeExec('tflint', [`--chdir=${root}`, `--config=${ctx.tool.config_path}`, '--format=json', ...ctx.tool.arguments], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'tflint');
  const parsed = tryParseJson(result.stdout);
  if (!parsed.ok) failParse(ctx, 'tflint', parsed, result, root);
  const findings = (Array.isArray(parsed.data?.issues) ? parsed.data.issues : []).map((issue: any) => ({
    file: issue.range?.filename ? path.resolve(root, issue.range.filename) : root,
    line: issue.range?.start?.line ?? null, column: issue.range?.start?.column ?? null,
    severity: issue.rule?.severity === 'warning' ? 'warning' : 'error',
    code: issue.rule?.name || 'tflint', message: issue.message || 'TFLint finding',
  }));
  if (result.exitCode !== 0 && findings.length === 0) failParse(ctx, 'tflint', { error: 'non-zero exit without issues' }, result, root);
  return findings;
}

function trivyTerraformTool() {
  return {
    id: 'trivy-terraform',
    name: 'Trivy Terraform',
    binary: 'trivy',
    run: async (ctx: any) => {
      const findings: any[] = [];
      for (const root of terraformRoots(ctx)) findings.push(...await runTrivyTerraform(ctx, root));
      return findingsResult(findings);
    },
  };
}

async function runTrivyTerraform(ctx: any, root: string) {
  const result = requireToolExecution(await safeExec('trivy', ['config', '--quiet', '--format', 'json', '--misconfig-scanners', 'terraform', '--severity', 'HIGH,CRITICAL', '--skip-check-update', '--skip-version-check', '--skip-dirs', '.terraform', '--skip-files', '**/*.tfstate*', '--exit-code', '1', ...ctx.tool.arguments, root], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'trivy-terraform');
  const parsed = tryParseJson(result.stdout);
  if (!parsed.ok) failParse(ctx, 'trivy-terraform', parsed, result, root);
  const findings = (Array.isArray(parsed.data?.Results) ? parsed.data.Results : []).flatMap((entry: any) =>
    (Array.isArray(entry.Misconfigurations) ? entry.Misconfigurations : []).map((issue: any) => ({
      file: entry.Target ? path.resolve(root, entry.Target) : root,
      line: issue.CauseMetadata?.StartLine ?? null, column: null, severity: 'error',
      code: issue.ID || 'trivy-terraform', message: issue.Title ?? 'Terraform security misconfiguration',
    })),
  );
  if (result.exitCode !== 0 && findings.length === 0) failParse(ctx, 'trivy-terraform', { error: 'non-zero exit without misconfigurations' }, result, root);
  return findings;
}

export function registerTerraformTools(registerTool: any) {
  registerTool(terraformFmtTool());
  registerTool(terraformValidateTool());
  registerTool(tflintTool());
  registerTool(trivyTerraformTool());
}
