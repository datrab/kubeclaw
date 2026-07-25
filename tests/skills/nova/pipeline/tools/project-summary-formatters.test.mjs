import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown } from '../../../../../skills/nova/pipeline/tools/project-summary-formatters.ts';

function minimalCode() {
  return {
    codeLines: 100,
    totalLines: 100,
    codeFiles: 3,
    swarmFiles: 1,
    commitCount: 1,
    authors: [],
    byLang: {},
  };
}

function minimalPipeline() {
  return {
    moduleCount: 1,
    totalCompleted: 1,
    totalBlocked: 0,
    totalPending: 0,
    gateCount: 1,
    gateStats: [{ title: 'Final', status: 'PASS' }],
    moduleStats: [],
    totalAttempts: 1,
    firstPassRate: 100,
    passedFirstTry: 1,
    avgAttempts: 1,
  };
}

function minimalReviews() {
  return { reviews: [], totalCritical: 0, totalDeferred: 0 };
}

function minimalAgents() {
  return { total: 0, forge: 0, buster: 0, echo: 0 };
}

test('buildCaseStudyBase reports code files and test duration from collector fields', () => {
  const summary = buildCaseStudyBase({ project: 'case-study-metrics', code: {
      totalFiles: 5,
      codeFiles: 3,
      swarmFiles: 2,
      codeLines: 100,
      totalLines: 120,
      byLang: {},
    }, pipeline: {
      moduleCount: 0,
      totalCompleted: 0,
      totalBlocked: 0,
      totalPending: 0,
      gateStats: [],
      moduleStats: [],
    }, tests: {
      totalRuns: 1,
      totalChecks: 4,
      totalFindings: 0,
      totalDuration: 2500,
    }, unitCensus: { python: { functions: 0 }, frontend: { functions: 0 } }, apiCensus: { totalCases: 0 }, reviews: { reviews: [], totalCritical: 0, totalDeferred: 0 }, agents: { total: 0 } });

  assert.equal(summary.code.code_files, 3);
  assert.equal(summary.code.pipeline_config_files, 2);
  assert.equal(summary.tests.duration_seconds, 2.5);
});

test('buildDiscordEmbeds keeps field values within Discord limits', () => {
  const longTitle = 'module-title-' + 'x'.repeat(600);
  const longGateTitle = 'gate-title-' + 'y'.repeat(600);
  const pipeline = {
    moduleCount: 6,
    totalCompleted: 6,
    totalBlocked: 0,
    totalPending: 0,
    firstPassRate: 50,
    totalAttempts: 12,
    gateCount: 6,
    elapsedHours: 1.5,
    hardestModules: Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`,
      title: `${longTitle}-${i}`,
      failCount: i + 1,
    })),
    gateStats: Array.from({ length: 6 }, (_, i) => ({
      title: `${longGateTitle}-${i}`,
      status: i % 2 === 0 ? 'PASS' : 'FAIL',
    })),
    moduleStats: Array.from({ length: 6 }, (_, i) => ({
      id: `m${i}`,
      title: `${longTitle}-delivered-${i}`,
      status: 'PASS',
      scope_group: i % 2 === 0 ? 'platform_backend' : 'frontend_ui',
    })),
  };

  const embeds = buildDiscordEmbeds({ project: 'oversized-summary', code: {
      codeLines: 1000,
      codeFiles: 10,
      commitCount: 2,
      byLang: {
        TypeScript: { code: 500 },
        Python: { code: 300 },
      },
    }, pipeline: pipeline, tests: {}, unitCensus: { python: { functions: 7 }, frontend: { functions: 8 } }, apiCensus: { totalCases: 9 }, reviews: { totalCritical: 1, totalDeferred: 2 }, agents: { total: 20, forge: 10, buster: 6, echo: 4 } });

  for (const embed of embeds) {
    for (const field of embed.fields) {
      assert.ok(
        field.value.length <= 1024,
        `${field.name} exceeded Discord field limit with ${field.value.length} characters`,
      );
    }
  }
});

test('buildMarkdown supports legacy and partial census shapes', () => {
  const markdown = buildMarkdown({ project: 'legacy-census-markdown', code: minimalCode(), pipeline: minimalPipeline(), tests: { totalRuns: 0, totalChecks: 0, totalFindings: 0, totalDuration: 0 }, unitCensus: { pythonFunctions: 2, frontendBlocks: 3 }, apiCensus: { totalCases: 4 }, reviews: minimalReviews(), agents: minimalAgents() });

  assert.match(markdown, /\| Unit Tests \(Python\/pytest\) \| 2 functions in 0 files \|/);
  assert.match(markdown, /\| Unit Tests \(Frontend\/Vitest\) \| 3 test blocks in 0 files \|/);
  assert.match(markdown, /\| API Test Specs \| 4 cases in 0 specs \|/);
  assert.match(markdown, /\| Total Test Functions \| 9 \|/);
});

test('buildMarkdown reports blocked module state explicitly', () => {
  const pipeline = {
    ...minimalPipeline(),
    totalCompleted: 0,
    totalBlocked: 1,
    totalPending: 0,
    gateStats: [{ title: 'Final', status: 'PENDING' }],
    moduleStats: [{
      id: '02-nginx',
      title: 'Content branch',
      status: 'BLOCKED',
      blockedPhase: 'preflight_contract',
      blockedReason: 'SERVE_DOCKERFILE_NOT_DECLARED',
    }],
  };
  const markdown = buildMarkdown({ project: 'blocked-summary', code: minimalCode(), pipeline: pipeline, tests: { totalRuns: 0, totalChecks: 0, totalFindings: 0, totalDuration: 0 }, unitCensus: { pythonFunctions: 0, frontendBlocks: 0 }, apiCensus: { totalCases: 0 }, reviews: minimalReviews(), agents: minimalAgents() });

  assert.match(markdown, /- \*\*Final Status:\*\* BLOCKED/);
  assert.match(markdown, /- \*\*Blocking Point:\*\* Content branch \/ preflight_contract — SERVE_DOCKERFILE_NOT_DECLARED/);
});

test('buildDiscordEmbeds supports legacy and partial census shapes', () => {
  const embeds = buildDiscordEmbeds({ project: 'legacy-census-discord', code: minimalCode(), pipeline: minimalPipeline(), tests: {}, unitCensus: { pythonFunctions: 2, frontendBlocks: 3 }, apiCensus: { totalCases: 4 }, reviews: minimalReviews(), agents: minimalAgents() });
  const testsField = embeds[0].fields.find(field => field.name.includes('Tests Written'));

  assert.equal(testsField.value, '9 (2 py + 3 tsx + 4 api)');
});
