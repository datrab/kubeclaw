"""Independent conservative scope enumeration. Candidate obligations != semantic PASS.
Traverses every tracked source, not author filters. Never emits setting values.
"""
import pathlib,subprocess,json,re,hashlib,yaml,collections
root=pathlib.Path.cwd(); out=root/'docs/review/evidence/config-acceptance/independent'
paths=subprocess.check_output(['git','ls-files','-z']).decode().split('\0'); paths=[p for p in paths if p]
inv=json.loads((root/'docs/review/remediation/config-semantic-inventory.json').read_text()); matrix=json.loads((root/'docs/review/remediation/config-acceptance-matrix.json').read_text())
rows=inv['rows']; rowpaths=collections.defaultdict(list)
for r in rows: rowpaths[r.get('source',{}).get('path')].append(r)
def sha(b):return hashlib.sha256(b).hexdigest()
def norm(s):return str(s).removeprefix('#/').strip('/').replace('/properties/','.').replace('properties/','').replace('/','.')
def leaves(v,p=''):
 if isinstance(v,dict) and v:
  for k,x in v.items(): yield from leaves(x,p+'.'+str(k) if p else str(k))
 elif isinstance(v,list) and v:
  yield p # array obligation: members deliberately not exported
 else:yield p
sources=[]; obligations=[]; readerrors=[]
def add(path,kind,field,line=None):
 exact=[r['id'] for r in rowpaths[path] if norm(r['source']['field'])==norm(field)]
 obligations.append({'path':path,'kind':kind,'field':field,'line':line,'coveredExactSettingIds':exact,'disposition':'exact-row-present-needs-semantic-review' if exact else 'independent-unresolved'})
for p in paths:
 q=root/p
 if not q.exists():readerrors.append(p);continue
 b=q.read_bytes(); text=b.decode('utf8',errors='replace'); symlink=q.is_symlink()
 historical=p.startswith('docs/review/')
 test=bool(re.search(r'(^|/)(tests?|fixtures?|examples?|spikes)(/|\.)|_test\.go$|\.test\.',p))
 source=not historical and (q.suffix in ['.ts','.mts','.js','.mjs','.cjs','.go','.sh','.yaml','.yml','.json','.tpl'] or 'Dockerfile' in q.name or p=='.dockerignore')
 sources.append({'path':p,'sha256':sha(b),'symlink':symlink,'trackedContentMode':'symlink-target-bytes' if symlink else 'file','boundary':'historical-evidence/docs' if historical else 'test/example-candidate-delivery-check-required' if test else 'source-or-author-candidate' if source else 'other-source-independent-disposition-required','primaryRowIds':[r['id'] for r in rowpaths[p]]})
 if not source:continue
 if q.suffix in ['.json','.yaml','.yml'] and 'lock' not in q.name:
  try:
   documents=[json.loads(text)] if q.suffix=='.json' else list(yaml.safe_load_all(text))
   for i,v in enumerate(documents):
    for f in leaves(v):add(p,'schema-document-leaf' if 'schema' in q.name else 'author-or-data-leaf',f)
  except Exception as e:readerrors.append({'path':p,'reason':type(e).__name__})
 for n,line in enumerate(text.splitlines(),1):
  # Includes Go helpers, dynamic calls, shell expansions, Docker ENV/ARG,
  # templates with embedded JS and CLI annotations. Text is not emitted.
  for m in re.finditer(r'(?:process\.env|environment|env)\s*(?:\.([A-Z][A-Z0-9_]*)|\[\s*[\'"`]([A-Z][A-Z0-9_]*)[\'"`]\s*\])|(?:os\.(?:Getenv|LookupEnv)|\benv(?:Int|Bool|Duration)?|\bgetenvFile|\brequired(?:Environment|Env)?)\s*\(\s*[\'"`]([A-Z][A-Z0-9_]*)[\'"`]|\$\{([A-Z][A-Z0-9_]*)[^}]*\}|^\s*(?:ENV|ARG)\s+([A-Z][A-Z0-9_]*)',line):
   add(p,'environment-reader-or-author',next(x for x in m.groups() if x),n)
  if re.search(r'(?:process\.env|environment|env)\s*\[\s*[^\'"`\s]|\b(?:envInt|env|os\.Getenv)\s*\(\s*[^\'"`\s]|\$\{!',line):add(p,'dynamic-environment-map','line:'+str(n),n)
  if re.search(r'\?\?|\|\||\bdefault\b|\bDEFAULT_|\b(?:setTimeout|setInterval|time\.Sleep)\s*\(|\b(?:const|let|var)\s+[A-Z_][A-Z_0-9]+\s*=|flag\.(?:String|Int|Duration)|--[a-z][a-z-]+',line):add(p,'literal-default-cli-invariant-or-task-candidate','line:'+str(n),n)
sourceids={r['id'] for r in rows}; linked={i for c in matrix['cases'] for i in c.get('settingIds',[])}
expected_cases=[]
# Independently declared full gate obligations, not author-generated case IDs.
for r in rows:
 if r.get('class',r.get('classification'))=='operator-setting':
  for suffix in ['distinct-valid-profile-real-consumer','missing-required-or-explicit-inactive','wrong-type-unit-domain','unknown-key-owner','competing-author-even-equal','fallback-semantic-mutation','activation-boundary','recovery-deadline-budget','explain-provenance-redaction']:
   expected_cases.append({'id':'IC0-'+r['id']+'-'+suffix,'settingId':r['id'],'status':'requires-explicit-case-disposition'})
globals=['reference-escape-and-duplicate','shared-binding-cross-field-budget-conflict','config-only-ci-input','docker-complete-config-set','both-helm-complete-generation','real-role-package-callers','release-guard-drift','module-before-bind-crash','module-after-bind-before-dispatch-crash','module-after-dispatch-uncertain-effect','concurrent-module-start-publication-A-or-B','started-module-A-unstarted-module-B','invalid-generation-no-partial-or-fallback','fixed-Eval-generation-all-units','repair-and-technical-retry-no-budget-reset','wait-resume-and-cancel-cleanup-original-closure','missing-historical-closure-reject','retired-or-revoked-secret-revision','legacy-versioned-run-contract','free-graph-explicit-membership','run-scoped-adapter-observer-lifetime','C1-exact-boundary-value-preserving-delta','old-filename-source-rejection','F-CODE-owner-dependency-map','F-DOC-current-link-consistency']
summary={'identity':{'head':subprocess.check_output(['git','rev-parse','HEAD']).decode().strip(),'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}']).decode().strip()},'trackedSources':len(sources),'candidateObligations':len(obligations),'byKind':dict(collections.Counter(o['kind'] for o in obligations)),'exactFieldMatches':sum(bool(o['coveredExactSettingIds']) for o in obligations),'inventoryRows':len(rows),'matrixCases':len(matrix['cases']),'rowsWithoutCaseLinkFromMatrix':sorted(sourceids-linked),'readErrors':readerrors,'warning':'Conservative lexical/data superset. No candidate is excluded by scanner alone; false positives and delivery-copied tests require semantic disposition. Exact field match does not prove contract correctness. Schema leaves include keywords; logical refs must also be checked.'}
for name,data in [('source-roster',sources),('expected-field-obligations',obligations),('expected-case-obligations',{'fieldCases':expected_cases,'globalCases':['IC0-GLOBAL-'+x for x in globals]}),('scope-summary',summary)]: (out/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps(summary,indent=2))
