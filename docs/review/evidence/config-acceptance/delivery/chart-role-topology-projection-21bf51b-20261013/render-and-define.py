"""Offline current Helm rendering + strict pinned schemas only; never native/API/skip."""
import pathlib,json,subprocess,hashlib
out=pathlib.Path(__file__).resolve().parent;delivery=out.parent;repo=delivery.parents[4];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();rel=lambda p:str(p.relative_to(repo));v=json.loads((out/'profile-identities.json').read_text());logs=[];schemaRoot=delivery/'pinned-kubernetes-json-schema/c8f4e61c63bc529749125ac566bccc6986e08d45/v1.35.6-standalone-strict'
for r in v['records']:
 stem=r['role']+'-'+r['letter']+'-chart-supported';file=out/(stem+'.render.yaml');err=out/(stem+'.render.stderr');argv=['helm','template','dlv-'+r['role'],r['chart'],'--namespace',r['namespace'],'--kube-version','1.35.6','--values',r['profile']['path']]
 with file.open('wb') as stdout,err.open('wb') as stderr:p=subprocess.run(argv,cwd=repo,stdout=stdout,stderr=stderr)
 record={'profile':r['profile'],'scope':'actual offline currentChart full-document source render only','render':{'argv':argv,'exitCode':p.returncode,'stdout':{'path':rel(file),'sha256':sha(file)},'stderr':{'path':rel(err),'sha256':sha(err)}}}
 if p.returncode==0:
  name=out/(stem+'.strict-schema.stdout');error=out/(stem+'.strict-schema.stderr');check=['kubeconform','-summary','-strict','-kubernetes-version','1.35.6','-schema-location',str(schemaRoot/'{{.ResourceKind}}{{.KindSuffix}}.json'),str(file)]
  with name.open('wb') as stdout,error.open('wb') as stderr:q=subprocess.run(check,cwd=repo,stdout=stdout,stderr=stderr)
  record['strictDefinition']={'argv':check,'exitCode':q.returncode,'stdout':{'path':rel(name),'sha256':sha(name)},'stderr':{'path':rel(error),'sha256':sha(error)},'meaning':'exact pinned PRIMARY structural definitions, no skip; NOT deployedAPI/default/feature/provider/image/native behavior acceptance'}
 else:record['strictDefinition']={'result':'not-run because real current Helm failed; not semantic-negative kill'}
 logs.append(record)
(out/'actual-render-schema-observations.json').write_text(json.dumps({'scope':'actual offline pure current source render/pinned strict definitions only; failed raw kept; no native/API/auth/host/business actions','baseline':v['baseline'],'records':logs,'v1.34.11':'BLOCKED exact missing primaryschemas404at old acquiredcommit, retainedidentity; no permissive fallback or skipPASS'},indent=2)+'\n')
print(json.dumps({'renders':len(logs),'renderFailures':sum(x['render']['exitCode']!=0 for x in logs),'schemaFailures':sum(x.get('strictDefinition',{}).get('exitCode',0)!=0 for x in logs),'scope':'offline structural/source only'},indent=2))
