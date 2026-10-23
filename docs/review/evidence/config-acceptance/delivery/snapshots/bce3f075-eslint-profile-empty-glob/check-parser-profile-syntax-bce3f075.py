"""Standard TOML and ECMAScript syntax only; NOT actual Codex/ESLint consumer validation."""
import pathlib,json,tomllib,hashlib,subprocess,sys
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];records=[]
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(repo))
for p in sorted((out/'codex-definition-profiles-bce3f075').glob('*.toml')):
 record={'id':'DLV-C0-BCE3-TOML-SYNTAX-'+p.stem,'command':['python3',rel(pathlib.Path(__file__))],'profile':rel(p),'sourceDigests':{rel(p):h(p)},'scope':'Python standard TOML syntax only, NOT selected Codex serde/requirements/auth/permissions/MCP parser or effect'}
 try:tomllib.loads(p.read_text());record['result']='passed'
 except Exception as e:record.update(result='failed',diagnostic=str(e))
 records.append(record)
for p in sorted((out/'lint-definition-profiles-bce3f075').glob('*.eslint.mjs')):
 actual=subprocess.run(['node','--check',rel(p)],cwd=repo,capture_output=True,text=True);record={'id':'DLV-C0-BCE3-ESLINT-MODULE-SYNTAX-'+p.stem,'command':['node','--check',rel(p)],'profile':rel(p),'sourceDigests':{rel(p):h(p)},'scope':'ECMAScript module syntax only, NO module import/dependency resolution/flat-config or per-rule semantic validation/native lint effect','exit':actual.returncode,'stdout':actual.stdout,'stderr':actual.stderr,'result':'passed' if actual.returncode==0 else 'failed'};records.append(record)
body={'records':records,'scope':'bounded static profile syntax observations only','sourceDigests':{rel(pathlib.Path(__file__)):h(pathlib.Path(__file__))},'tools':{'python':sys.version,'node':subprocess.check_output(['node','--version'],text=True).strip()},'acceptance':'NOT ACCEPTED; native semantics/effects unrun'}
(out/'parser-profile-syntax-bce3f075.json').write_text(json.dumps(body,indent=2)+'\n');print(json.dumps(body,indent=2));sys.exit(any(r['result']!='passed' for r in records))
