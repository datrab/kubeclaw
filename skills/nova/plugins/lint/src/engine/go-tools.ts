import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredTargetPaths, findFiles } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { tryParseJson } from './parsers.ts';
import { policyIncludesFile } from './policy.ts';
import { failConfigMissing, failParse, notApplicable } from './report.ts';

function commandOutput(result: any) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

function findingsResult(findings: any) {
  return {
    errors: findings.filter((finding: any) => finding.severity === 'error').length,
    warnings: findings.filter((finding: any) => finding.severity === 'warning').length,
    findings,
  };
}

function moduleDirectories(ctx: any) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return ctx.policyProject.go.modules.map((module: any) => path.dirname(path.resolve(projectRoot, module.mod_file)));
}

function affectedModuleDirectories(ctx: any) {
  const modules = moduleDirectories(ctx);
  if (!ctx.changedFilesRequested) return modules;
  const changes = ctx.changedFiles.map((file: any) => path.resolve(ctx.repoRoot, file));
  return modules.filter((moduleRoot: any) => changes.some((change: any) => {
    const relative = path.relative(moduleRoot, change);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }));
}

function goBuildTagArguments(ctx: any, moduleRoot: any) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  const module = ctx.policyProject.go.modules.find((entry: any) => path.dirname(path.resolve(projectRoot, entry.mod_file)) === moduleRoot);
  return module?.build_tags?.length ? [`-tags=${module.build_tags.join(',')}`] : [];
}

function goModuleSettings(ctx: any, moduleRoot: any) {
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return ctx.policyProject.go.modules.find((entry: any) => path.dirname(path.resolve(projectRoot, entry.mod_file)) === moduleRoot);
}

function goFiles(ctx: any) {
  if (ctx.changedFilesRequested) {
    return ctx.changedFiles.filter((file: any) => file.endsWith('.go')).map((file: any) => path.resolve(ctx.repoRoot, file));
  }
  const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
  return moduleDirectories(ctx)
    .flatMap((moduleRoot: any) => findFiles(moduleRoot, (file: any) => file.endsWith('.go'), Number.MAX_SAFE_INTEGER))
    .filter((file: any) => policyIncludesFile(path.relative(projectRoot, file).split(path.sep).join('/'), ctx.tool, ctx.policy.global_exclusions))
    .sort();
}

