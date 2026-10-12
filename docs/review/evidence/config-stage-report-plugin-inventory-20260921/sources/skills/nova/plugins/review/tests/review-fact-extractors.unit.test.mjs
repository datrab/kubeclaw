import assert from 'node:assert/strict';

import { extractReviewRelations } from '../src/review-fact-extractors.ts';
import { jsoncObject } from '../src/review-json.ts';

assert.deepEqual(jsoncObject('{ // comment\n"url":"https://example.test/a//b", "items":[1,],\n}'), {
  url: 'https://example.test/a//b', items: [1],
});
assert.deepEqual(jsoncObject('\uFEFF{ // comment\n"compilerOptions":{"strict":true,},\n}'), {
  compilerOptions: { strict: true },
});
assert.equal(jsoncObject('{"valid":true} /* unterminated'), undefined);

const documents = [
  { path: 'go.mod', content: 'module example.test/repo\n' },
  { path: 'src/a.ts', content: 'export const a = 1;\n' },
  { path: 'src/b.ts', content: "import { a } from './a.js';\nexport const b = a;\n" },
  { path: 'tests/a.test.ts', content: "import { a } from '../src/a.js';\nvoid a;\n" },
  { path: 'src/widget.ts', content: 'export const widget = true;\n' },
  { path: 'tests/widget.ts', content: 'export const widgetTest = true;\n' },
  { path: 'schema/root.json', content: '{"$ref":"./leaf.json#/definitions/x"}' },
  { path: 'schema/leaf.json', content: '{"definitions":{"x":{"type":"string"}}}' },
  { path: 'pkg/a/a.go', content: 'package a\n' },
  { path: 'pkg/b/b.go', content: 'package b\nimport "example.test/repo/pkg/a"\n' },
  { path: 'pkg/c/c.go', content: 'package c\nimport . "example.test/repo/pkg/a"\n' },
  { path: 'pkg/d/d.go', content: 'package d\nimport (\n  . "example.test/repo/pkg/a"\n)\n' },
  { path: 'pkg/e/e.go', content: 'package e\nimport `example.test/repo/pkg/a`\n' },
  { path: 'pkg/f/f.go', content: 'package f\nimport (\n  raw `example.test/repo/pkg/a`\n)\n' },
  { path: 'docker/Dockerfile', content: 'COPY ../src /app/src\n' },
  { path: 'docker/Dockerfile.multi', content: 'COPY ../src/a.ts \\\n    ../src/widget.ts /app/src/\n' },
  { path: 'scripts/run.sh', content: 'node ../tools/check.mjs\n' },
  { path: 'tools/check.mjs', content: 'await fetch("https://example.test");\n' },
  { path: 'src/network.ts', content: "export const request = () => fetch('/api/status');\n" },
];
const forward = extractReviewRelations(documents);
const reversed = extractReviewRelations([...documents].reverse());
assert.deepEqual(forward, reversed);
const keys = forward.map(({ type, from, to }) => `${type}:${from}:${to}`);
for (const expected of [
  'imports:src/b.ts:src/a.ts',
  'imports:pkg/b/b.go:pkg/a/a.go',
  'imports:pkg/c/c.go:pkg/a/a.go',
  'imports:pkg/d/d.go:pkg/a/a.go',
  'imports:pkg/e/e.go:pkg/a/a.go',
  'imports:pkg/f/f.go:pkg/a/a.go',
  'references_schema:schema/root.json:schema/leaf.json',
  'packages_source:docker/Dockerfile:src/a.ts',
  'packages_source:docker/Dockerfile.multi:src/a.ts',
  'packages_source:docker/Dockerfile.multi:src/widget.ts',
  'invokes_script:scripts/run.sh:tools/check.mjs',
  'tests:tests/a.test.ts:src/a.ts',
  'tests:tests/widget.ts:src/widget.ts',
  'uses_network:tools/check.mjs:resource:network',
  'uses_network:src/network.ts:resource:network',
]) assert.equal(keys.includes(expected), true, expected);
assert.equal(keys.filter((key) => key === 'imports:pkg/d/d.go:pkg/a/a.go').length, 1);
assert.equal(forward.find(({ from }) => from === 'src/b.ts')?.provenance, 'src/b.ts:1');
assert.equal(forward.find(({ from }) => from === 'pkg/b/b.go')?.provenance, 'pkg/b/b.go:2');
assert.equal(forward.find(({ from }) => from === 'pkg/d/d.go')?.provenance, 'pkg/d/d.go:3');
assert.equal(forward.find(({ from }) => from === 'schema/root.json')?.provenance, 'schema/root.json:1');
assert.equal(forward.every(({ provenance, confidence }) => provenance.length > 0
  && ['exact', 'derived', 'uncertain'].includes(confidence)), true);

