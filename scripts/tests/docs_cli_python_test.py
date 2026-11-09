import importlib.util,json,pathlib,hashlib,ast,sysconfig,sys
base=pathlib.Path(__file__).parent
spec=importlib.util.spec_from_file_location('adapter',base.parent/'lib/cli/python_cli_ast.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
tests=[]
def check(name,body):body();tests.append(name);print('PASS '+name)
def analyze(text):return adapter.extract_source({'path':'entry.py','text':text})
def modes():
 r=analyze("import sys\nmode=sys.argv[1]\ncustody=mode in ('--documentation-custody','--stdin-custody')\nif mode in ('--stdin','--stdin-custody'):pass\nfixture='--fake'\n")
 assert {'--documentation-custody','--stdin-custody','--stdin'}<={x['name']for x in r['options']};assert '--fake' not in {x['name']for x in r['options']}
 changed=analyze("from sys import argv as args\nmode=args[1]\nif mode=='--changed':pass\n")
 assert '--changed'in{x['name']for x in changed['options']};assert '--stdin' not in {x['name']for x in changed['options']}
check('local argv aliases add/remove and private string negative',modes)
def raised():
 r=analyze("value=SystemExit(9)\ntry:\n raise SystemExit(3)\nexcept SystemExit:\n pass\nfinally:\n marker=True\n")
 assert not any(x.get('valueExpression')=='9'for x in r['exits']);assert any(x.get('kind')=='SystemExit-object-construction-not-termination'for x in r['delegations']);raised=next(x for x in r['exits']if x.get('kind')=='raised-SystemExit');assert raised['valueExpression']=='3';assert raised['exceptionContext'][0]['handlers'];assert raised['exceptionContext'][0]['finallySources']
check('SystemExit construction is not raised termination',raised)
def parser():
 r=analyze("import argparse as ap\np=ap.ArgumentParser(exit_on_error=False,argument_default='fallback',allow_abbrev=False)\np.add_argument('--yes',action='store_true')\np.add_argument('--no',action='store_false',default='explicit')\np.parse_args()\n")
 assert {'-h','--help','--yes','--no'}<={x['name']for x in r['options']}
 assert any(x.get('kind')=='argparse-action-default-policy'and x['valueExpression']=="'fallback'"for x in r['defaults'])
 assert any(x.get('kind')=='argparse-action-default-policy'and x['valueExpression']=="'explicit'"for x in r['defaults'])
 e=next(x for x in r['exits']if x.get('kind')=='argparse-sourcebound-error-policy');assert e['valueExpression']=='2';assert e['exitOnErrorExpression']=='False';assert 'regardless'in e['conditionsPolicy']
 assert any(x['valueExpression']=='False'for x in analyze("import argparse\np=argparse.ArgumentParser()\np.add_argument('--yes',action='store_true')\n")['defaults']if x.get('kind')=='argparse-action-default-policy')
 assert any(x.get('bindingExpression')=='allow_abbrev'and x.get('valueExpression')=='False'for x in r['defaults'])
 no=analyze("from argparse import ArgumentParser as Parser\np=Parser(add_help=False)\np.parse_args()\n")
 assert not no['options'];assert not any(x.get('kind')=='argparse-implicit-help-policy'for x in no['exits'])
check('genuine argparse constructor and action/error/help default policies',parser)
def shadow():
 r=analyze("def fake(argparse):\n p=argparse.ArgumentParser()\n p.parse_args()\n")
 assert not r['options'];assert not any(x.get('kind').startswith('argparse')for x in r['exits'])
 r=analyze("import argparse\np=argparse.ArgumentParser()\nalias=p\nalias.exit=custom\np.parse_args()\n")
 assert all(x.get('valueExpression')is None for x in r['exits']if x.get('kind')in('argparse-implicit-help-policy','argparse-sourcebound-error-policy'))
check('receiver shadow and alias method override do not invent native status',shadow)
def opaque():
 r=analyze("import sys\nfrom pathlib import Path\ntext=Path(sys.argv[1]).read_text()\nif text=='--source-content':pass\n")
 assert '--source-content' not in {x['name']for x in r['options']}
check('opaque source content is not CLI argument data',opaque)
def lexical():
 r=analyze("try:\n def later():\n  raise ValueError('later')\nexcept Exception:pass\n")
 assert next(x for x in r['exits']if x.get('kind')=='python-raised-completion')['exceptionContext']==[]
 assert analyze('def :')['unresolved'][0]['rule']=='syntax-error'
check('lexical exception boundary and invalid syntax',lexical)

def selected_contract():
 assert adapter.qualify_selected_argparse_prerequisite()=={'contract':'cpython-stdlib-argparse-semantic-v1','qualified':True}
 source=(pathlib.Path(sysconfig.get_path('stdlib'))/'argparse.py').read_text()
 assert adapter.qualify_argparse_stdlib_source(source)==adapter.qualify_argparse_stdlib_source('# harmless patch comment\n'+source)
 # A real contract default change must fail, not silently retain generated False.
 tree=ast.parse(source);cls=next(n for n in tree.body if isinstance(n,ast.ClassDef)and n.name=='_StoreTrueAction');fn=next(n for n in cls.body if isinstance(n,ast.FunctionDef)and n.name=='__init__');index=[a.arg for a in fn.args.args].index('default')-(len(fn.args.args)-len(fn.args.defaults));fn.args.defaults[index]=ast.Constant(value=True)
 try:adapter.qualify_argparse_stdlib_source(ast.unparse(tree))
 except RuntimeError as error:assert str(error)=='CLI_ARGPARSE_PREREQUISITE_CONTRACT_CHANGED:_StoreTrueAction.__init__'
 else:raise AssertionError('changed action default accepted')
 # A real error status contract change must also fail.
 tree=ast.parse(source);cls=next(n for n in tree.body if isinstance(n,ast.ClassDef)and n.name=='ArgumentParser');fn=next(n for n in cls.body if isinstance(n,ast.FunctionDef)and n.name=='error');call=next(n for n in ast.walk(fn)if isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)and n.func.attr=='exit');call.args[0]=ast.Constant(value=3)
 try:adapter.qualify_argparse_stdlib_source(ast.unparse(tree))
 except RuntimeError as error:assert str(error)=='CLI_ARGPARSE_PREREQUISITE_CONTRACT_CHANGED:ArgumentParser.error'
 else:raise AssertionError('changed error status accepted')
