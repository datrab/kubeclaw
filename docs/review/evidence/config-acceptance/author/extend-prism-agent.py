"""Record distinct real Prism launcher policies; does not migrate or run agents."""
import copy
import hashlib
import json
from pathlib import Path

root = Path.cwd()
base = root / 'docs/review/evidence/config-acceptance/author'
path = base / 'main-fragment.json'
data = json.loads(path.read_text())
prototype = data['rows'][0]
evidence = str((base / 'prism-agent-source-read.log').relative_to(root))
files = ['skills/prism/server/agent-attempt.ts', 'skills/prism/control/agent-jobs.ts',
         'skills/prism/server/agent-process.ts', 'skills/prism/server/agent-job-runner.mjs',
         'skills/prism/server/agent-bridge.mjs']
sources = []
with (root/evidence).open('w') as out:
    for name in files:
        text = (root/name).read_text()
        sha = hashlib.sha256((root/name).read_bytes()).hexdigest()
        sources.append({'path':name,'sha256':sha})
        out.write(f'{name} sha256={sha}\n')
        out.writelines(f'{i}: {line}\n' for i,line in enumerate(text.splitlines(),1))

specs = []
for field,value,unit in [('timeoutMs',900000,'milliseconds'),('cleanupTimeoutMs',10000,'milliseconds'),
                         ('logBytes',1048576,'bytes'),('resultBytes',1048576,'bytes'),
                         ('evidenceBytes',2097152,'bytes'),('evidenceFiles',2,'files')]:
    specs.append((f'AUTH-PRISM-AGENT-LIMIT-{field}',files[0],f'{field}:{value:_}',value,unit,
                  f'limits.{field}', 'J: accepted agent attempt; persisted before external launch',
                  ['Control agent claim transaction','agentAttempt','persisted attempt_envelope',
                   'AgentJobRunner.runOne','WorkerAttemptExecutor'],
                  'Core validates accepted envelope limits; launcher prepare ignores limits and local CPU/memory/process measurements remain unavailable. '
                  'Envelope timeout bounds local launcher, not authoritative cancellation of remote gateway/model.',
                  'Different complete selected limits reach accepted envelope and local Core enforcement. '
                  'Observe bound V2 receipt and fenced Control result; local CLI close alone cannot prove external success.'))