const missing = extractReviewRelations([
  { path: 'go.mod', content: 'module example.test/repo\n' },
  { path: 'src/missing.ts', content: "import './absent.js';\n" },
  { path: 'pkg/missing.go', content: 'package missing\nimport "example.test/repo/pkg/absent"\n' },
  { path: 'schema/missing.json', content: '{"$ref":"./absent.json"}' },
]);
assert.equal(missing.some(({ from, to }) => from === 'src/missing.ts' && to === 'src/absent.js'), true);
assert.equal(missing.some(({ from, to }) => from === 'pkg/missing.go' && to.endsWith('/__missing__.go')), true);
assert.equal(missing.some(({ from, to }) => from === 'schema/missing.json' && to === 'schema/absent.json'), true);
const generated = extractReviewRelations([{ path: 'src/uses-generated.ts',
  content: "import './generated/client.js';\n" }]);
assert.equal(generated.some(({ to }) => to === 'resource:generated-file:src/generated/client.js'), true);
const external = extractReviewRelations([{ path: 'schema/external.json', content: '{"$ref":"https://example.test/schema"}' }]);
assert.equal(external.some(({ to }) => to === 'resource:schema:https://example.test/schema'), true);
const localSelf = extractReviewRelations([{ path: 'schema/self.json', content: '{"$ref":""}' }]);
assert.equal(localSelf.length, 0, 'an empty JSON Reference URI is local to the current document');
const basedSchema = extractReviewRelations([
  { path: 'schema/root.json', content: '{"$id":"sub/","$ref":"child.json"}' },
  { path: 'schema/sub/child.json', content: '{"type":"string"}' },
]);
assert.equal(basedSchema.some(({ from, to }) => from === 'schema/root.json'
  && to === 'schema/sub/child.json'), true);
const nestedSchemaId = extractReviewRelations([
  { path: 'schema/address.json', content: '{"$defs":{"address":{"$id":"urn:example:address","type":"string"}}}' },
  { path: 'schema/user.json', content: '{"$ref":"urn:example:address"}' },
]);
assert.equal(nestedSchemaId.some(({ from, to }) => from === 'schema/user.json'
  && to === 'schema/address.json'), true);
const dynamicSchema = extractReviewRelations([
  { path: 'schema/base.json', content: '{"$dynamicAnchor":"node"}' },
  { path: 'schema/use.json', content: '{"$dynamicRef":"./base.json#node"}' },
]);
assert.equal(dynamicSchema.some(({ from, to }) => from === 'schema/use.json' && to === 'schema/base.json'), true);
const multilineSchema = extractReviewRelations([
  { path: 'schema/multi.json', content: '{\n  "$defs": {\n    "one": { "$ref": "./a.json" },\n    "two": { "$ref": "./b.json" }\n  }\n}' },
  { path: 'schema/a.json', content: '{}' }, { path: 'schema/b.json', content: '{}' },
]);
assert.equal(multilineSchema.find(({ to }) => to === 'schema/a.json')?.provenance, 'schema/multi.json:3');
assert.equal(multilineSchema.find(({ to }) => to === 'schema/b.json')?.provenance, 'schema/multi.json:4');
const rootDocker = extractReviewRelations([
  { path: 'Dockerfile', content: 'COPY . /app\n' }, { path: 'src/index.ts', content: 'export const value = 1;\n' },
]);
assert.equal(rootDocker.some(({ from, to }) => from === 'Dockerfile' && to === 'src/index.ts'), true);
const dockerGlob = extractReviewRelations([
  { path: 'Dockerfile', content: 'COPY package*.json /app/\n' },
  { path: 'package.json', content: '{"name":"example"}' },
  { path: 'package-lock.json', content: '{"lockfileVersion":3}' },
]);
assert.equal(dockerGlob.some(({ to }) => to === 'package.json'), true);
assert.equal(dockerGlob.some(({ to }) => to === 'package-lock.json'), true);
const unresolvedDockerGlob = extractReviewRelations([{ path: 'Dockerfile', content: 'COPY missing*.json /app/\n' }]);
assert.equal(unresolvedDockerGlob.some(({ to }) => to === 'missing*.json'), true);
const stagedDocker = extractReviewRelations([
  { path: 'Dockerfile', content: 'COPY --from=builder /out/app /app\n' },
]);
assert.equal(stagedDocker.length, 0, 'a multi-stage source is not a Git build-context dependency');
const repositoryContextDocker = extractReviewRelations([
  { path: 'docker/Dockerfile', content: 'COPY contracts/example.json /app/contracts/\n' },
  { path: 'contracts/example.json', content: '{}' },
]);
assert.equal(repositoryContextDocker.some(({ to }) => to === 'contracts/example.json'), true);
const directoryDocker = extractReviewRelations([
  { path: 'docker/Dockerfile', content: 'COPY web/ /app/web/\n' },
  { path: 'web/index.html', content: '<h1>Ready</h1>\n' },
]);
assert.equal(directoryDocker.some(({ to }) => to === 'web/index.html'), true);
const uppercaseDirectoryDocker = extractReviewRelations([
  { path: 'Projects/demo/Dockerfile', content: 'COPY index.html /app/\n' },
  { path: 'Projects/demo/index.html', content: '<h1>Ready</h1>\n' },
]);
assert.equal(uppercaseDirectoryDocker.some(({ to }) => to === 'Projects/demo/index.html'), true);
const goFixtures = extractReviewRelations([
  { path: 'go.mod', content: 'module example.test/repo\n' },
  { path: 'pkg/raw/raw.go', content: 'package raw\nvar fixture = `\nimport "example.test/repo/pkg/missing"\n`\n// import "example.test/repo/pkg/comment"\n/*\nimport "example.test/repo/pkg/block"\n*/\n' },
]);
assert.equal(goFixtures.some(({ from }) => from === 'pkg/raw/raw.go'), false);
const ordinaryGoString = extractReviewRelations([
  { path: 'go.mod', content: 'module example.test/project\n' },
  { path: 'pkg/sample.go', content: 'package pkg\nconst sample = "import \\"example.test/project/missing\\""\n' },
]);
assert.equal(ordinaryGoString.some(({ from }) => from === 'pkg/sample.go'), false);

