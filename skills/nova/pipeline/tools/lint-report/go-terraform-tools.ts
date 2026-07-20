import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredTargetPaths, findFiles } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { tryParseJson } from './parsers.ts';
import { policyIncludesFile } from './policy.ts';
import { failConfigMissing, failParse, notApplicable } from './report.ts';

function commandOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

function findingsResult(findings) {
  return {
    errors: findings.filter(finding => finding.severity === 'error').length,
    warnings: findings.filter(finding => finding.severity === 'warning').length,
    findings,
  };
}

function moduleDirectories(ctx) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return ctx.policyProject.go.modules.map(module => path.dirname(path.resolve(projectRoot, module.mod_file)));
}

function affectedModuleDirectories(ctx) {
  const modules = moduleDirectories(ctx);
  if (!ctx.changedFilesRequested) return modules;
  const changes = ctx.changedFiles.map(file => path.resolve(ctx.repoRoot, file));
  return modules.filter(moduleRoot => changes.some(change => {
    const relative = path.relative(moduleRoot, change);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }));
}

function goBuildTagArguments(ctx, moduleRoot) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  const module = ctx.policyProject.go.modules.find(entry => path.dirname(path.resolve(projectRoot, entry.mod_file)) === moduleRoot);
  return module?.build_tags?.length ? [`-tags=${module.build_tags.join(',')}`] : [];
}

function goModuleSettings(ctx, moduleRoot) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return ctx.policyProject.go.modules.find(entry => path.dirname(path.resolve(projectRoot, entry.mod_file)) === moduleRoot);
}

function goFiles(ctx) {
  if (ctx.changedFilesRequested) {
    return ctx.changedFiles.filter(file => file.endsWith('.go')).map(file => path.resolve(ctx.repoRoot, file));
  }
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return moduleDirectories(ctx)
    .flatMap(moduleRoot => findFiles(moduleRoot, file => file.endsWith('.go'), Number.MAX_SAFE_INTEGER))
    .filter(file => policyIncludesFile(path.relative(projectRoot, file).split(path.sep).join('/'), ctx.tool, ctx.policy.global_exclusions))
    .sort();
}

function parseGoDiagnostic(line, moduleRoot, code) {
  const match = line.match(/^(.+?\.go):(\d+)(?::(\d+))?:\s+(.+)$/);
  if (!match) return null;
  return {
    file: path.resolve(moduleRoot, match[1]),
    line: Number(match[2]),
    column: match[3] ? Number(match[3]) : null,
    severity: 'error',
    code,
    message: match[4],
  };
}

function parseJsonLines(ctx, toolId, result, target) {
  const values = [];
  for (const line of result.stdout.split('\n').filter(Boolean)) {
    const parsed = tryParseJson(line);
    if (!parsed.ok) failParse(ctx, toolId, parsed, result, target);
    values.push(parsed.data);
  }
  if (values.length === 0 && result.exitCode !== 0) {
    failParse(ctx, toolId, { error: 'non-zero exit without JSON output' }, result, target);
  }
  return values;
}

function parseJsonStream(ctx, toolId, result, target) {
  const values = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < result.stdout.length; index++) {
    const character = result.stdout[index];
    if (start < 0) {
      if (/\s/.test(character)) continue;
      if (character !== '{' && character !== '[') failParse(ctx, toolId, { error: 'unexpected text outside JSON value' }, result, target);
      start = index;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') depth--;
    if (depth !== 0) continue;
    const parsed = tryParseJson(result.stdout.slice(start, index + 1));
    if (!parsed.ok) failParse(ctx, toolId, parsed, result, target);
    values.push(parsed.data);
    start = -1;
  }
  if (start >= 0 || values.length === 0) failParse(ctx, toolId, { error: start >= 0 ? 'incomplete JSON stream' : 'empty JSON stream' }, result, target);
  return values;
}

