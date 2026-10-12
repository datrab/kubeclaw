from pathlib import Path
import json,hashlib
B=Path(__file__).resolve().parent;R=B.parents[3]
paths=['charts/kubeclaw/files/config/buster-engine.config.json','charts/kubeclaw/templates/_swarm-config.tpl','skills/common/plugin-runtime/foundation/config/swarm-components.schema.json','skills/common/plugin-runtime/foundation/config/swarm-bundle.ts','skills/common/plugin-runtime/foundation/config/buster-execution.ts','skills/buster/engine/test-gates/report-adapter-runtime.ts','skills/buster/engine/test-gates/runner.ts','tests/verification/contracts/check-pipeline-junit-report-adapter.mts','tests/verification/contracts/check-pipeline-report-adapter-runtime.mts','docs/architecture/buster-execution-configuration.md']
for r in paths:
 for d in ['before','files']:
  q=B/d/r;q.parent.mkdir(parents=True,exist_ok=True);assert not q.exists();q.write_bytes((R/r).read_bytes())
def read(r):return (B/'files'/r).read_text()
def write(r,s):(B/'files'/r).write_text(s)
r=paths[0];o=json.loads(read(r));o['settings']['execution']['reports'].update({'minimumOpenFiles':16,'minimumHeapMiB':16,'heapFraction':0.7});write(r,json.dumps(o,indent=2)+'\n')
r=paths[2];o=json.loads(read(r));d=o['$defs']['buster-execution-reports'];d['required']+=['minimumOpenFiles','minimumHeapMiB','heapFraction'];d['properties'].update({'minimumOpenFiles':{'type':'integer','minimum':1,'maximum':256},'minimumHeapMiB':{'type':'integer','minimum':1,'maximum':8589934591},'heapFraction':{'type':'number','exclusiveMinimum':0,'maximum':1}});d['properties']['maximumOpenFiles']['minimum']=1;write(r,json.dumps(o,indent=2)+'\n')
r=paths[3];write(r,read(r).replace("'buster-provider-runtime'] as const", "'buster-provider-runtime', 'buster-execution-reports'] as const"))
r=paths[4];s=read(r).replace('export interface BusterReportExecutionSettings {','export interface BusterReportExecutionSettings {\n  readonly minimumOpenFiles: number;\n  readonly minimumHeapMiB: number;\n  readonly heapFraction: number;');a=s.index('  const requiredReportMemory =');z=s.index('  if (policy.stores.attempts',a);s=s[:a]+'  validateReportCoherence(policy.reports);\n'+s[z:];s+='''
function validateReportCoherence(policy: BusterReportExecutionSettings): void {
  const requiredMemory = 64 * 1024 * 1024 + 3 * policy.maximumSourceBytes
    + 2 * policy.maximumAggregateResultBytes;
  if (policy.memoryBytes < requiredMemory) throw new Error('SWARM_CONFIG_BUSTER_EXECUTION_REPORT_MEMORY_INVALID');
  if (policy.minimumOpenFiles > policy.maximumOpenFiles) throw new Error('SWARM_CONFIG_BUSTER_REPORT_DESCRIPTOR_RANGE_INVALID');
}
export function validateBusterReportSettings(value: unknown): BusterReportExecutionSettings {
  validateComponentSettings('buster-execution-reports', value, 'SWARM_CONFIG_BUSTER_REPORT_POLICY_INVALID');
  const policy = value as BusterReportExecutionSettings;
  validateReportCoherence(policy);
  return Object.freeze({ ...policy });
}
''';write(r,s)
r=paths[5];s=read(r);s="import { validateBusterReportSettings, type BusterReportExecutionSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';\n"+s;a=s.index('const HARD_LIMITS =');z=s.index('const REQUIRED_LIMITS',a);s=s[:a]+s[z:]
s=s.replace('function validateLimits(limits: ReportAdapterRuntimeLimits): void {','''function validateLimits(limits: ReportAdapterRuntimeLimits, policy: BusterReportExecutionSettings): void {''')
s=s.replace("  if (limits.maximumCases > 5_000", "  // Structural maxima are reportCase/reportAdapterResult constraints in pipeline-test-gate.v1.schema.json.\n  if (limits.maximumCases > 5_000")
s=s.replace('  for (const [name, maximum] of Object.entries(HARD_LIMITS)) {\n    if (limits[name as keyof typeof HARD_LIMITS] > maximum)', '''  const selectedCeilings = {
    maximumCases: policy.maximumCases, maximumFindings: policy.maximumFindings,
    maximumCaseFindings: policy.maximumCaseFindings,
    maximumSourceBytes: policy.maximumSourceBytes, maximumResultBytes: policy.maximumAggregateResultBytes,
    timeoutMs: policy.maximumTimeoutMs, memoryBytes: policy.memoryBytes,
    cpuMillis: Math.max(policy.minimumCpuTimeMs, Math.floor(policy.maximumTimeoutMs / 1000) * 1000),
    openFiles: policy.maximumOpenFiles,
  };
  for (const [name, maximum] of Object.entries(selectedCeilings)) {
    if (limits[name as keyof typeof selectedCeilings] > maximum)''')
