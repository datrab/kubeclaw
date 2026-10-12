from pathlib import Path
r=Path(__file__).parent
base=Path('skills/buster/engine/test-gates');s=(r/'before'/base/'kubernetes-fixture-runtime.ts').read_text()
out=r/'files'/base

def segment(a,b): return s[s.index(a):s.index(b)]
def write(name,body): (out/name).write_text(body)
def public(body):
 import re
 return re.sub(r'^(function|interface|const|type) ',r'export \1 ',body,flags=re.M)
values=segment('function object(', 'function contained(')
values=values.replace("      || item.includes('\\0') || (pattern ? !pattern.test(item) : false)","      || invalidArrayEntry(item, pattern)")
values += '''function invalidArrayEntry(item: string, pattern?: RegExp): boolean {
  if (item.includes('\\0')) return true;
  return pattern !== undefined && !pattern.test(item);
}
'''
patterns=segment('const DNS_LABEL', 'const CLUSTER_SCOPED_KINDS')
# Storage quantity stays with storage parser.
patterns='\n'.join(x for x in patterns.splitlines() if not x.startswith('const STORAGE_QUANTITY'))+'\n'
write('kubernetes-fixture-values.ts',public(patterns+"type JsonObject = Record<string, unknown>;\n\n"+values))
write('kubernetes-fixture-manifest-files.ts',"import crypto from 'node:crypto';\nimport fs from 'node:fs';\nimport path from 'node:path';\nimport { text, object, type JsonObject } from './kubernetes-fixture-values.ts';\n\n"+public(segment('function contained(', 'function podSpecs(')))
write('kubernetes-fixture-storage.ts',"import { text, object, type JsonObject } from './kubernetes-fixture-values.ts';\n"+segment('const STORAGE_QUANTITY', 'const CLUSTER_SCOPED_KINDS')+'\n'+public(segment('function storageBytes(', 'function validatePodSecurity(')))
# Preserve field/validation traversal order while moving per-container checks.
pod=segment('function podSpecs(', 'function storageBytes(')
pod=pod.replace("!spec || typeof spec !== 'object' || Array.isArray(spec)","!isObject(spec)").replace("template && typeof template === 'object' && !Array.isArray(template)","isObject(template)").replace("templateSpec && typeof templateSpec === 'object' && !Array.isArray(templateSpec)","isObject(templateSpec)").replace("jobTemplate && typeof jobTemplate === 'object' && !Array.isArray(jobTemplate)","isObject(jobTemplate)").replace("jobSpec && typeof jobSpec === 'object' && !Array.isArray(jobSpec)","isObject(jobSpec)").replace("jobTemplateValue && typeof jobTemplateValue === 'object' && !Array.isArray(jobTemplateValue)","isObject(jobTemplateValue)").replace("jobPodSpec && typeof jobPodSpec === 'object' && !Array.isArray(jobPodSpec)","isObject(jobPodSpec)")
security=segment('function validatePodSecurity(', 'function inspectManifest(')
a=security.index('      const container = object(');b=security.index('\n    }\n  }\n}',a)
container=security[a:b]
security=security[:a]+"      validateContainerSecurity(raw, podSecurity);"+security[b:]
security += '\nfunction validateContainerSecurity(raw: unknown, podSecurity: JsonObject): void {\n'+''.join(x[6:]+'\n' for x in container.splitlines())+'}\n'
write('kubernetes-fixture-pods.ts',"import { object, type JsonObject } from './kubernetes-fixture-values.ts';\n\nfunction isObject(value: unknown): value is JsonObject {\n  return !!value && typeof value === 'object' && !Array.isArray(value);\n}\n\n"+public(pod+security))
# Settings retains original constructor evaluation and assignment order.
fields=segment('  readonly #root:', '  constructor(options:')
ctor=segment('  constructor(options:', '  async #kubectlRun(')
header=ctor[:ctor.index('    if (!DNS_LABEL')]
checks=ctor[ctor.index('    if (!DNS_LABEL'):ctor.index('    const runnerSubject')]
limits=ctor[ctor.index('    for (const [value, label]'):ctor.index('    this.#controllerNamespace')]
ctor=ctor.replace(checks,'    validateAddresses(options);\n').replace(limits,'    validateLimits(options);\n')
# split address checks at storage section for each decision count <=15.
pos=checks.index('    if (options.allowedSecretReferences')
address=checks[:pos]+'    validateStorageOptions(options);\n'
storage=checks[pos:]
helpers='\nfunction validateAddresses(options: KubernetesFixtureCapabilityInvokerOptions): void {\n'+address+'}\n\nfunction validateStorageOptions(options: KubernetesFixtureCapabilityInvokerOptions): void {\n'+storage+'}\n\nfunction validateLimits(options: KubernetesFixtureCapabilityInvokerOptions): void {\n'+limits+'}\n'
options=segment('export interface KubernetesFixtureCapabilityInvokerOptions', 'function object(')
execute=segment('type Execute', 'export interface KubernetesFixtureCapabilityInvokerOptions')
execute=execute.replace('type JsonObject = Record<string, unknown>;\n','')
settingsImports="import fs from 'node:fs';\nimport { validateBusterProcessInputSettings, type BusterProcessInputSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';\nimport { runProcessInput } from './process-input.ts';\nimport { DNS_LABEL, SECRET_NAME, MAX_TIMER_MS, MAX_NAMESPACE_PREFIX_LENGTH, STORAGE_CLASS_NAME } from './kubernetes-fixture-values.ts';\n\n"
write('kubernetes-fixture-settings.ts',settingsImports+execute+options+'export class KubernetesFixtureSettings {\n'+fields.replace('#','')+ctor.replace('this.#','this.')+'}\n'+helpers)
inspection=segment('function inspectManifest(', 'function detail(')
# Turn accumulating lexical locals into explicit traversal state.
statekeys=['workloads','matchedImage','matchedService','serviceTargetPortName','resolvedServiceTargetPort','namedContainerPorts','persistentVolumeTotalBytes']
import re
loop=inspection[inspection.index('  for (const document of documents) {'):inspection.index("  if (workloads < 1)")]
service=loop[loop.index("    if (kind === 'Service') {")+len("    if (kind === 'Service') {\n"):loop.index('    for (const spec of podSpecs(document))')]
service=service.rsplit('    }',1)[0]
pods=loop[loop.index('    for (const spec of podSpecs(document))'):].rsplit('  }',1)[0]
identity=loop[loop.index('    const apiVersion'):loop.index('    for (const claim')]
claims=loop[loop.index('    for (const claim'):loop.index("    if (kind === 'Service')")]
# Separate service validation from matching/port selection.
serviceSplit=service.index('      if (metadata.name === serviceName) {')
serviceSafety=service[:serviceSplit]
serviceSelect=service[serviceSplit:]
containerStart=pods.index("          const containerObject")
containerEnd=pods.rfind('\n        }')
container=pods[containerStart:containerEnd]
portsStart=container.index('          for (const rawPort')
portbody=container[portsStart:]
container=container[:portsStart]+'          recordContainerPorts(containerObject, state);\n'
pods=pods[:containerStart]+'          inspectContainer(container, policy, state);'+pods[containerEnd:]
policykeys=['immutableImage','allowedRegistryPrefixes','serviceName','servicePort','expectedServiceTargetPort','persistentVolumePolicy','maximumResources']
def refs(body):
 for key in statekeys: body=re.sub(r'\b'+key+r'\b','state.'+key,body)
 for key in policykeys: body=re.sub(r'\b'+key+r'\b','policy.'+key,body)
 return body
