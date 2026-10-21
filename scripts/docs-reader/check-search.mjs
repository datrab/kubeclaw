import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { searchReaderPages } from './renderer.mjs';

const root = path.resolve(process.argv[2] ?? '.tmp/docs-publication');
const manifest = JSON.parse(fs.readFileSync('docs/config/documentation-publication-manifest.json', 'utf8'));
const source = fs.readFileSync(path.join(root, 'search-index.js'), 'utf8');
const prefix = 'window.kubeclawSearchIndex=';
assert(source.startsWith(prefix) && source.endsWith(';\n'), 'Invalid reader index envelope');
const index = JSON.parse(source.slice(prefix.length, -2));
const expected = manifest.pages.map(item => item.route.slice(1)).sort();
assert.deepEqual(index.map(item => item.route).sort(), expected, 'Search must contain exactly the canonical manifest, not internal artifacts or auxiliary pages');
assert.equal(new Set(index.map(item => item.route)).size, index.length);
assert(index.every(item => typeof item.title === 'string' && item.title && Array.isArray(item.headings)
  && item.headings.every(heading => typeof heading === 'string') && typeof item.text === 'string' && item.text));
const questions = JSON.parse(fs.readFileSync(new URL('./search-questions.json', import.meta.url), 'utf8')).questions;
const observed = questions.map(question => {
  assert(typeof question.query === 'string' && question.query.trim() && typeof question.route === 'string' && expected.includes(question.route));
  const top = searchReaderPages(index, question.query).slice(0, 3).map(item => item.route);
  assert(top.includes(question.route), `Reader question missed upper results: ${question.query}: ${top.join(', ')}`);
  return { query: question.query, expectedRoute: question.route, observedTopThree: top };
});
assert.deepEqual(searchReaderPages(index, 'NO_SUCH_DOC_VALUE_0e19'), []);
console.log(JSON.stringify({ indexedCanonicalPages: index.length, internalArtifacts: 0, readerQuestionsPassed: observed.length, observed }, null, 2));