check('selected stdlib genuine contract accepts; changed default/error AST fails closed',selected_contract)
def main_order():
 class Unreadable:
  def read(self,*args):raise AssertionError('input extraction happened before qualification')
 saved_qualifier=adapter.qualify_selected_argparse_prerequisite;saved_stdin=adapter.sys.stdin
 def changed():raise RuntimeError('TEST_CONTRACT_CHANGED')
 try:
  adapter.qualify_selected_argparse_prerequisite=changed;adapter.sys.stdin=Unreadable()
  try:adapter.main()
  except RuntimeError as error:assert str(error)=='TEST_CONTRACT_CHANGED'
  else:raise AssertionError('main ignored prerequisite failure')
 finally:adapter.qualify_selected_argparse_prerequisite=saved_qualifier;adapter.sys.stdin=saved_stdin
check('main qualifies prerequisite before reading product input',main_order)
def parse(body):
 r=adapter.extract_source({'path':'entry.py','text':'import argparse\np=argparse.ArgumentParser()\n'+body})
 return r,[x['constructor'] for x in r['delegations']if x.get('kind')=='argparse-dispatch']
def value(s):return s['actionDefaultStates'][0]['valueExpression']
r,s=parse("p.add_argument('--x',default='a')\np.parse_args()\np.set_defaults(x='b')\np.parse_args()\n")
assert [value(x)for x in s]==["'a'","'b'"];assert len(s[0]['actionDefaultStates'][0]['orderedUpdates'])==0;assert len(s[1]['actionDefaultStates'][0]['orderedUpdates'])==1
r,s=parse("p.set_defaults(x='before')\np.add_argument('--x')\np.parse_args()\n")
assert value(s[0])=="'before'"
r,s=parse("p.set_defaults(x='before')\np.add_argument('--x',default='explicit')\np.parse_args()\n")
assert value(s[0])=="'explicit'"
r,s=parse("p.add_argument('-s','--some-key',default='a')\np.set_defaults(some_key='b')\np.parse_args()\n")
assert value(s[0])=="'b'";assert s[0]['actionDefaultStates'][0]['destination']=='some_key'
r,s=parse("p.add_argument('--x',dest='other',default='a')\np.set_defaults(x='b')\np.parse_args()\n")
assert value(s[0])=="'a'"
r,s=parse("p.add_argument('--x',default='a')\np.set_defaults(**mapping)\np.parse_args()\np.set_defaults(x='later')\np.parse_args()\n")
assert value(s[0])is None;assert value(s[1])=="'later'";assert any(x.get('rule')=='expanded-argparse-set-defaults-mapping'for x in r['unresolved'])
r,s=parse("p.add_argument('--x',default='a')\nif selected:\n p.set_defaults(x='b')\np.parse_args()\n")
assert value(s[0])is None;assert s[0]['actionDefaultStates'][0]['orderedUpdates'][0]['callSource']['conditions']
print('PASS seven source-order/destination/unknown/guard/snapshot controls')
r,s=parse("p.add_argument('--x',default='a')\ndef never_called():\n p.set_defaults(x='b')\np.parse_args()\n")
assert value(s[0])=="'a'"
for block in ("for unused in []:\n p.set_defaults(x='b')\n", "try:\n pass\nexcept Exception:\n p.set_defaults(x='b')\n", "while selected:\n p.set_defaults(x='b')\n"):
 r,s=parse("p.add_argument('--x',default='a')\n"+block+"p.parse_args()\n")
 assert value(s[0])is None
 assert s[0]['actionDefaultStates'][0]['unresolved']
