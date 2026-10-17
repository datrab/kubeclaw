"""Remaining exact Docker ARG contracts; static definitions, never builds/PASS."""
import pathlib,json,hashlib,copy
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4]
v=json.loads((out/'inventory-fragment.json').read_text());cases=json.loads((out/'proposed-cases.json').read_text());sources={s['path']:s for s in v['sources']};records=[];resolved=[]
def ref(f,id):
 h=hashlib.sha256((repo/f).read_bytes()).hexdigest()
 if f not in sources:sources[f]={'path':f,'sha256':h,'settingIds':[],'disposition':'exact productive image dependency/platform/hash/source consumer inspected; does not close all other literals in file'}
 if id not in sources[f]['settingIds']:sources[f]['settingIds'].append(id)
 return {'path':f,'sha256':h}
# URL/format/installation names are the actual current Docker consumers, not a generic version domain.
tools={
'GO':('https://go.dev/dl/go${GO_VERSION}.linux-${arch}.tar.gz','tar -C /usr/local; PATH /usr/local/go/bin; GOTOOLCHAIN=local',['docker/go-tools/go.mod','docker/go-tools/go.sum','docker/go-tools/requirements.json']),
'HADOLINT':('https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-${hadolint_arch}','install /usr/local/bin/hadolint; --version',[]),
'SHFMT':('https://github.com/mvdan/sh/releases/download/v${SHFMT_VERSION}/shfmt_v${SHFMT_VERSION}_linux_${arch}','install /usr/local/bin/shfmt; --version',[]),
'TERRAFORM':('https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${arch}.zip','unzip; install /usr/local/bin/terraform; version -json; pre-provisioned provider mirror is separate',[]),
'TFLINT':('https://github.com/terraform-linters/tflint/releases/download/v${TFLINT_VERSION}/tflint_linux_${arch}.zip','unzip; install /usr/local/bin/tflint; --version',[]),
'TRIVY':('https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${trivy_arch}.tar.gz','tar to /usr/local/bin/trivy; --version; database scanner compatibility separate',[]),
'KUBECONFORM':('https://github.com/yannh/kubeconform/releases/download/v${KUBECONFORM_VERSION}/kubeconform-linux-${arch}.tar.gz','tar to /usr/local/bin/kubeconform; -v; offline selected schema tree separate',[]),
'KUBECTL':('https://dl.k8s.io/release/v${KUBECTL_VERSION}/bin/linux/${arch}/kubectl','install /usr/local/bin/kubectl; version --client=true; pin is not deployed API identity',[]),
'HELM':('https://get.helm.sh/helm-v${HELM_VERSION}-linux-${arch}.tar.gz','extract linux-${arch}/helm; install; version --short',[])}
for r in v['rows']:
 if r['status']!='source-traced-buildstep-domain-open':continue
 f=r['source']['path'];key=r['source']['field'];owner=r['owner'];extra=[];error='';profile='complete current versions.json and per-image override manifest; A linux/amd64 and B linux/arm64, platform availability and real executable build prerequisite, not assumed'
 if key.endswith('_BASE'):
  domain='managed string ending @sha256:lowercase64hex; OCI registry/reference/platform and base ABI/user/package manager contract validated by actual builder, not central suffix regex'
  op='FROM ${'+key+'}; '+('builder Go compiler and final nonroot static runtime are distinct stages; controller compiler hardcodes GOARCH=amd64, so arm64 build is NOT a supported complete positive' if owner=='image-namespace-controller' else 'exact current base supplies executable runtime, filesystem, distro/keyring/users and builder stages; actual manifest platform availability separate')
  error='Unpinned base image at versions validator; actual registry/digest/platform resolution or later ABI/user/package-manager failures at build'
  if owner=='image-namespace-controller':profile='A unchanged complete versions manifest on linux/amd64; B alternate authentic digest-pinned Go+static Debian12-compatible base pair on linux/amd64 requires acquired ABI/availability receipts. Current hardcoded binary amd64 forbids asserting a supported arm64 positive.'
 elif key=='DEBIAN_SNAPSHOT':
  domain='central version-token grammar only, not date parser; exact snapshot URL token, suite bookworm/bookworm-updates/bookworm-security and base Debian archive signing keyring'
  scheme='http' if owner=='image-prism-worker' else 'https'
  op=f'{scheme} snapshot.debian.org/archive/debian and debian-security URLs; Deb822 Signed-By Debian archive keyring; Check-Valid-Until=false; '+('native gcc/libc launcher stage then copies sources into final Playwright install-deps' if owner=='image-prism-worker' else 'APT update/install retries5 and Error-Mode=any; repository pin is not each package receipt')
  error='invalid version token rejected centrally; nonexistent snapshot, transport or metadata signature/package failures reject APT build, no timestamp-only schema rejection'
 elif key=='OPENCLAW_PLUGIN_VERSION':
  domain='derived solely from manifest.openclaw.version YYYY.M.D[-n]; buildArgs OPENCLAW fields prohibited and per-image OPENCLAW override prohibited; package versions are not installed OCI equality'
  op='openclaw plugins install npm:@openclaw/acpx@version and npm:@openclaw/discord@version --force --accept-capabilities; select architecture-specific ACP native packages, npm pack both, copy npm cache; pack count2 and aggregate byte hash'
  error='OpenClaw must have one authority / OpenClaw versions must match across roles; install/source/pack/cache/native architecture errors at actual build; pack count/hash alone not transitive identity validation'
  extra=['ops/pod/package-lock.json'] if False else []
 elif key=='TARGETARCH':
  r['class']='generated-binding'
  if owner=='image-nova':op='${TARGETARCH:-$(dpkg --print-architecture)} selects binary amd64|arm64; plugin pruning separately ${TARGETARCH:-amd64}; different absence semantics must bind one explicit platform'
  elif owner in ['image-buster-gateway','image-prism-agent']:op='${TARGETARCH:-amd64} plugin package pruning: codex-acp-linux-x64/arm64, claude-agent-sdk-linux-x64/arm64, @esbuild linux-x64/arm64; unsupported exit1'
  elif owner=='image-prism-worker':op='browser-archive-lock.mjs --install raw TARGETARCH prism /ms-playwright; pinned lock platforms and actual browser executable graph; absent is not converted to native architecture'
  else:op='Go GOOS=linux GOARCH=${TARGETARCH} CGO_ENABLED=0 builds selected gh/kubectl/Hubble; ops-pod Helm selector accepts only amd64|arm64, no fallback for explicit empty; ARG default amd64 but automatic BuildKit target can supply platform'
  domain='generated BuildKit target-platform architecture, not a version number; supported current complete profiles explicit amd64|arm64 except hardcoded controller stage; independent Docker --build-arg remains competing binding'
  error='unsupported architecture exits1 in binary/plugin selector or browser lock platform rejection; Go compiler supports more GOARCH but that does not extend complete image dependency graph'
  if owner=='image-prism-worker':extra=['scripts/browser-archive-lock.mjs','docker/browser-archives.lock.json']
 elif key in ['RUFF_VERSION','MYPY_VERSION','PIP_AUDIT_VERSION','SEMGREP_VERSION']:
  name={'RUFF_VERSION':'ruff','MYPY_VERSION':'mypy','PIP_AUDIT_VERSION':'pip-audit','SEMGREP_VERSION':'semgrep'}[key];lock='semgrep-nova.txt' if name=='semgrep' else 'common.txt'
  domain=f'central token plus exact {name}==value SPACE membership in {lock}; actual binary wheel/platform hashes must resolve; not arbitrary valid SemVer'
  op=f'grep -F {name}==${{{key}}} lock, then pip --require-hashes --only-binary=:all:; '+('/opt/semgrep venv and symlink' if name=='semgrep' else 'system pip --break-system-packages')+'; actual --version readback'
  error='grep mismatch exits1 before pip; pip hash/only-binary/wheel compatibility failures are separate from config grammar'
  extra=['docker/python-tools/'+lock,'docker/runtime-tool-locks.json','scripts/runtime-tool-locks.mjs']
 elif key in ['STATICCHECK_VERSION','GOVULNCHECK_VERSION','GOCYCLO_VERSION']:
  tool={'STATICCHECK_VERSION':'honnef.co/go/tools/cmd/staticcheck','GOVULNCHECK_VERSION':'golang.org/x/vuln/cmd/govulncheck','GOCYCLO_VERSION':'github.com/fzipp/gocyclo/cmd/gocyclo'}[key]
  domain='central token must equal requirements.json key; actual readonly resolved Go module graph and go.sum, not free go install @latest/version'
  op=f'test ARG = jq requirements.json; go install -mod=readonly -trimpath {tool}; GOTOOLCHAIN=local, module/build cache mounts; installed version/smoke readback'
  error='test mismatch exits before compiler; locked Go graph/build/runtime compatibility may fail separately'
  extra=['docker/go-tools/requirements.json','docker/go-tools/go.mod','docker/go-tools/go.sum']
 elif key=='KUBERNETES_JSON_SCHEMA_COMMIT':
  domain='central token grammar does not demand40hex, but git fetched commit must exactly equal requested value; selected v${KUBECTL_VERSION}-standalone-strict dir required'
  op='git sparse-checkout selected version strict directory, depth1 fetch exact commit, compare rev-parse FETCH_HEAD equality, detached checkout; copy strict tree offline; deployment-apps-v1 file required; actual whole-document no-skip schema obligations separate'
  error='git transport/missing commit, exact commit mismatch, missing version directory or deployment schema reject build; no deployed API feature support inference'
 elif owner=='image-ops-pod' and key in ['GH_VERSION','GH_SOURCE_SHA256']:
  domain='GH_VERSION token selects v-prefixed source tag and linker build.Version; GH_SOURCE_SHA256 required lowercase64hex authentic source archive digest'
  op='wget codeload.github.com/cli/cli/tar.gz/refs/tags/v${GH_VERSION}; selected source SHA before tar; COPY gh-build/go.mod/go.sum overwrites source dependency declarations; bounded module download; GOPROXY=off readonly Go build linker version'
  error='source SHA mismatch before extraction; Go dependency/build failures separate; linker text does not attest upstream source or dependencies by itself'
  extra=['ops/pod/gh-build/go.mod','ops/pod/gh-build/go.sum']
 elif owner=='image-ops-pod' and key=='KUBECTL_VERSION':
  domain='explicit v1.MINOR.PATCH regex; exact eight resolved Kubernetes modules must be corresponding v0.MINOR.PATCH with no Replace and count8'
  op='COPY local kubectl-build graph/source; go mod download all; verify-version.sh go list -mod=readonly -m all MVS graph; GOPROXY=off binary builds with two gitVersion ldflags'
  error='Invalid kubectl version / kubectl source/version mismatch / release module graph incomplete before build; linker version alone is not graph/source proof'
  extra=['ops/pod/kubectl-build/verify-version.sh','ops/pod/kubectl-build/go.mod','ops/pod/kubectl-build/go.sum']
 elif key.startswith('OPS_NPM_'):
  name={'OPS_NPM_TAR_VERSION':'tar','OPS_NPM_BRACE_VERSION':'brace-expansion','OPS_NPM_IP_VERSION':'ip-address'}[key]
  domain='central token becomes exact npm package spec; no predeclared dedicated integrity lock for this npm self-dependency repair; registry/transitive bytes are an unresolved V receipt obligation'
  op=f'delete npm package devDependencies; npm install --prefix /usr/local/lib/node_modules/npm --omit=dev --ignore-scripts --no-audit --no-fund --save-exact {name}@ARG; npm own runtime dependency graph, not Codex package lock'
  error='npm spec/registry/resolution/integrity failures; current selected package version token is not immutable transitive closure'
 elif key.split('_SHA256')[0].removesuffix('_VERSION') in tools:
  name=key.split('_SHA256')[0].removesuffix('_VERSION');url,install,extra=tools[name]
  if owner=='image-ops-pod' and name=='HELM':url='https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz'
  domain=('managed lowercase64hex digest of exact '+name+' selected platform downloaded bytes; opposite platform inactive during build but still required version author' if '_SHA256_' in key else 'central version token, actual '+name+' URL/version prefix/ABI below; arbitrary token syntactic acceptance is not a runnable dependency profile')
  op=url+' → selected amd64/arm64 sha256sum -c BEFORE extraction/install → '+install
  error='Invalid checksum centrally; curl/TLS/HTTP or selected SHA mismatch fails build before install; extraction and actual executable version/smoke failures are separate boundaries'
 else:raise RuntimeError('unhandled field '+r['id'])
 refs=[ref(q,r['id']) for q in [f,'versions.json','scripts/versions.mjs','.github/workflows/build-images.yaml']+extra]
 lines=(repo/f).read_text().splitlines();uses=[{'line':i+1,'text':s} for i,s in enumerate(lines) if key in s and not s.startswith('ARG ')]
 r.update(typeUnitDomain=domain,reader={'path':f,'operation':op,'references':refs,'fieldOccurrences':uses},validation={'schema':'versions validateVersionEntries + exact described productive boundary','semantic':domain,'errorContract':error},productiveCallerChain='versions.json sole V author → per-image projection → real workflow context/build-push-action → '+op,profileEvalSuitability=profile,status='source-traced',caseIds=list(dict.fromkeys(r['caseIds']+['DLV-CASE-IMAGE-CONTRACT-'+owner.upper()])))
 r['current']['precedence']='per-image managed override > central version projection; actual Docker build-arg may compete with generated default. TARGETARCH BuildKit automatic binding/default differs per consumer; no override rejection from source-only versions check.'
 r['activationScope']={'current':'new image build and selected OCI rollout only; started image/run unchanged','target':'version artifacts remain versions.json sole V author; platform is explicit generated binding, immutable image/source/dependency/platform closure before new module dispatch'}
 r['recoveryRetryClaimDeadlineBudgetEffects']='same selected digest/source/platform/lock identities retained across rebuild/recovery; tool installer retries do not authorize changing versions mid-run; started process/image and persistent credential/data state remain separate'
 r['migrationAction']='retain existing author; bind effective build args/platform/source/image receipts and prevent equal/different legacy override before real build. C1 context/CI/package migration; C3 dependency receipt gaps where identified, not implemented.'
 records.append({'id':r['id'],'domain':domain,'reader':r['reader'],'errorContract':error,'completeProfileAlternatives':profile,'classification':r['class']});resolved.append(r)
