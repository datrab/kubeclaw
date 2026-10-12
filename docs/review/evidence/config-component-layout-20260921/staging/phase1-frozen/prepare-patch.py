from pathlib import Path
import copy,json,hashlib,subprocess,difflib
root=Path.cwd(); staging=root/'docs/review/evidence/config-component-layout-20260921/staging'; out=staging/'files'
config='charts/kubeclaw/files/config/'; code='skills/common/plugin-runtime/foundation/config/'
def write(name,value):
 p=out/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value)
def js(value): return json.dumps(value,indent=2,ensure_ascii=False)+'\n'
old=json.loads((root/config/'swarm.config.json').read_text()); schema=json.loads((root/code/'swarm.schema.json').read_text())
prism=old['operator']['prism']; sp=schema['properties']['operator']['properties']['prism']['properties']; bp=schema['properties']['operator']['properties']['buster']
def strict(properties):return {'type':'object','additionalProperties':False,'required':list(properties),'properties':properties}
settings={
 'prism-control':{**prism['control'],'dispatchTimeoutMs':prism['native']['dispatchTimeoutMs']},
 'prism-studio':prism['studio'],
 'prism-worker':{'ingress':prism['worker'],'supervisor':prism['native']['supervisor']},
 'prism-execution':{k:prism['native'][k] for k in ['resourcePolicy','maximumResultBytes']},
 'buster-engine':old['operator']['buster']}
components={
 'prism-control':strict({**sp['control']['properties'],'dispatchTimeoutMs':sp['native']['properties']['dispatchTimeoutMs']}),
 'prism-studio':sp['studio'],
 'prism-worker':strict({'ingress':sp['worker'],'supervisor':sp['native']['properties']['supervisor']}),
 'prism-execution':strict({k:sp['native']['properties'][k] for k in ['resourcePolicy','maximumResultBytes']}),
 'buster-engine':bp}
for owner, values in settings.items():write(config+owner+'.config.json',js({'schemaVersion':'swarm-component.v1','owner':owner,'settings':values}))
entry={k:v for k,v in old.items() if k not in ['operator','_doc']}
entry={'schemaVersion':'swarm-entry.v2',**entry,'components':{k:k+'.config.json' for k in settings}}
write(config+'swarm.config.json',js(entry))
entryschema=copy.deepcopy(schema);entryschema.pop('$defs');entryschema['required']=[k for k in schema['required'] if k!='operator']+['schemaVersion','components'];entryschema['properties'].pop('operator');entryschema['properties']['schemaVersion']={'const':'swarm-entry.v2'};entryschema['properties']['components']=strict({k:{'const':k+'.config.json'} for k in settings})
write(code+'swarm.schema.json',js(entryschema))
defs={**schema['$defs'],**components,'buster-preparation':bp['properties']['preparation'],'buster-admission':bp['properties']['admission']}
write(code+'swarm-components.schema.json',js({'$schema':schema['$schema'],'$defs':defs,'oneOf':[strict({'schemaVersion':{'const':'swarm-component.v1'},'owner':{'const':k},'settings':{'$ref':'#/$defs/'+k}}) for k in settings]}))
s=(root/code/'swarm.ts').read_text()
s=s.replace("import fs from 'node:fs';\n",'').replace("import Ajv2020 from 'ajv/dist/2020.js';", "import { readSwarmBundle, validateComponentSettings, type SwarmBundleIdentity } from './swarm-bundle.ts';")
a=s.index('interface Validator {');b=s.index('const migratedEnvironmentKeys',a)
s=s[:a]+s[b:]
s=s.replace("  const file = environment.SWARM_CONFIG ?? '/home/node/.openclaw/swarm.config.json';\n  return prismSettingsFromConfig(JSON.parse(fs.readFileSync(file, 'utf8')));",'  return loadSwarmSettings(environment).prism;')
s=s.replace("  const file = environment.SWARM_CONFIG ?? '/home/node/.openclaw/swarm.config.json';\n  return busterSettingsFromConfig(JSON.parse(fs.readFileSync(file, 'utf8')));",'  return loadSwarmSettings(environment).buster;')
s=s.replace('  if (!validate(value)) throw new Error(`SWARM_CONFIG_INVALID:${JSON.stringify(validate.errors ?? [])}`);\n','')
s=s.replace('export function prismWorkerSettingsFromConfig(value: unknown): PrismWorkerSettings {\n  return prismSettingsFromConfig(value).worker;\n}\n\n','')
s=s.replace('export function busterSettingsFromConfig','function busterSettingsFromConfig').replace('export function busterPreparationSettingsFromConfig','function busterPreparationSettingsFromConfig')
for member,title in [('admission','Admission'),('preparation','Preparation')]:
 a=s.index('  const document = schema as', s.index('export function validateBuster'+title+'Settings'))
 b=s.index('\n',s.index("  if (!validateSettings(value))",a))+1
 s=s[:a]+f"  validateComponentSettings('buster-{member}', value, 'SWARM_CONFIG_BUSTER_{member.upper()}_INVALID');\n"+s[b:]
