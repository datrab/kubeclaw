import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { discoverEventCandidates, collectDeclaredTypeGraph, collectRecordConstructors,
  collectSchemaGraph, collectSourceCallGraph, selectDeclaredTypeClosure,
  collectEmbeddedScriptSyntax } from '../lib/docs-event-contracts.mjs';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-event-contracts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['add', '.'], { cwd: root });
  return root;
}

test('discovery keeps production, tests, deployment and retained evidence distinct without active-role claims', (t) => {
  const root = fixture(t, {
    'skills/app/entry.ts': "export interface RecordEvent {schemaVersion:'a.v1'; eventId:string}\nexport const e={kind:'event',payload:{text:'x'}};",
    'cmd/app/main_test.go': 'package main\n// event fixture\n',
    'skills/app/store.sql': 'CREATE TABLE preference_event (event_id text);',
    'handoffs/old.json': { schemaVersion: 'event.v1' },
    'scripts/publish.mjs': "process.stdout.write('event');",
  });
  const first = discoverEventCandidates(root);
  assert.deepEqual(discoverEventCandidates(root), first);
  assert.equal(first.sources.find((s) => s.path.endsWith('_test.go')).classification, 'test-fixture-or-example');
  assert.equal(first.sources.find((s) => s.path.startsWith('handoffs/')).classification, 'transition-evidence-or-release-record');
  assert(first.candidates.some((c) => c.path.endsWith('.sql') && c.kind === 'unresolved-language-candidate'));
  assert(first.candidates.some((c) => c.kind === 'record-object' && c.properties.includes('kind')));
  assert.match(first.status, /NOT_QUALIFIED/u);
});

test('a newly shipped event module changes the source census rather than hiding behind the old three families', (t) => {
  const root = fixture(t, { 'skills/app/entry.ts': 'export const ready=true;' });
  const before = discoverEventCandidates(root);
  fs.writeFileSync(path.join(root, 'skills/app/new.ts'), "export interface NewEvent {schemaVersion:'new-event.v1';payload:{required:string}};");
  execFileSync('git', ['add', 'skills/app/new.ts'], { cwd: root });
  const after = discoverEventCandidates(root);
  assert.notEqual(after.sourceSetSha256, before.sourceSetSha256);
  assert(after.candidates.some((c) => c.path === 'skills/app/new.ts' && c.kind === 'record-type-member'));
});

test('script parse errors fail explicitly and tracked symlinks are not read as schema authorities', (t) => {
  const root = fixture(t, { 'skills/app/entry.ts': 'export interface Broken {' });
  assert.throws(() => discoverEventCandidates(root), /EVENT_SOURCE_PARSE_FAILED/u);
  fs.writeFileSync(path.join(root, 'skills/app/entry.ts'), 'export const ok=true;');
  fs.symlinkSync('entry.ts', path.join(root, 'skills/app/linked.ts'));
  execFileSync('git', ['add', '.'], { cwd: root });
  assert.throws(() => discoverEventCandidates(root), /EVENT_SOURCE_NOT_REGULAR/u);
});

test('nested and optional/nullable declaration facts remain exact, not invented runtime validation', (t) => {
  const root = fixture(t, { 'skills/app/types.ts': "export namespace Inner { export interface Event {schemaVersion:'event.v1'; required:string; optional?:string|null;payload:unknown} }" });
  const graph = collectDeclaredTypeGraph(root, ['skills/app/types.ts']);
  const event = graph.declarations.find((entry) => entry.name === 'Event');
  assert(event);
  assert.equal(event.members.find((m) => m.name === 'optional').optional, true);
  assert.equal(event.members.find((m) => m.name === 'optional').type.expression, 'string|null');
  assert.equal(event.members.find((m) => m.name === 'payload').type.declaredUnknown, true);
  assert.match(graph.meaning, /not an asserted runtime validator/u);
});

test('payload closure follows real alias/barrel imports and does not select unrelated same-named types', (t) => {
  const root = fixture(t, {
    'skills/types/payload.ts': 'export interface Payload {needed:string; optional?:number|null}',
    'skills/types/index.ts': "export type {Payload as Renamed} from './payload.ts';",
    'skills/other/payload.ts': 'export interface Payload {wrong:boolean}',
    'skills/app/envelope.ts': "import type {Renamed as Data} from '../types/index.ts'; export interface Event {payload:Data}",
  });
  const files = discoverEventCandidates(root).sources.map((entry) => entry.path);
  const graph = collectDeclaredTypeGraph(root, files);
  const selected = selectDeclaredTypeClosure(root, graph, [], [{ path: 'skills/app/envelope.ts', name: 'Event' }]);
  assert(selected.declarations.some((entry) => entry.path === 'skills/types/payload.ts'));
  assert(!selected.declarations.some((entry) => entry.path === 'skills/other/payload.ts'));
});

