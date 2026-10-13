"""Independent every-ID check against immutable6606; no author writes or obsolete-case execution."""
import pathlib,json,hashlib,subprocess,collections,gzip
repo=pathlib.Path.cwd();out=repo/'docs/review/evidence/config-acceptance/independent-runtime-historical-links-6606';B=repo/'docs/review/evidence/config-acceptance/runtime/batches/6606af9-historical-case-links-12';SDK=repo/'docs/review/evidence/config-acceptance/author/nova-sdk-envelope-current-6606';base='6606af9e590032f328f330ecb3d953b1eef027e3';sha=lambda b:hashlib.sha256(b).hexdigest();can=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode();issues=[];observations=[]
expected='c28364abb8e336693adbf7c6fdbe27eee04f701281d3d3a61142a0538ca7a0ac';raw=(B/'stable-milestone-receipt.json').read_bytes();assert sha(raw)==expected;receipt=json.loads(raw);mapping=json.loads((B/'native-historical-successor-map.json').read_bytes())
# Freeze exact reviewed package inputs; current dirty author/parent fragments are deliberately never loaded.
inputDigests={};snap=out/'frozen-inputs';snap.mkdir(exist_ok=True)
for name in ['stable-milestone-receipt.json','native-historical-successor-map.json','baseline-committed-input-identities.json','current-profile-reader-observations.json','check-current-profile-readers.mjs','build-map.py','README.md']:
 data=(B/name).read_bytes();(snap/('runtime-'+name)).write_bytes(data);inputDigests[str((B/name).relative_to(repo))]=sha(data)
for name in ['check-current-sdk-envelope.mjs','source-and-check-identities.json','README.md']:
 data=(SDK/name).read_bytes();(snap/('sdk-'+name)).write_bytes(data);inputDigests[str((SDK/name).relative_to(repo))]=sha(data)
for name,h in receipt['artifacts'].items():
 p=B/name
 if not p.is_file() or sha(p.read_bytes())!=h:issues.append({'kind':'frozen-runtime-artifact-drift','path':str(p.relative_to(repo))})
assert sha(gzip.decompress((B/'dirty-delivery.patch.gz').read_bytes()))==receipt['rawDirtyPatchSha256']
committed={}
for path,ident in receipt['baselineReferences'].items():
 data=subprocess.check_output(['git','show',base+':'+path],cwd=repo);blob=subprocess.check_output(['git','rev-parse',base+':'+path],cwd=repo,text=True).strip()
 if sha(data)!=ident['sha256'] or blob!=ident['blob'] or ident['commit']!=base:issues.append({'kind':'baseline-reference-drift','path':path})
 committed[path]=json.loads(data)
