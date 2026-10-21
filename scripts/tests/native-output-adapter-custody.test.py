"""Finite native documentation adapters: source custody and receipt regressions."""
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import shutil
from unittest.mock import patch
import sys
import tempfile
import unittest
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / 'scripts'
spec = importlib.util.spec_from_file_location('receipt', SCRIPTS / 'docs-api-python-ast-v1.py')
receipt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receipt)

class NativeCustody(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.base = Path(cls.temp.name)
        cls.go = os.environ.get('KUBECLAW_DOCS_GO_BINARY')
        cls.binary = cls.base / 'adapter'
        if cls.go:
            result = subprocess.run([cls.go, 'build', '-o', str(cls.binary), str(SCRIPTS / 'docs-api-go-output-role-adapter.go')], capture_output=True, text=True)
            if result.returncode: raise RuntimeError(result.stderr)
    @classmethod
    def tearDownClass(cls): cls.temp.cleanup()

    def python(self, text):
        path = self.base / 'producer.py'; path.write_text(text)
        result = subprocess.run([sys.executable, str(SCRIPTS / 'docs-api-python-output-adapter.py'), str(path), '--classify'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def go_records(self, text, module='module custody.test/native\n\ngo 1.22\n', extra=None):
        if not self.go: self.skipTest('actual Go binary unavailable; set KUBECLAW_DOCS_GO_BINARY')
        directory = Path(tempfile.mkdtemp(dir=self.base))
        path = directory / 'main.go'; path.write_text(text)
        (directory / 'go.mod').write_text(module)
        for name, value in (extra or {}).items(): (directory / name).write_text(value)
        result = subprocess.run([str(self.binary)], input=json.dumps([{'path': str(path)}]), capture_output=True, text=True, env={**os.environ, 'GOWORK':'off', 'GOFLAGS':''})
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_all_existing_python_native_receipts_and_systemd_helper(self):
        registry = json.loads((SCRIPTS / 'docs-api-producer-adapter-authorities.json').read_text())
        checked = 0
        for contract in registry['nativeLanguageSerializationContracts']:
            if not contract['source'].endswith('.py'): continue
            outputs = self.python((ROOT / contract['source']).read_text())
            for record in contract['outputs']:
                actual = next(r for r in outputs if r['expression'] == record['expression'] and r['function'] == record['function'])
                self.assertEqual(hashlib.sha256(actual['operation'].encode()).hexdigest(), record['operationDigest'])
                if actual.get('systemdUnitFlow', {}).get('transform') == 'repair':
                    self.assertEqual(actual['systemdUnitFlow']['helperDigest'], '5509c7dbc386819dacddc95719508e034aa53c583c1d8e80cb9da99d1d9faf43')
                checked += 1
        self.assertEqual(checked, 5)

    def test_saved_cilium_whole_producer_recipe(self):
        source = 'scripts/verify-cilium-policies.py'
        registry = json.loads((SCRIPTS / 'docs-api-producer-adapter-authorities.json').read_text())
        expected = registry['sources'][source]['operationRecipe']['ast']
        self.assertEqual(receipt.serialize(ast.parse((ROOT / source).read_text()), source), expected)

    def test_sparse_representation_preserves_none_containers_and_context(self):
        self.assertEqual(receipt.serialize(ast.parse('x = [None, {}]')), "Module(body=[Assign(targets=[Name(id='x', ctx=Store())], value=List(elts=[Constant(value=None), Dict()], ctx=Load()))])")
        self.assertIn('kw_defaults=[None]', receipt.serialize(ast.parse('def f(*, x):\n pass')))
        self.assertIn("Constant(value=b'bytes')", receipt.serialize(ast.parse("x=b'bytes'")))
        self.assertIn('Constant(value=1j)', receipt.serialize(ast.parse('x=1j')))
        self.assertIn('keys=[None]', receipt.serialize(ast.parse('x = {**kw}')))
        self.assertNotEqual(receipt.serialize(ast.parse('x = []')), receipt.serialize(ast.parse('x = ()')))
        self.assertNotEqual(receipt.serialize(ast.Name(id='x', ctx=ast.Load())), receipt.serialize(ast.Name(id='x', ctx=ast.Store())))

    def test_semantic_changes_survive(self):
        pairs = [('f()', 'f(1)'), ('f()', 'f(**kw)'), ('import json', 'import other as json'),
                 ('if x:\n pass', 'if x:\n pass\nelse:\n pass'), ('def f():\n pass', '@d\ndef f():\n pass'),
                 ('x=1', 'x=2'), ('x=None', 'x="None"'), ('def f(x):\n pass', 'def f(x:int):\n pass'),
                 ('f(a,b)', 'f(b,a)'), ('f(None)', 'f()')]
        for a,b in pairs:
            with self.subTest(a=a,b=b): self.assertNotEqual(receipt.serialize(ast.parse(a)), receipt.serialize(ast.parse(b)))

    def test_unknown_nodes_fields_and_scalars_are_source_identified(self):
        class Future(ast.AST): _fields = ('meaning',)
        for value in (Future(meaning=1), ast.Constant(value=object())):
            with self.assertRaisesRegex(ValueError, 'actual-source.py'): receipt.serialize(value, 'actual-source.py')
        function = ast.parse('def f():\n pass').body[0]
        function.type_params = [ast.Name(id='T', ctx=ast.Load())]
        self.assertIn("type_params=[Name(id='T', ctx=Load())]", receipt.serialize(function))
        function.type_params = [Future(meaning=1)]
        with self.assertRaisesRegex(ValueError, 'unknown node Future'): receipt.serialize(function, 'actual-source.py')
        node = ast.parse('x=1'); node.new_semantic_field = 1
        with self.assertRaisesRegex(ValueError, 'unknown instance field'): receipt.serialize(node, 'actual-source.py')
        node = ast.Name(id='x', ctx=ast.Load()); node._fields = node._fields + ('new_field',); node.new_field = []
        with self.assertRaisesRegex(ValueError, 'unknown field'): receipt.serialize(node, 'actual-source.py')

    def test_cli_stdin_protocol(self):
        result = subprocess.run([sys.executable, str(SCRIPTS / 'docs-api-python-ast-v1.py'), '--stdin', 'original.py'], input='x=None', text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), receipt.serialize(ast.parse('x=None')))

    def test_python_documentation_declaration_custody(self):
        source = 'import json\nx = None\ndef f():\n return json.dumps(x)\n'
        result = subprocess.run([sys.executable, str(SCRIPTS / 'docs-api-python-ast-v1.py'), '--stdin-custody', 'original.py'], input=source, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        baseline = json.loads(result.stdout)
        self.assertEqual(baseline['protocol'], 'docs-python-ast-v1')
        self.assertEqual([r['kind'] for r in baseline['operations']], ['Import', 'Assign', 'FunctionDef'])
        changed = receipt.documentation_custody(ast.parse(source.replace('import json', 'import substitute as json')), 'original.py')
        self.assertNotEqual(baseline, changed)
        changed = receipt.documentation_custody(ast.parse(source.replace('return json.dumps(x)', 'return json.dumps({"kind":"Secret"})')), 'original.py')
        self.assertNotEqual(baseline, changed)

    def test_supervisor_import_sink_and_mutation_custody(self):
        source = (ROOT / 'ops/pod/supervisor.py').read_text()
        baseline = self.python(source)
        self.assertTrue(all(r['nativeStateQualified'] for r in baseline if r['function'] == 'status'))
        mutations = [source.replace('import json\n', 'import substitute_json as json\n'),
                     source.replace('from pathlib import Path', 'from substitute_path import Path'),
                     source.replace("state_file = Path('/tmp/codex-ops-status.json')", "state_file = CustomWriter()"),
                     source.replace('import time\n', 'import time\nimport substitute\n'),
                     source.replace('def main():', "def mutate():\n    json.dumps = other\n\ndef main():"),
                     source.replace('def main():', "def mutate():\n    setattr(json, 'dumps', other)\n\ndef main():")]
        for changed in mutations:
            with self.subTest(changed=changed[:50]):
                outputs = self.python(changed)
                self.assertTrue(all(r['nativeStateQualified'] is False for r in outputs if r['function'] == 'status'))
                self.assertEqual(next(r['operation'] for r in baseline if r['function']=='status'), next(r['operation'] for r in outputs if r['function']=='status'))

    def test_imported_serializer_reflection_alias_mutation_and_escape_family(self):
        supervisor = (ROOT / 'ops/pod/supervisor.py').read_text()
        inspector = (ROOT / 'scripts/inspect-data-plane-mtls.py').read_text()
        snippets = [
            "codec = json; setattr(codec, 'dumps', other)",
            "codec = json; codec.__dict__['dumps'] = other",
            "setter = setattr; setter(json, 'dumps', other)",
            "codec = json; setter = setattr; setter(codec, 'dumps', other)",
            "codec = json; escape(codec)",
            "escape({'codec': json})",
            "reflector = getattr; reflector(json, 'dumps')",
            "json.__dict__.update({'dumps': other})",
            "codec = json; del codec.dumps",
            "import importlib; importlib.import_module('json').dumps = other",
            "import sys; sys.modules['json'].dumps = other",
            "import substitute",
            "import builtins; builtins.setattr(json, 'dumps', other)",
        ]
        baseline = self.python(supervisor)
        original = next(r['operation'] for r in baseline if r['function'] == 'status')
        for snippet in snippets:
            with self.subTest(snippet=snippet):
                changed = supervisor.replace('def shutdown(', 'def added():\n    ' + snippet + '\n\ndef shutdown(')
                records = self.python(changed)
                status = [r for r in records if r['function'] == 'status']
                self.assertTrue(status and all(not r['nativeStateQualified'] for r in status))
                self.assertEqual(status[0]['operation'], original)
                self.assertTrue(any(r.get('gap') == 'imported-capability-state-unqualified' for r in records))
                records = self.python(inspector.replace('import json\n', 'import json\n' + snippet + '\n'))
                self.assertTrue(any(r.get('gap') == 'imported-capability-state-unqualified' for r in records))
                self.assertTrue(all(r['role'] != 'non-api' for r in records))

    def test_global_nonlocal_and_frame_namespace_custody(self):
        supervisor = (ROOT / 'ops/pod/supervisor.py').read_text()
        inspector = (ROOT / 'scripts/inspect-data-plane-mtls.py').read_text()
        snippets = [
            "global json; json.JSONEncoder.encode = other",
            "global json; json = other",
            "global codec; codec = json; codec.JSONEncoder.encode = other",
            "import sys; sys._getframe().f_globals['json'].JSONEncoder.encode = other",
            "import sys as frames; frame = frames._getframe; frame().f_globals['json'].JSONEncoder.encode = other",
            "import sys; namespace = sys._getframe().f_globals; namespace['json'].JSONEncoder.encode = other",
            "import sys; frame = sys._getframe(); frame.f_locals['json'] = other",
            "import sys; sys._current_frames()",
        ]
        for snippet in snippets:
            for source, anchor in ((supervisor, 'def shutdown('), (inspector, 'def main(')):
                changed = source.replace(anchor, 'def sabotage():\n    ' + snippet + '\n\n' + anchor)
                records = self.python(changed)
                with self.subTest(snippet=snippet, anchor=anchor):
                    self.assertTrue(any(r.get('gap') == 'imported-capability-state-unqualified' and r.get('sourceIdentity') for r in records))
                    if anchor == 'def shutdown(':
                        self.assertTrue(all(not r['nativeStateQualified'] for r in records if r['function']=='status'))
                    else:
                        self.assertTrue(all(r['role'] != 'non-api' for r in records))
        records = self.python('import json\ndef outer():\n codec = json\n def inner():\n  nonlocal codec\n  codec.JSONEncoder.encode = other\n print(json.dumps({"report": True}))\n')
        self.assertTrue(any(r.get('gap') == 'imported-capability-state-unqualified' for r in records))
        # Read-only Global is finite and must not turn an import into unknown.
        records = self.python('import json\ndef emit():\n global json\n print(json.dumps({"report": True}))\n')
        self.assertTrue(records and all(r['role']=='non-api' for r in records))

    def test_go_stdlib_output_wrappers_keep_publication_and_escape_custody(self):
        api = '`{"apiVersion":"v1","kind":"Secret"}`'
        bodies = [
            'func main(){log.SetFlags(0);log.SetPrefix("");log.Print('+api+')}',
            'func main(){emit:=log.Print;emit('+api+')}',
            'var emit=log.Print;func main(){emit('+api+')}',
            'func relay(f func(...any)){f('+api+')};func main(){relay(log.Print)}',
            'func main(){logger:=log.New(os.Stderr,"",0);logger.Print('+api+')}',
            'func main(){box:=struct{emit func(...any)}{log.Print};box.emit('+api+')}',
            'func handler(w http.ResponseWriter,r *http.Request){http.Error(w,'+api+',http.StatusOK)};func main(){http.HandleFunc("/",handler)}',
            'var emit=http.Error;func handler(w http.ResponseWriter,r *http.Request){emit(w,'+api+',200)}',
            'func relay(f func(http.ResponseWriter,string,int)){};func main(){relay(http.Error)}',
            'func handler(w http.ResponseWriter,r *http.Request){emit:=http.Error;emit=other;emit(w,'+api+',200)}',
        ]
        for body in bodies:
            with self.subTest(body=body):
                records = self.go_records('package main\nimport("log";"os";"net/http")\n'+body)
                self.assertTrue(records and any(r['role']=='unknown' for r in records))
        for imports,body in [('logger "log"','func main(){emit:=logger.Print;emit('+api+')}'),('. "log"','func main(){Print('+api+')}'),('web "net/http"','func handler(w web.ResponseWriter){web.Error(w,'+api+',200)}'),('. "net/http"','func handler(w ResponseWriter){Error(w,'+api+',200)}')]:
            records=self.go_records('package main\nimport '+imports+'\n'+body)
            self.assertTrue(records and any(r['role']=='unknown' for r in records))
        fixed=self.go_records('package main\nimport "net/http"\nfunc handler(w http.ResponseWriter){http.Error(w,"fixed application code",400)}')
        self.assertTrue(fixed and all(r['role']=='non-api' for r in fixed))

    def test_all_python_lexical_capture_sites_shadow_import_authority(self):
        cases = [
            'try:\n raise failure\nexcept CodecError as json:\n print(json.dumps({"report": True}))',
            'match value:\n case json:\n  print(json.dumps({"report": True}))',
            'match value:\n case Codec() as json:\n  print(json.dumps({"report": True}))',
            'match value:\n case [*json]:\n  print(json.dumps({"report": True}))',
            'match value:\n case {"codec": json}:\n  print(json.dumps({"report": True}))',
            'match value:\n case {"codec": other, **json}:\n  print(json.dumps({"report": True}))',
            'with manager as json:\n print(json.dumps({"report": True}))',
            'def emit():\n async def inner():\n  async with manager as json:\n   print(json.dumps({"report": True}))',
            'print([json.dumps({"report": True}) for json in codecs])',
            'print({json.dumps({"report": True}) for json in codecs})',
            'print({key: json.dumps({"report": True}) for key,json in codecs})',
            'print(tuple(json.dumps({"report": True}) for json in codecs))',
            '[(json := codec) for codec in codecs]\nprint(json.dumps({"report": True}))',
            'def emit():\n del json\n print(json.dumps({"report": True}))',
        ]
        for body in cases:
            with self.subTest(body=body):
                records=self.python('import json\n'+body+'\n')
                self.assertTrue(records and any(record['role']=='unknown' for record in records))
        for body in ['try:\n raise failure\nexcept CodecError as issue:\n print(json.dumps({"report": True}))','match value:\n case other:\n  print(json.dumps({"report": True}))','with manager as other:\n print(json.dumps({"report": True}))','[item for item in values]\nprint(json.dumps({"report": True}))']:
            records=self.python('import json\n'+body+'\n');self.assertTrue(records and all(record['role']=='non-api' for record in records))
        # A comprehension target is local to the comprehension, not a module
        # replacement of the imported serializer used by the following output.
        records=self.python('import json\n[json for json in codecs]\nprint(json.dumps({"report": True}))\n')
        self.assertTrue(records and all(record['role']=='non-api' for record in records))

    def test_definition_inputs_and_class_namespaces_have_finite_lexical_owners(self):
        fake='class Counterfeit:\n def dumps(self,value):\n  return \'{"apiVersion":"v1","kind":"Secret"}\'\n'
        for body in ['json=Counterfeit()\nclass Reporter:\n json=codec\n def emit(self):\n  print(json.dumps({"report":True}))\nReporter().emit()', 'json=Counterfeit()\nclass Outer:\n json=codec\n class Inner:\n  print(json.dumps({"report":True}))', 'json=Counterfeit()\nclass Reporter:\n json=codec\n values=[json.dumps({"report":True}) for item in values]']:
            records=self.python('import json as codec\n'+fake+body+'\n');self.assertTrue(records and any(record['role']=='unknown' for record in records))
        for body in ['class Reporter:\n json=Counterfeit()\n def emit(self):\n  print(json.dumps({"report":True}))', 'def emit(json=print(json.dumps({"report":True}))):\n pass', 'class Reporter:\n json=codec\n def emit(value=print(json.dumps({"report":True}))):\n  pass', 'class Reporter:\n json=codec\n values=[item for item in json.dumps({"report":True})]']:
            records=self.python('import json\nimport json as codec\n'+fake+body+'\n');self.assertTrue(records and all(record['role']=='non-api' for record in records))

    def test_unreviewed_generic_lexical_binders_reject_source_identified(self):
        path=self.base/'unreviewed-generic.py'
        for body in ('def emit[json]():\n print(json.dumps({"report": True}))', 'type json = Codec\nprint(json.dumps({"report": True}))'):
            path.write_text('import json\n'+body+'\n')
            result=subprocess.run([sys.executable,str(SCRIPTS/'docs-api-python-output-adapter.py'),str(path),'--classify'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('API_PRODUCT_PYTHON_AST_UNQUALIFIED',result.stderr)
            self.assertIn(str(path),result.stderr)
            self.assertRegex(result.stderr,'unknown node (TypeVar|TypeAlias)')

    def test_go_private_parameter_authority_requires_closed_references_and_no_mutation(self):
        api='`{"apiVersion":"v1","kind":"Secret"}`'
        prefix='package main\nimport("net/http";"os")\n'
        helper='func emit(w http.ResponseWriter,text string){http.Error(w,text,200)}\n'
        direct='func ordinary(w http.ResponseWriter){emit(w,"ordinary text")}\n'
        escapes=[
            'func handler(w http.ResponseWriter){callback:=emit;callback(w,'+api+')}',
            'var callback=emit;func handler(w http.ResponseWriter){callback(w,'+api+')}',
            'func relay(f func(http.ResponseWriter,string)){};func caller(){relay(emit)}',
            'func factory()func(http.ResponseWriter,string){return emit}',
            'var box=struct{emit func(http.ResponseWriter,string)}{emit}',
            'var callbacks=[]func(http.ResponseWriter,string){emit}',
            'func handler(w http.ResponseWriter){(emit)(w,'+api+')}',
            'func handler(w http.ResponseWriter){emit(w,os.Args[1])}',
        ]
        for escape in escapes:
            with self.subTest(escape=escape):
                records=self.go_records(prefix+helper+direct+escape)
                self.assertTrue(any(record['expression']=='http.Error(w, text, 200)' and record['role']=='unknown' for record in records))
        mutations=['text="first";text='+api+';', 'text='+api+';', 'ptr:=&text;*ptr='+api+';', 'alter(&text);', 'text += os.Args[1];']
        for mutation in mutations:
            records=self.go_records(prefix+helper.replace('http.Error',mutation+'http.Error')+direct)
            self.assertTrue(any(record['expression']=='http.Error(w, text, 200)' and record['role']=='unknown' for record in records))
        records=self.go_records(prefix+helper.replace('http.Error(w,text,200)','http.Error(w,text,200);text="ordinary text"')+'func caller(w http.ResponseWriter){emit(w,'+api+')}')
        self.assertTrue(any(record['role']=='unknown' for record in records))
        variadic=self.go_records('package main\nimport "fmt"\nfunc emit(text ...string){fmt.Print(text)}\nfunc caller(){emit("ordinary",'+api+')}')
        self.assertTrue(variadic and all(record['role']=='unknown' for record in variadic))
        safe=self.go_records(prefix+helper+direct+'func other(w http.ResponseWriter){emit(w,"ordinary text")}')
        self.assertTrue(safe and all(record['role']=='non-api' for record in safe))

    def test_immutable_serializer_alias_remains_finite(self):
        records = self.python('import json\ncodec = json\nserialize = codec.dumps\nprint(serialize({"report": True}))\n')
        self.assertTrue(records and all(r['role'] == 'non-api' for r in records))

    def test_patch_closed_source_grammar_before_execution(self):
        source = (ROOT / 'scripts/align-spire-webhook-order.py').read_text()
        baseline = self.python(source)
        selected = next(r for r in baseline if r['role'] == 'api-patch')
        self.assertEqual(len(selected['patchOperations']), 4)
        changed = source.replace('{"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},', '{"op": "move", "from": "/webhooks/1", "path": "/webhooks/0"},\n        {"op": "add", "path": "/metadata/labels/test", "value": "supported"},')
        self.assertEqual(len(next(r for r in self.python(changed) if r['role']=='api-patch')['patchOperations']), 5)
        sentinel = self.base / 'must-not-exist'
        attacks = [
            "json.__builtins__['open'](" + repr(str(sentinel)) + ", 'w').write('escape')",
            "codec = json; codec.__dict__['dumps'] = other",
            "setter = setattr; setter(json, 'dumps', other)",
            "json.dumps.__globals__['__builtins__']['open'](" + repr(str(sentinel)) + ", 'w')",
        ]
        for attack in attacks:
            path = self.base / 'changed-patch.py'
            path.write_text(source.replace('def main():', 'def main():\n    ' + attack))
            for mode in ('--classify', '--patch'):
                with self.subTest(attack=attack, mode=mode):
                    result = subprocess.run([sys.executable, str(SCRIPTS / 'docs-api-python-output-adapter.py'), str(path), mode], text=True, capture_output=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('API_PRODUCT_PYTHON_PATCH_SOURCE_UNQUALIFIED', result.stderr)
                    self.assertIn(str(path), result.stderr)
                    self.assertFalse(sentinel.exists())
        for mutation in ('def extra():\n    pass\n', "extra = json.__dict__\n"):
            path.write_text(source + '\n' + mutation)
            result = subprocess.run([sys.executable, str(SCRIPTS / 'docs-api-python-output-adapter.py'), str(path), '--patch'], capture_output=True,text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('API_PRODUCT_PYTHON_PATCH_SOURCE_UNQUALIFIED', result.stderr)

    def test_go_guarded_error_lexical_custody_and_external_boundary(self):
        source = 'package main\nimport("fmt";"os";"github.com/cilium/cilium/hubble/cmd")\nfunc main(){if err:=cmd.Execute();err!=nil{fmt.Fprintln(os.Stderr,err.Error());os.Exit(1)}}'
        module = 'module custody.test/native\nrequire github.com/cilium/cilium v1.20.1\n'
        baseline = self.go_records(source, module)[0]
        self.assertTrue(baseline['diagnosticQualified'])
        self.assertFalse(baseline['authorityQualified'])
        self.assertIn('unsupported external error-result authority', ' '.join(baseline['authorityIssues']))
        for changed in [source.replace('fmt.Fprintln', 'err = malicious(); fmt.Fprintln'), source.replace('fmt.Fprintln', 'err := malicious(); fmt.Fprintln'), source.replace('cmd.Execute()', 'malicious()')]:
            with self.subTest(changed=changed): self.assertFalse(self.go_records(changed, module)[0].get('diagnosticQualified', False))
        symbols = {r['symbol'] for r in baseline['dependencies']}
        self.assertTrue({'cmd','fmt','os','module-authority:go.mod'} <= symbols)

    def test_go_documentation_declaration_custody_preserves_changes(self):
        if not self.go: self.skipTest('actual Go binary unavailable; set KUBECLAW_DOCS_GO_BINARY')
        path = self.base / 'tool.go'
        path.write_text('package main\nimport "fmt"\nfunc main(){fmt.Println("ordinary diagnostic")}')
        result = subprocess.run([str(self.binary), '--documentation-custody', str(path)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        baseline = json.loads(result.stdout)
        self.assertEqual(baseline['protocol'], 'docs-go-custody-v1')
        self.assertEqual([r['kind'] for r in baseline['operations']], ['package', 'import', 'function'])
        path.write_text(path.read_text().replace('ordinary diagnostic', '{"kind":"Secret"}').replace('fmt.Println("{', 'fmt.Println(`{').replace('Secret"}")', 'Secret"}`)'))
        changed = subprocess.run([str(self.binary), '--documentation-custody', str(path)], capture_output=True, text=True)
        self.assertEqual(changed.returncode, 0, changed.stderr)
        self.assertNotEqual(baseline, json.loads(changed.stdout))

    def test_go_module_import_sum_and_workspace_authority(self):
        source='package main\nimport("encoding/json";"fmt")\nfunc main(){v,_:=json.Marshal(1);fmt.Println(string(v))}'
        baseline = self.go_records(source)[0]
        self.assertTrue(baseline['authorityQualified'])
        changed = self.go_records(source, extra={'go.sum':'selected module authority\n'})[0]
        self.assertIn('module-authority:go.sum', {r['symbol'] for r in changed['dependencies']})
        replaced = self.go_records(source, 'module custody.test/native\nreplace selected.test/m => ../replacement\n')[0]
        self.assertFalse(replaced['authorityQualified'])
        self.assertIn('unsupported replace authority', ' '.join(replaced['authorityIssues']))
        excluded = self.go_records(source, 'module custody.test/native\nexclude selected.test/m v1.0.0\n')[0]
        self.assertFalse(excluded['authorityQualified'])
        tab_replace = self.go_records(source, 'module custody.test/native\nreplace\tselected.test/m => ../replacement\n')[0]
        self.assertFalse(tab_replace['authorityQualified'])
        imported = self.go_records(source.replace('"encoding/json"', 'json "selected.test/substitute"'))[0]
        self.assertFalse(imported['authorityQualified'])
        self.assertIn('unsupported imported authority', ' '.join(imported['authorityIssues']))
        vanished = self.go_records('package main\nimport fmt "selected.test/substitute"\nfunc main(){fmt.Fprintln(nil, "ordinary")}')
        self.assertTrue(any(r['expression']=='<unsupported-import-module-authority>' for r in vanished))
        workspace = self.go_records(source, extra={'go.work':'go 1.22\nuse .\n'})[0]
        self.assertFalse(workspace['authorityQualified'])
        self.assertIn('module-authority:go.work', {r['symbol'] for r in workspace['dependencies']})

    def test_actual_canonicalizer_source_checksum_and_caller_control(self):
        source = (ROOT / 'contracts/pipeline-observability/v1/go/types.go').read_text()
        module = (ROOT / 'contracts/pipeline-observability/v1/go/go.mod').read_text()
        sums = (ROOT / 'contracts/pipeline-observability/v1/go/go.sum').read_text()
        cache = os.environ.get('GOMODCACHE')
        relative = 'github.com/cyberphone/json-canonicalization@v0.0.0-20241213102144-19d51d7fe467/go/src/webpki.org/jsoncanonicalizer'
        # Positive source custody requires actual ordinary-downloaded module
        # bytes, never fabricated Transform bodies or a silent skipped test.
        self.assertTrue(cache and (Path(cache) / relative).is_dir(), 'set GOMODCACHE to genuinely acquired selected canonicalizer source')
        selected = self.base / 'external-cache'
        directory = selected / relative
        shutil.copytree(Path(cache) / relative, directory)
        directory.chmod(0o755)
        for copied in directory.iterdir(): copied.chmod(0o644)
        def records(text=source, checksum=sums):
            with patch.dict(os.environ, {'GOMODCACHE':str(selected)}):
                return self.go_records(text, module, {'go.sum':checksum})
        baseline = records()
        self.assertTrue(baseline and all(r['authorityQualified'] for r in baseline))
        receipts = baseline[0]['externalAuthoritySources']
        self.assertEqual({r['sha256'] for r in receipts}, {'f77ac1b1e62ca9ab063cc558702ab830a0e6442fe71659d34d63897ea9c4e1ac','a5f31e4411d030c309b79d865329d02f90deeaabb9e926ceb0399cf053541e8c'})
        self.assertTrue(all(r['semantics']=='valid-json-error-checked-root-key-preservation-v1' for r in receipts))
        self.assertEqual(len(baseline[0]['externalAuthorityDependencies']), 3)
        original_operation = next(r['operation'] for r in baseline if r['function']=='EncodeCanonical')
        for changed in [source.replace('return nil, err', 'return raw, nil'), source.replace('return jsoncanonicalizer.Transform(raw)', 'result, _ := jsoncanonicalizer.Transform(raw); return result, nil'), source + '\nfunc ignoredError(raw []byte) []byte { value, _ := jsoncanonicalizer.Transform(raw); return value }\n']:
            self.assertTrue(any(not r['authorityQualified'] for r in records(changed)))
        changed = records(checksum=sums.replace('uX1JmpONuD549D73', 'changed'))
        self.assertFalse(changed[0]['authorityQualified'])
        self.assertEqual(next(r['operation'] for r in changed if r['function']=='EncodeCanonical'), original_operation)
        path = directory / 'jsoncanonicalizer.go'; original = path.read_bytes()
        path.write_bytes(original.replace(b'func Transform(', b'func Substitute('))
        self.assertTrue(any(not r['authorityQualified'] for r in records()))
        path.write_bytes(original)
        extra = directory / 'extra.go'; extra.write_text('package jsoncanonicalizer\nfunc init() {}\n')
        self.assertTrue(any(not r['authorityQualified'] for r in records()))
        extra.unlink(); path.unlink()
        self.assertTrue(any(not r['authorityQualified'] for r in records()))

    def test_actual_encodecanonical_consumer_checked_error_control(self):
        source = (ROOT / 'contracts/pipeline-observability/v1/go/fixturecheck/main.go').read_text()
        # Missing supplied local declaration authority stays rejected; consumer
        # control rejection is independent and still names the changed caller.
        unchanged = self.go_records(source)
        self.assertFalse(any('unreviewed EncodeCanonical consumer' in ' '.join(r.get('authorityIssues', [])) for r in unchanged))
        changed = self.go_records(source.replace('if err != nil {\n\t\tpanic(err)\n\t}\n\tif !bytes.Equal(canonical,', 'if false {\n\t\tpanic(err)\n\t}\n\tif !bytes.Equal(canonical,'))
        self.assertTrue(any('unreviewed EncodeCanonical consumer' in ' '.join(r.get('authorityIssues', [])) for r in changed))


    def test_go_actual_defined_type_dispatch_is_not_erased(self):
        for method in ('String', 'Error', 'Format'):
            receiver = ('func(message) Format(s fmt.State,v rune){s.Write([]byte(`{"apiVersion":"v1","kind":"Secret"}`))}' if method == 'Format' else 'func(message) '+method+'() string{return `{"apiVersion":"v1","kind":"Secret"}`}')
            bodies = [
                'func emit(text message){fmt.Fprintln(os.Stdout,text)}\nfunc main(){emit("ordinary diagnostic")}',
                'func main(){var text message="ordinary diagnostic";fmt.Fprintln(os.Stdout,text)}',
                'func main(){const text message="ordinary diagnostic";fmt.Fprintln(os.Stdout,text)}',
                'type alias = message\nfunc emit(text alias){fmt.Fprintln(os.Stdout,text)}\nfunc main(){emit("ordinary diagnostic")}',
                'func main(){var text message="ordinary diagnostic";alias:=text;fmt.Fprintln(os.Stdout,alias)}',
                'func main(){fmt.Fprintln(os.Stdout,message("ordinary diagnostic"))}',
            ]
            for body in bodies:
                with self.subTest(method=method, body=body):
                    source='package main\nimport("fmt";"os")\ntype message string\n'+receiver+'\n'+body
                    records=self.go_records(source)
                    self.assertEqual(next(r for r in records if r['expression'].startswith('fmt.Fprintln'))['role'], 'unknown')
            for body in bodies[:5]:
                with self.subTest(plain=method,body=body):
                    records=self.go_records('package main\nimport("fmt";"os")\ntype message string\n'+body)
                    self.assertEqual(next(r for r in records if r['expression'].startswith('fmt.Fprintln'))['role'], 'non-api')

    def test_go_named_map_serializer_dispatch_cannot_borrow_frozen_root(self):
        baseline='package main\nimport("bytes";"encoding/json";"io")\ntype document map[string]interface{}\nfunc requestPayload(body interface{})(io.Reader,error){if body==nil{return nil,nil};data,err:=json.Marshal(body);if err!=nil{return nil,err};return bytes.NewReader(data),nil}\nfunc caller()(io.Reader,error){var value document=map[string]interface{}{"apiVersion":"v1","kind":"ConfigMap"};return requestPayload(value)}\n'
        records=self.go_records(baseline)
        self.assertTrue(next(r for r in records if r['function']=='requestPayload')['transportBodyQualified'])
        for method in ('func(document) MarshalJSON()([]byte,error){return []byte(`{"apiVersion":"v1","kind":"Secret"}`),nil}', 'func(*document) MarshalJSON()([]byte,error){return []byte(`{"apiVersion":"v1","kind":"Secret"}`),nil}', 'func(document) MarshalText()([]byte,error){return []byte(`Secret`),nil}'):
            changed=self.go_records(baseline+method)
            record=next(r for r in changed if r['function']=='requestPayload')
            self.assertFalse(record['transportBodyQualified'])
            self.assertEqual(record['operation'],next(r for r in records if r['function']=='requestPayload')['operation'])
        # Implicit typed parameters and alias names retain method authority too.
        altered=baseline.replace('var value document=map[string]interface{}{"apiVersion":"v1","kind":"ConfigMap"};return requestPayload(value)', 'return helper(map[string]interface{}{"apiVersion":"v1","kind":"ConfigMap"})')+'\nfunc helper(value document)(io.Reader,error){return requestPayload(value)}\nfunc(document) MarshalJSON()([]byte,error){return nil,nil}'
        self.assertFalse(next(r for r in self.go_records(altered) if r['function']=='requestPayload')['transportBodyQualified'])

    def test_python_serializer_options_are_shared_call_authority(self):
        encoder='import json\nimport sys\nclass Counterfeit:\n def __init__(self,**options):pass\n def encode(self,value):return \'{"apiVersion":"v1","kind":"Secret"}\'\n def iterencode(self,value):return [self.encode(value)]\n'
        for call in ['json.dumps({"report":True},cls=Counterfeit)', 'json.dumps({"report":True},**{"cls":Counterfeit})', 'json.dump({"report":True},sys.stdout,cls=Counterfeit)', 'json.dumps({"report":True},default=Counterfeit)', 'json.dumps({"report":True},**options)']:
            source=encoder+(call if call.startswith('json.dump(') else 'print('+call+')')
            records=self.python(source)
            self.assertTrue(records)
            self.assertTrue(all(r['role']=='unknown' for r in records))
            self.assertTrue(any(r.get('gap')=='serializer-option-authority-unqualified' and r.get('sourceIdentity') for r in records))
        for options in ['indent=2,sort_keys=True','indent="  ",ensure_ascii=False,allow_nan=False','separators=(",",":"),cls=None,default=None', '**{"indent":2,"sort_keys":True}', '**options']:
            source='import json\noptions={"indent":2}\nprint(json.dumps({"report":True},'+options+'))'
            self.assertTrue(all(r['role']=='non-api' for r in self.python(source)))
        for options in ['separators=(\',\', \':false,"apiVersion":"v1","kind":\')', "indent='not whitespace'"]:
            self.assertTrue(all(r['role']=='unknown' for r in self.python('import json\nprint(json.dumps({"report":"Secret"},'+options+'))')))
        for escape in ['box=[options];box[0]["cls"]=other', 'def callback(): return options', 'change(options)']:
            source='import json\noptions={"indent":2}\n'+escape+'\nprint(json.dumps({"report":True},**options))'
            self.assertTrue(all(r['role']=='unknown' for r in self.python(source)))
        mutated='import json\noptions={"indent":2}\noptions["cls"]=other\nprint(json.dumps({"report":True},**options))'
        self.assertTrue(all(r['role']=='unknown' for r in self.python(mutated)))

if __name__ == '__main__': unittest.main(verbosity=2)
