// Canonical JavaScript and TypeScript lint policy for OpenClaw/KubeClaw.
// Rules are blocking. Existing genuine debt is fingerprinted in lint-baseline.json.
import path from 'node:path';

import tseslint from 'typescript-eslint';

const PRODUCTION_IGNORES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/fixtures/**',
  '**/generated/**',
  'contracts/telemetry/v1/telemetry-types.ts',
];

const TEST_FILES = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/test/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/tests/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/__tests__/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
];

const CONSOLE_BOUNDARIES = [
  'scripts/**/*.mjs',
  'skills/common/plugin-runtime/foundation/isolation/child.mjs',
  'skills/nova/core/cli.ts',
  'skills/nova/plugins/lint/src/engine/output.ts',
  'skills/nova/project_setup/tools/progress-scaffold.ts',
];

const ENVIRONMENT_BOUNDARIES = [
  'scripts/clawpatch-pipeline-light.mjs',
  'scripts/verify-all-skill-tests.mjs',
  'scripts/verify-plugin-live-capabilities.mjs',
  'scripts/verify-plugin-packages.mjs',
  'skills/common/plugin-runtime/foundation/registry/import-audit-child.mjs',
  'skills/common/plugin-runtime/foundation/registry/import-audit.ts',
  'skills/common/plugins/openclaw-agent-observer/src/config.ts',
  'skills/common/plugins/secret-resolver/src/adapter.ts',
  'skills/common/plugin-runtime/foundation/config/platform.ts',
  'skills/nova/plugins/lint/src/engine/execution.ts',
];

const DYNAMIC_MODULE_BOUNDARIES = [
  'skills/nova/pipeline.ts',
  'skills/common/plugin-runtime/foundation/isolation/child.mjs',
  'skills/common/plugin-runtime/foundation/isolation/runner.ts',
  'skills/common/plugin-runtime/foundation/registry/activation.ts',
  'skills/common/plugin-runtime/foundation/registry/import-audit-child.mjs',
];