test('a local Record type shadows the built-in operator and unresolved payload authorities fail closed', (t) => {
  const root = fixture(t, { 'skills/app/types.ts': 'type Record={local:string};export interface Event {payload:Record;missing:Missing}' });
  let graph = collectDeclaredTypeGraph(root, ['skills/app/types.ts']);
  assert.throws(() => selectDeclaredTypeClosure(root, graph, [], [{path:'skills/app/types.ts',name:'Event'}]), /EVENT_PAYLOAD_REFERENCE_NOT_UNIQUE/u);
  fs.writeFileSync(path.join(root, 'skills/app/types.ts'), 'type Record={local:string};export interface Event {payload:Record}');
  graph = collectDeclaredTypeGraph(root, ['skills/app/types.ts']);
  const selected = selectDeclaredTypeClosure(root, graph, [], [{path:'skills/app/types.ts',name:'Event'}]);
  assert(selected.declarations.some((entry) => entry.name === 'Record'));
});

test('local schema references preserve required/nullable/open/conditional facts and recursive edges', (t) => {
  const root = fixture(t, {
    'contracts/one.schema.json': {$defs:{child:{type:['object','null'],required:['id'],properties:{id:{type:'string'},parent:{$ref:'#/$defs/child'}},additionalProperties:false}},$ref:'two.schema.json'},
    'contracts/two.schema.json': {$ref:'one.schema.json#/$defs/child',if:{required:['id']},then:{properties:{id:{minLength:1}}}},
  });
  const graph = collectSchemaGraph(root, ['contracts/one.schema.json']);
  assert.equal(graph.documents.length, 2);
  assert.equal(graph.references.length, 3);
  assert(graph.references.every((entry) => entry.status === 'resolved-local-schema'));
  assert.deepEqual(graph.documents[0].document.$defs.child.type, ['object', 'null']);
  assert.equal(graph.documents[0].document.$defs.child.additionalProperties, false);
  assert.deepEqual(graph.documents[1].document.if, {required:['id']});
});

test('dangling schema pointers and outside-root targets are rejected; external registry refs are not claimed resolved', (t) => {
  const root = fixture(t, { 'contracts/a.schema.json': {$ref:'#/$defs/missing'} });
  assert.throws(() => collectSchemaGraph(root, ['contracts/a.schema.json']), /EVENT_SCHEMA_DANGLING_REFERENCE/u);
  fs.writeFileSync(path.join(root, 'contracts/a.schema.json'), JSON.stringify({$ref:'../../outside.json'}));
  assert.throws(() => collectSchemaGraph(root, ['contracts/a.schema.json']), /EVENT_SCHEMA_OUTSIDE_ROOT/u);
  fs.writeFileSync(path.join(root, 'contracts/a.schema.json'), JSON.stringify({$ref:'https://example.invalid/external#/$defs/Event'}));
  const graph = collectSchemaGraph(root, ['contracts/a.schema.json']);
  assert.equal(graph.references[0].status, 'external-registry-resolution-required');
});

test('record constructors retain every spread/computed field instead of presenting a falsely closed payload', (t) => {
  const root = fixture(t, { 'skills/app/events.ts': "const key='dynamic';const extras={x:1};export const event={schemaVersion:'event.v1',...extras,[key]:false,payload:unknownInput};" });
  const records = collectRecordConstructors(root, ['skills/app/events.ts']);
  const event = records.find((record) => record.fields.some((field) => field.literal === 'event.v1'));
  assert(event.fields.some((field) => field.kind === 'SpreadAssignment' && field.expression === '...extras'));
  assert(event.fields.some((field) => field.name === '[key]'));
  assert.equal(event.fields.find((field) => field.name === 'payload').expression, 'unknownInput');
  assert(records.some((record) => record.fields.some((field) => field.name === 'x')));
});

