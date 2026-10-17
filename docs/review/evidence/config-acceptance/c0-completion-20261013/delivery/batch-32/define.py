"""Twenty-eight original runtime packaging clauses; static definition only."""
from pathlib import Path
import json,hashlib
R=Path.cwd();P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery';O=P/'batch-32'
B='scripts/build-runtime-role-bundle.mjs'; C='scripts/check-runtime-role-manifests.mjs'; W='scripts/package-agent-skill-bundle.sh'; A='packaging/runtime/package-ownership.json'; M='packaging/runtime/roles/buster.json'
sources=[A,M,B,C,W]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(s,n):
    p=R/s;return dict(path=s,line=n,expression=p.read_text().splitlines()[n-1],sha256=sha(p))
def matching(s,text):return [ref(s,n) for n,line in enumerate((R/s).read_text().splitlines(),1) if text in line]
DB={
 9:('bundle invocation identity','build-input','five CLI inputs: role nova|buster|prism, fresh output path, commit, contractVersion, builtAt. Current nonempty checks do not prove commit SHA/content equivalence or contract/timestamp syntax; wrapper supplies v2/date defaults'),
 108:('plugin discovery membership','generated-catalog','actual four common/nova/buster/prism plugin roots; only directory+plugin.json entries collected. Checker independently rejects duplicate plugin IDs; no inferred external installed roster'),
 122:('internal package names','generated-dependency-catalog','ownership node-package package.json names plus discovered plugin package.json names; missing plugin package.json skipped. This is name classification for dependency collection, not selected-role membership or authorization'),
 133:('direct mandatory dependency collection','generated-package-closure','enqueue each package.json dependencies name outside internalPackageNames; copied from actual root node_modules, must exist later. Versions come from installed manifests, not from the dependency range string as native proof'),
 136:('direct optional dependency collection','generated-package-closure','enqueue noninternal optionalDependencies only if root node_modules package.json exists; absent optional packages omitted. Distinct from mandatory closure; checker mandatory dependency loop does not assert this optional closure'),
 225:('transitive mandatory dependency collection','generated-package-closure','copied external package dependencies recursively queued outside internal names; deduplicate installedDependencies by name, root node_modules resolution. No external solver or lockfile equivalence proof from this loop'),
 228:('transitive optional dependency collection','generated-package-closure','recursively enqueue installed optional noninternal names only. Actual selected installed tree required for reproducibility; do not turn optional absence into mandatory default or claim peerDependencies are collected'),
 234:('role entrypoint facade shebang','generated-role-entrypoint','only Nova gets node shebang and generated facade executable0755; others0644. Import/optional execution source comes from selected role manifest; output runtime role selection is not task/module grant'),
 267:('bundle manifest publication','generated-release-document','pipeline-runtime-bundle.v1 manifest records contractVersion, app-skills-package-set, /app/skills surface, role/commit/builtAt, selected entrypoint/package/plugin/dependency content records and declared externalCapabilities. Before writing, finalSourceChecks recompute original file sets/content mode digests. This is assembly identity, not installed runtime or immutable module/config acceptance'),
}
DC={
 84:('role mandatory package dependency closure','declared-package-membership','selected package package.json dependencies; registered internal packages/plugins must also be selected; unregistered @kubeclaw names reject. No optionalDependencies closure gate in this checker loop'),
 87:('internal namespace registration invariant','protocol-package-invariant','dependency starting @kubeclaw/ must map to registered ownership package or plugin package name; then enforce the relevant selected-role membership'),
 93:('runtime asset membership','declared-package-membership','each kubeclawRuntimeAssets member must be known ownership package and explicitly selected in this role. Assets are packaging members, not independently loaded config or actor grants'),
 104:('plugin owner compatibility','declared-role-profile','selected plugin must exist and owner shared or exact role. Current roles exactly nova/buster/prism; owner compatibility alone does not prove dynamic registration/profile or installed consumer effects'),
 105:('capability requirement registration classes','generated-capability-closure','requirements gathered from stages, observers and adapters registrations; testProviders not in this loop. Distinguish this from later owned-plugin enumeration, which includes testProviders'),
 106:('capability requirement IDs','declared-capability-reference','each registration.requiredCapabilities member added to required set; absent uses empty array. Reference closure is not a native available provider or dispatch authority'),
 108:('adapter registration members','declared-role-profile','plugin adapters supply providesCapabilities into provided set; no stages/observers/testProviders interpreted as capability providers by this loop'),
 109:('adapter provided capability IDs','declared-capability-reference','each adapter.providesCapabilities added to provided set, missing uses empty array. Actual provider instance/native authority must still be authentic and bound'),
 115:('extension owner compatibility','declared-role-profile','selected extension must be cataloged, owner shared or exact role, and have actual package.json. Current explicit catalog kubeclaw-agent-observer shared; not arbitrary external extension install support'),
 132:('required capability closure','generated-profile-validation','each required capability must have selected adapter provider OR explicit role externalCapabilities ID. External entries separately require strings/reason>=20, uniqueID and compatible catalog source roles/capabilities; declarations alone do not prove native availability'),
 151:('shared package runtime identity resolution','generated-catalog','resolve shared directory basename to pipeline plugin ID first, otherwise extension ID; unknown runtime identity requires empty expected-role list. Compare actual selected roles against explicit ownership.sharedPlugins, not an independent settings author'),
}
DW={
 4:('wrapper source directory','generated-location','derive absolute script directory from BASH_SOURCE; not user runtime setting'),
 5:('wrapper repository directory','generated-location','derive parent of script directory; used as location metadata here, builder independently derives its root from import.meta.dirname'),
 9:('wrapper commit precedence','build-input','positional argument3 if set, else GITHUB_SHA, else empty then reject. Exact reference/content/role compatibility must be checked in approved release closure; current wrapper only requires nonempty'),
 13:('wrapper required role/output','build-input','role/output arguments nonempty; subsequent role enum nova|buster|prism and commit presence gates. Output archive path explicit, no implicit deployed path'),
 30:('builder invocation and archive delivery','generated-build-call','pass role, temporary fresh role-commit root, commit, contract_version and built_at to builder. Current wrapper defaults contract_version v2 and built_at UTC now; tar sorted names/epoch mtime/uidgid0 plus gzip-n normalize archive metadata, not arbitrary source/builtAt identity'),
}
q=json.loads((P/'batch-24/remaining-batches.json').read_text());ids=set().union(*(set(next(x['candidateIds'] for x in q['bySource'] if x['source']==s)) for s in sources));originals=json.loads((P/'candidate-dispositions.json').read_text())['candidates'];rows=[]
for c in originals:
    if c['id'] not in ids:continue
    s=c['source'];n=c['line']; reader=ref(s,n); callers=[]
    if s==B:
        name,kind,domain=DB[n];callers=[ref(W,30)]+matching('.github/workflows/build-images.yaml','package-agent-skill-bundle.sh')
    elif s==C:
        name,kind,domain=DC[n];callers=[ref(B,14)]
    elif s==W:
        name,kind,domain=DW[n];callers=matching('.github/workflows/build-images.yaml','package-agent-skill-bundle.sh')+matching('.github/workflows/pipeline-reliability.yaml','package-agent-skill-bundle.sh')
    elif s==A:
        name='prompt-contract shared role ownership';kind='declared-package-ownership';domain='Current empty expected role set for sharedPlugins.prompt-contract. Checker resolves actual runtime catalog identity then requires empty for unknown identity or exact selected-role concordance for a known one. Not a prompt-content/model author or proof all prompts are centrally defined.';reader=ref(C,148);callers=[ref(C,151),ref(C,153),ref(C,157)]
    else:
        plugin='kubeclaw.coverage-budget' if n==39 else 'kubeclaw.size-budget'
        name=plugin+' Buster role selection';kind='declared-role-profile';domain='Exact installed-role plugin ID in Buster plugins array; builder copies selected plugin files, checker enforces catalog/owner/required capability closure. Plugin policy values and workflow stage instances remain separate authors/joins.';reader=ref(B,170);callers=[ref(C,101),ref(C,104)]
    rows.append(dict(candidateId=c['id'],originalCandidate=c,sourceRef=ref(s,n),field=name,classification=kind,currentDomainAndPrecedence=domain,actualReaderRef=reader,productiveCallerRefs=callers,
        proposedAuthority='Retain selected complete role manifest/ownership/catalog and explicit release inputs as appropriate; generated archive/manifest/facade are not competing config authors. Migrate root/schema/role/buildcontext/CI guards together in authorized C1/C4, not new unapproved packaging system.',
        activation='Build exact selected source/image/config/role generation before publication; verify real installed loader/entrypoint and declared provider compatibility before dispatch. Builder performs extension sync-contract subprocess before copying; source mutation/contract generation must be covered by final release identity, not assumed pure packaging.',
        recovery='Retain original artifact/content/contract/role/config identities and required authentic external capability facts; no latest tree or newly selected plugin catalog into recovered modules/runs.',
        remaining=['exact schema/profile/setting/requirement/future executable case joins','full actual release/install/runtime loader and immutable module binding','authentic external installed provider/lockfile/source/contract identities','fresh independent source review'],definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==28 and {x['candidateId'] for x in rows}==ids
(O/'source-field-definitions.json').write_text(json.dumps(dict(scope='28 original role packaging/manifest/dependency/wrapper clauses; static source definitions',rows=rows,priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),remainingQueueUnchanged=True,globalC0Accepted=False),indent=2)+'\n')
print('28 original packaging candidates conserved; concrete readers/callers and current precedence retained; no builder execution/native acceptance')
