import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { discoverEventCandidates } from '../lib/docs-event-contracts.mjs';
import { collectBoundEventReference } from '../lib/docs-event-reference-collector.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'event-reference-binding-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'skills/app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/app/events.ts'), "export interface Payload {id:string; extra?:unknown}; export function publish(){return {schema:'wire.v1',payload:{id:'one'}}}");
  execFileSync('git', ['init', '-q', root]); execFileSync('git', ['add', '.'], { cwd: root });
  const bindings = { schemaVersion: 'event-reference-bindings.v1', families: [{ id: 'wire',
    boundary: 'Local constructor; no live call claimed.', versionAuthority: {kind:'constructor-field',path:'skills/app/events.ts',field:'schema',enclosingSelector:'export function publish'},
    roles: [{ role: 'producer', path: 'skills/app/events.ts', selector: 'function publish', condition: 'When publish is called.' }],
    types: [{ path: 'skills/app/events.ts', name: 'Payload' }],
    constructorSources: ['skills/app/events.ts'], schemas: [], limits: ['No receiver binding supplied.'] }] };
  return { root, bindings };
}

test('bound collector joins fresh actual payload syntax without inventing a receiver', (t) => {
  const { root, bindings } = fixture(t);
  const first = collectBoundEventReference(root, discoverEventCandidates(root), bindings);
  assert.equal(first.families[0].declarations[0].members[1].type.expression, 'unknown');
  assert.equal(first.families[0].version, "'wire.v1'");
  assert(!first.families[0].roles.some((role) => role.role === 'consumer'));
  const source = path.join(root, 'skills/app/events.ts');
  fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace('id:string', 'id:string; nested:{value:number|null}').replace('wire.v1', 'wire.v2'));
  const next = collectBoundEventReference(root, discoverEventCandidates(root), bindings);
  assert.equal(next.families[0].version, "'wire.v2'");
  assert.notEqual(next.sourceSetSha256, first.sourceSetSha256);
  assert.equal(next.families[0].declarations[0].members[1].type.expression, '{value:number|null}');
});

test('missing relationship selectors and concurrent source changes fail rather than reusing stale custody', (t) => {
  const { root, bindings } = fixture(t); const census = discoverEventCandidates(root);
  bindings.families[0].roles[0].selector = 'not present';
  assert.throws(() => collectBoundEventReference(root, census, bindings), /SELECTOR_MISSING/u);
  bindings.families[0].roles[0].selector = 'function publish';
  fs.appendFileSync(path.join(root, 'skills/app/events.ts'), '\n// concurrent change\n');
  assert.throws(() => collectBoundEventReference(root, census, bindings), /SOURCE_CHANGED_DURING_COLLECTION/u);
});

test('inherited payload members resolve through actual aliased base imports', (t) => {
  const { root, bindings } = fixture(t);
  fs.writeFileSync(path.join(root, 'skills/app/base.ts'), 'export interface Base {identity:{id:string}; metadata?:unknown}');
  const source = path.join(root, 'skills/app/events.ts');
  fs.writeFileSync(source, "import type {Base as Parent} from './base.ts';" + fs.readFileSync(source, 'utf8').replace('interface Payload {', 'interface Payload extends Parent {'));
  execFileSync('git', ['add', 'skills/app/base.ts'], { cwd: root });
  const result = collectBoundEventReference(root, discoverEventCandidates(root), bindings);
  const base = result.families[0].declarations.find((entry) => entry.name === 'Base');
  assert(base); assert.equal(base.path, 'skills/app/base.ts');
  assert.equal(base.members[0].type.expression, '{id:string}');
  assert.equal(base.members[1].type.expression, 'unknown');
  assert.equal(base.members[1].optional, true);
});

test('same call expression retains branch-specific ownership and rejects stale occurrence coordinates', (t) => {
  const { root, bindings } = fixture(t);
  fs.writeFileSync(path.join(root, 'skills/app/events.ts'), "export interface Payload {id:string}\nexport function publish(){return {schema:'wire.v1'}}\nfunction command(){return rpc('capability',{request:1})}\nfunction event(){return rpc('event',{payload:2})}\n");
  const family = bindings.families[0];
  family.calls = [
    {path:'skills/app/events.ts',expression:'rpc',locations:[{line:3}],role:'supporting-command',condition:'Capability request only.'},
    {path:'skills/app/events.ts',expression:'rpc',locations:[{line:4}],role:'producer',condition:'Event payload only.'},
  ];
  const census = discoverEventCandidates(root);
  const calls = collectBoundEventReference(root, census, bindings).families[0].selectedCalls;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].role, 'supporting-command'); assert.match(calls[0].arguments[0], /capability/u);
  assert.equal(calls[1].role, 'producer'); assert.match(calls[1].arguments[0], /event/u);
  family.calls[0].locations = [{line:2}];
  assert.throws(() => collectBoundEventReference(root,census,bindings), /CALL_OCCURRENCE_MISSING/u);
  family.calls[0].locations = [{line:3},{line:3}];
  assert.throws(() => collectBoundEventReference(root,census,bindings), /CALL_OCCURRENCES_INVALID/u);
});
