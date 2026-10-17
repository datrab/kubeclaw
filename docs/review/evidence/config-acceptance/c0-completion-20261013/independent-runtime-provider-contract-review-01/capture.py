import pathlib,json,hashlib,gzip,datetime,subprocess
root=pathlib.Path('.')
base=root/'docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-01'
out=root/'docs/review/evidence/config-acceptance/c0-completion-20261013/independent-runtime-provider-contract-review-01'
out.mkdir(exist_ok=True);(out/'frozen-inputs').mkdir(exist_ok=True)
read=lambda p:json.loads(pathlib.Path(p).read_text())
digest=lambda b:hashlib.sha256(b).hexdigest()
inputs=set(base.rglob('*'))
inputs={p for p in inputs if p.is_file()}
for p in read(base/'source-identities.json'):inputs.add(root/p)
for name in ['OPENCLAW-CONFIG-GOAL.md','GOAL-START.md','decisions.md','acceptance-20260920.md','config-semantic-inventory.json','config-acceptance-matrix.json']:
 inputs.add(root/'docs/review/remediation'/name)
whole=root/'docs/review/evidence/config-acceptance/c0-completion-20261013/independent-whole-c0-readiness-review-01'
for name in ['README.md','runtime-residual-contract-groups.json','original-source-contract-navigation.json']:inputs.add(whole/name)
for p in ['skills/common/plugin-runtime/foundation/registry/build.ts','skills/common/plugin-runtime/foundation/registry/configuration.ts','skills/common/plugin-runtime/foundation/registry/schema.ts','skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json','skills/nova/core/test-gates/resolver.ts','skills/nova/core/execution/engine-runtime.ts','skills/nova/core/execution/adapter-startup.ts','skills/nova/core/execution/adapters.ts','skills/nova/core/execution/engine-run.ts','skills/buster/engine/test-gates/runner.ts','skills/buster/engine/test-gates/runner-values.ts','skills/buster/engine/test-gates/provider-loader.ts','skills/buster/engine/test-gates/provider-capabilities.ts','skills/buster/engine/test-gates/production-command-options.ts','skills/buster/engine/test-gates/capability-runtime.ts']:
 if (root/p).is_file():inputs.add(root/p)
identities=[]
for p in sorted(inputs):
 b=p.read_bytes();sha=digest(b)
 (out/'frozen-inputs'/f'{sha}.gz').write_bytes(gzip.compress(b,mtime=0))
 identities.append({'path':str(p),'bytes':len(b),'sha256':sha,'frozen':f'frozen-inputs/{sha}.gz'})
fields=read(base/'field-definitions.json')['rows'];cases=read(base/'case-definitions.json')['cases']
originals={r['id']:r for r in read(root/'docs/review/remediation/config-semantic-inventory.json')['rows']}
canonical={r['id']:r for r in read(root/'docs/review/remediation/config-acceptance-matrix.json')['cases']}
coords=read(base/'current-source-coordinates.json');coord_checks=[]
for r in coords:
 lines=(root/r['path']).read_text().splitlines();coord_checks.append({'path':r['path'],'line':r['line'],'exactTextMatches':lines[r['line']-1]==r['text']})
artifact_pins=read(base/'artifact-identities.json')['artifacts']
pins=[{'path':p,'matches':digest((base/p).read_bytes())==d['sha256']} for p,d in artifact_pins.items()]
navigation={'qualification':'Structural full-body traversal and exact conservation, not semantic acceptance or native execution','originalFieldCount':len(fields),'originalFieldsEqualCurrentCanonical':all(r['originalRow']==originals[r['id']] for r in fields),'canonicalCaseCount':len(cases),'canonicalBodiesEqualCurrentCanonical':all(r['originalCanonicalCase']==canonical[r['id']] for r in cases),'retainedNativeBodyCount':sum(r['retainedNativeCase'] is not None for r in cases),'sourceCoordinateCount':len(coords),'coordinateMismatches':[r for r in coord_checks if not r['exactTextMatches']],'frozenBArtifactPins':len(pins),'pinMismatches':[r for r in pins if not r['matches']],'fieldNavigation':[{'id':r['id'],'owner':r['originalRow']['owner'],'field':r['originalRow'].get('field',r['originalRow'].get('source',{}).get('field')),'activeDisposition':r['activeDisposition'],'targetSchemaBinding':r.get('targetSchemaBinding'),'caseIds':r['originalCaseIds']} for r in fields],'caseNavigation':[{'id':r['id'],'phase':r['originalCanonicalCase']['phase'],'result':r['originalCanonicalCase']['result'],'memberSettingIds':r['thisCutSettingIds'],'retainedNativeCaseId':r['retainedNativeCase'].get('id') if r['retainedNativeCase'] else None,'futureStatus':r['futureStatus'],'activeMemberContracts':r.get('perMemberFieldContracts',[]),'futureSubscenarios':r.get('futureSubscenarios',[])} for r in cases]}
(out/'read-identities.json').write_text(json.dumps({'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':identities},indent=2)+'\n')
(out/'conservation-and-navigation.json').write_text(json.dumps(navigation,indent=2)+'\n')
print(json.dumps({k:v for k,v in navigation.items() if not k.endswith('Navigation')}))
