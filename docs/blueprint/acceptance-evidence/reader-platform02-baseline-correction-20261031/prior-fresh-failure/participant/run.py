import pathlib,subprocess,time,json,datetime,sys
b=pathlib.Path('/home/node/.openclaw/workspace');e=b/'operations/pr13/evidence/reader-platform02-fresh-20261031/participant';c=b/'tmp/reader-platform02-fresh-20261031/kubeclaw'
commands=sys.argv[1:]
for cmd in commands:
 records=json.loads((e/'commands.json').read_text()); n=len(records)+1; name=f'{n:02d}-command.log';start=datetime.datetime.now(datetime.timezone.utc).isoformat();t=time.monotonic()
 p=subprocess.run(['bash','-c',cmd],cwd=c,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (e/name).write_text(p.stdout);r={'command':cmd,'cwd':str(c),'startedAt':start,'elapsedSeconds':time.monotonic()-t,'exitCode':p.returncode,'output':name};records.append(r);(e/'commands.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(r),flush=True);print(p.stdout[-12000:],flush=True)
 if p.returncode: sys.exit(p.returncode)
