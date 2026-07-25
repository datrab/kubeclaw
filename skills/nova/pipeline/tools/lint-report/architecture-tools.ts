import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredTargetPaths } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { tryParseJson } from './parsers.ts';
import { failConfigMissing, failParse } from './report.ts';

function findingsResult(findings: any) {
  return { errors: findings.length, warnings: 0, findings };
}

type DependencyGraph = Map<string, Set<string>>;
type ComponentState = {
  graph: DependencyGraph;
  nextIndex: number;
  indexes: Map<string, number>;
  lowLinks: Map<string, number>;
  stack: string[];
  onStack: Set<string>;
  components: string[][];
};

function dependencyGraph(modules: any[]): DependencyGraph {
  const graph: DependencyGraph = new Map();
  for (const module of modules) {
    if (typeof module.source !== 'string') continue;
    if (!graph.has(module.source)) graph.set(module.source, new Set());
    for (const dependency of Array.isArray(module.dependencies) ? module.dependencies : []) {
      if (typeof dependency.resolved !== 'string') continue;
      if (dependency.coreModule) continue;
      if (dependency.couldNotResolve) continue;
      graph.get(module.source)!.add(dependency.resolved);
      if (!graph.has(dependency.resolved)) graph.set(dependency.resolved, new Set());
    }
  }
  return graph;
}

function collectCompletedComponent(state: ComponentState, node: string): void {
  const component: string[] = [];
  while (state.stack.length > 0) {
    const member = state.stack.pop();
    if (member === undefined) throw new Error('Circular dependency component stack was unexpectedly empty.');
    state.onStack.delete(member);
    component.push(member);
    if (member === node) break;
  }
  component.sort();
  const selfCycle = state.graph.get(node)?.has(node) === true;
  if (component.length > 1 || selfCycle) state.components.push(component);
}

function visitDependencyNode(state: ComponentState, node: string): void {
  state.indexes.set(node, state.nextIndex);
  state.lowLinks.set(node, state.nextIndex);
  state.nextIndex += 1;
  state.stack.push(node);
  state.onStack.add(node);

  for (const dependency of [...(state.graph.get(node) ?? [])].sort()) {
    if (!state.indexes.has(dependency)) {
      visitDependencyNode(state, dependency);
      state.lowLinks.set(node, Math.min(state.lowLinks.get(node)!, state.lowLinks.get(dependency)!));
    } else if (state.onStack.has(dependency)) {
      state.lowLinks.set(node, Math.min(state.lowLinks.get(node)!, state.indexes.get(dependency)!));
    }
  }
  if (state.lowLinks.get(node) === state.indexes.get(node)) collectCompletedComponent(state, node);
}

function stronglyConnectedComponents(modules: any[]): string[][] {
  const graph = dependencyGraph(modules);
  const state: ComponentState = {
    graph,
    nextIndex: 0,
    indexes: new Map(),
    lowLinks: new Map(),
    stack: [],
    onStack: new Set(),
    components: [],
  };

  for (const node of [...graph.keys()].sort()) {
    if (!state.indexes.has(node)) visitDependencyNode(state, node);
  }
  return state.components.sort((left: any, right: any) => left[0]!.localeCompare(right[0]!));
}

function layerForFile(layers: any, file: any) {
  const matches = layers.flatMap((layer: any) => layer.roots
    .filter((root: any) => file === root || file.startsWith(`${root}/`))
    .map((root: any) => ({ layer, root })));
  return matches.sort((left: any, right: any) => right.root.length - left.root.length)[0]?.layer ?? null;
}

function dependencyCruiserFindings(ctx: any, modules: any) {
  const findings: any[] = [];
  for (const module of modules) {
    const source = module.source;
    const sourceLayer = layerForFile(ctx.policy.architecture.layers, source);
    for (const dependency of Array.isArray(module.dependencies) ? module.dependencies : []) {
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
  for (const members of stronglyConnectedComponents(modules)) {
    findings.push({
      file: members[0],
      line: null,
      column: null,
      severity: 'error',
      code: 'architecture:circular-dependency',
      message: `Circular dependency component (${members.length} modules): ${members.join(', ')}`,
      fingerprint_seed: { members },
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

function knipFindings(data: any) {
  const findings: any[] = [];
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

function cloneContext(repoRoot: any, file: any) {
  if (!repoRoot) return null;
  const sourcePath = path.resolve(repoRoot, file.name);
  if (!fs.existsSync(sourcePath)) return null;
  const lines = fs.readFileSync(sourcePath, 'utf8').split('\n');
  return [
    ...lines.slice(Math.max(0, file.start - 4), Math.max(0, file.start - 1)),
    ...lines.slice(file.end, file.end + 3),
  ].join('\n').trim().replace(/\s+/g, ' ');
}

function jscpdFindings(data: any, repoRoot: any = null) {
  return data.duplicates.map((clone: any) => {
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

function dependencyCruiserTool() {
  return {
    id: 'dependency-cruiser',
    name: 'Dependency Cruiser',
    binary: 'depcruise',
    run: (ctx: any) => {
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
  };
}

function knipTool() {
  return {
    id: 'knip',
    name: 'Knip',
    binary: 'knip',
    run: (ctx: any) => {
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
  };
}

function executeJscpd(ctx: any, configPath: any, targets: any, label: any) {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), `kubeclaw-jscpd-${label}-`));
  try {
    const result = requireToolExecution(safeExec('jscpd', [
      '--config', configPath, '--output', outputDir, '--exit-code', '0', '--silent',
      '--no-colors', '--no-tips', ...targets,
    ], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'jscpd');
    const reportPath = path.join(outputDir, 'jscpd-report.json');
    if (!fs.existsSync(reportPath)) failParse(ctx, 'jscpd', { error: 'missing JSON report' }, result);
    const parsed = tryParseJson(fs.readFileSync(reportPath, 'utf8'));
    if (!parsed.ok) failParse(ctx, 'jscpd', parsed, result);
    if (!Array.isArray(parsed.data?.duplicates)) failParse(ctx, 'jscpd', { error: 'missing duplicates array' }, result);
    if (result.exitCode !== 0) failParse(ctx, 'jscpd', { error: 'non-zero execution status' }, result);
    return parsed.data.duplicates;
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

function jscpdTool() {
  return {
    id: 'jscpd',
    name: 'JSCPD',
    binary: 'jscpd',
    run: (ctx: any) => {
      if (!ctx.tool.config_path || !fs.existsSync(ctx.tool.config_path)) failConfigMissing('jscpd-config-missing', 'JSCPD requires its exact configured path.');
      const testConfigPath = path.join(path.dirname(ctx.tool.config_path), 'jscpd-tests.json');
      if (!fs.existsSync(testConfigPath)) failConfigMissing('jscpd-test-config-missing', 'JSCPD requires its dedicated test calibration.');

      const productionDuplicates = executeJscpd(ctx, ctx.tool.config_path, configuredTargetPaths(ctx), 'production');
      const testDuplicates = executeJscpd(ctx, testConfigPath, ['tests'], 'tests');
      return findingsResult(jscpdFindings({ duplicates: [...productionDuplicates, ...testDuplicates] }, ctx.repoRoot));
    },
  };
}

function registerArchitectureTools(registerTool: any) {
  registerTool(dependencyCruiserTool());
  registerTool(knipTool());
  registerTool(jscpdTool());
}

export { dependencyCruiserFindings, jscpdFindings, knipFindings, registerArchitectureTools, stronglyConnectedComponents };
