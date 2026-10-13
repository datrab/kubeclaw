"""Independent bounded four-finding document review. Run from repository root."""
import ast, copy, gzip, hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
R=Path.cwd(); E=Path('docs/review/evidence/config-acceptance'); O=E/'independent-four-findings-recheck-20261013'; F=E/'four-findings-fix-20261013'; C=E/'components'; B=E/'runtime/batches/21bf51b-standalone-remote-19'; BASE='21bf51bc2075abec1191fdc091952492b6cb484e'
def sha(x): return hashlib.sha256(x).hexdigest()
def canon(x): return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def load(p): return json.loads(Path(p).read_bytes())
def git(p,commit=BASE): return subprocess.check_output(['git','show',commit+':'+str(p)])
def save(p,x): Path(p).write_text(json.dumps(x,indent=2)+'\n')
results=[]
def run(label,args,cwd=R,expected=0,boundary=None):
    proc=subprocess.run(args,cwd=cwd,capture_output=True)
    (O/(label+'.stdout')).write_bytes(proc.stdout); (O/(label+'.stderr')).write_bytes(proc.stderr)
    ok=proc.returncode==expected and (boundary is None or boundary.encode() in proc.stdout+proc.stderr)
    results.append(dict(label=label,command=[str(a) for a in args],exit=proc.returncode,expectedExit=expected,expectedBoundary=boundary,passed=ok))
    assert ok,(label,proc.returncode,proc.stdout[-1000:],proc.stderr[-1000:])
    return proc
def pointer(v,p):
    for k in p.split('/')[1:]: v=v[int(k)] if isinstance(v,list) else v[k.replace('~1','/').replace('~0','~')]
    return v
