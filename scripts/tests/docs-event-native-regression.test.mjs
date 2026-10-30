import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { discoverEventCandidates, collectGoDeclarationBodies, collectOwnedCallSyntax } from '../lib/docs-event-contracts.mjs';
import { collectBoundEventReference } from '../lib/docs-event-reference-collector.mjs';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'event-native-regression-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q', root]); execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

test('a quoted generated property has the same static version identity without losing its source spelling', (t) => {
  const file = 'contracts/wire.ts';
  const root = fixture(t, { [file]: 'export type Wire = {"schema_version":"wire.v1"; payload:unknown};' });
  const result = collectBoundEventReference(root, discoverEventCandidates(root), {
    schemaVersion: 'event-reference-bindings.v1', families: [{ id: 'wire', boundary: 'Declared fixture.',
      versionAuthority: { kind: 'type-member', path: file, name: 'Wire', member: 'schema_version' },
      roles: [{ role: 'declaration', path: file, selector: 'export type Wire', condition: 'Declaration only.' }],
      types: [{ path: file, name: 'Wire' }], limits: ['No runtime consumer.'] }],
  });
  assert.equal(result.families[0].version, '"wire.v1"');
  assert.equal(result.families[0].declarations[0].members[0].name, '"schema_version"');
});

test('Go interface parameter braces do not replace the complete diagnostic body', (t) => {
  const declaration = 'func logJSON(level string, message string, detail interface{}) {\n'
    + '  value := map[string]interface{}{"message": message, "detail": detail, "raw": `} {`}\n'
    + '  // A comment containing } does not close the declaration.\n'
    + '  write(value)\n}';
  const root = fixture(t, { 'cmd/app/main.go': `package main\n${declaration}\nfunc next() {}\n` });
  const bodies = collectGoDeclarationBodies(root, [{ path: 'cmd/app/main.go', selector: 'func logJSON(' }]);
  assert.equal(bodies[0].expression, declaration);
  assert.match(bodies[0].expression, /write\(value\)/u);
});

test('computed event type and complete payload arguments remain actual expressions', (t) => {
  const root = fixture(t, { 'skills/app/events.ts': "class Writer { #append(type:string, payload:unknown){}; run(status:string, extras:unknown){ this.#append('stage.'+status, {identity:{id:'one'},...extras}); } }" });
  const call = collectOwnedCallSyntax(root, ['skills/app/events.ts']).find((entry) => entry.expression === 'this.#append');
  assert.deepEqual(call.arguments, ["'stage.'+status", "{identity:{id:'one'},...extras}"]);
});

test('both actual embedded message versions derive from their postMessage argument objects', (t) => {
  const file = 'skills/app/preview.ts';
  const root = fixture(t, { [file]: "export const page=`<script>parent.postMessage({schema:'selection.v1',nodeId:id},'*');parent.postMessage({schema:'action.v1',nodeId:id,action:name},'*');</script>`;" });
  const result = collectBoundEventReference(root, discoverEventCandidates(root), {
    schemaVersion: 'event-reference-bindings.v1', families: [{ id: 'preview', boundary: 'Fixture iframe producers.',
      versionAuthority: { kind: 'embedded-field', path: file, field: 'schema', callExpression: 'parent.postMessage' },
      roles: [{ role: 'producer', path: file, selector: 'parent.postMessage', locations: [{line:1,occurrence:0},{line:1,occurrence:1}], condition: 'When iframe code runs.' }],
      embeddedSources: [file], limits: ['No live delivery claimed.'] }],
  });
  assert.equal(result.families[0].version, "'selection.v1' | 'action.v1'");
  assert.equal(result.families[0].embeddedScripts[0].calls.length, 2);
});
