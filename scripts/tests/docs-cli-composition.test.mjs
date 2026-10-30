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
 const m=structuredClone(model);m.sources[0].ownership.kind='supported';m.sources[0].options=[{name:'--file_*_name',nargs:'?',required:false,line:2}];
 const p=projectCliDocumentationFacts(m),text=renderCliDocumentationFacts(p);
 assert.ok(text.includes('--file\\_\\*\\_name'));assert.ok(text.includes('child\\_status'));
 assert.ok(text.includes('! child'));assert.ok(text.includes('Source-derived CLI reference'));
 assert.ok(text.includes('scripts/a%20weird.sh#L1'));
 p.sources[0].sourceBindings=[];assert.throws(()=>renderCliDocumentationFacts(p),/SOURCE_RANGE_UNRESOLVED/);
});

test('implicit language policies are limits and unlocated declarations fail closed',()=>{
 const m=structuredClone(model);m.sources[0].ownership.kind='supported';m.sources[0].exits=[{kind:'python-module-normal-completion-policy',policy:'No blanket numeric exit.'},{kind:'whole-shell-exit-boundary',policy:'Caller controls status.'}];
 const p=projectCliDocumentationFacts(m);assert.equal(p.sources[0].exits.length,0);assert.equal(p.sources[0].adapterLimits.length,2);
 assert.ok(renderCliDocumentationFacts(p).includes('No blanket numeric exit.'));
 p.sources[0].exits.push({kind:'explicit-sys-exit',valueExpression:'5'});assert.throws(()=>renderCliDocumentationFacts(p),/PHYSICAL_LOCATOR_REQUIRED/);
});
const MarkdownIt=createRequire(new URL('../docs-reader/package.json',import.meta.url))('markdown-it');
test('native Markdown tables preserve entities, pipes, backticks, angle brackets and escaped newline literals',()=>{
 const m=structuredClone(model);m.sources[0].ownership.kind='supported';m.sources[0].options=[{name:'--&copy;|`<literal>_value*',line:2,defaultExpression:JSON.stringify('first\nsecond')}];
 m.sources[0].defaults=[{optionName:m.sources[0].options[0].name,valueExpression:JSON.stringify('first\nsecond'),line:2}];
 const md=renderCliDocumentationFacts(projectCliDocumentationFacts(m)),html=new MarkdownIt({html:true,linkify:false,typographer:false}).render(md);
 assert.ok(html.includes('--&amp;copy;|`&lt;literal&gt;_value*'));assert.ok(!html.includes('©'));assert.ok(html.includes('first\\nsecond'));
});

test('CLI product excludes internal implementation proof without inventing process statuses',()=>{
 const m=structuredClone(model);m.sources[0].delegations=[{kind:'source-argv-call-binding',line:1,target:{expression:'function run(a) { return a; }'},boundCalleeCompletionSources:[{valueExpression:'a'}]},{kind:'python-subprocess-execution-result',line:2,childStatusExpression:'child.returncode'}];
 m.sources[0].exits=[{kind:'source-function-return-completion',valueExpression:'{arbitrary: "internal data"}',line:3},{kind:'explicit-process-exit',valueExpression:'status',conditions:[{conditionExpression:'completed'}],line:4}];
 m.typedContracts={sources:[{formalActualCalls:[{factPath:['sources','0','delegations','0']}]}]};
 const p=projectCliDocumentationFacts(m);assert.equal(p.typedContracts,undefined);assert.equal(p.sources[0].delegations.length,1);assert.equal(p.sources[0].delegations[0].childStatusExpression,'child.returncode');
 assert.deepEqual(p.sources[0].exits,[m.sources[0].exits[1]]);assert.equal(p.sources[0].exits[0].valueExpression,'status');assert.deepEqual(p.sources[0].sourceBindings,m.sources[0].sourceBindings);
});

