import assert from 'node:assert/strict';
import test from 'node:test';
import {shareExpressions,expandExpressions,composeCliReference,renderCliReference} from '../lib/cli/cli-semantic-composition.mjs';
const long='unevaluated '+ '$HOME `not execution` '.repeat(50);
const model={sourceRevision:'a'.repeat(40),authority:'Static only',unknown:{value:long},manifestInterfaces:[],ownership:[],dependencyBindings:[],sources:[{path:'scripts/a weird.sh',language:'shell',ownership:{kind:'source-only-unqualified',boundary:'No support established'},sourceBinding:{sha256:'123'},commands:[{sourceRange:'0:99',scope:'main',patterns:['start'],selector:{expression:'"$1"'},guards:[{conditionExpression:'[ "$x" = x ]'}]}],subcommands:[{expression:'nested',line:2}],functions:[{name:'run'}],defaults:[{expression:long,parameter:'X',fallback:{expression:'${X:-a}'},line:2,endLine:4}],exits:[{valueExpression:'child_status',expression:long,conditions:[{conditionExpression:'! child'}],line:5}],sourceBindings:[{id:'0:99',exact:'case "$1" in start)',startLine:1,endLine:1,startByte:0,endByte:99}],unresolved:[{rule:'original pending'}],adapterMetadata:{heredoc:long,extra:[null,{'$sourceExpression':'not a ref'}]}}]};
test('expression table reconstructs every nested/unknown key without tag collisions',()=>{const s=shareExpressions(model);assert.deepEqual(expandExpressions(s),model);assert.ok(s.references.length>=3);assert.equal(Object.keys(s.expressions).length,1)});
test('expression corruption fails closed',()=>{const s=shareExpressions(model);s.expressions[Object.keys(s.expressions)[0]]+='x';assert.throws(()=>expandExpressions(s),/binding mismatch/)});
test('reader retains ownership, nested selectors, defaults, conditional exits, no acceptance promotion',()=>{const c=composeCliReference(model),r=renderCliReference(c);assert.equal(c.unfulfilledOriginalObligations[0].rule,'original pending');for(const x of ['source-only-unqualified','Subcommand selectors','Function and receiver declarations','Defaults and source value selection','Exit, return and propagation rules','child\\_status','! child','No support established','NOT_ADJUDICATED','scripts/a%20weird.sh#L2-L4'])assert.ok(r.includes(x),x);assert.deepEqual(expandExpressions(c.sourceModel),model);assert.ok(r.includes('case "$1" in start)'));assert.ok(!r.includes(long));});
test('safe source code fences cannot terminate at input backticks',()=>{const m=structuredClone(model);m.sources[0].commands=[{expression:'```\n# hostile\n```',line:1}];const r=renderCliReference(composeCliReference(m));assert.ok(r.includes('````text\n```\n# hostile\n```\n````'))});
import {createRequire} from 'node:module';
import {translateTypedContracts,renderCliNativeSection} from '../lib/cli/cli-semantic-composition.mjs';
const ts=createRequire(new URL('../../package.json',import.meta.url))('typescript');
test('native default precedence keeps ?? distinct from || and guarded source order',()=>{const m=structuredClone(model);m.sources[0].language='typescript';m.sources[0].defaults=[{expression:'arg || fallback',bindingExpression:'x',scope:'main',startByte:1},{expression:'arg ?? (env || fallback)',bindingExpression:'x',scope:'main',startByte:10,conditions:[{conditionExpression:'mode === "a"',role:'then',line:1}]}];const r=translateTypedContracts(m,ts),s=r.sources[0];assert.equal(s.defaults[1].selection.kind,'nullish-fallback');assert.equal(s.defaults[1].selection.fallback.kind,'falsy-fallback');assert.equal(s.defaults[1].predicates[0].relation,'then-of');assert.equal(s.orderedAssignments[0].sourceOrderedRules.length,2)});
test('native formal/actual bindings preserve omitted default, rest and caller guards',()=>{const m=structuredClone(model);m.sources[0].language='typescript';m.sources[0].defaults=[];m.sources[0].delegations=[{expression:'run(argv)',scope:'main',conditions:[{conditionExpression:'enabled',role:'else',line:2}],target:{path:'helper.ts',expression:'function run(values, mode = "check", ...tail) { return mode; }',line:1}}];const r=translateTypedContracts(m,ts).sources[0].formalActualCalls[0];assert.equal(r.bindings[0].actual.expression,'argv');assert.equal(r.bindings[1].actual.defaultActivated,true);assert.equal(r.bindings[2].rest,true);assert.equal(r.callerPredicates[0].relation,'else-of');assert.equal(r.calleeSource,'helper.ts')});
test('compact existing-page section uses native groups/anchors, not389 page publication',()=>{const s=renderCliNativeSection(composeCliReference(model));assert.ok(s.includes('native-s0'));assert.ok(!s.includes('native-cli-reader/'));assert.ok(s.includes('source-only-unqualified'))});
test('spread cardinality cannot activate a supposedly omitted parameter default',()=>{const m=structuredClone(model);m.sources[0].language='typescript';m.sources[0].defaults=[];m.sources[0].delegations=[{expression:'run(...values)',target:{path:'h.ts',expression:'function run(a, b = "fallback") {}'}}];const b=translateTypedContracts(m,ts).sources[0].formalActualCalls[0].bindings;assert.equal(b[1].actual.kind,'spread-dependent-actual-position');assert.notEqual(b[1].actual.defaultActivated,true)});
test('native syntax refusal retained, not silently admitted as a default',()=>{const m=structuredClone(model);m.sources[0].language='typescript';m.sources[0].defaults=[{expression:'value ?? ('}];const r=translateTypedContracts(m,ts);assert.equal(r.sources[0].defaults.length,0);assert.equal(r.unresolved[0].rule,'native-default-expression-parse-refused')});
test('foreign source spans link the expression owner, not caller source',()=>{const m=structuredClone(model);m.sources[0].defaults=[{sourcePath:'shared/argument receiver.ts',expression:'argv ?? []',line:17,endLine:19,startByte:100,endByte:120}];const c=composeCliReference(m),s=renderCliNativeSection(c);assert.ok(s.includes('https://github.com/datrab/kubeclaw/blob/'));assert.ok(s.includes('/shared/argument%20receiver.ts#L17-L19'));assert.equal(c.sources[0].groups.defaults[0].range.sourcePath,'shared/argument receiver.ts');assert.ok(!s.includes('unadopted'));assert.ok(!s.includes('acceptance verdict'))});

