from pathlib import Path
import json,copy,sys,io,contextlib,hashlib
root=Path.cwd();base=root/'docs/review/evidence/config-acceptance';out=base/'independent-checkpoint6-integration-recheck';sys.path.insert(0,str(base/'author'))
source=(base/'author/check-matrix.py').read_text();adapted=source.replace("inventory = json.loads(args.inventory.read_text())","inventory = virtual_inventory").replace("matrix = json.loads(args.matrix.read_text())","matrix = virtual_matrix")
assert adapted!=source
(out/'virtual-matrix-input-adaptation.py').write_text(adapted)
inv=json.loads((root/'docs/review/remediation/config-semantic-inventory.json').read_text());mat=json.loads((root/'docs/review/remediation/config-acceptance-matrix.json').read_text())
def run(i,m):
 scope={'virtual_inventory':i,'virtual_matrix':m};old=sys.argv;sys.argv=['check-matrix.py','--structural']
 try:
  with contextlib.redirect_stdout(io.StringIO()):
   try:exec(compile(adapted,'actual-checker-only-initial-input-loads-adapted','exec'),scope)
   except SystemExit as e:exitcode=e.code
 finally:sys.argv=old
 return scope['report'],exitcode
obs=[]
def check(label,edit,expect):
 i=copy.deepcopy(inv);m=copy.deepcopy(mat);edit(i,m);r,c=run(i,m)
 if expect:assert c==1 and any(expect in x for x in r['errors']),(label,r)
 else:assert c==0,(label,r)
 obs.append({'id':label,'expectedRejection':expect,'exitCode':c,'errorCount':r['errorCount'],'errors':r['errors'][:8],'scope':'only virtual initial JSON loads differ; all actual source/reference files unchanged'})
check('real-restored-positive',lambda i,m:None,None)
check('native-single-case-omission',lambda i,m:m['nativeCasePackages'][0]['caseSpecifications'].pop(),'original specification/requirement loss')
check('native-requirement-omission',lambda i,m:m['nativeCasePackages'][0]['canonicalCaseMapping'][0]['requirementIds'].pop(),'mapping requirement loss')
def refmut(i,m):
 def walk(x):
  if isinstance(x,dict):
   if 'artifactSha256' in x:x['artifactSha256']='0'*64;return True
   return any(walk(v) for v in x.values())
  if isinstance(x,list):return any(walk(v) for v in x)
  return False
 assert walk(m['nativeCasePackages'][0]['caseSpecifications'])
check('native-observation-reference-tamper',refmut,'native observation references:')
check('baseline-metadata-tamper',lambda i,m:next(iter(i['supplementalDefinitionPackages'][0]['caseRequirementBaseline']['requirementsByCaseId'].values())).pop(),'baseline requirement metadata drift')
check('supplemental-required-ID-loss',lambda i,m:i['supplementalDefinitionPackages'][0]['caseSpecifications'].pop(),'baseline case/requirement loss')
check('supplemental-required-obligation-loss',lambda i,m:i['supplementalDefinitionPackages'][0]['caseSpecifications'][0]['requirements'].pop(),'baseline case/requirement loss')
# Whole package loss and canonical references have no current checker cross-link gate.
check('native-WHOLE-package-omission-undetected',lambda i,m:m.update(nativeCasePackages=[]),None)
def canonref(i,m):
 c=next(c for c in m['cases'] if c.get('nativeSpecificationReferences'));c['nativeSpecificationReferences'][0]['sourceSha256']='0'*64
check('canonical-native-spec-reference-tamper-undetected',canonref,None)
check('inventory-native-package-count-tamper-undetected',lambda i,m:i['nativeCasePackageReferences'][0].update(nativeCaseCount=1),None)
check('real-restored-final-positive',lambda i,m:None,None)
(out/'matrix-negative-controls.json').write_text(json.dumps({'scope':'documentation-integrity controls, no real files mutated, no substantive Core semantic review','sourceSha256':hashlib.sha256(source.encode()).hexdigest(),'observations':obs},indent=2)+'\n');print(json.dumps({'controls':len(obs),'undetectedIntegrationTampering':3,'restoredPositive':True,'noRootWrites':True}))
