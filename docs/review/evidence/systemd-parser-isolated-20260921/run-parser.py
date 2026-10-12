from pathlib import Path
import subprocess,os,json
c=Path('node_modules/.cache/systemd-parser-20260921').resolve();e=Path('docs/review/evidence/systemd-parser-isolated-20260921');r=c/'runtime';t=Path('node_modules/.cache/native-host-tools/root').resolve()
(c/'private-run').mkdir(exist_ok=True)
base=[str(t/'usr/bin/proot'),'-b',str(c/'private-run')+':/run','-b',str(r/'usr/lib/systemd')+':/usr/lib/systemd','-b',str(r/'usr/share/systemd')+':/usr/share/systemd',str(r/'usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2'),'--library-path',str(r/'usr/lib/x86_64-linux-gnu')+':'+str(r/'usr/lib/x86_64-linux-gnu/systemd'),str(r/'usr/bin/systemd-analyze'),'verify','--man=no']
env=dict(os.environ,LD_LIBRARY_PATH=str(t/'usr/lib')+':'+str(t/'lib'));rows=[]
for name in ['kubeclaw-native-pools.service','malformed.service','missing-start.service']:
 cmd=base+[str(c/'probes'/name)];p=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=120);rows.append({'command':cmd,'status':p.returncode,'stdout':p.stdout,'stderr':p.stderr});print(name,p.returncode,p.stderr)
(e/'parser-results.json').write_text(json.dumps(rows,indent=2)+'\n')
assert [row['status'] for row in rows]==[0,1,1]
assert 'is not executable' in rows[1]['stderr']
assert 'Service has no ExecStart=' in rows[2]['stderr']
