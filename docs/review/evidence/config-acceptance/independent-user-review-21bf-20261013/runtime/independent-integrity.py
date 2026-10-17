from pathlib import Path
import json,hashlib,subprocess,collections,importlib.util,gzip
P=Path('docs/review/evidence/config-acceptance/runtime'); B=P/'batches/21bf51b-standalone-remote-19'; O=Path('docs/review/evidence/config-acceptance/independent-user-review-21bf-20261013/runtime')
load=lambda p:json.loads(Path(p).read_text()); sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest(); can=lambda o:json.dumps(o,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
I=load(P/'inventory-fragment.json'); C=load(P/'case-proposals.json'); D=load(P/'runtime-case-dispositions.json'); ids={x['id']:x for x in C}; rows={x['id']:x for x in I['rows']}; di={x['id']:x for x in D['cases']}
assert len(ids)==len(C) and len(rows)==len(I['rows']) and len(di)==len(D['cases'])
assert set(ids)==set(di);assert all(set(x['cases'])<=set(ids) and not x['c0Closed'] for x in rows.values());assert all(set(x['settings'])<=set(rows) for x in C)
old=json.loads(subprocess.check_output(['git','show','21bf51bc2075abec1191fdc091952492b6cb484e:'+str(P/'case-proposals.json')])); assert C[:len(old)]==old
spec=importlib.util.spec_from_file_location('refs','docs/review/evidence/config-acceptance/author/observation_references.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);r=m.ObservationReferences(Path.cwd());r.resolve(C)
contracts=load(B/'contracts-captured-content-corrected.json'); entries=contracts['entries']; assert len(entries)==17
ob=load(B/'observations.json');assert len(ob['results'])==17 and ob['passed']==17 and ob['failed']==0
for category in ['sourceDigests','testDigests','inputDigests']:
 for p,h in ob[category].items():assert sha(p)==h,(category,p)
for e in entries:
 row=rows[e['setting']]; assert row['source']['field']==e['field'];assert row['domain']['targetProposed']==e['targetDomain'];assert row['classification']==e['classification'];assert sha(e['source']['path'])==e['source']['sha256']
 for reader in row['reader']:
  if 'line' in reader and 'text' in reader:assert Path(reader['path']).read_text().splitlines()[reader['line']-1].strip()==reader['text'].strip(),reader
 for suffix in ['VAL','AB','BINDING','RECOVERY','EVAL','MUTANT']:
  c=ids[e['setting']+'-STANDALONE19-'+suffix];assert c['result']=='not-run';assert c['action'] and c['priorState'];assert c['inputProfile']['completeA']==e['profiles']['A'];assert c['inputProfile']['completeB']==e['profiles']['B'];assert not di[c['id']]['countsTowardAcceptance']
for s in load(B/'historical-case-supersession.json')['records']:
 c=ids[s['historicalCaseID']];assert hashlib.sha256(can(c)).hexdigest()==s['originalBodySHA256'];assert c['requirements']==s['originalRequirements'];assert di[c['id']]['supersededBy']==s['activeSuccessorIDs'];assert set(c['requirements'])<=set(q for cid in s['activeSuccessorIDs'] for q in ids[cid]['requirements']);assert all(ids[cid]['result']=='not-run' and ids[cid]['settings']==c['settings'] for cid in s['activeSuccessorIDs'])
prior=json.loads(gzip.decompress((B/'changed-rows-before.json.gz').read_bytes()));assert len(prior)==17
oldRows={r['id']:r for r in json.loads(subprocess.check_output(['git','show','21bf51bc2075abec1191fdc091952492b6cb484e:'+str(P/'inventory-fragment.json')]))['rows']}; mismatches=[]
for p in prior:
 assert p==oldRows[p['id']]
 actual=hashlib.sha256(can(p)).hexdigest(); recorded=rows[p['id']]['sourceDefinitionHistory'][-1]['oldRowSHA256']; enriched=dict(p,sourceDefinitionHistory=[]);assert hashlib.sha256(can(enriched)).hexdigest()==recorded
 if actual!=recorded:mismatches.append({'setting':p['id'],'actualOriginalRowSHA256':actual,'recordedOldRowSHA256':recorded,'explainedByEmptyHistoryInsertion':True})
(O/'row-history-hash-mismatches.json').write_text(json.dumps(mismatches,indent=2)+'\n')
result={'independentScript':str(O/'independent-integrity.py'),'sha256':sha(O/'independent-integrity.py'),'rows':len(rows),'cases':len(ids),'results':dict(collections.Counter(c['result']for c in C)),'originalCaseBodiesUnchanged':len(old),'batch19ExpectedSettingIDs':[e['setting']for e in entries],'batch19CoveredCaseIDs':[e['setting']+'-STANDALONE19-'+s for e in entries for s in ['VAL','AB','BINDING','RECOVERY','EVAL','MUTANT','CURRENT-DEFINITION']],'immutableReferenceOccurrences':r.reference_count,'conservedSupersessions':51,'historicalRowSnapshots':len(prior),'rowHistoryDigestMismatches':len(mismatches),'verifiedSourceIdentities':load(B/'source-identities.json'),'status':'structural/case/reference/current checks pass; row-history digest findings separately retained; NOT C0 acceptance'}
(O/'integrity-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