function propertyName(node) {
  if (!node?.computed && node?.property?.type === 'Identifier') return node.property.name;
  if (node?.computed && node?.property?.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return null;
}

function isProcessEnv(node) {
  return node?.type === 'MemberExpression'
    && node.object?.type === 'Identifier'
    && node.object.name === 'process'
    && propertyName(node) === 'env';
}

function containsProcessEnv(node) {
  if (!node || typeof node !== 'object') return false;
  if (isProcessEnv(node)) return true;
  return Object.entries(node).some(([key, value]) => key !== 'parent'
    && (Array.isArray(value) ? value.some(containsProcessEnv) : containsProcessEnv(value)));
}

function staticDefault(node) {
  return node?.type === 'Literal'
    || (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    || (node?.type === 'UnaryExpression' && node.operator === 'void')
    || (node?.type === 'Identifier' && node.name === 'undefined');
}

function absentReturn(node) {
  return node === null
    || (node?.type === 'Literal' && node.value === null)
    || (node?.type === 'UnaryExpression' && node.operator === 'void')
    || (node?.type === 'Identifier' && node.name === 'undefined');
}

function isFallbackExpression(node) {
  return node?.type === 'LogicalExpression' && ['||', '??'].includes(node.operator);
}

function fallbackCount(node) {
  if (!isFallbackExpression(node)) return 1;
  return fallbackCount(node.left) + fallbackCount(node.right);
}

const BOOLEAN_METHODS = new Set([
  'endsWith',
  'every',
  'has',
  'includes',
  'isArray',
  'isFinite',
  'isInteger',
  'isSafeInteger',
  'some',
  'startsWith',
  'test',
  'Boolean',
]);

function isBooleanExpression(node) {
  if (!node) return false;
  if (node.type === 'Literal') return typeof node.value === 'boolean';
  if (node.type === 'UnaryExpression') return node.operator === '!';
  if (node.type === 'BinaryExpression') {
    return ['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'in', 'instanceof'].includes(node.operator);
  }
  if (node.type === 'CallExpression') {
    const calleeName = node.callee?.type === 'Identifier'
      ? node.callee.name
      : propertyName(node.callee);
    return BOOLEAN_METHODS.has(calleeName)
      || /^(?:can|does|has|is|should)[A-Z_]/.test(calleeName ?? '');
  }
  if (node.type === 'LogicalExpression') {
    return isBooleanExpression(node.left) && isBooleanExpression(node.right);
  }
  return false;
}

function isBooleanContext(node) {
  const parent = node?.parent;
  if (!parent) return false;
  const testContexts = new Set(['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ConditionalExpression']);
  if (testContexts.has(parent.type) && parent.test === node) return true;
  return parent.type === 'CallExpression'
    && parent.callee?.type === 'Identifier'
    && parent.callee.name === 'Boolean';
}

function intentionalNoncriticalCatch(node, sourceCode) {
  return sourceCode.getCommentsInside(node.body).some((comment) => (
    /INTENTIONAL_NONCRITICAL\([a-z0-9_]+\):\s*\S/i.test(comment.value)
  ));
}

function swallowedCatch(node, sourceCode) {
  if (intentionalNoncriticalCatch(node, sourceCode)) return false;
  const statements = node.body?.body ?? [];
  if (statements.length === 0) return true;
  if (statements.length !== 1) return false;
  const statement = statements[0];
  if (statement.type === 'ReturnStatement') {
    return absentReturn(statement.argument);
  }
  const callee = statement.type === 'ExpressionStatement' ? statement.expression?.callee : null;
  return callee?.type === 'MemberExpression'
    && callee.object?.type === 'Identifier'
    && callee.object.name === 'console'
    && ['error', 'log', 'warn'].includes(propertyName(callee));
}

const discipline = {
  rules: {
    'filename-case': {
      meta: { type: 'suggestion', schema: [], messages: { invalid: 'Use a lowercase kebab-case filename.' } },
      create(context) {
        return {
          Program(node) {
            const filename = path.basename(context.filename)
              .replace(/(?:\.d)?\.(?:c|m)?(?:j|t)sx?$/, '')
              .replace(/\.(?:test|spec)$/, '')
              .replace(/\.(?:unit|integration|e2e)$/, '');
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(filename)) context.report({ node, messageId: 'invalid' });
          },
        };
      },
    },
    'no-direct-env-access': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Read environment variables only in a declared configuration or infrastructure adapter.' } },
      create(context) {
        return { MemberExpression(node) { if (isProcessEnv(node)) context.report({ node, messageId: 'forbidden' }); } };
      },
    },
    'no-dynamic-module-loading': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Dynamic module loading is allowed only in a declared loader boundary.' } },
      create(context) {
        return {
          ImportExpression(node) { context.report({ node, messageId: 'forbidden' }); },
          CallExpression(node) {
            if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return;
            if (node.arguments.length === 1 && node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string') return;
            context.report({ node, messageId: 'forbidden' });
          },
        };
      },
    },
    'no-env-default': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Infrastructure environment variables must not hide hardcoded application defaults.' } },
      create(context) {
        return {
          LogicalExpression(node) {
            if (!['||', '??'].includes(node.operator)) return;
            if ((containsProcessEnv(node.left) && staticDefault(node.right))
              || (containsProcessEnv(node.right) && staticDefault(node.left))) {
              context.report({ node, messageId: 'forbidden' });
            }
          },
        };
      },
    },
    'no-fallback-chain': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Use one explicit value and at most one fallback; longer fallback chains hide authority.' } },
      create(context) {
        return {
          LogicalExpression(node) {
            if (!isFallbackExpression(node) || isFallbackExpression(node.parent)) return;
            if (isBooleanContext(node) || isBooleanExpression(node)) return;
            if (fallbackCount(node) > 2) context.report({ node, messageId: 'forbidden' });
          },
        };
      },
    },
    'no-swallowed-error': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Handle the error intentionally or rethrow it with context.' } },
      create(context) {
        return { CatchClause(node) { if (swallowedCatch(node, context.sourceCode)) context.report({ node, messageId: 'forbidden' }); } };
      },
    },
    'no-top-level-mutable-state': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Module-level mutable state is forbidden; keep state inside an explicit owner.' } },
      create(context) {
        return {
          VariableDeclaration(node) {
            if (node.parent?.type === 'Program' && node.kind !== 'const') context.report({ node, messageId: 'forbidden' });
          },
        };
      },
    },
  },
};

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '**/*.min.js'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: TEST_FILES,
    plugins: { discipline },
    rules: {
      complexity: ['error', { max: 70, variant: 'classic' }],
      'max-depth': ['error', { max: 6 }],
      'max-lines': ['error', { max: 2_000, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 650, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-params': ['error', { max: 12 }],
      'no-async-promise-executor': 'error',
      'no-global-assign': 'error',
      'no-useless-catch': 'error',
      'no-var': 'error',
      'discipline/filename-case': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    ignores: PRODUCTION_IGNORES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    ignores: PRODUCTION_IGNORES,
    plugins: { discipline },
    rules: {
      complexity: ['error', { max: 15, variant: 'classic' }],
      'max-depth': ['error', { max: 3 }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true, IIFEs: true }],
      'max-params': ['error', { max: 7 }],
      'no-global-assign': 'error',
      'no-console': 'error',
      'no-useless-catch': 'error',
      'no-var': 'error',
      'discipline/filename-case': 'error',
      'discipline/no-direct-env-access': 'error',
      'discipline/no-dynamic-module-loading': 'error',
      'discipline/no-env-default': 'error',
      'discipline/no-fallback-chain': 'error',
      'discipline/no-swallowed-error': 'error',
      'discipline/no-top-level-mutable-state': 'error',
    },
  },
  {
    files: ENVIRONMENT_BOUNDARIES,
    rules: { 'discipline/no-direct-env-access': 'off' },
  },
  {
    files: DYNAMIC_MODULE_BOUNDARIES,
    rules: { 'discipline/no-dynamic-module-loading': 'off' },
  },
  {
    files: CONSOLE_BOUNDARIES,
    rules: { 'no-console': 'off' },
  },
];
