from pathlib import Path
import json,shutil
B=Path(__file__).parent
F=B/'files'
def read(p):
 q=F/p
 if not q.exists():
  src=Path(p);q.parent.mkdir(parents=True,exist_ok=True)
  if src.exists():
   old=B/'before'/p;old.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,old);shutil.copyfile(src,q)
  else:q.write_text('')
 return q.read_text()
def write(p,s):
 read(p);(F/p).write_text(s)
def replace(p,a,b):
 s=read(p);assert a in s,(p,a[:100]);write(p,s.replace(a,b))
C='skills/common/plugin-runtime/foundation/config/'
T='skills/buster/engine/test-gates/'
write(C+'buster-security-scan.ts', '''import { validateComponentSettings } from './swarm-bundle.ts';

export interface BusterSecurityScanSettings {
  readonly trivyExecutable: string;
  readonly cacheDirectory: string;
  readonly allowedRegistryPrefixes: readonly string[];
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
  readonly executableSearchPath: readonly string[];
  readonly databasePolicy: {
    readonly maximumVulnerabilityAgeMs: number;
    readonly maximumJavaAgeMs: number;
    readonly maximumDatabaseBytes: number;
    readonly maximumMetadataBytes: number;
  };
  readonly findings: {
    readonly maximumTitleCodeUnits: number;
    readonly maximumMessageCodeUnits: number;
    readonly maximumResolutionCodeUnits: number;
  };
}

export function validateBusterSecurityScanSettings(value: unknown): BusterSecurityScanSettings {
  validateComponentSettings('buster-security-scan', value, 'SECURITY_SCAN_POLICY_INVALID');
  const input = value as BusterSecurityScanSettings;
  return Object.freeze({ ...input,
    allowedRegistryPrefixes: Object.freeze([...input.allowedRegistryPrefixes]),
    executableSearchPath: Object.freeze([...input.executableSearchPath]),
    databasePolicy: Object.freeze({ ...input.databasePolicy }),
    findings: Object.freeze({ ...input.findings }) });
}
''')
schema=json.loads(read(C+'swarm-components.schema.json'))
def obj(props):return dict(type='object',additionalProperties=False,required=list(props),properties=props)
def integer(low=1,high=9007199254740991):return dict(type='integer',minimum=low,maximum=high)
string=dict(type='string',minLength=1)
scanner=obj(dict(trivyExecutable=string,cacheDirectory=string,allowedRegistryPrefixes=dict(type='array',minItems=1,items=string),maximumExecutionMs=integer(high=2147483647),maximumOutputBytes=integer(1024),executableSearchPath=dict(type='array',minItems=1,items=dict(type='string',minLength=1,pattern='^/[^:\\u0000]*$')),databasePolicy=obj(dict(maximumVulnerabilityAgeMs=integer(high=2592000000),maximumJavaAgeMs=integer(high=2592000000),maximumDatabaseBytes=integer(high=34359738368),maximumMetadataBytes=integer())),findings=obj(dict(maximumTitleCodeUnits=integer(),maximumMessageCodeUnits=integer(),maximumResolutionCodeUnits=integer()))))
schema['$defs']['buster-security-scan']=scanner
schema['$defs']['buster-engine']['required'].append('securityScan')
schema['$defs']['buster-engine']['properties']['securityScan']={'$ref':'#/$defs/buster-security-scan'}
write(C+'swarm-components.schema.json',json.dumps(schema,indent=2)+'\n')
replace(C+'swarm-bundle.ts',"'buster-runtime-security', 'buster-cluster-invokers'","'buster-security-scan', 'buster-runtime-security', 'buster-cluster-invokers'")
p=C+'swarm.ts';s=read(p);s="import { validateBusterSecurityScanSettings, type BusterSecurityScanSettings } from './buster-security-scan.ts';\n"+s
s=s.replace('export interface BusterSettings {','export interface BusterSettings {\n  readonly securityScan: BusterSecurityScanSettings;')
s=s.replace('  return Object.freeze({ preparation, admission, dependencyReadiness, execution, clusterInvokers });','''  const scan = validateBusterSecurityScanSettings((value as SwarmConfig).operator.buster?.securityScan);
  const securityScan = Object.freeze({ ...scan,
    trivyExecutable: path.resolve(componentDirectory, scan.trivyExecutable),
    cacheDirectory: path.resolve(componentDirectory, scan.cacheDirectory) });
  return Object.freeze({ preparation, admission, dependencyReadiness, execution, clusterInvokers, securityScan });''');write(p,s)
