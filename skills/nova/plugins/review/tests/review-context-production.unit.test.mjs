import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import { produceReviewContextCandidates, reviewImportReferences,
  reviewImportSpecifiersWithLines } from '../src/review-context-production.ts';

const head = '2'.repeat(40);
const paths = ['skills/nova/plugins/demo/package.json', 'skills/nova/plugins/demo/src/index.ts',
  'skills/nova/plugins/demo/src/service.ts', 'skills/nova/plugins/demo/tests/service.test.ts'];
const content = "import { value } from './index.js';\n";
const seed = [{ path: 'skills/nova/plugins/demo/src/service.ts', digest: sha256Text(content), content,
  reasons: [{ kind: 'changed' }], dependencyDepth: 0 }];
const result = await produceReviewContextCandidates(seed, {
  changedPaths: [{ path: seed[0].path, status: 'modified' }], allowedPrefixes: ['skills/nova/plugins/demo'],
}, { head, proof: 'a'.repeat(64) }, { async invoke(capability, request) {
  assert.equal(capability, 'git.repository.read');
  if (request.operation === 'find_revision_references') {
    const references = [];
    return { head, references, referencesDigest: sha256Text(canonicalJson(references)) };
  }
  assert.equal(request.operation, 'list_revision_paths');
  return { head, paths, pathsDigest: sha256Text(canonicalJson(paths)) };
} });
assert.deepEqual(result.map(({ path }) => path), [
  'skills/nova/plugins/demo/package.json', 'skills/nova/plugins/demo/src/index.ts',
  'skills/nova/plugins/demo/tests/service.test.ts',
]);
assert.equal(result.find(({ path }) => path.endsWith('index.ts')).reasons.some(({ kind }) => kind === 'direct_import'), true);
assert.equal(result.find(({ path }) => path.endsWith('service.test.ts')).reasons[0].kind, 'test');
const ignored = reviewImportReferences('src/example.ts', [
  "// import './commented.js';",
  "// 😀 import './emoji-fake.js';",
  "/* export { x } from './blocked.js'; */",
  "const example = `import './template.js';`;",
  "const dynamic = `${await import('./dynamic.js')}`;",
  "const commentedDynamic = await import /* chunk */ ('./commented-dynamic.js');",
  "const commentedRequire = require /* legacy */ ('./commented-require.js');",
  "const attributed = await import('./attributed.json', { with: { type: 'json' } });",
  "const computed = await import('./computed.js' + suffix);",
  "import{compact}from'./compact.js';",
  "export{value}from'./exported.js';",
  "const propertyDynamic = loader.import('./property-dynamic.js');",
  "const spacedPropertyDynamic = loader . import /* method */ ('./property-spaced.js');",
  "const propertyRequire = loader.require('./property-require.js');",
  "const identifierRequire = myrequire('./identifier-require.js');",
  "const continued = \"example \\",
  "import './continued.js'\";",
  "const label = \"ready\"; void import('./after-string.js');",
  "const spaced = import ('./spaced.js');",
  "const matcher = /import '.\\/absent'/;",
  "const escaped = /[\\/]import(\\\".\\/also-absent\\\")/;",
  "if (enabled) /import('\\.\\/control-fake')/.test(label);",
  "if (enabled) {}\n/import from '.\\/block-fake'/.test(label);",
  "const quotient = { value: 4 } / divisor; void import('./after-object.js');",
  "const ratio = value / /import x from '.\\/division-fake'/.source.length;",
  "import {\n  value,\n} from './multiline.js';",
  "import './real.js';",
].join('\n'), new Set(['src/after-object.ts', 'src/after-string.ts', 'src/attributed.json', 'src/commented-dynamic.ts', 'src/commented-require.ts', 'src/compact.ts', 'src/dynamic.ts',
  'src/exported.ts',
  'src/multiline.ts', 'src/real.ts', 'src/spaced.ts']));
assert.deepEqual(ignored.map(({ resolvedPath, unresolvedPath }) => resolvedPath ?? unresolvedPath),
  ['src/after-object.ts', 'src/after-string.ts', 'src/attributed.json', 'src/commented-dynamic.ts', 'src/commented-require.ts', 'src/compact.ts', 'src/dynamic.ts',
    'src/exported.ts',
    'src/multiline.ts', 'src/real.ts', 'src/spaced.ts']);
assert.deepEqual(reviewImportSpecifiersWithLines([
  "import './first.js';",
  '',
  "export { value } from './third.js';",
  "const later = import('./fourth.js');",
].join('\n')), [
  { specifier: './first.js', line: 1 },
  { specifier: './fourth.js', line: 4 },
  { specifier: './third.js', line: 3 },
]);
assert.deepEqual(reviewImportReferences('src/example.ts', "\n\nimport './target.js';\n",
  new Set(['src/target.ts'])), [{ specifier: './target.js', unresolvedPath: 'src/target.js',
  resolvedPath: 'src/target.ts', line: 3 }]);
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.review', suite: 'review-context-production' }));
