import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredTargetPaths } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { tryParseJson } from './parsers.ts';
import { failConfigMissing, failParse } from './report.ts';

function findingsResult(findings) {
  return { errors: findings.length, warnings: 0, findings };
}

function canonicalCycle(paths) {
  const cycle = paths.at(0) === paths.at(-1) ? paths.slice(0, -1) : paths;
  if (cycle.length === 0) return [];
  const rotations = cycle.map((_, index) => [...cycle.slice(index), ...cycle.slice(0, index)]);
  return rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')))[0];
}

function layerForFile(layers, file) {
  const matches = layers.flatMap(layer => layer.roots
    .filter(root => file === root || file.startsWith(`${root}/`))
    .map(root => ({ layer, root })));
  return matches.sort((left, right) => right.root.length - left.root.length)[0]?.layer ?? null;
}

function dependencyCruiserFindings(ctx, modules) {
  const findings = [];
  const cycles = new Map();
  for (const module of modules) {
    const source = module.source;
    const sourceLayer = layerForFile(ctx.policy.architecture.layers, source);
    for (const dependency of Array.isArray(module.dependencies) ? module.dependencies : []) {
      if (dependency.circular && Array.isArray(dependency.cycle)) {
        const cycle = canonicalCycle([source, ...dependency.cycle.map(entry => entry.name)]);
        cycles.set(cycle.join('\0'), cycle);
      }
      if (!sourceLayer || dependency.coreModule || dependency.couldNotResolve || !dependency.resolved) continue;
      const targetLayer = layerForFile(ctx.policy.architecture.layers, dependency.resolved);
      if (!targetLayer || sourceLayer.may_depend_on.includes(targetLayer.id)) continue;
      findings.push({
        file: source,
        line: null,
        column: null,
        severity: 'error',
        code: 'architecture:forbidden-dependency',
        message: `${sourceLayer.id} may not depend on ${targetLayer.id}: ${source} → ${dependency.resolved}`,
        fingerprint_seed: { source, target: dependency.resolved, source_layer: sourceLayer.id, target_layer: targetLayer.id },
      });
    }
  }
  for (const cycle of cycles.values()) {
    findings.push({
      file: cycle[0],
      line: null,
      column: null,
      severity: 'error',
      code: 'architecture:circular-dependency',
      message: `Circular dependency: ${[...cycle, cycle[0]].join(' → ')}`,
      fingerprint_seed: { cycle },
    });
  }
  return findings;
}

const KNIP_CATEGORIES = {
  files: 'Dead file',
  exports: 'Unused export',
  types: 'Unused exported type',
  dependencies: 'Unused dependency',
  devDependencies: 'Unused development dependency',
  unlisted: 'Undeclared dependency',
  unresolved: 'Unresolved dependency',
};

function knipFindings(data) {
  const findings = [];
  for (const issue of data.issues) {
    for (const [category, label] of Object.entries(KNIP_CATEGORIES)) {
      for (const item of Array.isArray(issue[category]) ? issue[category] : []) {
        const name = typeof item === 'string' ? item : item.name;
        findings.push({
          file: category === 'files' ? name : issue.file,
          line: category === 'files' ? null : (item.line ?? null),
          column: category === 'files' ? null : (item.col ?? null),
          severity: 'error',
          code: `knip:${category}`,
          message: `${label}: ${name}`,
          fingerprint_seed: { category, file: category === 'files' ? name : issue.file, name },
        });
      }
    }
  }
  return findings;
}

function cloneContext(repoRoot, file) {
  if (!repoRoot) return null;
  const sourcePath = path.resolve(repoRoot, file.name);
  if (!fs.existsSync(sourcePath)) return null;
  const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');
  return [
    ...lines.slice(Math.max(0, file.start - 4), Math.max(0, file.start - 1)),
    ...lines.slice(file.end, file.end + 3),
  ].join('\n').trim().replace(/\s+/g, ' ');
}