body="""interface ManifestPolicy {
  readonly immutableImage: string;
  readonly maximumResources: number;
  readonly allowedRegistryPrefixes: readonly string[];
  readonly serviceName: string;
  readonly servicePort: number;
  readonly expectedServiceTargetPort: number | null;
  readonly persistentVolumePolicy: PersistentVolumePolicy;
}
interface InspectionState {
  workloads: number;
  matchedImage: boolean;
  matchedService: boolean;
  serviceTargetPortName: string | null;
  resolvedServiceTargetPort: number | null;
  namedContainerPorts: Map<string, Set<number>>;
  persistentVolumeTotalBytes: bigint;
}
export function inspectManifest(bytes: Buffer, policy: ManifestPolicy):
  { resources: number; workloads: number; serviceTargetPort: number } {
  const loaded = boundedManifestDocuments(bytes);
  const documents = flattenDocuments(loaded, policy.maximumResources);
  if (documents.length < 1 || documents.length > policy.maximumResources) throw new Error('KUBERNETES_FIXTURE_RESOURCE_COUNT_INVALID');
  const state: InspectionState = { workloads: 0, matchedImage: false, matchedService: false,
    serviceTargetPortName: null, resolvedServiceTargetPort: null,
    namedContainerPorts: new Map(), persistentVolumeTotalBytes: 0n };
  for (const document of documents) inspectDocument(document, policy, state);
  return finishInspection(documents.length, policy, state);
}
function inspectDocument(document: JsonObject, policy: ManifestPolicy, state: InspectionState): void {
"""+identity+refs(claims)+"    if (kind === 'Service') inspectService(document, metadata, policy, state);\n    inspectPods(document, policy, state);\n}\n"
body+='function inspectService(document: JsonObject, metadata: JsonObject, policy: ManifestPolicy, state: InspectionState): void {\n'+serviceSafety+'      selectService(spec, metadata, policy, state);\n}\n'
body+='function selectService(spec: JsonObject, metadata: JsonObject, policy: ManifestPolicy, state: InspectionState): void {\n'+refs(serviceSelect)+'}\n'
body+='function inspectPods(document: JsonObject, policy: ManifestPolicy, state: InspectionState): void {\n'+refs(pods)+'}\n'
body+='function inspectContainer(container: unknown, policy: ManifestPolicy, state: InspectionState): void {\n'+refs(container)+'}\n'
body+='function recordContainerPorts(containerObject: JsonObject, state: InspectionState): void {\n'+refs(portbody)+'}\n'
finish=inspection[inspection.index('  if (workloads < 1)'):]
finish=finish[:finish.index('  return {')]+"  return { resources, workloads: state.workloads, serviceTargetPort: state.resolvedServiceTargetPort };\n}\n"
finish=refs(finish).replace('state.state.','state.').replace('workloads: state.workloads','workloads: state.workloads')
# refs converted object property; restore the public result key.
finish=finish.replace('state.workloads:','workloads:')
body+='function finishInspection(resources: number, policy: ManifestPolicy, state: InspectionState) {\n'+finish
imports="import { boundedManifestDocuments } from './kubernetes-manifest.ts';\nimport { flattenDocuments } from './kubernetes-fixture-manifest-files.ts';\nimport { podSpecs, validatePodSecurity } from './kubernetes-fixture-pods.ts';\nimport { persistentVolumeClaims, validatePersistentVolumeClaim, type PersistentVolumePolicy } from './kubernetes-fixture-storage.ts';\nimport { object, text, IMMUTABLE_IMAGE, type JsonObject } from './kubernetes-fixture-values.ts';\n\n"
write('kubernetes-fixture-inspection.ts',imports+segment('const CLUSTER_SCOPED_KINDS', 'type Execute')+body)
readiness=segment('  async #waitLease(', '  async #releaseAfterPrepareFailure(')
readiness=readiness.replace('this.#kubectlRun','this.#run').replace('this.#controllerNamespace','this.#settings.controllerNamespace').replace('this.#pollIntervalMs','this.#settings.pollIntervalMs')
readiness=readiness.replace('#waitLease','waitLease').replace('#waitPods','waitPods').replace('#waitService','waitService')
a=readiness.index('        for (const rawPod of items) {');b=readiness.index('        if (pending.length === 0)',a)
pending=readiness[a:b]
readiness=readiness[:a]+'        collectPendingPods(items, pending);\n'+readiness[b:]
write('kubernetes-fixture-readiness.ts',"import { object, type JsonObject } from './kubernetes-fixture-values.ts';\nimport type { KubernetesFixtureSettings } from './kubernetes-fixture-settings.ts';\n\nexport type KubectlRun = (args: readonly string[], input: Buffer | string | null, signal: AbortSignal, timeout?: number) => Promise<string>;\n\n"+segment('function waitForPoll(', 'export class KubernetesFixtureCapabilityInvoker')+"export class KubernetesFixtureReadiness {\n  readonly #settings: KubernetesFixtureSettings;\n  readonly #run: KubectlRun;\n  constructor(settings: KubernetesFixtureSettings, run: KubectlRun) {\n    this.#settings = settings;\n    this.#run = run;\n  }\n"+readiness+'}\n\nfunction collectPendingPods(items: unknown[], pending: string[]): void {\n'+pending+'}\n')
prepare=segment('  async #prepare(', '  async #release(')
for key in re.findall(r'  readonly #(\w+):',fields): prepare=re.sub(r'this\.\#'+key+r'\b','this.#settings.'+key,prepare)
prepare=prepare.replace('this.#kubectlRun','this.#operations.run').replace('this.#waitLease','this.#operations.readiness.waitLease').replace('this.#waitPods','this.#operations.readiness.waitPods').replace('this.#waitService','this.#operations.readiness.waitService').replace('this.#generatedCredentials','this.#operations.generatedCredentials').replace('this.#releaseAfterPrepareFailure','this.#operations.releaseAfterPrepareFailure')
old="""inspectManifest(bytes, immutableImage, this.#settings.maximumResources, this.#settings.registryPrefixes,
      serviceName, servicePort, expectedServiceTargetPort, {
        allowedStorageClasses: this.#settings.allowedStorageClasses,
        allowDefaultStorageClass: this.#settings.allowDefaultStorageClass,
        maximumClaimBytes: this.#settings.maximumPersistentVolumeClaimBytes,
        maximumTotalBytes: this.#settings.maximumPersistentVolumeTotalBytes,
      })"""
