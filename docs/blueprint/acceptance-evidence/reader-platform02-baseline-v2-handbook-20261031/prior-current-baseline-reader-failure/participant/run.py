import subprocess,time,json,sys,pathlib,datetime
base=pathlib.Path(__file__).resolve().parent
name=sys.argv[1]; cmd=sys.argv[2]; cwd=sys.argv[3] if len(sys.argv)>3 else '/home/node/.openclaw/workspace/tmp/reader-platform02-fresh-20261031'
t=time.monotonic(); started=datetime.datetime.now(datetime.timezone.utc).isoformat()
p=subprocess.run(cmd,shell=True,executable='/bin/bash',cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
(base/(name+'.log')).write_text(p.stdout)
r=dict(name=name,command=cmd,cwd=cwd,started=started,durationSeconds=time.monotonic()-t,exitCode=p.returncode,outputFile=name+'.log')
with (base/'commands.jsonl').open('a') as f:f.write(json.dumps(r)+'\n')
print(json.dumps(r)); print(p.stdout[-6000:]);sys.exit(p.returncode)
