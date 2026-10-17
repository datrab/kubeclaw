"""Historical projection conservation controls on the unchanged checkpoint root.

No current root rewrite, production execution or semantic acceptance occurs.
"""
import copy
import json
import hashlib
import subprocess
from pathlib import Path
from historical_mapping import load_reviewed
from historical_projection import attach, verify

root = Path.cwd()
base = root/'docs/review/evidence/config-acceptance'
load = lambda path: json.loads(path.read_text())
fixture_bytes = subprocess.check_output(['git','show',
    '6606af9e590032f328f330ecb3d953b1eef027e3:docs/review/remediation/config-acceptance-matrix.json'])
assert hashlib.sha256(fixture_bytes).hexdigest() == '1eb9534c1576b6ee0bc621c4b67fe43e3f1592b005ed1ddb85e37012fbd6f998'
matrix = json.loads(fixture_bytes)
package = matrix['nativeCasePackages'][0]
canonical = matrix['cases']
histories = load_reviewed(root, load(base/'runtime/case-proposals.json'),
    load(base/'runtime/inventory-fragment.json')['rows'],
    load(base/'runtime/runtime-case-dispositions.json')['cases'], {c['id'] for c in canonical})
original_bodies = copy.deepcopy(package['caseSpecifications'])
original_results = {c['id']: c['result'] for c in canonical}
advertisement = attach(package, canonical, histories)
assert package['caseSpecifications'] == original_bodies
assert {c['id']: c['result'] for c in canonical} == original_results
assert advertisement == {'unlinkedNativeCaseCount':269,
                         'historicallyMappedNativeCaseCount':269,
                         'unresolvedNativeCaseCount':0}

def positive():
    verify(package, canonical, histories, advertisement)
    print('PASS positive: 269 inactive histories, 356 active successors; original bodies/results intact')

def negative(label, expected, action, restore):
    action()
    try:
        verify(package, canonical, histories, advertisement)
    except ValueError as error:
        assert expected in str(error), (label,str(error),expected)
        print('PASS rejection: '+label+' / '+str(error))
    else:
        raise AssertionError('escaped projection guard: '+label)
    finally:
        restore()

positive()
cid=next(iter(histories))
link=next(link for link in package['canonicalCaseMapping'] if link['nativeCaseId']==cid)
history=link['historicalMapping']
sid=history['activeCanonicalSuccessors'][0]['caseId']
successor=next(case for case in canonical if case['id']==sid)
refs=successor['historicalSpecificationReferences']
index=next(i for i,r in enumerate(refs) if r['nativeCaseId']==cid)
ref=refs[index]
negative('omitted historical mapping', 'historical set omission',
         lambda:link.pop('historicalMapping'),lambda:link.update(historicalMapping=history))
negative('changed mapping body', 'reviewed mapping drift',
         lambda:link.update(historicalMapping={**history,'countsTowardAcceptance':True}),
         lambda:link.update(historicalMapping=history))
negative('predecessor reactivation', 'reactivates predecessor',
         lambda:link.update(canonicalCaseId=cid),lambda:link.update(canonicalCaseId=None))
negative('missing reverse reference', 'reverse link',lambda:refs.pop(index),lambda:refs.insert(index,ref))
negative('duplicate reverse reference', 'reverse link',lambda:refs.append(ref),lambda:refs.pop())
negative('reverse source identity tamper', 'reverse link',
         lambda:refs.__setitem__(index,{**ref,'sourceSha256':'0'*64}),lambda:refs.__setitem__(index,ref))
negative('reverse acceptance promotion', 'reverse link',
         lambda:refs.__setitem__(index,{**ref,'countsTowardAcceptance':True}),lambda:refs.__setitem__(index,ref))
other=next(case for case in canonical if case['id'] not in
           {s['caseId'] for s in history['activeCanonicalSuccessors']})
other_refs=other.setdefault('historicalSpecificationReferences',[])
negative('wrong successor binding', 'binding drift',lambda:other_refs.append(ref),lambda:other_refs.pop())
for key in ['unlinkedNativeCaseCount','historicallyMappedNativeCaseCount','unresolvedNativeCaseCount']:
    old=advertisement[key]
    negative('count tamper '+key,'advertised count drift',
             lambda key=key:advertisement.update({key:-1}),
             lambda key=key,old=old:advertisement.update({key:old}))
positive()
print('11 negative projection controls / 2 positives; root unchanged, independent projection review pending')
