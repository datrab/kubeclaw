import pathlib,json,copy,subprocess,hashlib
O=pathlib.Path(__file__).parent;sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();d=json.loads((O/'candidate-dispositions.json').read_text());results=[]
def run(name,value,expect,diagnostic=None):
 file=O/(name+'.fixture.json');file.write_text(json.dumps(value,indent=2)+'\n');argv=['python3',str(O/'check-source-freeze.py'),'--candidates',str(file)];r=subprocess.run(argv,text=True,capture_output=True);raw=O/(name+'.log');raw.write_text(r.stdout+r.stderr);assert (r.returncode==0)==expect,(name,r.returncode,r.stderr)
 if diagnostic:assert diagnostic in r.stderr,(name,r.stderr)
 results.append({'id':name,'argv':argv,'fixtureSha256':sha(file),'raw':str(raw),'rawSha256':sha(raw),'exitCode':r.returncode,'expectedDiagnostic':diagnostic,'result':'passed sourceintegrity control (not F-MUT)'})
mut=copy.deepcopy(d);mut['candidates'].append(copy.deepcopy(mut['candidates'][0]));run('source-duplicate-marker-negative',mut,False,'Unique exact discovery marker IDs')
mut=copy.deepcopy(d);bad=next(c for c in mut['candidates'] if c['status']=='uncovered-source-obligation');bad['sourceQuestionId']='UNKNOWN_SOURCE_QUESTION';run('source-unlinked-obligation-negative',mut,False,'Exact named gap ratherthan genericbucket')
run('source-restored-positive',d,True)
(O/'source-integrity-controls.json').write_text(json.dumps({'scope':'Meaningful docs/sourceinventory structuralcontrols only, NOT F-MUT/businessruntime/C0 acceptance','results':results,'passed':3,'failed':0,'identities':{str(O/'check-source-freeze.py'):sha(O/'check-source-freeze.py'),str(O/'check-source-integrity-controls.py'):sha(O/'check-source-integrity-controls.py'),str(O/'candidate-dispositions.json'):sha(O/'candidate-dispositions.json')}},indent=2)+'\n');print('3 sourceintegrity negative/restored controls passed, noacceptance')
