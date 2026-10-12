import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const base = 'docs/review/evidence/buster-report-runtime-extraction-20260921';
const before = ts.createSourceFile('before.ts', fs.readFileSync(`${base}/report-adapter-runtime.before.txt`, 'utf8'), ts.ScriptTarget.Latest, true);
const after = ts.createSourceFile('after.ts', fs.readFileSync('skills/buster/engine/test-gates/report-adapter-runtime.ts', 'utf8'), ts.ScriptTarget.Latest, true);
function find(source, name) {
  let result;
  function visit(node) {
    if (node.name?.getText(source) === name) result = node;
    ts.forEachChild(node, visit);
  }
  visit(source); assert(result, name); return result;
}
const methods = ['adapt', '#run', '#assertRuntimeRoot', 'abortable', 'validateLimits', 'runtimePaths'];
for (const name of methods) assert.equal(find(after, name).getText(after), find(before, name).getText(before), name);
const oldPhase = find(before, '#adaptWithinDeadline').getText(before);
const newPhase = find(after, '#adaptWithinDeadline').getText(after);
assert.equal(oldPhase.slice(oldPhase.indexOf('    } catch (error) {')), newPhase.slice(newPhase.indexOf('    } catch (error) {')));
console.log(JSON.stringify({ byteIdenticalDeclarations: methods, phaseCleanupCatchFinallyByteIdentical: true }, null, 2));