p='charts/kubeclaw/templates/_swarm-config.tpl';s=read(p).replace('(ne (len $buster) 5)','(ne (len $buster) 6)').replace('(not (hasKey $buster "clusterInvokers"))','(not (hasKey $buster "clusterInvokers")) (not (hasKey $buster "securityScan"))').replace('execution and clusterInvokers only','execution, clusterInvokers and securityScan only');s=s.replace('{{- $cluster := $buster.clusterInvokers -}}','{{- include "kubeclaw.validateClusterPolicy" (dict "value" $buster.securityScan "schema" (index $definitions "buster-security-scan") "name" "securityScan") -}}\n{{- $cluster := $buster.clusterInvokers -}}');write(p,s)
p=T+'trivy-database.ts';s=read(p);start=s.index('export const DEFAULT_TRIVY_DATABASE_POLICY');end=s.index('const DATABASES',start);s=s[:start]+s[end:];s=s.replace('readonly maximumDatabaseBytes: number;','readonly maximumDatabaseBytes: number;\n  readonly maximumMetadataBytes: number;').replace('value: TrivyDatabasePolicy = DEFAULT_TRIVY_DATABASE_POLICY','value: TrivyDatabasePolicy');s=s.replace('  for (const age of [value.maximumVulnerabilityAgeMs','  if (!value || !Number.isSafeInteger(value.maximumMetadataBytes) || value.maximumMetadataBytes < 1) throw new Error(\'SECURITY_SCAN_DATABASE_POLICY_INVALID\');\n  for (const age of [value.maximumVulnerabilityAgeMs');s=s.replace("'metadata.json'), 16 * 1024, signal, true","'metadata.json'), policy.maximumMetadataBytes, signal, true");write(p,s)
p=T+'security-scan-runtime.ts';s=read(p);s="import { validateBusterSecurityScanSettings, type BusterSecurityScanSettings } from '../../../common/plugin-runtime/foundation/config/buster-security-scan.ts';\n"+s
start=s.index('export interface SecurityScanCapabilityInvokerOptions');end=s.index('  readonly unsupportedHttpRegistry?',start)
s=s[:start]+'''export interface SecurityScanCapabilityInvokerOptions extends BusterSecurityScanSettings {
  readonly workspaceRoot: string;
'''+s[end:]
s=s.replace('cache: {directory:string;registryEnvironment:Record<string,string>}','cache: {directory:string;registryEnvironment:Record<string,string>;executableSearchPath:readonly string[]}').replace("PATH: '/usr/local/bin:/usr/bin:/bin'","PATH: cache.executableSearchPath.join(path.delimiter)")
s=s.replace("        controller.abort();\n        finish(new Error('SECURITY_SCAN_OUTPUT_LIMIT_EXCEEDED'));","        finish(new Error('SECURITY_SCAN_OUTPUT_LIMIT_EXCEEDED'));\n        controller.abort();")
s=s.replace('function dependencyFindings(root: string, results: JsonObject[])','function dependencyFindings(root: string, results: JsonObject[], limits: BusterSecurityScanSettings[\'findings\'])').replace('function policyFindings(root: string, results: JsonObject[])',"function policyFindings(root: string, results: JsonObject[], limits: BusterSecurityScanSettings['findings'])")
s=s.replace('.slice(0, 2048)','.slice(0, limits.maximumTitleCodeUnits)').replace("String(item.Message ?? item.Description ?? item.Title ?? item.ID).slice(0, 4096)","String(item.Message ?? item.Description ?? item.Title ?? item.ID).slice(0, limits.maximumMessageCodeUnits)").replace("String(item.Resolution ?? '').slice(0, 4096)","String(item.Resolution ?? '').slice(0, limits.maximumResolutionCodeUnits)")
s=s.replace('  readonly #root: string;','  readonly #policy: BusterSecurityScanSettings;\n  readonly #root: string;')
a=s.index('    this.#root =',s.index('  constructor('));b=s.index('    this.#unsupportedHttpRegistry=',a)
s=s[:a]+'''    this.#policy = validateBusterSecurityScanSettings({
      trivyExecutable: options.trivyExecutable, cacheDirectory: options.cacheDirectory,
      allowedRegistryPrefixes: options.allowedRegistryPrefixes, maximumExecutionMs: options.maximumExecutionMs,
      maximumOutputBytes: options.maximumOutputBytes, executableSearchPath: options.executableSearchPath,
      databasePolicy: options.databasePolicy, findings: options.findings });
'''+s[b:]
s=s.replace('this.#registryAccess=options.registryAccess;','this.#registryAccess=options.registryAccess ? Object.freeze({ ...options.registryAccess }) : undefined;')
s=s.replace('      if(options.registryAccess.caFile)fs.accessSync(options.registryAccess.caFile,fs.constants.R_OK);','')
s=s.replace('    this.#registryPrefixes = [...options.allowedRegistryPrefixes];','''    this.#root = fs.realpathSync(options.workspaceRoot);
    this.#trivy = fs.realpathSync(this.#policy.trivyExecutable);
    fs.accessSync(this.#trivy, fs.constants.X_OK);
    if (this.#registryAccess?.caFile) fs.accessSync(this.#registryAccess.caFile, fs.constants.R_OK);
    this.#registryPrefixes = this.#policy.allowedRegistryPrefixes;''')
