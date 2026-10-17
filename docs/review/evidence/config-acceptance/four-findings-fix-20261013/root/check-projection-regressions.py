"""Actual full documentation checker controls, not implementation F-MUT cases."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path.cwd()
author = root/'docs/review/evidence/config-acceptance/author'
inventory_path = root/'docs/review/remediation/config-semantic-inventory.json'
matrix_path = root/'docs/review/remediation/config-acceptance-matrix.json'
inventory = json.loads(inventory_path.read_text())
matrix = json.loads(matrix_path.read_text())
before = {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [inventory_path,matrix_path]}
checker = author/'check-matrix.py'

def run(label, inv, mat, expected=None):
    with tempfile.TemporaryDirectory(prefix='c0-projection-document-') as temporary:
        temp = Path(temporary)
        ip = temp/'inventory.json'; mp = temp/'matrix.json'
        ip.write_text(json.dumps(inv)); mp.write_text(json.dumps(mat))
        result = subprocess.run([sys.executable,str(checker),'--structural','--inventory',str(ip),
                                 '--matrix',str(mp)],cwd=root,capture_output=True)
        (Path(__file__).parent/('generated-projection-'+label+'-6606.log')).write_bytes(result.stdout)
        (Path(__file__).parent/('generated-projection-'+label+'-6606.stderr.log')).write_bytes(result.stderr)
        output = json.loads(result.stdout)
        if expected is None:
            assert result.returncode == 0 and output['errorCount'] == 0, (label,output)
        else:
            assert result.returncode == 1 and any(expected in error for error in output['errors']), (label,output)
        print(json.dumps({'control':label,'exit':result.returncode,'expectedBoundary':expected,
              'inventoryMutantSha256':hashlib.sha256(ip.read_bytes()).hexdigest(),
              'matrixMutantSha256':hashlib.sha256(mp.read_bytes()).hexdigest(),
              'result':'passed documentation guard only'}))

run('restored-positive-before',inventory,matrix)
for label, action, expected in [
    ('core-package-omission',lambda p:p.clear(),'supplemental package omitted'),
    ('core-source-omission',lambda p:p.pop('canonicalFieldCaseLinkSource'),'required link source omitted'),
    ('core-alias-loss',lambda p:next(v for v in p['canonicalFieldCaseLinks'].values() if v['unresolvedAliases'])['unresolvedAliases'].clear(),'link/alias conservation drift'),
]:
    inv=copy.deepcopy(inventory)
    package=next(p for p in inv['supplementalDefinitionPackages'] if p['id']=='CORE-ICQ-DEFINITION-CORRECTIONS-20261013')
    if label=='core-package-omission': inv['supplementalDefinitionPackages'].remove(package)
    else: action(package)
    run(label,inv,matrix,expected)
mat=copy.deepcopy(matrix)
link=next(link for link in mat['nativeCasePackages'][0]['canonicalCaseMapping'] if 'historicalMapping' in link)
link.pop('historicalMapping')
run('historical-map-omission',inventory,mat,'historical set omission')
del mat
mat=copy.deepcopy(matrix)
case=next(c for c in mat['cases'] if c.get('historicalSpecificationReferences'))
case['historicalSpecificationReferences'][0]['countsTowardAcceptance']=True
run('historical-reference-promotion',inventory,mat,'reverse link')
del mat
inv=copy.deepcopy(inventory)
advertised=inv['nativeCasePackageReferences'][0]
advertised['historicallyMappedNativeCaseCount']=0
run('historical-count-tamper',inv,matrix,'advertised count drift')
core_fragment=json.loads((root/'docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions/canonical-question-fragment.json').read_text())
core_row_id=core_fragment['rows'][0]['id']
for label,key,value in [('core-instance-scope','instanceScope','changed'),
                         ('core-normalized-class','class','changed'),
                         ('core-extra-scope','scope','undeclared injection')]:
    inv=copy.deepcopy(inventory)
    row=next(row for row in inv['rows'] if row['id']==core_row_id)
    row[key]=value
    run(label,inv,matrix,'normalized source body/requirement conservation drift')
inv=copy.deepcopy(inventory)
row=next(row for row in inv['rows'] if row['id']==core_row_id)
row['source']['field']='changed'
run('core-source-field',inv,matrix,'normalized source body/requirement conservation drift')
for label,key,value in [('core-case-prior-state','priorState',{'generation':'changed'}),
                         ('core-case-requirement-loss','requirementIds',[]),
                         ('core-case-review-promotion','reviewerConfirmation','accepted')]:
    mat=copy.deepcopy(matrix)
    case=next(case for case in mat['cases'] if case['id']=='QC-FOUNDATION-FLOCK-WAIT-VAL')
    case[key]=value
    run(label,inventory,mat,'source property/requirement conservation drift' if key!='reviewerConfirmation' else 'phase/review promotion drift')
for label,mutate in [('pure-package-omission',lambda mat:mat.pop('definitionObservationPackages')),
                     ('pure-observation-body-loss',lambda mat:mat['definitionObservationPackages'][0]['observations'].pop()),
                     ('pure-observation-scope-promotion',lambda mat:mat['definitionObservationPackages'][0]['observations'][0].update(scope='native acceptance'))]:
    mat=copy.deepcopy(matrix)
    mutate(mat)
    run(label,inventory,mat,'pure definition observation package missing' if label=='pure-package-omission' else 'observation body/scope/requirement conservation drift')
run('restored-positive-after',inventory,matrix)
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==expected for p,expected in before.items())
print('16 full-checker negatives / 2 restored positives; root byte drift zero; no native or global acceptance')