const nestedModules = extractReviewRelations([
  { path: 'services/foo/go.mod', content: 'module example.test/foo\n' },
  { path: 'services/foo/pkg/a/a.go', content: 'package a\n' },
  { path: 'services/foo/pkg/b/b.go', content: 'package b\nimport "example.test/foo/pkg/a"\n' },
]);
assert.equal(nestedModules.some(({ from, to }) => from === 'services/foo/pkg/b/b.go'
  && to === 'services/foo/pkg/a/a.go'), true);
const siblingModules = extractReviewRelations([
  { path: 'services/app/go.mod', content: 'module example.test/app // application module\n' },
  { path: 'services/app/main.go', content: 'package main\nimport "example.test/tools/pkg"\n' },
  { path: 'tools/go.mod', content: 'module example.test/tools\n' },
  { path: 'tools/pkg/tool.go', content: 'package pkg\n' },
]);
assert.equal(siblingModules.some(({ from, to }) => from === 'services/app/main.go'
  && to === 'tools/pkg/tool.go'), true);
const secretBoundary = extractReviewRelations([
  { path: 'src/secret.ts', content: 'export const token = process.env.API_TOKEN;\n' },
]);
assert.equal(secretBoundary.some(({ type, from }) => type === 'reads_secret' && from === 'src/secret.ts'), true);

const localAliases = extractReviewRelations([
  { path: 'tsconfig.json', content: '{ // alias\n"compilerOptions":{"baseUrl":".","paths":{"@app/*":["src/*"],}},}' },
  { path: 'src/a.ts', content: 'export const a = 1;\n' },
  { path: 'src/b.ts', content: "import { a } from '@app/a';\nvoid a;\n" },
  { path: 'packages/demo/package.json', content: '{"name":"@repo/demo"}' },
  { path: 'packages/demo/src/index.ts', content: 'export const demo = 1;\n' },
  { path: 'src/c.ts', content: "import { demo } from '@repo/demo';\nvoid demo;\n" },
]);
assert.equal(localAliases.some(({ from, to }) => from === 'src/b.ts' && to === 'src/a.ts'), true);
assert.equal(localAliases.some(({ from, to }) => from === 'src/c.ts'
  && to === 'packages/demo/src/index.ts'), true);
assert.equal(localAliases.find(({ from, to }) => from === 'src/b.ts' && to === 'src/a.ts')?.provenance,
  'src/b.ts:1');
const scopedAliases = extractReviewRelations([
  { path: 'packages/a/tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' },
  { path: 'packages/a/src/value.ts', content: 'export const value = "a";\n' },
  { path: 'packages/b/tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}' },
  { path: 'packages/b/src/value.ts', content: 'export const value = "b";\n' },
  { path: 'packages/b/src/use.ts', content: "import { value } from '@/value';\nvoid value;\n" },
]);
assert.equal(scopedAliases.some(({ from, to }) => from === 'packages/b/src/use.ts'
  && to === 'packages/b/src/value.ts'), true);
