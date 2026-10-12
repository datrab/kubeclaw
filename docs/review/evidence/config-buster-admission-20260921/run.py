import pathlib, subprocess, json, sys, os
root=pathlib.Path.cwd(); evidence=root/'docs/review/evidence/config-buster-admission-20260921'
name=sys.argv[1]; command=sys.argv[2:]
if command[0]=='flock-node':
 command=[str(root/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(root/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','-b',str(root/'node_modules/.cache/native-host-tools/root/bin/tar')+':/usr/bin/tar!','/usr/local/bin/node']+command[1:]
env={**os.environ, 'LD_LIBRARY_PATH':str(root/'node_modules/.cache/native-host-tools/root/usr/lib')}
with (evidence/(name+'.txt')).open('w') as output: result=subprocess.run(command,stdout=output,stderr=subprocess.STDOUT,env=env)
(evidence/(name+'.json')).write_text(json.dumps({'command':command,'exitCode':result.returncode},indent=2)+'\n')
print(name,result.returncode);sys.exit(result.returncode)
