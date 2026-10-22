from pathlib import Path,PurePosixPath
import json,hashlib,tarfile
r=Path('/home/node/.openclaw/workspace/kubeclaw-pr13-recovery');s=Path('/home/node/.openclaw/workspace/tmp/pr13-finish-20261021');p=r/'docs/blueprint/acceptance-evidence/eleven-guide-corrections-20261022';d=s/'eleven-guide-delivery-result-independent';d.mkdir(exist_ok=True);j=lambda f:json.loads(f.read_text());h=lambda x:hashlib.sha256(x).hexdigest();index=j(p/'evidence-index.json');arc=p/index['archive']['path'];assert len(arc.read_bytes())==index['archive']['bytes']==1084066 and h(arc.read_bytes())==index['archive']['sha256']=='d66f3239e8fe9f276f80ad117900003c40c144feb952c80fb4b73fc2f949b9ec';assert len(index['currentPages'])==11 and len({x['path'] for x in index['currentPages']})==11
for x in index['currentPages']:f=r/x['path'];assert f.is_file() and not f.is_symlink() and h(f.read_bytes())==x['sha256']
indexed={x['path']:x for x in index['members']};assert len(indexed)==len(index['members'])==223;data={}
with tarfile.open(arc,'r:gz') as t:
 members=t.getmembers();assert len(members)==223 and len({x.name for x in members})==223 and set(x.name for x in members)==set(indexed)
 for m in members:
  pp=PurePosixPath(m.name);assert m.isreg() and not pp.is_absolute() and '..' not in pp.parts and str(pp)==m.name
  raw=t.extractfile(m).read();row=indexed[m.name];assert len(raw)==m.size==row['bytes'] and h(raw)==row['sha256'];f=s/m.name;assert f.is_file() and not f.is_symlink() and f.read_bytes()==raw;data[m.name]=raw
checks=[]
for name,expected in [('publication-after-repin',['/usr/local/bin/node','scripts/docs-publication.mjs','check']),('core-guides-after-repin',['/usr/local/bin/node','scripts/check-core-architecture-guides.mjs']),('buster-guides-after-repin',['/usr/local/bin/node','scripts/check-buster-guides.mjs'])]:
 prefix='eleven-guide-scalar-checks/'+name+'/';inv=json.loads(data[prefix+'invocation.json']);res=json.loads(data[prefix+'result.json']);assert inv['argv']==res['argv']==expected and inv['cwd']==res['cwd']==str(r);assert inv['environment']==res['environment'];assert inv['start']==res['start']<=res['end'] and res['exitCode']==0;env=inv['environment'];assert env=={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/home/node','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC','TMPDIR':str(s/'eleven-guide-scalar-checks/tmp'),'npm_config_cache':str(s/'eleven-guide-scalar-checks/npm-cache'),'npm_config_logs_max':'0','npm_config_timing':'false','npm_config_update_notifier':'false'}
 for f,x in res['streams'].items():raw=data[prefix+f];assert len(raw)==x['bytes'] and h(raw)==x['sha256']
 assert not data[prefix+'stderr.raw'];checks.append({'name':name,'argv':expected,'exitCode':0,'stdout':data[prefix+'stdout.raw'].decode().rstrip(),'streams':res['streams']})
failures=[]
for name in ['publication','buster-guides','buster-guides-after-style']:
 prefix='eleven-guide-scalar-checks/'+name+'/';inv=json.loads(data[prefix+'invocation.json']);res=json.loads(data[prefix+'result.json']);assert res['exitCode']==1 and res['argv']==inv['argv']
 for f,x in res['streams'].items():raw=data[prefix+f];assert len(raw)==x['bytes'] and h(raw)==x['sha256']
 failures.append({'name':name,'exitCode':1,'stderrSha256':h(data[prefix+'stderr.raw']),'stderrBytes':len(data[prefix+'stderr.raw'])})
assert len([x for x in data['eleven-guide-scalar-checks/publication/stderr.raw'].decode().splitlines() if x.startswith('- ')])==24;assert b'copies maintained code' in data['eleven-guide-scalar-checks/buster-guides/stderr.raw'];assert b'uses another revision' in data['eleven-guide-scalar-checks/buster-guides-after-style/stderr.raw']
# Attribution presence only: do not independently reaccept own authored content.
style=json.loads(data['eleven-guide-style-root-independent/review.json']);repin=json.loads(data['buster-demo-auth-seven-url-repin-root-independent/review.json']);assert style['reviewer']=='/root' and style['author']=='/root/operator_acceptance' and style['status'].startswith('PASS_');assert repin['reviewer']=='/root' and repin['author']=='/root/operator_acceptance' and repin['status'].startswith('PASS_')
result={'status':'PASS_DELIVERY_AND_ACTUAL_ORIGINAL_CHECK_RESULTS_ONLY_NOT_CONTENT_REACCEPTANCE_READER_GATE','archiveSha256':h(arc.read_bytes()),'archiveBytes':arc.stat().st_size,'regularSafeUniqueMembers':223,'allIndexHashesLengthsMemberNamesAndOriginalScratchBytesExact':True,'all11CurrentPageHashesExact':True,'finalActualChecks':checks,'retainedOriginalFailures':failures,'rootIndependentStyleAndRepinAttributionPresent':True,'noExecutionOrMainWriteByReviewer':True}
(d/'passive-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