for owner in sorted({r['owner'] for r in resolved}):
 rows=[r for r in resolved if r['owner']==owner];cid='DLV-CASE-IMAGE-CONTRACT-'+owner.upper();case=copy.deepcopy(next(c for c in cases if c['id']=='DLV-CASE-BUSTER-BUILD-PLATFORM-VERSION-CLOSURE'));case.update(id=cid,settingIds=[r['id'] for r in rows],productiveCaller='current '+owner+' managed version projection and exact Docker consumers',inputProfile={'manifest':'unchanged complete versions.json plus all imageOverrides, same frozen source revision','A':{'platform':'linux/amd64','allManagedArgs':{r['source']['field']:r['current']['valueOrDefault'] for r in rows}},'B':{'platform':'linux/amd64' if owner=='image-namespace-controller' else 'linux/arm64','fieldSpecificPrerequisites':[r['profileEvalSuitability'] for r in rows]},'negatives':['selected download checksum mismatch; corresponding positive authentic artifact first','missing/equal/different competing build-arg/default author','unsupported/empty architecture at all real selectors','version/hashed-wheel/readonly-module/source lock mismatch','missing required context/COPY dependency','registry/platform/ABI/receipt setup failures are NOT semantic mutant kills']},command='node scripts/versions.mjs --check; proposed docker build --platform <selected-supported-platform> --file '+rows[0]['source']['path']+' --progress=plain -t dlv-'+owner+' <isolated-approved-complete-context>; verify exact FROM/download/lock/installed version/native ABI/OCI/source receipts',expectedEffectOrBoundary='real valid complete dependency/platform control must build and execute supported reader smoke first; each selected malformed field then rejects its described exact boundary, with no old-author bypass. Current source inspection is not image/run acceptance.',sourceDigests={q['path']:q['sha256'] for r in rows for q in r['reader']['references']})
 cases=[c for c in cases if c['id']!=cid]+[case]
v['sources']=list(sources.values());(out/'inventory-fragment.json').write_text(json.dumps(v,indent=2)+'\n');(out/'proposed-cases.json').write_text(json.dumps(cases,indent=2)+'\n');(out/'image-contracts-bce3f075.json').write_text(json.dumps({'scope':'static exact field contracts; no image build/download/runtime action','records':records},indent=2)+'\n');print('Source traced exact remaining',len(resolved),'Docker ARG contracts; no image acceptance')