frozen=load(F/'review-input-identities.json')
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==frozen['head']
for item in frozen['files']: assert sha(Path(item['path']).read_bytes())==item['sha256'],item['path']
assert gzip.decompress((F/'review-input.patch.gz').read_bytes())==subprocess.check_output(['git','diff','--binary'])
save(O/'input-identities.json',{'head':frozen['head'],'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'frozenManifestSHA256':sha((F/'review-input-identities.json').read_bytes()),'frozenFilesVerified':len(frozen['files']),'reviewScriptSHA256':sha(Path(__file__).read_bytes()),'python':sys.version})
# Authenticate ALL original rows directly against immutable git and retained records.
olds=json.loads(gzip.decompress((B/'changed-rows-before.json.gz').read_bytes())); baseline=json.loads(git(E/'runtime/inventory-fragment.json')); before=json.loads(gzip.decompress((F/'runtime/inventory-before.json.gz').read_bytes())); now=load(E/'runtime/inventory-fragment.json'); corrections=load(F/'runtime/corrections.json')['records']
assert len(olds)==len(corrections)==17
byold={r['id']:r for r in baseline['rows']}; bynow={r['id']:r for r in now['rows']}; bybefore={r['id']:r for r in before['rows']}; corr={r['settingID']:r for r in corrections}; restored=copy.deepcopy(now); restore_rows={r['id']:r for r in restored['rows']}; proof=[]
for old in olds:
    sid=old['id']; assert old==byold[sid]
    h=next(h for h in bynow[sid]['sourceDefinitionHistory'] if h['batch']=='standalone-remote-19'); orig=next(h for h in bybefore[sid]['sourceDefinitionHistory'] if h['batch']=='standalone-remote-19')
    enriched=copy.deepcopy(old); enriched.setdefault('sourceDefinitionHistory',[])
    assert h['oldRowSHA256']==sha(canon(old)); assert orig['oldRowSHA256']==sha(canon(enriched)); assert corr[sid]['originalHistoryRecord']==orig
    fix=h['oldRowSHA256Correction']; assert fix==corr[sid]['correction']; assert fix['previousIncorrectOldRowSHA256']==orig['oldRowSHA256']; assert fix['correctedOldRowSHA256']==h['oldRowSHA256']; assert fix['originalSnapshotSHA256']==sha((B/'changed-rows-before.json.gz').read_bytes()); assert fix['originalBaselineCommit']==BASE
    restore_rows[sid]['sourceDefinitionHistory'][restore_rows[sid]['sourceDefinitionHistory'].index(h)]=orig
    proof.append({'settingID':sid,'originalSHA256':sha(canon(old)),'retainedIncorrectSHA256':orig['oldRowSHA256']})
assert restored==before
# Test actual corrected integration prefix, without executing file-writing integration.
tree=ast.parse((B/'integrate.py').read_text()); loop=next(n for n in tree.body if isinstance(n,ast.For)); prefix=ast.Module(body=loop.body[:4],type_ignores=[])
for old in olds:
    row=copy.deepcopy(old); exec(compile(prefix,'actual-integration-prefix','exec'),{'rows':{old['id']:row},'e':{'setting':old['id']},'hashlib':hashlib,'copy':copy,'can':canon,'B':B}); assert row['sourceDefinitionHistory'][-1]['oldRowSHA256']==sha(canon(old))
save(O/'all17-independent-provenance.json',proof)
protected=load(F/'runtime/input-digests.json')['historicalArtifactsUnchanged']
for p,h in protected.items(): assert sha(Path(p).read_bytes())==h
# Historical acceptance/decision obligations unchanged; all production changes excluded.
for p in ['docs/review/remediation/decisions.md','docs/review/remediation/acceptance-20260920.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md']:
    assert Path(p).read_bytes()==git(p,frozen['head'])
changed=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines(); assert len(changed)==6 and all(p.startswith('docs/review/') for p in changed)
# Independent reconstruction of root runtime row normalization, preserving every original property.
inv=load('docs/review/remediation/config-semantic-inventory.json'); mat=load('docs/review/remediation/config-acceptance-matrix.json'); roots={r['id']:r for r in inv['rows']}
for raw in now['rows']:
    wanted=dict(raw); wanted.update(fragment='runtime',**{'class':raw.get('class',raw.get('classification')),'requirementIds':raw.get('requirementIds',raw.get('requirements',[])),'caseIds':raw.get('caseIds',raw.get('cases',[])),'verifiedSourceEvidence':raw.get('verifiedSourceEvidence',raw.get('evidence',[])),'semanticStatus':raw.get('semanticStatus',raw.get('status','unresolved')),'reviewerConfirmation':None})
    assert roots[raw['id']]==wanted,raw['id']
native=load(E/'runtime/case-proposals.json'); assert mat['nativeCasePackages'][0]['caseSpecifications']==native
assert inv['status']=='in-progress-not-C0-accepted'; assert len({r['id'] for r in inv['rows']})==len(inv['rows'])
run('root-structural',['python3',str(E/'author/check-matrix.py'),'--structural'])
run('native-conservation',['python3',str(E/'author/check-native-case-integration.py')])
# Execute persisted isolated root and component controls; never mutate candidate inputs.
with tempfile.TemporaryDirectory(prefix='independent-four-review-') as td:
    T=Path(td); (T/'.git').symlink_to(R/'.git',target_is_directory=True)
    def cp(p):
        dest=T/p; dest.parent.mkdir(parents=True,exist_ok=True)
        if Path(p).is_symlink(): shutil.copyfile(p,dest)
        else: shutil.copyfile(p,dest)
    helper=F/'components/validate-bindings.py'; cp(helper)
    canonical=[C/'semantic-fragment.json',C/'refined-case-profiles.json',C/'checkpoint6606-canonical-questions/source-marker-canonical-projection.json',C/'checkpoint6606-canonical-questions/remaining-backlog.json',C/'source-candidates-bce3f075/source-json-coordinates.json',Path('skills/common/plugin-runtime/foundation/config/swarm-components.schema.json'),Path('charts/kubeclaw/templates/_swarm-config.tpl')]
    for batch in ('01','02'):
        folder=C/('checkpoint21bf-source-links-'+batch); cp(folder/'check-bindings.py'); cp(folder/'committed-input-references.json')
        canonical.extend(Path(r['path']) for r in load(folder/'committed-input-references.json')['refs'])
    for p in set(canonical): cp(p)
    # git symlink sources must have their original link bytes for canonical identity.
    for p in set(canonical):
        if Path(p).is_symlink():
            (T/p).unlink(); (T/p).symlink_to(Path(p).readlink()); target=(p.parent/Path(p).readlink()).resolve(); rel=target.relative_to(R); cp(rel)
    for batch in ('01','02'):
        folder=C/('checkpoint21bf-source-links-'+batch); filename='source-coordinate-definitions.json' if batch=='01' else 'schema-coordinate-definitions.json'; data=load(folder/filename); script=str(R/folder/'check-bindings.py'); inp=T/'candidate.json'
        def control(label,d,expected=0,boundary=None):
            save(inp,d); (O/(batch+'-'+label+'.input.json.gz')).write_bytes(gzip.compress(inp.read_bytes(),mtime=0)); run(batch+'-'+label,['python3',script,'--input',str(inp)],T,expected,boundary)
        control('positive-before',data)
        for label in ['member-delete','member-duplicate','coordinate-delete','unrelated-profile','same-owner-wrong-field','owner-drift','field-drift','case-loss']:
            d=copy.deepcopy(data); rec=d['records'][0]; mem=rec['members'][0]; key='completeABProfile' if batch=='01' else 'completeAB'
            if label=='member-delete': rec['members'].pop(); rec['memberCount']-=1
            elif label=='member-duplicate': rec['members'].append(copy.deepcopy(mem)); rec['memberCount']+=1
            elif label=='coordinate-delete': d['records'].pop()
            elif label=='unrelated-profile': mem[key]['rfc6901Pointer']='/CMP-C1-EFFECT-prism-studio-port'
            elif label=='same-owner-wrong-field':
                profiles=load(C/'refined-case-profiles.json'); mem[key]['rfc6901Pointer']='/'+next(cid for cid,p in profiles.items() if cid.startswith('CMP-C1-EFFECT-') and p['delta']['owner']==mem['owner'] and '/'+cid!=mem[key]['rfc6901Pointer'])
            elif label=='owner-drift': mem['owner']='prism-studio'
            elif label=='field-drift': mem['selectedField' if batch=='01' else 'field']='/settings/port'
            elif label=='case-loss': mem['caseIds']=[]
            control(label,d,1,'CANONICAL_BINDING:')
        # Mutate unrelated COMPLETE profile contents before process startup: frozen whole-file identity must reject.
        profpath=T/C/'refined-case-profiles.json'; original=profpath.read_bytes(); profiles=json.loads(original); unrelated=profiles['CMP-C1-EFFECT-prism-studio-port']; unrelated['A']['prism-studio']['settings']['port']+=1; save(profpath,profiles)
        (O/(batch+'-unrelated-profile-content.json.gz')).write_bytes(gzip.compress(profpath.read_bytes(),mtime=0)); control('persisted-unrelated-profile-content',data,1,'canonical source drift:'); profpath.write_bytes(original)
        control('positive-after',data)
    # Full root checker supports isolated serialized candidate paths.
    for label,mutate,target in [('runtime-row-delete',lambda x:x['rows'].pop(next(i for i,r in enumerate(x['rows']) if r['id']==olds[0]['id'])),'inventory'),('runtime-history-drift',lambda x:next(r for r in x['rows'] if r['id']==olds[0]['id'])['sourceDefinitionHistory'][0].update(oldRowSHA256='0'*64),'inventory'),('native-spec-delete',lambda x:x['nativeCasePackages'][0]['caseSpecifications'].pop(),'matrix')]:
        ii=copy.deepcopy(inv); mm=copy.deepcopy(mat); mutate(ii if target=='inventory' else mm); ip=T/'inventory.json'; mp=T/'matrix.json'; save(ip,ii); save(mp,mm)
        (O/(label+'.'+target+'.json.gz')).write_bytes(gzip.compress((ip if target=='inventory' else mp).read_bytes(),mtime=0)); run(label,['python3',str(E/'author/check-matrix.py'),'--structural','--inventory',str(ip),'--matrix',str(mp)],R,0 if label=='runtime-history-drift' else 1)
        if label=='runtime-history-drift':
            assert next(r for r in ii['rows'] if r['id']==olds[0]['id']) != roots[olds[0]['id']]
save(O/'checks.json',results)
save(O/'recovery-identities.json',{'candidateFilesUnchanged':all(sha(Path(i['path']).read_bytes())==i['sha256'] for i in frozen['files']),'historicalProtectedFilesVerified':len(protected),'runtimeRowsIndependentlyConserved':len(now['rows']),'nativeSpecificationsConserved':len(native),'rootRows':len(inv['rows']),'all17DigestsAuthenticated':True,'obligationDocumentsUnchanged':True,'productionChanged':False,'isolatedInputsRemoved':True})
print(json.dumps({'boundedReview':'completed','checks':len(results),'all17DigestsAuthenticated':True,'globalC0Accepted':False}))