function registerGoTools(registerTool) {
  registerTool({
    id: 'gofmt',
    name: 'gofmt',
    binary: 'gofmt',
    run: (ctx) => {
      const files = goFiles(ctx);
      if (files.length === 0) return notApplicable('No Go files match the requested scope.');
      const result = requireToolExecution(safeExec('gofmt', ['-l', ...files], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'gofmt');
      if (result.exitCode !== 0) failParse(ctx, 'gofmt', { error: 'format check failed' }, result, ctx.repoRoot);
      const findings = result.stdout.split('\n').filter(Boolean).map(file => ({
        file,
        line: null,
        column: null,
        severity: 'error',
        code: 'go-format',
        message: 'Go file is not in canonical gofmt format. Run gofmt -w on this file.',
      }));
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'go-vet',
    name: 'go vet',
    binary: 'go',
    run: (ctx) => {
      const findings = [];
      const modules = affectedModuleDirectories(ctx);
      if (modules.length === 0) return notApplicable('No Go module is affected by the requested scope.');
      for (const moduleRoot of modules) {
        const findingsBefore = findings.length;
        const result = requireToolExecution(safeExec('go', ['vet', ...goBuildTagArguments(ctx, moduleRoot), ...ctx.tool.arguments], { cwd: moduleRoot, timeout: ctx.tool.timeout_ms }), 'go-vet');
        for (const line of commandOutput(result).split('\n').filter(Boolean)) {
          const finding = parseGoDiagnostic(line, moduleRoot, 'go-vet');
          if (finding) findings.push(finding);
        }
        if (result.exitCode !== 0 && findings.length === findingsBefore) failParse(ctx, 'go-vet', { error: 'non-zero exit without diagnostics' }, result, moduleRoot);
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'gocyclo',
    name: 'gocyclo',
    binary: 'gocyclo',
    run: (ctx) => {
      const findings = [];
      const modules = affectedModuleDirectories(ctx);
      if (modules.length === 0) return notApplicable('No Go module is affected by the requested scope.');
      for (const moduleRoot of modules) {
        const result = requireToolExecution(safeExec('gocyclo', [...ctx.tool.arguments, moduleRoot], { cwd: moduleRoot, timeout: ctx.tool.timeout_ms }), 'gocyclo');
        for (const line of result.stdout.split('\n').filter(Boolean)) {
          const match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(.+?\.go):(\d+):(\d+)$/);
          if (!match) failParse(ctx, 'gocyclo', { error: 'unrecognized complexity finding' }, result, moduleRoot);
          findings.push({
            file: path.resolve(moduleRoot, match[4]),
            line: Number(match[5]),
            column: Number(match[6]),
            severity: 'error',
            code: 'go-complexity',
            message: `${match[3]} has cyclomatic complexity ${match[1]}; maximum allowed is 10.`,
            fingerprint_seed: { package: match[2], function: match[3], file: path.relative(ctx.repoRoot, path.resolve(moduleRoot, match[4])).split(path.sep).join('/') },
          });
        }
        if (result.exitCode !== 0 && (result.exitCode !== 1 || findings.length === 0)) {
          failParse(ctx, 'gocyclo', { error: 'non-zero exit without complexity findings' }, result, moduleRoot);
        }
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'go-imports',
    name: 'Go Import Boundaries',
    binary: 'go',
    run: (ctx) => {
      const findings = [];
      const modules = affectedModuleDirectories(ctx);
      if (modules.length === 0) return notApplicable('No Go module is affected by the requested scope.');
      for (const moduleRoot of modules) {
        const settings = goModuleSettings(ctx, moduleRoot);
        const result = requireToolExecution(safeExec('go', ['list', '-json', ...goBuildTagArguments(ctx, moduleRoot), ...ctx.tool.arguments], { cwd: moduleRoot, timeout: ctx.tool.timeout_ms }), 'go-imports');
        const packages = parseJsonStream(ctx, 'go-imports', result, moduleRoot);
        if (result.exitCode !== 0) {
          throw Object.assign(new Error(`go list failed for ${moduleRoot}: ${commandOutput(result).split('\n')[0] || 'non-zero exit'}`), { code: 'go-imports-execution-failed' });
        }
        for (const packageInfo of packages) {
          for (const imported of Array.isArray(packageInfo.Imports) ? packageInfo.Imports : []) {
            const external = imported.split('/')[0].includes('.');
            const allowed = settings.allowed_import_prefixes.some(prefix => imported === prefix || imported.startsWith(`${prefix}/`));
            if (external && !allowed) findings.push({
              file: path.join(moduleRoot, 'go.mod'),
              line: null,
              column: null,
              severity: 'error',
              code: 'go-import-boundary',
              message: `Package ${packageInfo.ImportPath} imports '${imported}', which is outside the allowed import prefixes.`,
            });
          }
        }
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'staticcheck',
    name: 'Staticcheck',
    binary: 'staticcheck',
    run: (ctx) => {
      const findings = [];
      const modules = affectedModuleDirectories(ctx);
      if (modules.length === 0) return notApplicable('No Go module is affected by the requested scope.');
      for (const moduleRoot of modules) {
        const result = requireToolExecution(safeExec('staticcheck', ['-f', 'json', ...goBuildTagArguments(ctx, moduleRoot), ...ctx.tool.arguments], { cwd: moduleRoot, timeout: ctx.tool.timeout_ms }), 'staticcheck');
        for (const item of parseJsonLines(ctx, 'staticcheck', result, moduleRoot)) {
          findings.push({
            file: path.resolve(moduleRoot, item.location?.file || ''),
            line: item.location?.line ?? null,
            column: item.location?.column ?? null,
            severity: item.severity === 'warning' ? 'warning' : 'error',
            code: item.code || 'staticcheck',
            message: item.message || 'Staticcheck finding',
          });
        }
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'govulncheck',
    name: 'govulncheck',
    binary: 'govulncheck',
    run: (ctx) => {
      const findings = [];
      const modules = affectedModuleDirectories(ctx);
      if (modules.length === 0) return notApplicable('No Go module is affected by the requested scope.');
      for (const moduleRoot of modules) {
        const result = requireToolExecution(safeExec('govulncheck', ['-format', 'json', ...goBuildTagArguments(ctx, moduleRoot), ...ctx.tool.arguments], { cwd: moduleRoot, timeout: ctx.tool.timeout_ms }), 'govulncheck');
        const messages = parseJsonStream(ctx, 'govulncheck', result, moduleRoot);
        // Pinned govulncheck JSON mode exits 0 even when findings exist; any
        // nonzero exit is therefore an operational failure, not finding state.
        if (result.exitCode !== 0) {
          throw Object.assign(new Error(`govulncheck failed for ${moduleRoot}: ${commandOutput(result).split('\n')[0] || 'non-zero exit'}`), { code: 'govulncheck-execution-failed' });
        }
        for (const item of messages) {
          if (!item.finding?.osv) continue;
          const trace = Array.isArray(item.finding.trace) ? item.finding.trace : [];
          const position = [...trace].reverse().find(frame => frame.position)?.position;
          findings.push({
            file: position?.filename ? path.resolve(moduleRoot, position.filename) : path.join(moduleRoot, 'go.mod'),
            line: position?.line ?? null,
            column: position?.column ?? null,
            severity: 'error',
            code: item.finding.osv,
            message: `Reachable Go vulnerability ${item.finding.osv}`,
          });
        }
      }
      return findingsResult(findings);
    },
  });
}

function terraformRoots(ctx) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return ctx.policyProject.terraform.roots.map(root => path.resolve(projectRoot, root));
}

function affectedTerraformRoots(ctx) {
  const roots = terraformRoots(ctx);
  if (!ctx.changedFilesRequested) return roots;
  const changes = ctx.changedFiles.map(file => path.resolve(ctx.repoRoot, file));
  return roots.filter(root => changes.some(change => {
    const relative = path.relative(root, change);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }));
}

function terraformProviderMirror(ctx) {
  const mirror = ctx.policyProject.terraform.provider_mirror;
  if (!mirror || !path.isAbsolute(mirror)) failConfigMissing('terraform-provider-mirror-invalid', 'Terraform provider mirror must be an absolute configured path.');
  if (!fs.existsSync(mirror) || !fs.statSync(mirror).isDirectory()) failConfigMissing('terraform-provider-mirror-missing', `Terraform provider mirror does not exist: ${mirror}`);
  return mirror;
}

function writeTerraformCliConfig(dataDir, mirror) {
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

function registerTerraformTools(registerTool) {
  registerTool({
    id: 'terraform-fmt',
    name: 'terraform fmt',
    binary: 'terraform',
    run: (ctx) => {
      const findings = [];
      const roots = affectedTerraformRoots(ctx);
      if (roots.length === 0) return notApplicable('No Terraform root is affected by the requested scope.');
      for (const root of roots) {
        const result = requireToolExecution(safeExec('terraform', [`-chdir=${root}`, 'fmt', '-check', '-recursive'], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'terraform-fmt');
        const files = result.stdout.split('\n').filter(Boolean);
        if (result.exitCode !== 0 && files.length === 0) failParse(ctx, 'terraform-fmt', { error: 'non-zero exit without file names' }, result, root);
        findings.push(...files.map(file => ({ file: path.resolve(root, file), line: null, column: null, severity: 'error', code: 'terraform-format', message: 'Terraform file is not in canonical terraform fmt format.' })));
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'terraform-validate',
    name: 'terraform validate',
    binary: 'terraform',
    run: (ctx) => {
      const findings = [];
      const providerMirror = terraformProviderMirror(ctx);
      for (const root of terraformRoots(ctx)) {
        const findingsBefore = findings.length;
        const lockfile = path.join(root, '.terraform.lock.hcl');
        if (!fs.existsSync(lockfile)) failConfigMissing('terraform-lockfile-missing', `Terraform root requires a committed provider lockfile: ${lockfile}`);
        const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-lint-data-'));
        try {
          const cliConfig = writeTerraformCliConfig(dataDir, providerMirror);
          const options = { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms, env: { TF_DATA_DIR: dataDir, TF_CLI_CONFIG_FILE: cliConfig } };
          const initialized = requireToolExecution(safeExec('terraform', [`-chdir=${root}`, 'init', '-backend=false', '-get=false', '-input=false', '-lockfile=readonly', '-no-color'], options), 'terraform-init');
          if (initialized.exitCode !== 0) throw Object.assign(new Error(`terraform init -backend=false failed for ${root}: ${commandOutput(initialized).split('\n')[0] || 'no output'}`), { code: 'terraform-init-failed' });
          const result = requireToolExecution(safeExec('terraform', [`-chdir=${root}`, 'validate', '-json'], options), 'terraform-validate');
          const parsed = tryParseJson(result.stdout);
          if (!parsed.ok) failParse(ctx, 'terraform-validate', parsed, result, root);
          for (const diagnostic of Array.isArray(parsed.data?.diagnostics) ? parsed.data.diagnostics : []) {
            findings.push({
              file: diagnostic.range?.filename ? path.resolve(root, diagnostic.range.filename) : root,
              line: diagnostic.range?.start?.line ?? null,
              column: diagnostic.range?.start?.column ?? null,
              severity: diagnostic.severity === 'warning' ? 'warning' : 'error',
              code: 'terraform-validate',
              message: diagnostic.summary ? `${diagnostic.summary}: ${diagnostic.detail || ''}`.trim() : 'Terraform validation finding',
            });
          }
          if (!parsed.data?.valid && findings.length === findingsBefore) failParse(ctx, 'terraform-validate', { error: 'invalid result without diagnostics' }, result, root);
        } finally {
          fs.rmSync(dataDir, { recursive: true, force: true });
        }
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'tflint',
    name: 'TFLint',
    binary: 'tflint',
    run: (ctx) => {
      const findings = [];
      for (const root of terraformRoots(ctx)) {
        const findingsBefore = findings.length;
        const result = requireToolExecution(safeExec('tflint', [`--chdir=${root}`, `--config=${ctx.tool.config_path}`, '--format=json', ...ctx.tool.arguments], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'tflint');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) failParse(ctx, 'tflint', parsed, result, root);
        for (const issue of Array.isArray(parsed.data?.issues) ? parsed.data.issues : []) {
          findings.push({
            file: issue.range?.filename ? path.resolve(root, issue.range.filename) : root,
            line: issue.range?.start?.line ?? null,
            column: issue.range?.start?.column ?? null,
            severity: issue.rule?.severity === 'warning' ? 'warning' : 'error',
            code: issue.rule?.name || 'tflint',
            message: issue.message || 'TFLint finding',
          });
        }
        if (result.exitCode !== 0 && findings.length === findingsBefore) failParse(ctx, 'tflint', { error: 'non-zero exit without issues' }, result, root);
      }
      return findingsResult(findings);
    },
  });

  registerTool({
    id: 'trivy-terraform',
    name: 'Trivy Terraform',
    binary: 'trivy',
    run: (ctx) => {
      const findings = [];
      for (const root of terraformRoots(ctx)) {
        const findingsBefore = findings.length;
        const result = requireToolExecution(safeExec('trivy', ['config', '--quiet', '--format', 'json', '--misconfig-scanners', 'terraform', '--severity', 'HIGH,CRITICAL', '--skip-check-update', '--skip-version-check', '--skip-dirs', '.terraform', '--skip-files', '**/*.tfstate*', '--exit-code', '1', ...ctx.tool.arguments, root], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'trivy-terraform');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) failParse(ctx, 'trivy-terraform', parsed, result, root);
        for (const entry of Array.isArray(parsed.data?.Results) ? parsed.data.Results : []) {
          for (const issue of Array.isArray(entry.Misconfigurations) ? entry.Misconfigurations : []) {
            findings.push({
              file: entry.Target ? path.resolve(root, entry.Target) : root,
              line: issue.CauseMetadata?.StartLine ?? null,
              column: null,
              severity: 'error',
              code: issue.ID || 'trivy-terraform',
              message: issue.Title || issue.Description || 'Terraform security misconfiguration',
            });
          }
        }
        if (result.exitCode !== 0 && findings.length === findingsBefore) failParse(ctx, 'trivy-terraform', { error: 'non-zero exit without misconfigurations' }, result, root);
      }
      return findingsResult(findings);
    },
  });
}

export { registerGoTools, registerTerraformTools };