function jscpdFindings(data, repoRoot = null) {
  return data.duplicates.map(clone => {
    const first = clone.firstFile;
    const second = clone.secondFile;
    const files = [first.name, second.name].sort();
    return {
      file: first.name,
      line: first.start,
      column: null,
      severity: 'error',
      code: 'duplication:structural-clone',
      message: `${clone.format} clone (${clone.lines} lines, ${clone.tokens} tokens): ${first.name}:${first.start} ↔ ${second.name}:${second.start}`,
      fingerprint_seed: {
        files,
        format: clone.format,
        fragment: String(clone.fragment || '').trim().replace(/\s+/g, ' '),
        contexts: [cloneContext(repoRoot, first), cloneContext(repoRoot, second)],
      },
    };
  });
}

function registerArchitectureTools(registerTool) {
  registerTool({
    id: 'dependency-cruiser',
    name: 'Dependency Cruiser',
    binary: 'depcruise',
    run: (ctx) => {
      const targets = configuredTargetPaths(ctx);
      const result = requireToolExecution(safeExec('depcruise', [
        '--no-config', '--output-type', 'json', '--progress', 'none',
        '--do-not-follow', '(^|/)node_modules/', ...targets,
      ], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'dependency-cruiser');
      const parsed = tryParseJson(result.stdout);
      if (!parsed.ok) failParse(ctx, 'dependency-cruiser', parsed, result);
      if (!Array.isArray(parsed.data?.modules)) failParse(ctx, 'dependency-cruiser', { error: 'missing modules array' }, result);
      if (result.exitCode !== 0) failParse(ctx, 'dependency-cruiser', { error: 'non-zero execution status' }, result);
      return findingsResult(dependencyCruiserFindings(ctx, parsed.data.modules));
    },
  });

  registerTool({
    id: 'knip',
    name: 'Knip',
    binary: 'knip',
    run: (ctx) => {
      if (!ctx.tool.config_path || !fs.existsSync(ctx.tool.config_path)) failConfigMissing('knip-config-missing', 'Knip requires its exact configured path.');
      const result = requireToolExecution(safeExec('knip', [
        '--directory', ctx.repoRoot,
        '--config', ctx.tool.config_path,
        '--reporter', 'json',
        '--no-progress',
        '--no-config-hints',
        '--no-tag-hints',
        '--no-exit-code',
        '--include', 'files,exports,types,dependencies,unlisted,unresolved',
      ], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'knip');
      const parsed = tryParseJson(result.stdout);
      if (!parsed.ok) failParse(ctx, 'knip', parsed, result);
      if (!Array.isArray(parsed.data?.issues)) failParse(ctx, 'knip', { error: 'missing issues array' }, result);
      if (result.exitCode !== 0) failParse(ctx, 'knip', { error: 'non-zero execution status' }, result);
      return findingsResult(knipFindings(parsed.data));
    },
  });

  registerTool({
    id: 'jscpd',
    name: 'JSCPD',
    binary: 'jscpd',
    run: (ctx) => {
      if (!ctx.tool.config_path || !fs.existsSync(ctx.tool.config_path)) failConfigMissing('jscpd-config-missing', 'JSCPD requires its exact configured path.');
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-jscpd-'));
      try {
        const result = requireToolExecution(safeExec('jscpd', [
          '--config', ctx.tool.config_path,
          '--output', outputDir,
          '--exit-code', '0',
          '--silent',
          '--no-colors',
          '--no-tips',
          ...configuredTargetPaths(ctx),
        ], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'jscpd');
        const reportPath = path.join(outputDir, 'jscpd-report.json');
        if (!fs.existsSync(reportPath)) failParse(ctx, 'jscpd', { error: 'missing JSON report' }, result);
        const parsed = tryParseJson(fs.readFileSync(reportPath, 'utf8'));
        if (!parsed.ok) failParse(ctx, 'jscpd', parsed, result);
        if (!Array.isArray(parsed.data?.duplicates)) failParse(ctx, 'jscpd', { error: 'missing duplicates array' }, result);
        if (result.exitCode !== 0) failParse(ctx, 'jscpd', { error: 'non-zero execution status' }, result);
        return findingsResult(jscpdFindings(parsed.data, ctx.repoRoot));
      } finally {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    },
  });
}

export { canonicalCycle, dependencyCruiserFindings, jscpdFindings, knipFindings, registerArchitectureTools };
