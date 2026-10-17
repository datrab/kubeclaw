"""Gateway source inventory; no gateway runtime/schema operations."""
from pathlib import Path
import hashlib, json

R=Path.cwd(); P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery'; O=P/'batch-29'
S='charts/kubeclaw/templates/configmap-gateway.yaml'; DEP='charts/kubeclaw/templates/deployment.yaml'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(path,n):
    p=R/path; return dict(path=path,line=n,expression=p.read_text().splitlines()[n-1],sha256=sha(p))
# Explicit startup reads: fields are not all overwritten on each restart.
# A ConfigMap projection alone is not proof of effective gateway consumption.
D={
 2: ('Discord guild user projection','commands.allowFromDiscord',['channels/discord/guilds/*/users'],'ordered sender list, trim user: then discord: prefixes and uniq for guild users; current absent/empty uses list fallback; same unnormalized list goes to command/channel allowFrom', [489,494]),
 67: ('memory embedding endpoint','litellm.endpoint',['memory/search/remote/baseUrl'],'selected HTTP(S) service endpoint; current renderer interpolates a string without URL validation. Provider/model and env SecretRef are independent dependencies, not endpoint defaults',[529]),
 84: ('agent model route envelope','agent.model',['agents/defaults/model'],'one primary plus ordered explicit fallbacks. Generated envelope is not a second author; installed model/provider/catalog/policy compatibility is required',[510]),
 85: ('primary model route','agent.model.primary',['agents/defaults/model/primary'],'nonempty provider/model reference in installed catalog and selected allow policy; current renderer quotes string but does not validate catalog or authorize model access',[513]),
 87: ('fallback model members','agent.model.fallbacks',['agents/defaults/model/fallbacks/<index>'],'ordered list of provider/model references; preserve explicit empty list and priority, no implicit provider/catalog defaults',[513]),
 88: ('fallback JSON quoting and separators','agent.model.fallbacks',['agents/defaults/model/fallbacks/<index>'],'generated array JSON punctuation and quote, not an independent setting author',[513]),
 102: ('conditional model runtime registration','agent.model.primary',['agents/defaults/models/openai~1gpt-6-astra/agentRuntime/id'],'current astra registration iff primary is exactly openai/gpt-6-astra; constant sol/5.5 registrations remain. Fallback-only astra is not automatically registered here; catalog/policy consistency remains a target obligation',[516,519,522,525]),
 157: ('managed Discord default binding','discord.enabled',['bindings/agentId=main/match/channel=discord/accountId=default'],'strict selected bool target. Current Helm if is not a strict boolean check; true emits binding. False emits none, but startup does not remove a prior default binding in that case',[543,552,565]),
 190: ('command owner principals','commands.ownerAllowFrom',['commands/ownerAllowFrom'],'explicit ordered known owner principal refs; absent/empty falls back to list; auth roster and genuine operator facts must agree, no arbitrary grants inferred',[489]),
 192: ('Discord command allowlist','commands.allowFromDiscord',['commands/allowFrom/discord'],'explicit known sender refs, exact wire prefixes remain. Empty list does not itself prove downstream command denial semantics',[489]),
 211: ('Discord channel enable policy','discord.enabled',['channels/discord/enabled'],'strict target bool; current literal interpolation, channel subsection and env-token reference retained even false. Genuine provider runtime disable semantics require separate evidence',[494,497]),
 217: ('Discord channel allowlist','commands.allowFromDiscord',['channels/discord/allowFrom'],'same selected sender list as command author, no independently editable channel copy. Guild normalization remains a distinct generated projection',[494]),
 240: ('Discord execution approver principals','discord.execApprovers',['channels/discord/execApprovals/approvers'],'explicit known approver refs; current absent/empty list fallback. This does not itself authorize an execution action or bypass task/grant constraints',[494]),
 246: ('gateway listen port','gateway.port',['gateway/port'],'target integer1..65535; current unquoted interpolation. Template also delivers env and container port; persisted gateway section is NOT refreshed by managed startup copy list',[461,1368,1411]),
 278: ('Buster installed plugin allow entry','agentRole',['plugins/allow/kubeclaw-agent-observer'],'generated iff role exactly buster, current missing role fallback empty string; role selects installed catalog, not a new plugin settings author',[475,477]),
 281: ('Prism installed plugin allow entry','agentRole',['plugins/allow/kubeclaw-prism'],'generated iff role exactly prism, original selected role/catalog must match installed package',[475,477]),
 287: ('Discord installed plugin enable policy','discord.enabled',['plugins/entries/discord/enabled'],'same selected bool as channel and binding; generated installed plugin entry, not a competing enable author',[480,483]),
 301: ('Buster observer plugin projection','agentRole',['plugins/entries/kubeclaw-agent-observer'],'generated role-specific observer entry; individual embedded observer policy constants are separately inventoried policies, not authored by the role string',[480,483]),
 323: ('Prism plugin projection','agentRole',['plugins/entries/kubeclaw-prism'],'generated role-specific installed plugin config; fixed current controlUrl at327 is separate endpoint policy. Role itself neither defines URL nor grants service authority',[480,483]),
}
queue=json.loads((P/'batch-24/remaining-batches.json').read_text()); ids=set(next(x['candidateIds'] for x in queue['bySource'] if x['source']==S))
originals=json.loads((P/'candidate-dispositions.json').read_text())['candidates']; rows=[]
for c in originals:
    if c['id'] not in ids: continue
    n=c['line']; name,author,outputs,domain,readers=D[n]
    rows.append(dict(candidateId=c['id'],originalCandidate=c,field=name,currentAuthor='Helm Values.'+author,currentPrecedence=domain,
        sourceRef=ref(S,n),actualRendererReaderRef=ref(S,n),generatedOutputPointers=outputs,
        currentStartupReaderRefs=[ref(DEP,i) for i in readers],
        startupDeliveryRefs=[ref(DEP,i) for i in [444,446,450,461,473,585,1221,1420,1617]],
        currentStartupSemantics='Initial ConfigMap is copied only if persistent openclaw.json is absent. Existing persistent source survives; only explicitly managed subtrees are refreshed. gateway and other unmanaged fields can retain older values. Disabled Discord does not imply deletion of old default binding.',
        proposedAuthority='One selected role/profile deployment and gateway policy owner; generated openclaw.json is not an independent author. Physical target root/schema and external installed provider roster joins remain unresolved; no competing author file invented.',
        activation='Validate selected full model/catalog/authorization/role profile and SecretRef revisions before delivery; target controlled generation replacement. Current startup reader is not a durable module/run binding proof.',
        recovery='Retain original selected generation, role, model/provider, authorized principal roster and SecretRef revisions; do not refresh latest into old runs or infer expanded authority from new values.',
        remaining=['exact setting/requirement/case links and whole role schema/profile joins','selected gateway image/version actual loader and downstream effect/rejection contracts','true/false restart and persistent-source precedence future executable cases','authentic external installed provider/model/plugin and principal/Secret revision inputs','fresh independent source review'],
        definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==19 and {x['candidateId'] for x in rows}==ids
(O/'source-field-definitions.json').write_text(json.dumps(dict(scope='19 remaining gateway template clauses; renderer/startup source facts, no runtime acceptance',rows=rows,priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),remainingQueueUnchanged=True,globalC0Accepted=False),indent=2)+'\n')
print('19 original gateway candidates retained; actual renderer/startup readers and persistent-source precedence captured')