s=s.replace('  if (limits.openFiles < 16)', '  if (limits.cpuMillis < policy.minimumCpuTimeMs) throw new Error(\'REPORT_ADAPTER_CPU_LIMIT_BELOW_POLICY\');\n  if (limits.openFiles < policy.minimumOpenFiles)')
s=s.replace('export class RegisteredReportAdapterRuntime {','export class RegisteredReportAdapterRuntime {\n  readonly #policy: BusterReportExecutionSettings;')
s=s.replace('constructor(reader: ReportArtifactReader, runtimeRoot: string) {','constructor(reader: ReportArtifactReader, runtimeRoot: string, policy: BusterReportExecutionSettings) {\n    this.#policy = validateBusterReportSettings(policy);')
s=s.replace('    validateLimits(limits);','    validateLimits(limits, this.#policy);').replace('Math.max(16, Math.floor(limits.memoryBytes / (1024 * 1024) * 0.7))','Math.max(this.#policy.minimumHeapMiB, Math.floor(limits.memoryBytes / (1024 * 1024) * this.#policy.heapFraction))');write(r,s)
r=paths[6];s=read(r).replace("path.join(observabilityRoot, 'report-adapters'));", "path.join(observabilityRoot, 'report-adapters'), executionPolicy.reports);");write(r,s)
for r in paths[7:9]:
 s="import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';\n"+read(r)
 s=s.replace('new RegisteredReportAdapterRuntime(new FileReportArtifactReader([artifacts]), runtimeRoot)', 'new RegisteredReportAdapterRuntime(new FileReportArtifactReader([artifacts]), runtimeRoot, runnerExecutionPolicy.reports)').replace('new RegisteredReportAdapterRuntime(reader, path.parse(runtimeRoot).root)', 'new RegisteredReportAdapterRuntime(reader, path.parse(runtimeRoot).root, runnerExecutionPolicy.reports)').replace('new RegisteredReportAdapterRuntime(reader, runtimeRoot)', 'new RegisteredReportAdapterRuntime(reader, runtimeRoot, runnerExecutionPolicy.reports)')
 for suffix in ['preparation-runtime','dishonest-reader-runtime','race-runtime']:
  s=s.replace("}, path.join(workspace, '"+suffix+"'));", "}, path.join(workspace, '"+suffix+"'), runnerExecutionPolicy.reports);")
 write(r,s)
r=paths[1];s=read(r);needle='{{- $reportMemory := addf';at=s.index(needle);s=s[:at]+'''{{- if gt $execution.reports.minimumOpenFiles $execution.reports.maximumOpenFiles -}}{{- fail "buster execution report minimumOpenFiles exceeds maximumOpenFiles" -}}{{- end -}}
'''+s[at:];write(r,s)
r=paths[9];s=read(r).replace('All 37 execution fields are required. Thirty-six are positive integers;\n`provider.heapFraction` is a number', 'All 40 execution fields are required. Thirty-eight are positive integers;\n`provider.heapFraction` and `reports.heapFraction` are numbers');needle='| `maximumOpenFiles` | File descriptor allowance passed to the report process. |';s=s.replace(needle,needle+'''
| `minimumOpenFiles` | Minimum accepted per-adaptation descriptor allowance; cannot exceed maximumOpenFiles. |
| `minimumHeapMiB` | Node old-space allowance floor in MiB for the report child. |
| `heapFraction` | Fraction of the selected report memory used to derive Node old-space. |
''');s=s.replace("Selecting larger application values does not remove the report\nruntime's independent security bounds.",'''The report runtime requires this same immutable reports snapshot before creating
its runtime directory. Per-adaptation limits cannot exceed its selected capacities.
The CPU ceiling is derived as max(minimumCpuTimeMs, maximumTimeoutMs rounded down
to whole seconds), so it cannot fall below the selected CPU floor. The existing
HARD_LIMIT_EXCEEDED diagnostic now refers to the explicitly selected policy bound;
no separate hardcoded resource ceiling supplies another operational value.
Detail counts5000/5000/100 remain structural constraints of the versioned report
result schema. Node heap selection does not guarantee process startup or raise
the selected workload memory limit.''');write(r,s)
rows=[]
for r in paths:rows.append({'path':r,'beforeSha256':hashlib.sha256((B/'before'/r).read_bytes()).hexdigest(),'afterSha256':hashlib.sha256((B/'files'/r).read_bytes()).hexdigest()})
(B/'manifest-v1.json').write_text(json.dumps({'status':'private-unreviewed-unexecuted','files':rows},indent=2)+'\n')
