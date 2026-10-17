from pathlib import Path
import json,hashlib,sys,shutil
R=Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');B=R/'docs/review/evidence/config-acceptance/c0-completion-20261013';O=B/'same-entry-role-browser-binding-01'
def h(f):
 p=Path(f);return hashlib.sha256((p if p.is_absolute() else R/p).read_bytes()).hexdigest()
def read(f):return json.loads(Path(f).read_text())
def write(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
check=read(O/'check-final.stdout.json');assert check['failed']==0 and read(O/'check-final.command.json')['exitCode']==0;assert (O/'check-final.stderr').stat().st_size==0
pins=read(O/'input-identities.json');assert all(h(i['path'])==i['sha256']==i['endSha256'] for i in pins);deps=read(O/'frozen-dependency-manifest-identities.json');assert all(h(i['path'])==i['sha256'] for i in deps)
write('end-input-identities.json',[{'path':i['path'],'firstSha256':i['sha256'],'endSha256':h(i['path'])} for i in pins+deps])
commands=[{'artifact':f.name,'receipt':read(f)} for f in sorted(O.glob('*.command.json'))];commands.append({'artifact':'author-attempt1.exit.json','receipt':read(O/'author-attempt1.exit.json'),'script':'author-attempt1.py.snapshot','stdout':'author-attempt1.stdout','stderr':'author-attempt1.stderr'})
write('commands-and-exits.json',{'qualification':'Pure source-specific author/schema/selector/hash and existing read-only digest/elapsed helpers only; no native/CLI/provider/browser/gateway/PG/Helm/renderer/network/credential/Eval activation','receipts':commands,'preservedFailures':{'author1':'Discriminated readonly schema assembly; actual conditional arms corrected','check01':'Missing pure hash declaration; snapshot/rawexit1 retained','check02':'Gateway readonly fields missing in original then/else closed branches; exact arms corrected without relaxing original relations','check03':'Security ownerErrors lexical array shadowed Browser helper; lexical name corrected','elapsed':'Missing builtin path import; failed snapshot/rawexit1 retained','closeoutInline':'Default workspace CWD could not resolve a historical repo-relative input; no wrongpath absence inferred. Actual collector CWD is repo; author now normalizes repo-relative old schemas before active current schema rejoin'},'additionalMaterialCorrections':['Closed explicit five-profile source plan: no unknown/non-B→A fill;857 physical input/entry/output members remained byte-exact','Historical relative Browser schema refs normalized against actual repo before active receiving path+arm index rejoin.105 exact active Browser owner/receiver nodes now point to current physical twelve-arm/currentowner schema; originals/history retained.857 physical members unchanged; final3108collector replay exit0 after corrected concordance'],'originalBrowserFullCollectorExecuted':False,'nativeCasesExecuted':0})
packages=[]
for name in ['ajv','ajv-formats','yaml','typescript']:
 f=R/'node_modules'/name/'package.json';packages.append({'name':name,'version':read(f)['version'],'path':str(f),'sha256':h(f)})
write('definition-tool-identities.json',{'node':{'version':check['node'],'path':shutil.which('node'),'sha256':h(shutil.which('node'))},'python':{'version':sys.version,'path':sys.executable,'sha256':h(sys.executable)},'packages':packages})
(O/'README.md').write_text('''# Same-entry role/browser binding 01 — proposed pipeline-entry.v8

**Ready for fresh full material review; NOT whole C0, Gateway/WCR03, implementation, native or activation acceptance.** One complete proposed v8 root supersedes frozen reviewed Engine01 + normative02/v7 only upon independent admission. Prior packages, productive sources, canonical original bodies and failure history are untouched.

## Exact integrated generation

- Same six components; original nine bindings/four Provider contexts, v7 Security and Prism engine authority conserved. Same Buster owner adds only `browser-source-A`; same Control owner adds the existing whole product-off B fixture for explicit co-selection.
- Twelve actual typed test-provider arms: three prior Provider, five Security, four Browser. Nova processing remains separate. Browser/Security extra service contexts are structural migration stands, NOT installed routing or implicit same-key multiplex.
- 422 complete roots: 210 Browser, 163 Security, 22 Provider, 22 Prism, five own Chart contexts. Browser 201 profiles retain original source/task/native resource domains. Gateway70/75 joins the SAME Chart, shared endpoint/model authors and each profile's own explicit generated context/source recipe; no A/B fallback or private OpenClaw writer.
- 261 physical Provider/Security/Browser field nodes and 1,926 case-member joins; Gateway 279 case edges, 137 current typed owner/receiving leaf pairs plus 3 deliberate conditional/unused omissions across 140 A/B records. All 49 Controller original fields / 98 receiving values rejoin current Chart. No case results or effect requirements are synthesized/waived.
- Direct original conservation: 343 primary field occurrences plus 49 Controller fields; 1,739 case-family occurrences, 1,738 unique original case IDs; zero mismatches. One shared original case is retained, not renamed. All original native/history obligations remain, native cases executed: zero.

`RECEIVING-ABI.md` specifies all-owner/all-profile current-source admission BEFORE one caller, exact role/package/profile/service/resource/native-source predicates, confidentiality/aliases, full native parser/doctor ordering, original Control/J claim/grant/deadline invariants and local C1 deltas. `source-author-tree-delta.json` preserves exact eight original author movements and actual image/filter/loader/Chart/mount/receiver migration gaps.

## Physical and receiving artifacts

`stand/`, `schemas/`, `entries/` contain the one complete material generation and explicit full fixtures. `file-set-stand.json` records 208 regular no-follow author/schema/current-source/immutable generated-context inputs in the original length-framed codec. Root RAW identity is distinct from the full digest. Public receipt v3 contains three S outputs: original Control/Prism policies plus baseline Gateway policy bound to exact root/digest/selection/owner/schema/context/profile. Browser 210/prior8 typed task views and five Gateway policy fixtures are reference shapes, not authentic native delivery/results.

Current source/node/case/entry concordances resolve physical JSON pointers and frozen hashes. All105 active Browser fields point to the current physical twelve-arm receiving schema and copied current owner schemas, not the old seven-arm file. Old version roots/refs are explicit historical/dependency inputs, not active parallel writers. The original full Browser writer collector was inspected/extracted narrowly but NEVER run. No giant prior-universe archive or productive source/test/schema/canonical modification was made.

## Observed finite checks

Final inspected `check-generation.mjs`: **3,108 observations, zero reported failures, exit0**. Existing source-package helper checks all 210 Browser digests; unchanged native elapsed admission has 14 observations, exit0. Raw earlier schema/helper assembly failures/script snapshots remain. Later author source-plan and active-schema path corrections preserve 857 physical root/schema/entry/output members byte-exact; corrected active concordance was replayed before freeze. Selected/current/unselected owner, schema-valid foreign/missing Security/Browser profile, role/service/resource/capability, caller, aliases/context, malformed TTL, receipt/hash/nofollow and product-off controls are finite definition evidence only.

`commands-and-exits.json`, raw outputs, input/end identities, tool identities and manifest retain observed inputs/exits. Known parent canonical integration adds only currentCombinedDefinitionGeneration metadata; prior nonmetadata object/body equality is recorded, not silently relabeled unchanged. No native CLI/provider/browser/OpenClaw gateway/config/database/API/network/credentials/Eval/Helm/full renderer activation occurred.

## Finite remaining boundaries

Nova/Prism Gateway contexts remain deliberately unsupported, not borrowed from Buster. `remaining-local-role-recipes.json` lists the original 70 fields/75 cases and exact real Chart/deployment/role values/plugin/credential/model source inputs for next LOCAL definitions. Ready-product-off local same-owner definition is complete; native ENV/Control/image/grant effects remain unexecuted.

Current production has NO v8 decoder/materializer. Authentic native full raw parser/schema/image/source/installed service/tool/browser/model/grants, confidential original Secret revision retention/access, original task/claim/clock/budget/evidence/recovery and fixed Eval effects remain activation gates. Browser 13 and Security 25 unavailable independent alternates stay unwaived/not-run. Fresh combined-root review is required; source/shape success is not global acceptance.
''')
files=[{'relativePath':str(f.relative_to(O)),'sha256':h(f),'byteLength':f.stat().st_size} for f in sorted(O.rglob('*')) if f.is_file() and f.name!='manifest.json'];write('manifest.json',{'scope':'New additive full proposed v8 generation and finite source-specific definition evidence only','files':files,'counts':{'artifacts':len(files),'inputMembers':208,'endPinnedInputsAndDependencies':len(pins+deps),'definitionObservations':3108,'failed':0,'primaryOriginalFields':343,'controllerOriginalFields':49,'originalCaseOccurrences':1739,'uniqueOriginalCaseIds':1738},'freshIndependentFullMaterialReviewRequired':True,'nativeCasesExecuted':0,'globalAcceptance':False});print(json.dumps({'artifacts':len(files),'inputPins':len(pins),'dependencyPins':len(deps),'checks':len(check['observations']),'failed':0}))