specs += [
 ('AUTH-PRISM-AGENT-CLAIM-LIFETIME',files[1],"interval '16 minutes'",960000,'milliseconds','claimLifetimeMs',
  'J: durable database claim; never reset by recovery/retry',
  ['authenticated agent-job-routes claim','claimAgentJob transaction','clock_timestamp + interval','agentAttempt claim/queueDeadline','lockAgentResult'],
  'Fixed SQL interval; expired running job becomes needs_nova, never accepted/requeued. Result commit requires live fenced claim.',
  'At identical DB time choose full A/B claim durations around completion time. A expires and rejects result with NeedsNova, B commits live fenced result; no replay of uncertain launch.'),
 ('AUTH-PRISM-AGENT-KILL-GRACE',files[2],"setTimeout(()=>kill('SIGKILL'),1000)",1000,'milliseconds','terminationGraceMs',
  'J: launcher operation inherits accepted cleanup policy; SIGTERM-to-SIGKILL grace is currently independent',
  ['AgentJobRunner.runOne','WorkerAttemptExecutor termination','AgentProcess.terminate','negative process-group PID signal'],
  'Fixed delay, ESRCH ignored only; waits actual child close. This does not cancel remote gateway work.',
  'Real detached local child trapping SIGTERM; A/B grace gives distinct SIGKILL timing and closed streams. Receipt still states external action unresolved when appropriate.'),
 ('AUTH-PRISM-AGENT-CLI-TIMEOUT',files[3],"'--timeout','900'",900,'seconds','cliTimeoutSeconds',
  'J: launch args bound to accepted agent policy',
  ['AgentJobRunner.runOne','AgentProcess constructor','spawn openclaw agent --timeout'],
  'Current fixed CLI argument; external pinned OpenClaw parser owns supported domain. Must relate seconds to Core milliseconds and DB claim margin; no guessed domain.',
  'Two complete launcher profiles emit different real CLI timeout arguments and corresponding gateway timeout; external gateway availability is a live prerequisite.'),
 ('AUTH-PRISM-AGENT-CLI-OWNER',files[3],"'--agent','main'",'main','agent identity','agentId',
  'J: external gateway agent selection is fixed for accepted job/session',
  ['AgentJobRunner.runOne','AgentProcess spawn','OpenClaw agent --agent'],
  'Current fixed main; external installed agent roster required for alternate valid identity. Session key generated from namespace/project is task binding, not operator author.',
  'Two explicitly installed allowed agent profiles select distinct real agents with same durable job/session constraints. Missing agent rejects before effect; no implicit main.'),
 ('AUTH-PRISM-AGENT-CLAIM-HTTP',files[3],"'/v1/agent/jobs/claim',{runnerId:this.runnerId},AbortSignal.timeout(10_000)",10000,'milliseconds','claimHttpTimeoutMs',
  'S: runner transport policy; no retry may replay uncertain claim',
  ['AgentJobRunner.tick/runOne','controlRequest claim','fetch AbortSignal.timeout'],
  'Fixed timeout; response must be ok JSON; claim may already be durable when transport fails. Next tick only obtains accepted unstarted work; running remains fenced.',
  'Delay real Control claim response between A/B timeout. A transport times out without replaying started job, B receives original fenced claim; inspect DB and runner outcome.'),
 ('AUTH-PRISM-AGENT-FINISH-HTTP',files[3],"{fence:job.fence,outcome},AbortSignal.timeout(10_000)",10000,'milliseconds','finishHttpTimeoutMs',
  'S: runner transport policy; accepted attempt/claim not replaced',
  ['AgentJobRunner.runOne','controlRequest finish','finishAgentRun fenced transaction'],
  'Fixed timeout after local result; Control receipt validates against accepted envelope. Network failure cannot establish remote failure or authorize repeat launch.',
  'Delay real finish response between A/B timeouts. Observe single committed fenced outcome and safe NeedsNova reconciliation, not duplicate external launch.')]

for sid,name,needle,value,unit,field,activation,chain,validation,effect in specs:
    text=(root/name).read_text()
    if needle not in text:
        raise ValueError(f'productive source changed: {sid}: {needle}')
    row=copy.deepcopy(prototype)
    row.update(id=sid,owner='prism-agent-launcher',scope={'instance':'prism-agent-launcher','profile':'explicit selected complete launcher policy'},
               source={'path':name,'field':field,'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest(),
                       'lines':[i for i,line in enumerate(text.splitlines(),1) if needle in line]},
               current={'valueOrDefault':value,'precedence':'fixed producer literal; no existing operator override'},
               typeUnitDomain=f'{unit}; exact target supported domain not yet frozen',unit=unit,
               reader=chain[-1],productiveCallerChain=chain,
               validation={'schema':'no current central launcher author','semantic':validation},
               targetAuthorRef=f'config/engines/prism-agent.config.json#/profiles/<selected>/{field}',
               activationScope={'current':activation,'target':activation},
               recoveryRetryClaimDeadlineBudgetEffects=validation,
               caseIds=[sid+'-EFFECT'],verifiedSourceEvidence=[evidence],semanticStatus='source-traced')
    row['classificationReason']='Launcher-specific operator policy, not deterministic-engine quota or remote resource guarantee.'
    if sid == 'AUTH-PRISM-AGENT-CLI-TIMEOUT':
        row['class']='generated-binding'
        row['classificationReason']='Target CLI seconds must be an exact validated projection of sole accepted launcher timeoutMs author, not a second independently editable timeout. Current fixed 900 seconds and 900000 ms are two code literals, not proven single authority.'
        row['targetAuthorRef']='alias:AUTH-PRISM-AGENT-LIMIT-timeoutMs; validated milliseconds-to-seconds projection'
        row['sharedAuthoritySettingId']='AUTH-PRISM-AGENT-LIMIT-timeoutMs'
    case={'id':sid+'-EFFECT','settingIds':[sid],'requirementIds':['C0-C','C0-D','F-EFFECT','F-BIND'],
          'phase':'implementation-proposal','scope':'live' if 'CLI-' in sid else 'local',
          'productiveCaller':chain,'inputProfile':{'current':value,'alternative':'complete launcher profile and supported domain pending'},
          'priorState':'accepted unstarted fenced job; no started job retargeted',
          'expectedEffectOrRejectingBoundary':effect,'observerMethod':'real Control transaction, launcher process and bound receipt; remote gateway observations only for live cases',
          'command':None,'sourceIdentity':{'sources':sources},'testDigests':[],
          'toolDependencyImageConfigIdentities':None,'rawEvidencePath':None,'result':'not-run',
          'reason':'C3/C4/C5 not approved; exact future harness/domain/profile pending',
          'reviewerConfirmation':None,'specificationStatus':'incomplete'}
    data['rows']=[r for r in data['rows'] if r['id']!=sid]+[row]
    data['cases']=[r for r in data['cases'] if r['id']!=case['id']]+[case]