function parseGoDiagnostic(line: any, moduleRoot: any, code: any) {
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

function parseJsonLines(ctx: any, toolId: any, result: any, target: any) {
  const values: any[] = [];
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

type JsonStreamState = { start: number; depth: number; inString: boolean; escaped: boolean };

function advanceJsonStream(state: JsonStreamState, character: string): void {
  if (state.inString) {
    if (state.escaped) state.escaped = false;
    else if (character === '\\') state.escaped = true;
    else if (character === '"') state.inString = false;
    return;
  }
  if (character === '"') state.inString = true;
  else if (character === '{' || character === '[') state.depth++;
  else if (character === '}' || character === ']') state.depth--;
}

function beginJsonStreamValue(ctx: any, toolId: any, result: any, target: any, state: JsonStreamState, character: string, index: number): boolean {
  if (/\s/.test(character)) return false;
  if (character !== '{' && character !== '[') failParse(ctx, toolId, { error: 'unexpected text outside JSON value' }, result, target);
  state.start = index;
  state.depth = 1;
  return true;
}

function parseJsonStream(ctx: any, toolId: any, result: any, target: any) {
  const values: any[] = [];
  const state: JsonStreamState = { start: -1, depth: 0, inString: false, escaped: false };
  for (let index = 0; index < result.stdout.length; index++) {
    const character = result.stdout[index];
    if (state.start < 0) {
      beginJsonStreamValue(ctx, toolId, result, target, state, character, index);
      continue;
    }
    advanceJsonStream(state, character);
    if (state.depth !== 0) continue;
    const parsed = tryParseJson(result.stdout.slice(state.start, index + 1));
    if (!parsed.ok) failParse(ctx, toolId, parsed, result, target);
    values.push(parsed.data);
    state.start = -1;
  }
  if (state.start >= 0 || values.length === 0) failParse(ctx, toolId, { error: state.start >= 0 ? 'incomplete JSON stream' : 'empty JSON stream' }, result, target);
  return values;
}

function collectForbiddenImports(findings: any[], packageInfo: any, settings: any, moduleRoot: string): void {
  for (const imported of Array.isArray(packageInfo.Imports) ? packageInfo.Imports : []) {
    const external = imported.split('/')[0].includes('.');
    const allowed = settings.allowed_import_prefixes.some((prefix: any) => imported === prefix || imported.startsWith(`${prefix}/`));
    if (!external || allowed) continue;
    findings.push({
      file: path.join(moduleRoot, 'go.mod'), line: null, column: null, severity: 'error',
      code: 'go-import-boundary',
      message: `Package ${packageInfo.ImportPath} imports '${imported}', which is outside the allowed import prefixes.`,
    });
  }
}


function gofmtTool() {
  return {
    id: 'gofmt',
    name: 'gofmt',
    binary: 'gofmt',
    run: (ctx: any) => {
      const files = goFiles(ctx);
      if (files.length === 0) return notApplicable('No Go files match the requested scope.');
      const result = requireToolExecution(safeExec('gofmt', ['-l', ...files], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'gofmt');
      if (result.exitCode !== 0) failParse(ctx, 'gofmt', { error: 'format check failed' }, result, ctx.repoRoot);
      const findings = result.stdout.split('\n').filter(Boolean).map((file: any) => ({
        file,
        line: null,
        column: null,
        severity: 'error',
        code: 'go-format',
        message: 'Go file is not in canonical gofmt format. Run gofmt -w on this file.',
      }));
      return findingsResult(findings);
    },
  };
}

function goVetTool() {
  return {
    id: 'go-vet',
    name: 'go vet',
    binary: 'go',
    run: (ctx: any) => {
      const findings: any[] = [];
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
  };
}

function gocycloTool() {
  return {
    id: 'gocyclo',
    name: 'gocyclo',
    binary: 'gocyclo',
    run: (ctx: any) => {
      const findings: any[] = [];
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
  };
}

function goImportsTool() {
  return {
    id: 'go-imports',
    name: 'Go Import Boundaries',
    binary: 'go',
    run: (ctx: any) => {
      const findings: any[] = [];
      const modules = affectedModuleDirectories(ctx);
      if (modules.length === 0) return notApplicable('No Go module is affected by the requested scope.');
      for (const moduleRoot of modules) {
        const settings = goModuleSettings(ctx, moduleRoot);
        const result = requireToolExecution(safeExec('go', ['list', '-json', ...goBuildTagArguments(ctx, moduleRoot), ...ctx.tool.arguments], { cwd: moduleRoot, timeout: ctx.tool.timeout_ms }), 'go-imports');
        const packages = parseJsonStream(ctx, 'go-imports', result, moduleRoot);
        if (result.exitCode !== 0) {
          throw Object.assign(new Error(`go list failed for ${moduleRoot}: ${commandOutput(result).split('\n')[0] || 'non-zero exit'}`), { code: 'go-imports-execution-failed' });
        }
        for (const packageInfo of packages) collectForbiddenImports(findings, packageInfo, settings, moduleRoot);
      }
      return findingsResult(findings);
    },
  };
}

function staticcheckTool() {
  return {
    id: 'staticcheck',
    name: 'Staticcheck',
    binary: 'staticcheck',
    run: (ctx: any) => {
      const findings: any[] = [];
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
  };
}

function govulncheckTool() {
  return {
    id: 'govulncheck',
    name: 'govulncheck',
    binary: 'govulncheck',
    run: (ctx: any) => {
      const findings: any[] = [];
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
        findings.push(...messages.filter((item: any) => item.finding?.osv).map((item: any) => govulnFinding(item, moduleRoot)));
      }
      return findingsResult(findings);
    },
  };
}

function govulnFinding(item: any, moduleRoot: string) {
  const trace = Array.isArray(item.finding.trace) ? item.finding.trace : [];
  const position = [...trace].reverse().find((frame: any) => frame.position)?.position;
  return {
    file: position?.filename ? path.resolve(moduleRoot, position.filename) : path.join(moduleRoot, 'go.mod'),
    line: position?.line ?? null, column: position?.column ?? null, severity: 'error',
    code: item.finding.osv, message: `Reachable Go vulnerability ${item.finding.osv}`,
  };
}

export function registerGoTools(registerTool: any) {
  registerTool(gofmtTool());
  registerTool(goVetTool());
  registerTool(gocycloTool());
  registerTool(goImportsTool());
  registerTool(staticcheckTool());
  registerTool(govulncheckTool());
}
