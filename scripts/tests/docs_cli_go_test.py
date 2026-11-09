import json,pathlib,subprocess,tempfile,atexit,os
base=pathlib.Path(__file__).parent
scratch=tempfile.TemporaryDirectory(prefix='kubeclaw-cli-go-test-');atexit.register(scratch.cleanup);binary=pathlib.Path(scratch.name)/'go-cli-ast'
subprocess.run(['go','build','-trimpath','-o',str(binary),str(base.parent/'lib/cli/go_cli_ast.go')],check=True,env={**os.environ,'GOTOOLCHAIN':'local','GOWORK':'off','GO111MODULE':'off','GOPROXY':'off','GOSUMDB':'off'})
def analyze(text):return json.loads(subprocess.run([str(binary)],input=json.dumps({'sources':[{'path':'main.go','text':text}]}),capture_output=True,text=True,check=True).stdout)['sources'][0]
tests=[]
def test(name,fn):fn();tests.append(name);print('PASS '+name)
def exits():
 text='package main\nimport "os"\nfunc main(){defer func(){recover()}();if len(os.Args)<2{panic("missing")};return}\n'
 r=analyze(text);k={x['kind']for x in r['exits']};assert {'go-main-normal-completion-policy','go-return-completion','go-deferred-completion-action','go-builtin-panic-completion','go-builtin-recover-completion'}<=k
 panic=next(x for x in r['exits']if x['kind']=='go-builtin-panic-completion');assert panic['conditions'];assert panic['deferSources'];assert not any(x.get('valueExpression')in('0','1')for x in r['exits'])
 changed=analyze(text.replace('panic("missing")','panic("changed")'));assert any('changed'in x['expression']for x in changed['exits']);assert not any('panic("missing")'==x['expression']for x in changed['exits'])
 removed=analyze(text.replace('panic("missing")','println("missing")'));assert not any(x['kind']=='go-builtin-panic-completion'for x in removed['exits'])
test('main return/panic/defer/recover completion positive changed/removal',exits)
def shadow():
 r=analyze('package main\nfunc main(){panic:=func(string){};panic("private");fixture:="panic(fake)";_=fixture}\n');assert not any(x['kind']=='go-builtin-panic-completion'for x in r['exits'])
test('shadowed builtin and private fixture do not invent panic',shadow)
def child():
 r=analyze('package main\nimport e "os/exec"\nfunc main(){cmd:=e.Command("tool","--foreign");if err:=cmd.Run();err!=nil{panic(err)};unused:=e.Command("other");_=unused}\n')
 assert len([x for x in r['delegations']if x['kind']=='go-exec-command-construction'])==2
 results=[x for x in r['exits']if x['kind']=='go-exec-child-result-completion'];assert len(results)==1;assert results[0]['method']=='Run';assert not r['options']
test('exec construction vs executed result and child flag nongrant',child)
def lexical():
 r=analyze('package main\nfunc main(){if true{f:=func(){panic("later")};_=f}}\n');p=next(x for x in r['exits']if x['kind']=='go-builtin-panic-completion');assert p['conditions']==[]
 assert analyze('package main\nfunc {')['unresolved'][0]['rule']=='syntax-error'
test('nested function lexical guard and syntax failure',lexical)
print(json.dumps({'tests':len(tests),'passed':len(tests)}))