print('PASS four function-definition/zero-iteration/exception/loop controls')

print(json.dumps({'existingTests':len(tests),'orderedDefaultControls':11,'passed':len(tests)+11}))

r=analyze("import argparse\nargparse.ArgumentParser().add_subparsers().add_parser('run')\n")
assert [x['name']for x in r['commands']if x.get('kind')=='argparse-add_parser']==['run']
assert sum(x.get('name')=='--help'for x in r['options'])==2
r=analyze("from argparse import ArgumentParser as P\np=P(add_help=False).add_subparsers().add_parser('build',add_help=False)\np.add_argument('--path',default='out')\np.set_defaults(path='later')\np.parse_args()\n")
assert [x['name']for x in r['options']]==['--path'];d=next(x for x in r['delegations']if x.get('kind')=='argparse-dispatch');assert d['constructor']['actionDefaultStates'][0]['valueExpression']=="'later'"
r=analyze("import argparse\nargparse.ArgumentParser().add_argument('--direct',default='fallback')\n")
assert '--direct'in[x['name']for x in r['options']];assert any(x.get('kind')=='argparse-action-default-policy'and x['valueExpression']=="'fallback'"for x in r['defaults'])
r=analyze("import argparse\np=argparse.ArgumentParser()\np.set_defaults(x=1).add_argument('--impossible')\n")
assert '--impossible'not in[x['name']for x in r['options']];assert any(x.get('rule')=='argparse-chained-call-result-not-qualified-parser-receiver'for x in r['unresolved'])
r=analyze("def helper(argparse):\n argparse.ArgumentParser().add_argument('--fake')\n")
assert r['options']==[]
r=analyze("import argparse\nargparse.ArgumentParser().add_parser('invalid')\n")
assert not any(x.get('name')=='invalid'for x in r['commands']);assert any(x.get('rule')=='argparse-action-is-not-parser-receiver'for x in r['unresolved'])
print('PASS six chained constructor/subparser/direct/unknown-result/shadow/wrong-receiver controls')

for cls_name,method in [('ArgumentParser','add_subparsers'),('_SubParsersAction','add_parser')]:
 source=(pathlib.Path(sysconfig.get_path('stdlib'))/'argparse.py').read_text();tree=ast.parse(source)
 cls=next(x for x in tree.body if isinstance(x,ast.ClassDef)and x.name==cls_name);fn=next(x for x in cls.body if isinstance(x,ast.FunctionDef)and x.name==method)
 node=next(x for x in ast.walk(fn)if isinstance(x,ast.Return));node.value=ast.Constant(value=None)
 try:adapter.qualify_argparse_stdlib_source(ast.unparse(tree))
 except RuntimeError as error:assert str(error)=='CLI_ARGPARSE_PREREQUISITE_CONTRACT_CHANGED:'+cls_name+'.'+method
 else:raise AssertionError('changed receiver return contract accepted')
print('PASS two genuine receiver-return contract mutation controls')


# A factory may return an arbitrary object, not a native ArgumentParser.
for factory in ["parser_class=Custom", "action=Custom", "**factory_options"]:
 r=analyze("import argparse\np=argparse.ArgumentParser().add_subparsers("+factory+").add_parser('run')\np.add_argument('--not-native', default='a')\np.parse_args()\n")
 assert any(x.get('rule')=='argparse-factory-receiver-unqualified' for x in r['unresolved'])
 assert '--not-native' not in {x.get('name') for x in r['options']}
 assert not any(x.get('kind') in ('argparse-implicit-help-policy','argparse-sourcebound-error-policy') for x in r['exits'])
print('PASS custom parser_class/action/expanded factory receiver refusal')

r=analyze("import argparse\np=argparse.ArgumentParser(**config)\np.exit=custom_exit\np.parse_args()\n")
assert any(x.get('rule')=='argparse-factory-receiver-unqualified' for x in r['unresolved'])
assert not any(x.get('kind')=='argparse-dispatch' for x in r['delegations'])
print('PASS expanded root receiver method override remains unresolved without crash')
print(json.dumps({"controls":31,"passed":31}))
