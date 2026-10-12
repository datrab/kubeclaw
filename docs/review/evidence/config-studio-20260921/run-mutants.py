import json,pathlib,subprocess,os
p=pathlib.Path('docs/review/evidence/config-studio-20260921'); rows=[]
for mutation in ['override','port','timeout','upstream']:
 command=['node','--import',str((p/'mutation-hook.mjs').resolve()),'--test','skills/prism/tests/studio-config.test.mts']
 result=subprocess.run(command,env=dict(os.environ,STUDIO_MUTANT=mutation),text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
 (p/('mutant-'+mutation+'.txt')).write_text(result.stdout)
 assert result.returncode!=0 and ('AssertionError' in result.stdout or 'ERR_ASSERTION' in result.stdout),mutation
 rows.append(dict(mutation=mutation,command=command,exitCode=result.returncode,semanticAssertionFailure=True))
(p/'mutants.json').write_text(json.dumps(rows,indent=2)+'\n')
