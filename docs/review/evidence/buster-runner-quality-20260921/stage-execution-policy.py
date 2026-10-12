from pathlib import Path
import json,hashlib
root=Path.cwd();out=Path(__file__).resolve().parent
paths=['skills/common/plugin-runtime/foundation/config/swarm.ts','skills/common/plugin-runtime/foundation/config/swarm-components.schema.json','charts/kubeclaw/files/config/buster-engine.config.json','charts/prism/templates/_swarm-bundle.tpl','skills/buster/engine/test-gates/production.ts','skills/buster/engine/test-gates/remote-plan-service.ts','skills/buster/engine/test-gates/remote-prepared-execution.ts','skills/buster/engine/test-gates/provider-loader.ts','skills/buster/engine/test-gates/specialist-report-finalization.ts']
rows=[]
for rel in paths:
 p=root/rel; data=p.read_bytes(); target=out/'files'/rel
 for directory in ['before','files']:
  q=out/directory/rel
  if q.exists():raise RuntimeError('refuse overwriting prior private work:'+str(q))
  q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(data)
 rows.append({'path':rel,'sha256':hashlib.sha256(data).hexdigest(),'capturedAfterBRIntegration':True})
(out/'execution-policy-baselines.json').write_text(json.dumps(rows,indent=2)+'\n')
provider={'cleanupTimeoutMs':30000,'maximumResultBytes':16777216,'claimGraceMs':60000,'queueTimeoutMs':60000}
reports={'maximumAggregateResultBytes':16777216,'maximumSourceBytes':67108864,'maximumCases':5000,'maximumFindings':5000,'maximumCaseFindings':100,'maximumTimeoutMs':300000,'memoryBytes':536870912,'minimumCpuTimeMs':1000,'maximumOpenFiles':64}
observation={'resourceSampleIntervalMs':10,'processSampleIntervalMs':50}
stores={'attempts':{'maximumEvidenceObjects':10000,'maximumEvidenceBytes':10737418240,'maximumEvidenceObjectBytes':1073741824,'maximumResults':10000,'maximumClosures':10000,'maximumMetadataBytes':268435456,'maximumPendingEvidenceAgeMs':3600000},'admission':{'maximumIngressBytes':16777216,'maximumRecords':10000,'maximumBytes':268435456,'maximumQuarantineRecords':1000,'maximumQuarantineBytes':67108864}}
execution={'provider':provider,'reports':reports,'observation':observation,'stores':stores}
p=out/'files/charts/kubeclaw/files/config/buster-engine.config.json';data=json.loads(p.read_text());data['settings']['execution']=execution;p.write_text(json.dumps(data,indent=2)+'\n')
def bounded(maximum,minimum=1,**extra):return {'type':'integer','minimum':minimum,'maximum':maximum,**extra}
def obj(props):return {'type':'object','additionalProperties':False,'required':list(props),'properties':props}
p=out/'files/skills/common/plugin-runtime/foundation/config/swarm-components.schema.json';schema=json.loads(p.read_text());defs=schema['$defs']
pdefs={key:bounded(2147483647) for key in provider};pdefs['maximumResultBytes']=bounded(9007199254740991-4096)
rmax={'maximumAggregateResultBytes':16777216,'maximumSourceBytes':67108864,'maximumCases':5000,'maximumFindings':5000,'maximumCaseFindings':100,'maximumTimeoutMs':300000,'memoryBytes':2147483648,'minimumCpuTimeMs':300000,'maximumOpenFiles':256}
rdefs={key:bounded(rmax[key]) for key in reports};rdefs['minimumCpuTimeMs']=bounded(300000,1000,multipleOf=1000);rdefs['maximumOpenFiles']=bounded(256,16)
defs['buster-execution-provider']=obj(pdefs);defs['buster-execution-reports']=obj(rdefs);defs['buster-execution-observation']=obj({key:bounded(2147483647) for key in observation})
for kind,fields in stores.items():defs['buster-execution-store-'+kind]=obj({key:bounded(9007199254740991) for key in fields})
defs['buster-execution-stores']=obj({key:{'$ref':'#/$defs/buster-execution-store-'+key} for key in stores})
defs['buster-execution']=obj({key:{'$ref':'#/$defs/buster-execution-'+key} for key in execution})
buster=defs['buster-engine'];buster['required'].append('execution');buster['properties']['execution']={'$ref':'#/$defs/buster-execution'};p.write_text(json.dumps(schema,indent=2)+'\n')
p=out/'files/skills/common/plugin-runtime/foundation/config/buster-execution.ts'
def interface(name,fields):return 'export interface '+name+' {\n'+''.join('  readonly '+key+': number;\n' for key in fields)+'}\n'
text="import { validateComponentSettings } from './swarm-bundle.ts';\n\n"+interface('BusterProviderExecutionSettings',provider)+interface('BusterReportExecutionSettings',reports)+interface('BusterObservationSettings',observation)+interface('BusterAttemptStoreSettings',stores['attempts'])+interface('BusterAdmissionStoreSettings',stores['admission'])+'''export interface BusterExecutionSettings {
  readonly provider: BusterProviderExecutionSettings;
  readonly reports: BusterReportExecutionSettings;
  readonly observation: BusterObservationSettings;
  readonly stores: Readonly<{ attempts: BusterAttemptStoreSettings; admission: BusterAdmissionStoreSettings }>;
}

export function validateBusterExecutionSettings(value: unknown): BusterExecutionSettings {
  validateComponentSettings('buster-execution', value, 'SWARM_CONFIG_BUSTER_EXECUTION_INVALID');
  const policy = value as BusterExecutionSettings;
  if (policy.provider.maximumResultBytes > Number.MAX_SAFE_INTEGER - policy.reports.maximumAggregateResultBytes - 4096) {
    throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_RESULT_SUM_INVALID');
  }
  return Object.freeze({ provider: Object.freeze({ ...policy.provider }), reports: Object.freeze({ ...policy.reports }),
    observation: Object.freeze({ ...policy.observation }), stores: Object.freeze({
      attempts: Object.freeze({ ...policy.stores.attempts }), admission: Object.freeze({ ...policy.stores.admission }),
    }) });
}

export function validateBusterObservationSettings(value: unknown): BusterObservationSettings {
  validateComponentSettings('buster-execution-observation', value, 'SWARM_CONFIG_BUSTER_OBSERVATION_INVALID');
  return Object.freeze({ ...value as BusterObservationSettings });
}
''';p.write_text(text)
p=out/'files/skills/common/plugin-runtime/foundation/config/swarm.ts';s=p.read_text();s="import { validateBusterExecutionSettings, type BusterExecutionSettings } from './buster-execution.ts';\nexport { validateBusterExecutionSettings, type BusterExecutionSettings } from './buster-execution.ts';\n"+s;s=s.replace('export interface BusterSettings {','export interface BusterSettings {\n  readonly execution: BusterExecutionSettings;');s=s.replace('  return Object.freeze({ preparation, admission, dependencyReadiness });','  const execution = validateBusterExecutionSettings((value as SwarmConfig).operator.buster?.execution);\n  return Object.freeze({ preparation, admission, dependencyReadiness, execution });');p.write_text(s)
print({'privatePolicyLeaves':sum(len(x) for x in [provider,reports,observation,*stores.values()]),'existingBRbytesPreserved':True})
