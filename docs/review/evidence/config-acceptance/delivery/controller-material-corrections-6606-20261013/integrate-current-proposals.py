"""Current proposal links only. Historical reviewed controller inputs and111controls unchanged."""
import pathlib,json,hashlib
out=pathlib.Path(__file__).resolve().parent;delivery=out.parent;repo=delivery.parents[4];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(repo))
paths=['correction-contracts.json','policy-definition-schema.json','lifecycle-definition-schema.json','native-case-contracts.json','reviewed-input-preservation.json','policy-A.json','policy-B.json']
refs={rel(out/n):sha(out/n) for n in paths}
v=json.loads((delivery/'inventory-fragment.json').read_text());cases=json.loads((delivery/'proposed-cases.json').read_text());rows=[r for r in v['rows'] if r['owner']=='namespace-controller'];assert len(rows)==49
for r in rows:
 r['materialCorrectionSupersession']={'reviewFindings':['DCTRL-01','DCTRL-02','DCTRL-03'],'reviewState':'proposed corrections pending independent material recheck; NOT ACCEPTED','contracts':refs,'original49Scope':'old source/default/current reader identities preserved; old111 observations unchanged; new purecontrols supplemental','retainedState':'immutable status.deliveryPolicyEpoch vs proposed typed mutable status.deliveryLifecycle+current exact demoReadiness/demoProduct, UID/RV CAS/readback, no timestamp rebasing'}
 if r['id'].endswith('BUSTER-READY-PRODUCER') or r['id'].endswith('BUSTER-PRODUCT-PRODUCER'):
  r['targetDomain']['materialCorrection']={'schema':rel(out/'policy-definition-schema.json'),'sha256':sha(out/'policy-definition-schema.json'),'domain':'exact system:serviceaccount: namespaceDNSlabel1..63 / SA DNSsubdomain1..253 +distinct principals; actual UID/auth/grants separate'}
linked=[]
for c in cases:
 if any(r['id'] in c['settingIds'] for r in rows):
  c.setdefault('specDigests',{}).update(refs);c['materialCorrectionSupersession']={'contracts':rel(out/'correction-contracts.json'),'nativePreparation':rel(out/'native-case-contracts.json'),'scope':'old6 epoch wrappers are summaries, NOT complete native fixtures; NEW T0 identity DAG before baseline only; retained history never rebase; strict syntax+typed lifecycle/CAS/source full state required','status':'not-run; pending independent material definition recheck'};linked.append(c['id'])
(delivery/'inventory-fragment.json').write_text(json.dumps(v,indent=2)+'\n');(delivery/'proposed-cases.json').write_text(json.dumps(cases,indent=2)+'\n')
(out/'current-integration.json').write_text(json.dumps({'rowIds':[r['id'] for r in rows],'canonicalCaseIds':linked,'correctionSpecDigests':refs,'result':'proposal-linked, not accepted','remainingWholeFilePreservation': 'all73 original decoded snapshot payload SHA+length verified: 68plain5gzip; original raw-container mismatch diagnostic retained, encoding qualification additive; selected-source vs current drift distinct'},indent=2)+'\n')
print('49 controller proposal links and',len(linked),'canonical case containers superseded at named material definition scope; no historical111 rewrite or acceptance')