for source in sources:
    data['sources']=[s for s in data['sources'] if s['path']!=source['path']]+[source]
actual_log=base/'agent-definition.log'
if actual_log.exists():
    records=[json.loads(line) for line in actual_log.read_text().splitlines()]
    identity=next(r for r in records if r['kind']=='identity')
    result=next(r for r in records if r['kind']=='actual-definition')
    if not result['observations'] or any(o['result']!='passed' for o in result['observations']):
        raise ValueError('definition observations incomplete or failed')
    test=next(s for s in identity['sources'] if s['path'].endswith('check-agent-definition.mjs'))
    if hashlib.sha256((root/test['path']).read_bytes()).hexdigest()!=test['sha256']:
        raise ValueError('definition check changed after execution')
    actual_id='AUTH-PRISM-AGENT-C0-DEFINITION'
    actual={'id':actual_id,'settingIds':[s[0] for s in specs if s[0].startswith('AUTH-PRISM-AGENT-LIMIT-')],
            'requirementIds':['C0-A','C0-C','A2','A5'], 'phase':'C0','scope':'local',
            'productiveCaller':['agentAttempt real producer','checkWorkerResourceContractV2 real installed validator'],
            'inputProfile':'fixed no-secret synthetic accepted job, current real launcher profile only',
            'priorState':'no dispatch, empty job request; future expiry, generated issuedAt',
            'expectedEffectOrRejectingBoundary':'14 exact current definition observations, including actual V2 positive, V1 negative, missing explicit budget and wrong-unit rejection; does not prove launch/effect',
            'observerMethod':result['observations'],
            'command':'node docs/review/evidence/config-acceptance/author/check-agent-definition.mjs',
            'sourceIdentity':identity,'testDigests':[test],
            'toolDependencyImageConfigIdentities':{'node':identity['node'],'packageLock':identity['sources'][-1],
                                                  'profileDigest':result['envelope']['profile']['profileDigest'],
                                                  'attemptSpecDigest':result['envelope']['attemptSpecDigest']},
            'rawEvidencePath':str(actual_log.relative_to(root)),
            'rawEvidenceSha256':hashlib.sha256(actual_log.read_bytes()).hexdigest(),
            'result':'passed','reason':'actual definition observation only; independent review pending',
            'reviewerConfirmation':None,'specificationStatus':'executed-definition-review-open'}
    data['cases']=[c for c in data['cases'] if c['id']!=actual_id]+[actual]
    for row in data['rows']:
        if row['id'] in actual['settingIds']:
            row['caseIds']=list(dict.fromkeys(row['caseIds']+[actual_id]))
data['gaps']=[g for g in data['gaps'] if g.get('id')!='AUTH-PRISM-AGENT-DOMAINS']+[
    {'id':'AUTH-PRISM-AGENT-DOMAINS','reason':'Launcher profile schema does not yet exist; exact coupled claim/CLI/Core/cleanup domains and live external gateway agent roster remain open. Current sources distinguish local process completion from authoritative fenced remote result.'}]
path.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'addedOrRefreshedRows':len(specs),'status':'source-traced; domains/cases/review open'}))
