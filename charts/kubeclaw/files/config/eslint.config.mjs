// Shared ESLint baseline for OpenClaw/KubeClaw pipeline lint-report.
//
// Phase 2 scope for maintainability enforcement:
//   - raw UI primitives in JSX
//   - dynamic imports / dynamic require in JS/JSX
//   - swallowed catch behavior in JS/JSX
//
// Note: this baseline currently targets JS/JSX-family files only.
// The runtime image ships ESLint but not the TypeScript ESLint parser/plugin,
// so TS/TSX enforcement remains covered by Semgrep until that parser is added.

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.min.js',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    ignores: [
      '**/plugin/**',
      '**/plugins/**',
      '**/registry/**',
      '**/registries/**',
      '**/loader/**',
      '**/loaders/**',
      '**/migrations/**',
      '**/*.test.*',
      '**/*.spec.*',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: false }],
      'no-useless-catch': 'warn',
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'ImportExpression',
          message: 'Dynamic imports reduce static discoverability, prefer static imports or an explicit registry boundary.',
        },
        {
          selector: "CallExpression[callee.name='require'][arguments.length=1]:not([arguments.0.type='Literal'])",
          message: 'Dynamic require() reduces static discoverability, prefer static imports or an explicit registry boundary.',
        },
        {
          selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='input']",
          message: 'Use the component library input primitive instead of raw <input>.',
        },
        {
          selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='textarea']",
          message: 'Use the component library textarea primitive instead of raw <textarea>.',
        },
        {
          selector: "JSXOpeningElement[name.type='JSXIdentifier'][name.name='select']",
          message: 'Use the component library select primitive instead of raw <select>.',
        },
        {
          selector: "CatchClause[body.body.length=1] > BlockStatement > ReturnStatement",
          message: 'Return-only catch block hides failures, handle the error explicitly or rethrow with context.',
        },
        {
          selector: "CatchClause[body.body.length=1] > BlockStatement > ExpressionStatement > CallExpression[callee.object.name='console']",
          message: 'Logging-only catch block hides failures, handle the error explicitly or rethrow with context.',
        },
      ],
    },
  },
];
