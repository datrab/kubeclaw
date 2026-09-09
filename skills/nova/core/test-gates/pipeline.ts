import fs from 'node:fs';
import path from 'node:path';
import type { LoadedPipelineTestScope, PipelineLintDeclaration, TestPlanScope, TestScopeDeclaration } from './types.ts';

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`TEST_PLAN_PIPELINE_INVALID:${label}`);
  }
  return value as Record<string, unknown>;
}

export function loadPipelineTestScope(
  pipelinePath: string,
  scope: TestPlanScope,
): LoadedPipelineTestScope {
  if (path.basename(pipelinePath) !== 'pipeline.json') {
    throw new Error('TEST_PLAN_PIPELINE_NAME_INVALID');
  }
  if (path.basename(path.dirname(pipelinePath)) !== '.swarm') {
    throw new Error('TEST_PLAN_PIPELINE_LOCATION_INVALID');
  }
  if ((scope.moduleId === null) === (scope.gateId === null)) {
    throw new Error('TEST_PLAN_SCOPE_INVALID');
  }
  let source: unknown;
  try {
    source = JSON.parse(fs.readFileSync(pipelinePath, 'utf8'));
  } catch (error) {
    throw new Error('TEST_PLAN_PIPELINE_INVALID', { cause: error });
  }
  const pipeline = objectValue(source, 'root');
  if (typeof pipeline.project !== 'string' || pipeline.project.length === 0) {
    throw new Error('TEST_PLAN_PIPELINE_INVALID:project');
  }
  const collectionName = scope.moduleId === null ? 'gates' : 'modules';
  const scopeId = scope.moduleId ?? scope.gateId!;
  const collection = objectValue(pipeline[collectionName], collectionName);
  const selected = objectValue(collection[scopeId], `${collectionName}.${scopeId}`);
  const declaration: TestScopeDeclaration = {
    ...(selected.coverage === undefined ? {} : { coverage: selected.coverage as NonNullable<TestScopeDeclaration['coverage']> }),
    ...(selected.suites === undefined ? {} : { suites: selected.suites as NonNullable<TestScopeDeclaration['suites']> }),
    ...(selected.tests === undefined ? {} : { tests: selected.tests as NonNullable<TestScopeDeclaration['tests']> }),
    ...(selected.fixtures === undefined ? {} : { fixtures: selected.fixtures as NonNullable<TestScopeDeclaration['fixtures']> }),
    ...(selected.concurrencyLimits === undefined ? {} : {
      concurrencyLimits: selected.concurrencyLimits as NonNullable<TestScopeDeclaration['concurrencyLimits']>,
    }),
  };
  return Object.freeze({
    project: pipeline.project,
    declaration,
  });
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`TEST_PLAN_PIPELINE_INVALID:${label}`);
  }
  if (new Set(value).size !== value.length) throw new Error(`TEST_PLAN_PIPELINE_INVALID:${label}:duplicate`);
  return value as string[];
}

export function loadPipelineLintDeclaration(pipelinePath: string): PipelineLintDeclaration | null {
  if (path.basename(pipelinePath) !== 'pipeline.json' || path.basename(path.dirname(pipelinePath)) !== '.swarm') {
    throw new Error('TEST_PLAN_PIPELINE_LOCATION_INVALID');
  }
  let source: unknown;
  try { source = JSON.parse(fs.readFileSync(pipelinePath, 'utf8')); }
  catch (error) { throw new Error('TEST_PLAN_PIPELINE_INVALID', { cause: error }); }
  const pipeline = objectValue(source, 'root');
  if (pipeline.lint === undefined) return null;
  const lint = objectValue(pipeline.lint, 'lint');
  if (lint.uses !== 'kubeclaw.lint.full' || typeof lint.policyProject !== 'string' || lint.policyProject.length === 0) {
    throw new Error('TEST_PLAN_PIPELINE_INVALID:lint');
  }
  const rawManifests = stringList(lint.rawManifests, 'lint.rawManifests');
  const helmCharts = stringList(lint.helmCharts, 'lint.helmCharts');
  if (rawManifests.length + helmCharts.length === 0) throw new Error('TEST_PLAN_PIPELINE_INVALID:lint.inputs');
  return Object.freeze({ uses: 'kubeclaw.lint.full', policyProject: lint.policyProject, rawManifests, helmCharts });
}