s=s.replace('options.maximumExecutionMs;','this.#policy.maximumExecutionMs;').replace('options.maximumOutputBytes;','this.#policy.maximumOutputBytes;').replace('fs.realpathSync(options.cacheDirectory)','fs.realpathSync(this.#policy.cacheDirectory)').replace('databasePolicy(options.databasePolicy)','databasePolicy(this.#policy.databasePolicy)')
a=s.index('  #registryConfiguration(');b=s.index('\n  async #scan',a)
s=s[:a]+'''  #registryConfiguration(operation: string, target: string, args: string[]) {
    if (operation !== 'image') return { directory: undefined, environment: {} };
    // An explicit empty Docker configuration prevents ambient cache/host authentication.
    const directory = fs.mkdtempSync(path.join(this.#cache, '.registry-auth-'));
    fs.chmodSync(directory, 0o700);
    const access = this.#registryAccess?.registryReference === target.split('/')[0] ? this.#registryAccess : undefined;
    const auths = access ? { [access.registryReference]: {
      auth: Buffer.from(`${access.username}:${access.password}`).toString('base64') } } : {};
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ auths }), { mode: 0o600 });
    if (access?.caFile) args.splice(args.length - 1, 0, '--cacert', access.caFile);
    return { directory, environment: { DOCKER_CONFIG: directory } };
  }
'''+s[b:]
s=s.replace('registryEnvironment:registryConfig.environment}', 'registryEnvironment:registryConfig.environment,executableSearchPath:this.#policy.executableSearchPath}')
s=s.replace('policyFindings(this.#root, output) : dependencyFindings(this.#root, output)','policyFindings(this.#root, output, this.#policy.findings) : dependencyFindings(this.#root, output, this.#policy.findings)');write(p,s)