assert.equal(scopedAliases.some(({ from, to }) => from === 'packages/b/src/use.ts'
  && to === 'packages/a/src/value.ts'), false);
const inheritedAliases = extractReviewRelations([
  { path: 'configs/tsconfig.base.json', content: '{"compilerOptions":{"baseUrl":"..","paths":{"@shared/*":["shared/*"]}}}' },
  { path: 'packages/app/tsconfig.json', content: '{"extends":"../../configs/tsconfig.base.json"}' },
  { path: 'packages/app/src/use.ts', content: "import { value } from '@shared/value';\nvoid value;\n" },
  { path: 'shared/value.ts', content: 'export const value = true;\n' },
]);
assert.equal(inheritedAliases.some(({ from, to }) => from === 'packages/app/src/use.ts'
  && to === 'shared/value.ts'), true);
const isolatedAliases = extractReviewRelations([
  { path: 'tsconfig.json', content: '{"compilerOptions":{"baseUrl":".","paths":{"shared/*":["root/*"]}}}' },
  { path: 'root/value.ts', content: 'export const value = true;\n' },
  { path: 'packages/app/tsconfig.json', content: '{"compilerOptions":{"strict":true}}' },
  { path: 'packages/app/src/use.ts', content: "import 'shared/value';\n" },
]);
assert.equal(isolatedAliases.some(({ from }) => from === 'packages/app/src/use.ts'), false);
const exactAlias = extractReviewRelations([
  { path: 'tsconfig.json', content: '{"compilerOptions":{"paths":{"@app":["src/app.ts"]}}}' },
  { path: 'src/app.ts', content: 'export const app = true;\n' },
  { path: 'src/use.ts', content: "import '@app/server';\n" },
]);
assert.equal(exactAlias.some(({ from }) => from === 'src/use.ts'), false);
const aliasPrecedence = extractReviewRelations([
  { path: 'tsconfig.json', content: '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"],"@/generated":["generated/index.ts"]}}}' },
  { path: 'generated/index.ts', content: 'export const generated = true;\n' },
  { path: 'src/generated.ts', content: 'export const wrong = true;\n' },
  { path: 'src/local.ts', content: 'export const local = true;\n' },
  { path: 'src/use.ts', content: "import '@/generated';\nimport 'src/local';\nimport 'external-package';\n" },
]);
assert.equal(aliasPrecedence.some(({ from, to }) => from === 'src/use.ts' && to === 'generated/index.ts'), true);
assert.equal(aliasPrecedence.some(({ from, to }) => from === 'src/use.ts' && to === 'src/local.ts'), true);
assert.equal(aliasPrecedence.some(({ from, to }) => from === 'src/use.ts' && to.includes('external-package')), false);
const rootPackageAlias = extractReviewRelations([
  { path: 'package.json', content: '{"name":"root-app"}' },
  { path: 'index.ts', content: 'export const app = true;\n' },
  { path: 'consumer.ts', content: "import { app } from 'root-app';\nvoid app;\n" },
]);
assert.equal(rootPackageAlias.some(({ from, to }) => from === 'consumer.ts' && to === 'index.ts'), true);
const scopedTests = extractReviewRelations([
  { path: 'packages/a/src/index.ts', content: 'export const a = true;\n' },
  { path: 'packages/a/tests/index.test.ts', content: 'void 0;\n' },
  { path: 'packages/b/src/index.ts', content: 'export const b = true;\n' },
  { path: 'packages/b/tests/index.test.ts', content: 'void 0;\n' },
]);
assert.equal(scopedTests.filter(({ type }) => type === 'tests').length, 2);
assert.equal(scopedTests.some(({ from, to }) => from.includes('packages/a/') && to.includes('packages/b/')), false);
const repeatedIndexFiles = Array.from({ length: 1_000 }, (_, index) => [
  { path: `packages/p${index}/src/index.ts`, content: 'export const value = true;\n' },
  { path: `packages/p${index}/tests/index.test.ts`, content: 'void 0;\n' },
]).flat();
const repeatedIndexRelations = extractReviewRelations(repeatedIndexFiles).filter(({ type }) => type === 'tests');
assert.equal(repeatedIndexRelations.length, 1_000);
assert.equal(repeatedIndexRelations.every(({ from, to }) => from.split('/')[1] === to.split('/')[1]), true);

console.log(JSON.stringify({ ok: true, suite: 'review-fact-extractors' }));
