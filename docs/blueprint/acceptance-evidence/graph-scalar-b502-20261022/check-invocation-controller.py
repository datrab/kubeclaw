import os,sys,json,subprocess,time,pathlib,hashlib
base=pathlib.Path(__file__).resolve().parent
root='/home/node/.openclaw/workspace/kubeclaw-pr13-recovery'
env={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/home/node','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC','TMPDIR':str(base/'tmp'),'npm_config_cache':str(base/'npm-cache'),'npm_config_logs_max':'0','npm_config_timing':'false','npm_config_update_notifier':'false'}
commands={'scalar-controls':['/usr/local/bin/node','--test','scripts/tests/deployment-scalar-occurrence-custody.test.mjs','scripts/tests/deployment-config-output-custody.test.mjs'],'publication':['/usr/local/bin/node','scripts/docs-publication.mjs','check'],'core-guides':['/usr/local/bin/node','scripts/check-core-architecture-guides.mjs'],'buster-guides':['/usr/local/bin/node','scripts/check-buster-guides.mjs']}
name=sys.argv[1]; target=base/name;target.mkdir(exist_ok=False)
record={'argv':commands[name],'cwd':root,'environment':env,'start':time.time()}
(target/'invocation.json').write_text(json.dumps(record,indent=2)+'\n')
with (target/'stdout.raw').open('wb') as out,(target/'stderr.raw').open('wb') as err:
 p=subprocess.run(commands[name],cwd=root,env=env,stdout=out,stderr=err)
record.update(exitCode=p.returncode,end=time.time(),streams={n:{'bytes':(target/n).stat().st_size,'sha256':hashlib.sha256((target/n).read_bytes()).hexdigest()} for n in ['stdout.raw','stderr.raw']})
(target/'result.json').write_text(json.dumps(record,indent=2)+'\n'); print(json.dumps(record));sys.exit(p.returncode)