import {projectCliDocumentationFacts} from '../lib/cli/cli-semantic-composition.mjs';
test('documentation projection retains complete factual payloads without raw parser metadata',()=>{
 const m=structuredClone(model);m.sources[0].adapterMetadata={rawAst:{privateParserDump:true}};
 m.sources[0].defaults=[{bindingExpression:'out',valueExpression:'env.OUT ?? caller',conditions:[{role:'else',conditionExpression:'enabled'}]}];
 const p=projectCliDocumentationFacts(m);
 for(const family of ['commands','subcommands','options','positionals','defaults','exits','branches','delegations','guards','unresolved','adapterLimits'])
  assert.deepEqual(p.sources[0][family],m.sources[0][family]??[]);
 assert.equal(p.sources[0].adapterMetadata,undefined);assert.equal(p.acceptance,'NOT_ADJUDICATED');
 p.sources[0].defaults[0].valueExpression='changed';assert.equal(m.sources[0].defaults[0].valueExpression,'env.OUT ?? caller');
});

test('documentation facts retain precise local and foreign source-range bindings',()=>{
 const m=structuredClone(model);const b={id:'foreign:19',sourcePath:'shared/receiver.ts',sha256:'b'.repeat(64),startLine:19,endLine:20,startByte:42,endByte:62,exact:'exit(selectedStatus)'};
 m.sources[0].sourceBindings.push(b);m.sources[0].exits.push({sourceRange:b.id,sourcePath:b.sourcePath,valueExpression:'selectedStatus',conditions:[{conditionExpression:'failed'}]});
 const p=projectCliDocumentationFacts(m),f=p.sources[0].exits.at(-1);
 assert.deepEqual(p.sources[0].sourceBindings.find(x=>x.id===f.sourceRange),b);
 assert.deepEqual(p.sources[0].sourceBindings,m.sources[0].sourceBindings);
});

import {renderCliDocumentationFacts} from '../lib/cli/cli-semantic-composition.mjs';
test('documented facts show conditional defaults/exits and resolve source links',()=>{
 const m=structuredClone(model);m.sources[0].options=[{name:'--file_*_name',nargs:'?',required:false,line:2}];
 const p=projectCliDocumentationFacts(m),text=renderCliDocumentationFacts(p);
 assert.ok(text.includes('--file\\_\\*\\_name'));assert.ok(text.includes('child\\_status'));
 assert.ok(text.includes('! child'));assert.ok(text.includes('Source-derived CLI reference'));
 assert.ok(text.includes('scripts/a%20weird.sh#L1'));
 p.sources[0].sourceBindings=[];assert.throws(()=>renderCliDocumentationFacts(p),/SOURCE_RANGE_UNRESOLVED/);
});