new="""inspectManifest(bytes, { immutableImage, maximumResources: this.#settings.maximumResources,
      allowedRegistryPrefixes: this.#settings.registryPrefixes, serviceName, servicePort, expectedServiceTargetPort,
      persistentVolumePolicy: {
        allowedStorageClasses: this.#settings.allowedStorageClasses,
        allowDefaultStorageClass: this.#settings.allowDefaultStorageClass,
        maximumClaimBytes: this.#settings.maximumPersistentVolumeClaimBytes,
        maximumTotalBytes: this.#settings.maximumPersistentVolumeTotalBytes,
      } })"""
assert old in prepare;prepare=prepare.replace(old,new)
a=prepare.index('    const payload');b=prepare.index('    const retentionSeconds')
readRequest=prepare[a:b]
returnkeys='payload, leaseName, namespaceName, namespacePrefix, immutableImage, manifestDigest, bytes, serviceName, servicePort, secretReferences, facts'
c=prepare.index('    const leaseBytes')
lease=prepare[b:c]
d=prepare.index('    let status: JsonObject;');e=prepare.index('    } catch (error)',d)
active=prepare[d:e];active=active.replace('    let status: JsonObject;\n    try {\n','').replace('      status = await','      const status = await')
# Context objects carry existing values, never recompute authored settings.
head="""import { object, text, integer, stringArray, DNS_LABEL, IMMUTABLE_IMAGE, DIGEST, SECRET_NAME, MAX_NAMESPACE_PREFIX_LENGTH, type JsonObject } from './kubernetes-fixture-values.ts';
import { contained, manifestBytes } from './kubernetes-fixture-manifest-files.ts';
import { inspectManifest } from './kubernetes-fixture-inspection.ts';
import type { KubernetesFixtureSettings } from './kubernetes-fixture-settings.ts';
import type { KubernetesFixtureReadiness, KubectlRun } from './kubernetes-fixture-readiness.ts';
import type { generatedDemoCredentials } from './generated-demo-credentials.ts';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';

interface PreparationOperations {
  readonly run: KubectlRun;
  readonly readiness: KubernetesFixtureReadiness;
  readonly generatedCredentials: (expected: Parameters<typeof generatedDemoCredentials>[2], signal: AbortSignal) => Promise<ReturnType<typeof generatedDemoCredentials>>;
  readonly releaseAfterPrepareFailure: (leaseName: string) => Promise<void>;
}
export class KubernetesFixturePreparation {
  readonly #settings: KubernetesFixtureSettings;
  readonly #operations: PreparationOperations;
  constructor(settings: KubernetesFixtureSettings, operations: PreparationOperations) {
    this.#settings = settings;
    this.#operations = operations;
  }
"""
# Concrete inferred structures without exposing private method types.
readmethod='  #readRequest(request: TestProviderCapabilityRequest) {\n'+readRequest+'    return { '+returnkeys+' };\n  }\n'
readmethod=readmethod.replace('  #readRequest','  readRequest')
leasemethod='  #leaseRequest(request: TestProviderCapabilityRequest, prepared: ReturnType<KubernetesFixturePreparation[\'readRequest\']>) {\n    const { '+returnkeys+' } = prepared;\n'+lease+'    return { lease, retentionSeconds, readinessTimeoutMs, testCredentials };\n  }\n'
# Destructure only used identifiers (avoid unused vars in helpers).
leasemethod=leasemethod.replace(returnkeys,'payload, leaseName, namespaceName, namespacePrefix, immutableImage, manifestDigest, serviceName, servicePort, secretReferences, facts')
leasemethod=leasemethod.replace('  #leaseRequest','  leaseRequest')
activemethod="  async #activate(prepared: ReturnType<KubernetesFixturePreparation['readRequest']>, selected: ReturnType<KubernetesFixturePreparation['leaseRequest']>, signal: AbortSignal) {\n    const { leaseName, namespaceName, immutableImage, manifestDigest, bytes, serviceName, servicePort, secretReferences, facts } = prepared;\n    const { retentionSeconds, readinessTimeoutMs, testCredentials } = selected;\n"+active+'  }\n'
main="  async prepare(request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {\n    const prepared = this.readRequest(request);\n    const selected = this.leaseRequest(request, prepared);\n    const { leaseName } = prepared;\n    const { lease } = selected;\n"+prepare[c:d]+"    try {\n      return await this.#activate(prepared, selected, signal);\n"+prepare[e:]
write('kubernetes-fixture-preparation.ts',head+readmethod+leasemethod+activemethod+main+'}\n')
# Public wrapper keeps command/env access and cleanup boundary.
rest=segment('  async #kubectlRun(', '  async #waitLease(')+segment('  async #releaseAfterPrepareFailure(', '  async #prepare(')+s[s.index('  async #release('):]
for key in re.findall(r'  readonly #(\w+):',fields): rest=re.sub(r'this\.\#'+key+r'\b','this.#settings.'+key,rest)
rest=rest.replace('return this.#prepare(request, signal)','return this.#preparation.prepare(request, signal)')
runtime="""import path from 'node:path';
import { assertGeneratedCredentialLease, generatedDemoCredentials } from './generated-demo-credentials.ts';
import { object, text, DNS_LABEL } from './kubernetes-fixture-values.ts';
import { KubernetesFixtureSettings, type KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-settings.ts';
import { KubernetesFixtureReadiness } from './kubernetes-fixture-readiness.ts';
import { KubernetesFixturePreparation } from './kubernetes-fixture-preparation.ts';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
import type { TestProviderCapabilityInvoker } from './runner.ts';
export type { KubernetesFixtureCapabilityInvokerOptions } from './kubernetes-fixture-settings.ts';

"""+segment('function detail(', 'function waitForPoll(')+"""export class KubernetesFixtureCapabilityInvoker implements TestProviderCapabilityInvoker {
  readonly #settings: KubernetesFixtureSettings;
  readonly #preparation: KubernetesFixturePreparation;
  constructor(options: KubernetesFixtureCapabilityInvokerOptions) {
    this.#settings = new KubernetesFixtureSettings(options);
    const run = this.#kubectlRun.bind(this);
    const readiness = new KubernetesFixtureReadiness(this.#settings, run);
    this.#preparation = new KubernetesFixturePreparation(this.#settings, {
      run, readiness,
      generatedCredentials: this.#generatedCredentials.bind(this),
      releaseAfterPrepareFailure: this.#releaseAfterPrepareFailure.bind(this),
    });
  }
"""+rest
write('kubernetes-fixture-runtime.ts',runtime)