test('package routes retain actual cwd, script body, lifecycle and unsupported boundaries',()=>{
 const m=structuredClone(model);m.manifestInterfaces=[{kind:'npm-script-declaration',manifest:'pkg/package.json',cwd:'pkg',name:'verify',command:'node check.mjs --check',lifecycle:[{name:'preverify',command:'node prepare.mjs'},{name:'verify',command:'node check.mjs --check'}],supportBoundary:'Private declaration, not operator support.'}];
 const text=renderCliDocumentationFacts(projectCliDocumentationFacts(m));
 for(const value of ['Declared package launch routes','pkg/package.json','/scripts/verify','preverify','Private declaration, not operator support.'])assert.ok(text.includes(value),value);
 assert.equal(projectCliDocumentationFacts(m).manifestInterfaces[0].command,'node check.mjs --check');
});

import {stripFencedCodeAndComments} from '../lib/docs-markdown-anchors.mjs';
test('reader tier groups owned routes and literal comment markers survive the unchanged reference stripper',()=>{
 const m=structuredClone(model);m.sources[0].ownership.kind='qualified-maintenance';m.sources[0].options=[{name:'<!--literal-->',line:2}];
 m.sources[0].commands=[{name:'image',parentModes:[{patterns:['render']},{patterns:['nova','buster']}],line:3}];
 const rendered=renderCliDocumentationFacts(projectCliDocumentationFacts(m));
 assert.ok(rendered.includes('Supported and maintenance routes'));assert.ok(rendered.includes('render → nova / buster → image'));
 assert.ok(!rendered.includes('scopeIdentity'));assert.ok(!rendered.includes('startByte'));assert.ok(!rendered.includes('<!--literal'));
 const stripped=stripFencedCodeAndComments(rendered+'\nTAIL_PRESERVED');assert.ok(stripped.includes('TAIL_PRESERVED'));
});

import {markdownAnchorEntries} from '../lib/docs-markdown-anchors.mjs';
test('actual shell and argparse schemas normalize without undefined joins or object coercion',()=>{
 const m=structuredClone(model);m.sources[0].ownership.kind='supported';
 m.sources[0].options=[{option:'--with-code',scope:'main',line:2}];m.sources[0].defaults=[{parameter:'UNRELATED_ENV',valueExpression:'wrong-for-option',line:3}];
 m.sources[0].exits=[{kind:'return',valueExpression:{expression:'1',literal:'1'},statusBoundary:'Function return, not unconditional process exit.',line:4}];
 let md=renderCliDocumentationFacts(projectCliDocumentationFacts(m));assert.match(md,/--with-code \| No separate literal default joined/);assert.ok(!md.includes('[object Object]'));assert.ok(md.includes('return: 1; Function return, not unconditional process exit.'));
 m.sources[0].ownership.kind='delegated-receiver';m.sources[0].options=[{name:'--apply',kind:'argparse-declaration',parser:'p',scope:'main',line:2}];m.sources[0].defaults=[{kind:'argparse-action-default-policy',destination:'apply',parser:'p',scope:'main',valueExpression:'False',line:2}];
 md=renderCliDocumentationFacts(projectCliDocumentationFacts(m));assert.ok(md.includes('--apply: False'));
});
test('literal backticks do not swallow actual navigation anchors and commands retain cwd-qualified declaration links',()=>{
 const m=structuredClone(model);m.sources[0].ownership.kind='supported';m.sources[0].options=[{name:'--literal`',line:2}];
 const second=structuredClone(m.sources[0]);second.path='scripts/second.mjs';second.options=[{name:'--other`',line:3}];m.sources.push(second);
 m.manifestInterfaces=[{kind:'npm-script-declaration',manifest:'pkg/package.json',name:'test',cwd:'pkg',command:'node tests/relative.test.mts',lifecycle:[]}];
 const md=renderCliDocumentationFacts(projectCliDocumentationFacts(m)),anchors=new Set(markdownAnchorEntries(md).map(x=>x.anchor));
 assert.ok(anchors.has('cli-entry-0'));assert.ok(anchors.has('cli-entry-1'));assert.ok(!md.includes('node tests/relative.test.mts'));assert.ok(md.includes('/scripts/test'));assert.equal(projectCliDocumentationFacts(m).manifestInterfaces[0].command,'node tests/relative.test.mts');
});