I=committed['docs/review/evidence/config-acceptance/runtime/inventory-fragment.json'];C=committed['docs/review/evidence/config-acceptance/runtime/case-proposals.json'];D=committed['docs/review/evidence/config-acceptance/runtime/runtime-case-dispositions.json'];M=committed['docs/review/remediation/config-acceptance-matrix.json'];rows={r['id']:r for r in I['rows']};cases={c['id']:c for c in C};disp={d['id']:d for d in D['cases']};roots={c['id']:c for c in M['cases']};pkg=next(x for x in M['nativeCasePackages'] if x['sourcePath']=='docs/review/evidence/config-acceptance/runtime/case-proposals.json');unlinked={r['nativeCaseId']:r for r in pkg['canonicalCaseMapping'] if r['canonicalCaseId'] is None};assert len(unlinked)==269
records=mapping['records'];assert len(records)==len({r['nativeCaseId'] for r in records})==269;assert {r['nativeCaseId'] for r in records}==set(unlinked)
fields={};grades=collections.Counter();requirementCounts=collections.Counter();sourceRefs={};successors=set()
for record in records:
 id=record['nativeCaseId'];c=cases[id];d=disp[id];errors=[]
 if record['historicalCaseCanonicalSha256']!=sha(can(c)):errors.append('originalcasehash')
 for key,native in [('nativeOriginalRequirements','requirements'),('nativeOriginalResult','result'),('nativeOriginalScope','scope')]:
  if record[key]!=c[native]:errors.append(key)
 if record['historicalDisposition']!=d or d['disposition']!='superseded' or d['countsTowardAcceptance'] is not False or d['activeSettingLinks']!=[]:errors.append('disposition')
 if d['originalRequirementsPreserved']!=c['requirements'] or d['evidenceResultPreserved']!=c['result']:errors.append('disposition-preservation')
 if set(unlinked[id]['settingIds'])!=set(c['settings']) or set(unlinked[id]['requirementIds'])!=set(c['requirements']):errors.append('root-originalmetadata')
 links=record['oneToManyActiveCanonicalSuccessors'];ids=[s['caseId'] for s in links]
 if ids!=d['supersededBy']:errors.append('exact-successor-ids')
 for sr in record['settings']:
  row=rows[sr['settingId']]
  for k in ['source','classification','scope']:
   if sr[k]!=row[k]:errors.append('row-'+k)
  if sr['rowDefinitionCanonicalSha256']!=sha(can(row)):errors.append('rowhash')
  if not sr['activeSuccessorCasesAlreadyLinked'] or not all(s in row['cases'] for s in ids):errors.append('successors-not-active-linked')
  src=row['source']['path'];data=subprocess.check_output(['git','show',base+':'+src],cwd=repo)
  if sha(data)!=row['source']['sha256']:errors.append('sourcehash')
  sourceRefs[src]=sha(data);fields[sr['settingId']]=sr;grades[sr['grade']]+=1
  if sr['grade']:
   parts=row['source']['field'].split('.',2)
   if parts[0]!='DEFAULTS' or parts[1]!=sr['grade'] or parts[2]!=sr['field']:errors.append('grade-field')
  elif sr['field'] not in ['reviewerModel','reviewerRuntime','reviewerAgentId','reviewerThinking']:errors.append('attestation-field')
 requirementCounts.update(c['requirements']);covered=set()
 for s in links:
  sid=s['caseId'];successors.add(sid);native=cases[sid];root=roots[sid]
  if s['caseCanonicalSha256']!=sha(can(native)):errors.append('successorhash')
  for k in ['requirements','result','scope']:
   if s[k]!=native[k]:errors.append('successor-'+k)
  if root['result']!=native['result'] or not set(native['requirements']).issubset(root['requirementIds']):errors.append('root-successor-result/requirements')
  if not set(c['settings']).issubset(native['settings']) or not set(c['settings']).issubset(root['settingIds']):errors.append('successor-wrongfield')
  if disp[sid]['disposition']!='active-canonical' and disp[sid]['disposition']!='active':errors.append('successor-disposition:'+disp[sid]['disposition'])
  covered.update(native['requirements'])
 if not set(c['requirements']).issubset(covered):errors.append('droppedrequirements')
 if record['semanticAcceptance'] is not False:errors.append('acceptanceclaim')
 if errors:issues.append({'id':id,'issues':sorted(set(errors))})
 observations.append({'id':id,'originalHash':record['historicalCaseCanonicalSha256'],'requirements':c['requirements'],'result':c['result'],'scope':c['scope'],'successors':ids,'resultOfReview':'passed' if not errors else 'failed'})
# No monkeypatching, oldbodyexecution or root integration; extract87 committed source default witnesses for independent pure resolver.
gradeRows=[r for r in I['rows'] if r['source']['field'].startswith('DEFAULTS.')];assert len(gradeRows)==87
(out/'committed-grade-witnesses.json').write_text(json.dumps([{'id':r['id'],'source':r['source'],'default':r['current']['default']} for r in gradeRows],indent=2)+'\n')
SDKident=json.loads((SDK/'source-and-check-identities.json').read_text());sdkissues=[]
for item in SDKident['inputs']:
 p=repo/item['path']
 if not p.is_file() or sha(p.read_bytes())!=item['sha256']:sdkissues.append(item['path'])
 if item['path'].startswith('skills/') or item['path']=='package-lock.json':
  data=subprocess.check_output(['git','show',base+':'+item['path']],cwd=repo)
  if sha(data)!=item['sha256']:sdkissues.append('not-baseline:'+item['path'])
 if p.is_file():inputDigests[item['path']]=sha(p.read_bytes())
# The historical wholeworkspace dirty patch/untrackedDelivery IDs are history, not current frozen acceptance inputs.
result={'scope':'independent every-ID structural/source preservation and successor correspondence of frozen269 historical links, not full target/native semantic acceptance','baseline':base,'runtimeReceiptSha256':expected,'rootUnlinked269IntentionallyUnchanged':True,'historicalCases':269,'gradeHistorical':sum(r['settings'][0]['grade'] is not None for r in records),'attestationHistorical':sum(r['settings'][0]['grade'] is None for r in records),'distinctSuccessorCases':len(successors),'distinctMappedFields':len(fields),'gradeCounts':dict(grades),'originalRequirementCounts':dict(requirementCounts),'observations':observations,'issues':issues,'sdkIdentityIssues':sdkissues,'sourceReferences':sourceRefs,'frozenInputDigests':inputDigests,'limit':'originals reconstructed from committed6606 only, no moving author fragments loaded; future successors remain not-run; row historicalclassification preserved, not target semantic endorsement; no Runner/observer/module/dispatch/model proof'}
(out/'mapping-preservation-controls.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['historicalCases','gradeHistorical','attestationHistorical','distinctSuccessorCases','distinctMappedFields','issues','sdkIdentityIssues']},indent=2));raise SystemExit(1 if issues or sdkissues else 0)
