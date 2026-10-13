from pathlib import Path
import json,copy,sys,contextlib,io,hashlib
r=Path.cwd();b=r/'docs/review/evidence/config-acceptance';d=b/'independent-checkpoint6-crosslink-recheck';sys.path.insert(0,str(b/'author'))
source=(b/'author/check-matrix.py').read_text();adapt=source.replace('inventory = json.loads(args.inventory.read_text())','inventory = virtual_inventory').replace('matrix = json.loads(args.matrix.read_text())','matrix = virtual_matrix');assert adapt!=source
(d/'virtual-checker-load-adaptation.py').write_text(adapt)
i=json.loads((r/'docs/review/remediation/config-semantic-inventory.json').read_text());m=json.loads((r/'docs/review/remediation/config-acceptance-matrix.json').read_text())
helper=(b/'author/check-native-case-integration.py').read_text();hadapt=helper.replace('matrix = json.loads(matrix_path.read_text())','matrix = virtual_matrix').replace("inventory = json.loads((root/'docs/review/remediation/config-semantic-inventory.json').read_text())",'inventory = virtual_inventory');assert hadapt!=helper;(d/'virtual-native-helper-load-adaptation.py').write_text(hadapt)
obs=[]
def run(vi,vm):
 scope={'virtual_inventory':vi,'virtual_matrix':vm};old=sys.argv;sys.argv=['check-matrix.py','--structural']
 try:
  with contextlib.redirect_stdout(io.StringIO()):
   try:exec(compile(adapt,'actual-checker-only-initial-loads-adapted','exec'),scope)
   except SystemExit as e:code=e.code
 finally:sys.argv=old
 return scope['report'],code

def hrun(vi,vm):
 try:
  with contextlib.redirect_stdout(io.StringIO()):exec(compile(hadapt,'actual-native-helper-only-initial-loads-adapted','exec'),{'virtual_inventory':vi,'virtual_matrix':vm,'__file__':str(b/'author/check-native-case-integration.py')})
 except (AssertionError,IndexError,KeyError) as e:return {'rejected':True,'exception':type(e).__name__}
 return {'rejected':False}

def case(vm):return next(c for c in vm['cases'] if c.get('nativeSpecificationReferences'))
def control(label,edit,expected=None,helperReject=None):
 vi=copy.deepcopy(i);vm=copy.deepcopy(m);edit(vi,vm);report,code=run(vi,vm)
 if expected:assert code==1 and any(expected in x for x in report['errors']),(label,report)
 else:assert code==0,(label,report)
 h=hrun(vi,vm)
 if helperReject is not None:assert h['rejected']==helperReject,(label,h)
 obs.append({'id':label,'structuralExit':code,'errorCount':report['errorCount'],'matchingErrors':[x for x in report['errors'] if expected and expected in x][:5],'nativeHelper':h,'intendedStructuralReject':expected,'helperRejectionRequired':helperReject});print(label,code,flush=True)
control('real-baseline-positive',lambda i,m:None,None,False)
control('matrix-package-only-omission',lambda i,m:m.update(nativeCasePackages=[]),'native package presence differs',True)
control('both-package-and-advertisement-omission',lambda i,m:(m.update(nativeCasePackages=[]),i.update(nativeCasePackageReferences=[])),'required productive Runtime native specification package missing',True)
control('inventory-advertisement-only-omission',lambda i,m:i.update(nativeCasePackageReferences=[]),'native package presence differs',True)
control('inventory-native-count-drift',lambda i,m:i['nativeCasePackageReferences'][0].update(nativeCaseCount=1),'advertised case counts drift',True)
control('inventory-unlinked-count-drift',lambda i,m:i['nativeCasePackageReferences'][0].update(unlinkedNativeCaseCount=1),'advertised case counts drift',True)
control('inventory-source-path-drift',lambda i,m:i['nativeCasePackageReferences'][0].update(sourcePath='wrong.json'),'advertised sourcePath drift',True)
control('inventory-source-SHA-drift',lambda i,m:i['nativeCasePackageReferences'][0].update(sourceSha256='0'*64),'advertised sourceSha256 drift',True)
# Standalone helper intentionally narrower than full structural checker for placement/unique-ID metadata.
control('inventory-matrix-location-drift',lambda i,m:i['nativeCasePackageReferences'][0].update(matrixLocation='wrong'),'advertised matrix location drift',None)
control('duplicate-package-ID',lambda i,m:m['nativeCasePackages'].append(copy.deepcopy(m['nativeCasePackages'][0])),'native package: duplicate ID',None)
control('duplicate-advertisement-ID',lambda i,m:i['nativeCasePackageReferences'].append(copy.deepcopy(i['nativeCasePackageReferences'][0])),'native package advertisement: duplicate ID',None)
control('missing-canonical-reference',lambda i,m:case(m)['nativeSpecificationReferences'].clear(),'missing/duplicate/exact canonical specification reference',True)
control('canonical-reference-wrong-package',lambda i,m:case(m)['nativeSpecificationReferences'][0].update(packageId='WRONG'),'native reference package missing',True)
control('canonical-reference-wrong-native-case',lambda i,m:case(m)['nativeSpecificationReferences'][0].update(nativeCaseId='WRONG'),'native reference identity/case binding drift',True)
control('canonical-reference-wrong-path',lambda i,m:case(m)['nativeSpecificationReferences'][0].update(sourcePath='wrong.json'),'native reference identity/case binding drift',True)
control('canonical-reference-wrong-SHA',lambda i,m:case(m)['nativeSpecificationReferences'][0].update(sourceSha256='0'*64),'native reference identity/case binding drift',True)
control('duplicate-exact-canonical-reference',lambda i,m:case(m)['nativeSpecificationReferences'].append(copy.deepcopy(case(m)['nativeSpecificationReferences'][0])),'missing/duplicate/exact canonical specification reference',True)
def unrelated(vi,vm):
 origin=case(vm);target=next(c for c in vm['cases'] if c['id']!=origin['id']);target.setdefault('nativeSpecificationReferences',[]).append(copy.deepcopy(origin['nativeSpecificationReferences'][0]))
control('unrelated-canonical-native-tuple',unrelated,'native reference identity/case binding drift',True)
control('single-native-case-omission',lambda i,m:m['nativeCasePackages'][0]['caseSpecifications'].pop(),'original specification/requirement loss',True)
control('single-native-requirement-loss',lambda i,m:m['nativeCasePackages'][0]['canonicalCaseMapping'][0]['requirementIds'].pop(),'mapping requirement loss',True)
control('real-restored-final-positive',lambda i,m:None,None,False)
(d/'crosslink-controls.json').write_text(json.dumps({'scope':'actual full documentation checker + actual native helper virtual initial JSON loads only; no real inputs changed; not production F-MUT','checkerSha256':hashlib.sha256(source.encode()).hexdigest(),'helperSha256':hashlib.sha256(helper.encode()).hexdigest(),'observations':obs},indent=2)+'\n')