s += '''
/** One fully validated startup snapshot; no inline-document or path fallback API. */
export function loadSwarmSettings(environment: NodeJS.ProcessEnv): Readonly<{
  prism: PrismSettings;
  buster: BusterSettings;
  identity: SwarmBundleIdentity;
}> {
  rejectLegacyAuthors(environment);
  const bundle = readSwarmBundle(environment.SWARM_CONFIG);
  const control = bundle.components['prism-control'].settings as unknown as PrismControlSettings & { dispatchTimeoutMs: number };
  const worker = bundle.components['prism-worker'].settings as unknown as { ingress: PrismWorkerSettings; supervisor: PrismSupervisorSettings };
  const execution = bundle.components['prism-execution'].settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes'>;
  const { dispatchTimeoutMs, ...controlSettings } = control;
  const projection: SwarmConfig = { operator: {
    prism: {
      control: controlSettings,
      studio: bundle.components['prism-studio'].settings as unknown as PrismStudioSettings,
      worker: worker.ingress,
      native: { ...execution, dispatchTimeoutMs, supervisor: worker.supervisor },
    },
    buster: bundle.components['buster-engine'].settings as unknown as BusterSettings,
  } };
  // Validate both domains before returning either: no partial bundle activation.
  const prism = prismSettingsFromConfig(projection);
  const buster = busterSettingsFromConfig(projection);
  return Object.freeze({ prism, buster, identity: bundle.identity });
}

function rejectLegacyAuthors(environment: NodeJS.ProcessEnv): void {
  for (const key of [...migratedEnvironmentKeys,
    'BUSTER_V2_MAX_ARCHIVE_BYTES', 'BUSTER_V2_MAX_REQUEST_BYTES', 'BUSTER_V2_MAX_EXTRACTED_BYTES',
    'BUSTER_V2_MAX_ACTIVE_JOBS', 'BUSTER_V2_MAX_QUEUED_JOBS', 'BUSTER_V2_MAX_CONCURRENT_ATTEMPTS']) {
    if (environment[key] !== undefined) throw new Error(`SWARM_CONFIG_LEGACY_OVERRIDE:${key}`);
  }
}
'''
# Legacy-author checks have one owner; wrapper APIs just select from full snapshot.
a=s.index('  for (const key of migratedEnvironmentKeys)',s.index('export function loadPrismSettings'))
b=s.index('  return loadSwarmSettings',a);s=s[:a]+s[b:]
a=s.index("  for (const key of ['BUSTER_V2",s.index('export function loadBusterSettings'));b=s.index('  return loadSwarmSettings',a);s=s[:a]+s[b:]
write(code+'swarm.ts',s)
print('Staged six authored JSON files, entry/component schemas and swarm.ts; no live writes.')