test('universal carriers retain embedded producers, snake-case schema roots and objects without event-like keys', (t) => {
  const root = fixture(t, {
    'skills/ui/preview.ts': "export function html(content:string){return `<main>${content}</main><script>parent.postMessage({schema:'selection.v1',nodeId:'a'},'*')</script>`}",
    'skills/host/log.ts': "export const record={schema_version:'runtime_log.v1',message:'hello'};export const data={unusualKey:1};",
    'contracts/log.schema.json': {$id:'runtime_log.v1',type:'object',properties:{schema_version:{const:'runtime_log.v1'}}},
  });
  const census = discoverEventCandidates(root);
  assert(census.candidates.some((entry) => entry.path.endsWith('preview.ts') && entry.kind === 'literal-carrier' && entry.scriptMarkupHint));
  assert(census.candidates.some((entry) => entry.path.endsWith('log.schema.json') && entry.kind === 'json-document-carrier'));
  assert(census.candidates.some((entry) => entry.kind === 'record-object' && entry.properties.includes('unusualKey')));
  assert(census.sources.every((entry) => entry.semanticDisposition.startsWith('unreviewed')));
  const embedded = collectEmbeddedScriptSyntax(root, ['skills/ui/preview.ts']);
  assert.equal(embedded.scripts.length, 1);
  assert.equal(embedded.incomplete.length, 0);
  assert.equal(embedded.scripts[0].status, 'parsed-static-script');
  assert(embedded.scripts[0].objects.some((entry) => entry.fields.some((field) => field.literal === 'selection.v1')));
  assert.match(embedded.scripts[0].coordinateMeaning, /NOT original source offsets/u);
});

test('dynamic embedded-script boundaries and scoped schema references do not become invented closed contracts', (t) => {
  const root = fixture(t, {
    'skills/ui/dynamic.ts': "export function html(code:string){return `<script>${code}</script>`}",
    'contracts/scoped.schema.json': {$defs:{scoped:{$id:'nested/', $ref:'child.json'}}},
  });
  const embedded = collectEmbeddedScriptSyntax(root, ['skills/ui/dynamic.ts']);
  assert.equal(embedded.scripts.length, 0);
  assert.equal(embedded.incomplete.length, 1);
  assert.throws(() => collectSchemaGraph(root, ['contracts/scoped.schema.json']), /EVENT_SCHEMA_SCOPED_REFERENCE_RESOLVER_REQUIRED/u);
});

test('unsupported import-type authority is explicit rather than silently omitted from recursive payload closure', (t) => {
  const root = fixture(t, {'skills/app/types.ts': "export interface Event {payload:import('./other.ts').Data}",
    'skills/app/other.ts':'export interface Data {required:string}'});
  const types = collectDeclaredTypeGraph(root, ['skills/app/types.ts','skills/app/other.ts']);
  assert.throws(() => selectDeclaredTypeClosure(root, types, [], [{path:'skills/app/types.ts',name:'Event'}]), /EVENT_PAYLOAD_REFERENCE_NOT_UNIQUE/u);
});

test('actual checker resolves private/aliased calls to local declarations without treating type-only imports as consumption', (t) => {
  const root = fixture(t, {
    'skills/lib/package.json': {name:'@fixture/contracts',exports:{'.':'./index.ts'}},
    'skills/lib/index.ts': 'export class Journal {append(type:string,payload:unknown){return payload}}',
    'skills/app/caller.ts': "import {Journal as Log} from '@fixture/contracts';import type {Journal} from '@fixture/contracts';const log=new Log();class Runner {#append(type:string,payload:unknown){return log.append(type,payload)}run(){return this.#append('event',{field:1})}}",
  });
  const census = discoverEventCandidates(root);
  const before = fs.readFileSync(path.join(root, 'skills/app/caller.ts'));
  const graph = collectSourceCallGraph(root, census);
  const call = graph.calls.find((entry) => entry.expression === 'log.append');
  assert.equal(call.resolvedSignature.path, 'skills/lib/index.ts');
  assert.equal(call.resolvedSignature.localInput, true);
  const privateCall = graph.calls.find((entry) => entry.expression === 'this.#append');
  assert.equal(privateCall.resolvedSignature.path, 'skills/app/caller.ts');
  assert.equal(privateCall.resolvedSignature.localInput, true);
  assert(!graph.calls.some((entry) => entry.expression === 'Journal'));
  assert.deepEqual(fs.readFileSync(path.join(root, 'skills/app/caller.ts')), before);
});
