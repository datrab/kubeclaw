import { QUALITY_TASK_SCHEMA_DIGEST, remotePlanDigest, validatePipelineTestGateContract, type ProviderConfigurationV2, type SelectedProviderPolicyV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { validateRuntimeRegistrationConfiguration, resolveTestProviderConfiguration } from '../registry/configuration.ts';
import { isDeepStrictEqual } from 'node:util';
import { computePackageFileSetDigest } from '../registry/digest.ts';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseDocument } from 'yaml';
import { preflightPipelineV10Owners } from './swarm-bundle.ts';
import { captureWorkerCorePolicy } from './worker-core-policy.ts';
import { captureBusterPreparationV10 } from './buster-preparation-v10.ts';
import { validateBusterAdmissionSettings, validateBusterDependencyReadinessSettings } from './swarm.ts';
import { readBusterRemotePlanServicePolicy, receiveBusterRuntimeV2ServicePolicy, validateBusterRuntimeSourceMetadata } from './buster-service-policy.ts';
import { preflightPipelineV10Infrastructure } from './pipeline-v10-infra.ts';
import type { capturePipelineInputSet } from './pipeline-input-set.ts';
import { composePipelineV10InputSet } from './pipeline-v10-input-set.ts';
import type { RegistrySnapshot } from '../registry/types.ts';
export type PipelineV10ReceiverFamily = 'provider' | 'nova' | 'gateway' | 'launcher';
const catalog = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-receiver-schemas.json', import.meta.url), 'utf8')) as Record<PipelineV10ReceiverFamily, { schema: object }>;
interface Validator { (value: unknown): boolean }
const Constructor = Ajv2020 as unknown as new (options: object) => { compile(schema: object): Validator };
const validators = new Map<string, Validator>();
function requireBinding(value: unknown, code: string): asserts value {
  if (!value) throw new Error(`PIPELINE_V10_RECEIVER_INVALID:${code}`);
}
const sha = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
function parse(raw: Uint8Array): any {
  const text = Buffer.from(raw).toString('utf8');
  try {
    requireBinding(parseDocument(text,{version:'1.2',schema:'json',strict:true,uniqueKeys:true}).errors.length===0,'JSON');
    return JSON.parse(text);
  } catch { throw new Error('PIPELINE_V10_RECEIVER_INVALID:JSON'); }
}

/** Inspection only, NEVER a receiver admission/issuer/native/caller grant.
 * Source capture shape is not authentication. Exact original author/schema/
 * profile/package/tool/image/key/issuer/caller closure remains mandatory.
 * Raw output SHA is separate from stable root/input SHA (no digest cycle).
 * Provider-v2 has no input-generation field: report linkage separately rather
 * than insert an invented field or silently rebrand old output as a v4 wire.
 */
export function inspectPipelineV10Receiver(family: PipelineV10ReceiverFamily, output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  requireBinding(Object.hasOwn(catalog,family),'FAMILY');
  let valid=validators.get(family);
  if(!valid){const compiler=new Constructor({strict:true,allErrors:true,allowUnionTypes:true});(addFormats as unknown as (v:unknown)=>void)(compiler);valid=compiler.compile(catalog[family].schema);validators.set(family,valid);}
  const raw=Buffer.from(output), document=parse(raw);requireBinding(valid(document),'SCHEMA');
  inputs.assertCurrent();
  const root=inputs.read('config/pipeline.config.json'), rootDocument=parse(root);
  requireBinding(rootDocument.schemaVersion==='pipeline-entry.v10','ROOT_VERSION');
  const rootRawSha256=sha(root);
  if(family==='provider') requireBinding(document.selectedPolicy.binding.rootDigest===`sha256:${rootRawSha256}`,'ROOT_IDENTITY');
  else {
    const binding=family==='nova'?document.binding:document;
    requireBinding(binding.rootRawSha256===rootRawSha256,'ROOT_IDENTITY');
    requireBinding(binding.inputGenerationSha256===inputs.inputGenerationSha256,'INPUT_IDENTITY');
  }
  inputs.assertCurrent();
  return Object.freeze({family,rootRawSha256,inputGenerationSha256:inputs.inputGenerationSha256,
    outputRawSha256:sha(raw),activationAllowed:false as const});
}

/** Stronger local Nova tuple/raw-source inspection, STILL NOT source/caller
 * authorization. The historical profile digest uses Python sorted JSON, NOT
 * automatically the SDK codec; no unversioned substitution is made here.
 */
export function inspectPipelineV10NovaSourceIdentity(output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  const raw = Buffer.from(output);
  const identity = inspectPipelineV10Receiver('nova', raw, inputs);
  const document = parse(raw), binding = document.binding;
  const root = parse(inputs.read('config/pipeline.config.json'));
  requireBinding(Array.isArray(root.pluginSelections), 'SELECTIONS');
  const fields = ['kind','packageId','registrationId','instanceId','ownerPath','profileId','serviceInstanceId'];
  const selections = root.pluginSelections.filter((row: any) => fields.every(key => row[key] === binding[key]));
  requireBinding(selections.length === 1, 'EXACT_NOVA_TUPLE');
  // Fixed reviewed source paths only; never resolve arbitrary output owner paths.
  const plugins = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-plugin-schemas.json', import.meta.url), 'utf8'));
  const source = plugins.packages[binding.packageId];
  requireBinding(source && source.family === 'nova-module' && source.ownerPath === binding.ownerPath, 'NOVA_SOURCE');
  const ownerBytes = inputs.read(`config/${source.ownerPath}`), owner = parse(ownerBytes);
  requireBinding(binding.ownerRawSha256 === sha(ownerBytes), 'OWNER_RAW_IDENTITY');
  requireBinding(owner.packageId === binding.packageId && owner.instanceId === binding.instanceId
    && (owner.registrationId === undefined || owner.registrationId === binding.registrationId), 'OWNER_SELECTION');
  requireBinding(Object.hasOwn(owner.profiles, binding.profileId), 'OWNER_PROFILE');
  const processing = owner.profiles[binding.profileId].processing;
  const selected = Object.hasOwn(processing, binding.registrationId) ? processing[binding.registrationId] : processing;
  requireBinding(isDeepStrictEqual(document.configuration, selected), 'SELECTED_CONFIGURATION');
  const schemaName = source.provenance.schemaPath.split('/schemas/')[1];
  requireBinding(schemaName && !schemaName.split('/').some((part: string) => !part || part === '.' || part === '..'), 'OWNER_SCHEMA_PATH');
  requireBinding(binding.ownerSchemaSha256 === sha(inputs.read(`schemas/${schemaName}`)), 'OWNER_SCHEMA_IDENTITY');
  const manifestBytes = inputs.read(source.manifestPath), manifest = parse(manifestBytes);
  requireBinding(binding.manifestSha256 === sha(manifestBytes), 'MANIFEST_IDENTITY');
  const section = binding.kind === 'adapter' ? manifest.adapters : binding.kind === 'stage' ? manifest.stages : undefined;
  requireBinding(Array.isArray(section) && section.filter((row: any) => `${manifest.id}:${row.id}` === binding.registrationId).length === 1
    && manifest.id === binding.packageId, 'MANIFEST_REGISTRATION');
  const packages = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-package-sources.json', import.meta.url), 'utf8'));
  const pkg = packages.packages[binding.packageId];
  requireBinding(pkg, 'PACKAGE_SOURCE');
  const files = pkg.files.map((row: any) => ({ relative: row.path, bytes: inputs.read(`${pkg.generationRoot}/${row.path}`) }));
  requireBinding(computePackageFileSetDigest(files) === binding.sourcePackageDigest, 'PACKAGE_CONTENT_IDENTITY');
  requireBinding(binding.runtimeDispatchOwnerRawSha256 === sha(inputs.read('config/plugins/kubeclaw.runtime-dispatch.config.json')), 'RUNTIME_DISPATCH_OWNER');
  inputs.assertCurrent();
  return Object.freeze({ ...identity, selectedConfigurationVerified: true as const,
    profileDigestVerified: false as const, originalAuthorizationVerified: false as const });
}

/** LOCAL original RegistrySnapshot/captured-source coherence only. The real
 * registry has no stage-instance identity: selected instance remains a tuple
 * observation, NOT authenticated per-stage binding, installed grant or receipt.
 * No plugin imports/activation; stage and adapter surfaces remain distinct.
 */
export function inspectPipelineV10NovaRegistryIdentity(output:Uint8Array,registry:RegistrySnapshot,
  inputs:Pick<ReturnType<typeof capturePipelineInputSet>,'inputGenerationSha256'|'read'|'assertCurrent'>) {
  const raw=Buffer.from(output),identity=inspectPipelineV10NovaSourceIdentity(raw,inputs);
  const {binding}=parse(raw);
  const sources=JSON.parse(fs.readFileSync(new URL('./pipeline-v10-plugin-schemas.json',import.meta.url),'utf8'));
  const manifest=parse(inputs.read(sources.packages[binding.packageId].manifestPath));
  const declaration=(binding.kind==='stage'?manifest.stages:manifest.adapters)
    .find((row:any)=>`${manifest.id}:${row.id}`===binding.registrationId);
  const entry=binding.kind==='stage'?registry.stages.get(declaration.type):registry.adapters.get(binding.registrationId);
  requireBinding(entry,'REGISTRY_REGISTRATION_MISSING');
  const pkg=registry.packages.get(binding.packageId);
  requireBinding(pkg&&pkg===entry.package&&isDeepStrictEqual(pkg.manifest,manifest),'REGISTRY_PACKAGE_MANIFEST');
  requireBinding(isDeepStrictEqual(entry.registration,declaration),'REGISTRY_DECLARATION');
  const provenance=entry.provenance;
  requireBinding(provenance.schemaVersion==='registration-provenance.v2'&&provenance.surface===binding.kind
    &&provenance.registrationId===declaration.id&&isDeepStrictEqual(provenance.package,pkg.provenance),'REGISTRY_PROVENANCE');
  const packageIdentity=pkg.provenance.package;
  requireBinding(packageIdentity.pluginId===binding.packageId&&packageIdentity.apiVersion===manifest.apiVersion
    &&packageIdentity.packageVersion===manifest.packageVersion&&packageIdentity.contentDigest===binding.sourcePackageDigest,
    'REGISTRY_PACKAGE_IDENTITY');
  requireBinding(registry.apiVersion===manifest.apiVersion,'REGISTRY_API_VERSION');
  // Source coherence is necessary but not the original configuration ABI.
  // Validate every retained owner profile through the SAME registry consumer;
  // do not resolve defaults, import modules or grant a stage-instance identity.
  const owner=parse(inputs.read(`config/${binding.ownerPath}`));
  for(const profile of Object.values(owner.profiles) as any[]) {
    const processing=profile.processing;
    const configuration=Object.hasOwn(processing,binding.registrationId)?processing[binding.registrationId]:processing;
    validateRuntimeRegistrationConfiguration(registry,new Set([binding.registrationId]),{
      stages:binding.kind==='stage'?[{type:declaration.type,config:configuration}]:[],
      observers:new Map(),
      adapters:binding.kind==='adapter'?new Map([[binding.registrationId,configuration]]):new Map(),
    });
  }
  inputs.assertCurrent();
  return Object.freeze({...identity,registrationSurface:binding.kind as 'stage'|'adapter',registrationId:binding.registrationId as string,
    stageType:binding.kind==='stage'?declaration.type as string:null,
    selectedInstanceId:binding.instanceId as string,registrySourceCoherent:true as const,
    installedSourceAuthorizationVerified:false as const,stageInstanceAuthorizationVerified:false as const,
    callerAuthorizationVerified:false as const,originalRunAuthorizationVerified:false as const});
}

/** Other declared families' LOCAL source identity, not a shared caller grant.
 * Captured hashes/content do not authenticate C3/task/issuer/key/native scopes.
 */
export function inspectPipelineV10SelectedSourceIdentity(family: 'provider' | 'gateway' | 'launcher', output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  const raw = Buffer.from(output), identity = inspectPipelineV10Receiver(family, raw, inputs);
  const document = parse(raw), root = parse(inputs.read('config/pipeline.config.json'));
  const exact = (rows: any[], value: any, fields: string[], code: string) => {
    requireBinding(Array.isArray(rows), code);
    const matches = rows.filter(row => fields.every(key => row[key] === value[key]));
    requireBinding(matches.length === 1, code); return matches[0];
  };
  if (family === 'provider') {
    const binding = document.selectedPolicy.binding;
    const tuple = exact(root.pluginSelections, binding, ['kind','packageId','registrationId','instanceId','profileId','serviceInstanceId'], 'EXACT_PROVIDER_TUPLE');
    const plugins = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-plugin-schemas.json', import.meta.url), 'utf8'));
    const source = plugins.packages[tuple.packageId];
    requireBinding(source && source.family === 'provider' && source.ownerPath === tuple.ownerPath
      && (binding.ownerPath === undefined || binding.ownerPath === source.ownerPath), 'PROVIDER_SOURCE');
    const ownerBytes = inputs.read(`config/${source.ownerPath}`), owner = parse(ownerBytes);
    requireBinding(binding.ownerDigest === `sha256:${sha(ownerBytes)}`, 'OWNER_RAW_IDENTITY');
    requireBinding(owner.instanceId === tuple.instanceId && owner.packageId === tuple.packageId
      && Object.hasOwn(owner.profiles, tuple.profileId), 'OWNER_SELECTION');
    const manifestBytes = inputs.read(source.manifestPath), manifest = parse(manifestBytes);
    requireBinding(manifest.id === tuple.packageId && binding.packageVersion === manifest.packageVersion, 'PACKAGE_VERSION');
    const declarations = manifest.testProviders?.filter((row: any) => `${manifest.id}:${row.id}` === tuple.registrationId);
    requireBinding(declarations?.length === 1, 'MANIFEST_REGISTRATION');
    const declaration = declarations[0];
    requireBinding(document.contractId === declaration.contractId, 'TASK_CONTRACT');
    const schemaName = source.provenance.schemaPath.split('/schemas/')[1];
    requireBinding(schemaName && !schemaName.split('/').some((part: string) => !part || part === '.' || part === '..'), 'OWNER_SCHEMA_PATH');
    requireBinding(binding.ownerSchemaDigest === `sha256:${sha(inputs.read(`schemas/${schemaName}`))}`, 'OWNER_SCHEMA_IDENTITY');
    // Locator comes from the fixed reviewed declaration, not arbitrary output.
    const schemaPath = `${source.manifestPath.slice(0, source.manifestPath.lastIndexOf('/'))}/${declaration.configSchema}`;
    // v1 package config schema remains immutable source. Quality v2 task values
    // instead use the separately versioned closed-empty task ABI, not that v1 digest.
    const quality = ['kubeclaw.size-budget', 'kubeclaw.coverage-budget'].includes(tuple.packageId);
    inputs.read(schemaPath);
    const taskDigest = quality ? QUALITY_TASK_SCHEMA_DIGEST : `sha256:${sha(inputs.read(schemaPath))}`;
    requireBinding(binding.taskSchemaDigest === taskDigest && document.taskSchemaDigest === taskDigest, 'TASK_SCHEMA_IDENTITY');
    const packages = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-package-sources.json', import.meta.url), 'utf8'));
    const pkg = packages.packages[tuple.packageId]; requireBinding(pkg, 'PACKAGE_SOURCE');
    const files = pkg.files.map((row: any) => ({ relative: row.path, bytes: inputs.read(`${pkg.generationRoot}/${row.path}`) }));
    requireBinding(binding.packageContentDigest === computePackageFileSetDigest(files), 'PACKAGE_CONTENT_IDENTITY');
    const profile = owner.profiles[tuple.profileId];
    const selected = tuple.packageId === 'kubeclaw.security-providers' ? profile.registrations[declaration.id] : profile;
    requireBinding(selected && isDeepStrictEqual(document.selectedPolicy.processing, selected.processing)
      && isDeepStrictEqual(document.selectedPolicy.declarations, selected.declarations), 'SELECTED_CONFIGURATION');
    if (quality) {
      // Validate the WHOLE original owner, including profiles not selected here.
      // Frozen schema bytes and raw owner digest are already tied above to this
      // same captured file-set; this is still not installed caller authorization.
      const schemaBytes = inputs.read(`schemas/${schemaName}`);
      const compiler = new Constructor({ strict: true, allErrors: true });
      const validateOwner = compiler.compile(parse(schemaBytes));
      requireBinding(validateOwner(owner), 'QUALITY_OWNER_SCHEMA');
      for (const [profileId, profile] of Object.entries(owner.profiles) as [string, any][]) {
        const configuration = { ...document, selectedPolicy: { ...document.selectedPolicy,
          processing: profile.processing, declarations: profile.declarations,
          binding: { ...binding, profileId, profileDigest: remotePlanDigest(profile) } } };
        validatePipelineTestGateContract('providerConfiguration', configuration);
      }
      validatePipelineTestGateContract('providerConfiguration', document);
    }
    const engine = exact(root.bindings, { role: 'buster', owner: 'buster-engine', instanceId: tuple.serviceInstanceId }, ['role','owner','instanceId'], 'PROVIDER_ENGINE_PEER');
    exact(root.bindings, { role: 'buster', owner: 'worker-core', instanceId: tuple.serviceInstanceId }, ['role','owner','instanceId'], 'PROVIDER_WORKER_PEER');
    if (binding.runtimeRole !== undefined) requireBinding(binding.runtimeRole === 'buster' && binding.componentInstanceId === engine.instanceId
      && binding.componentProfileId === engine.profileId, 'C3_COMPONENT_SELECTION');
    if (binding.componentOwnerDigest !== undefined) requireBinding(binding.componentOwnerDigest === `sha256:${sha(inputs.read('config/components/buster-engine.config.json'))}`, 'C3_OWNER_RAW_IDENTITY');
  } else {
    const launcher = family === 'launcher';
    const fields = launcher ? ['kind','role','engineId','engineInstanceId','serviceInstanceId','consumer','ownerPath','profileId','controlComponentInstanceId']
      : ['role','deploymentInstanceId','consumer','serviceInstanceId','ownerPath','profileId'];
    const tuple = exact(launcher ? root.engineSelections : root.deploymentSelections, document.selection, fields, 'EXACT_SERVICE_TUPLE');
    requireBinding(tuple.ownerPath === (launcher ? 'engines/prism-agent.config.json' : 'charts/kubeclaw/values.yaml'), 'SERVICE_OWNER_PATH');
    const ownerBytes = inputs.read(launcher ? 'config/engines/prism-agent.config.json' : 'charts/kubeclaw/values.yaml');
    const owner = parse(ownerBytes), profile = owner.profiles[tuple.profileId]; requireBinding(profile, 'OWNER_PROFILE');
    requireBinding(document.ownerRawSha256 === sha(ownerBytes), 'OWNER_RAW_IDENTITY');
    requireBinding(document.ownerSchemaSha256 === sha(inputs.read(launcher ? 'schemas/prism-agent-launcher.schema.json' : 'schemas/controller-owner.schema.json')), 'OWNER_SCHEMA_IDENTITY');
    if (launcher) {
      exact(root.bindings, { role: 'prism', owner: 'prism-control', instanceId: tuple.controlComponentInstanceId }, ['role','owner','instanceId'], 'LAUNCHER_CONTROL_PEER');
      requireBinding(isDeepStrictEqual(document.policy, profile), 'SELECTED_CONFIGURATION');
      // receiver stays control-agent-jobs OR prism-agent-bridge as originally
      // declared; the same policy view does NOT union their authenticated scope.
    } else {
      requireBinding(tuple.consumer === 'openclaw-gateway' && profile.role === tuple.role && profile.instanceId === tuple.serviceInstanceId, 'GATEWAY_ROLE_INSTANCE');
      const ref = profile.readonlyBindings.bootstrapContextRef;
      const allowed = profile.role === 'buster' ? 'managed-bootstrap-context.json' : profile.role === 'nova' ? 'generated-contexts/nova-bootstrap-context.json' : 'generated-contexts/prism-bootstrap-context.json';
      requireBinding(ref.path === allowed, 'GATEWAY_CONTEXT_PATH');
      const contextBytes = inputs.read(allowed), context = parse(contextBytes).contexts[ref.pointer.slice('/contexts/'.length)];
      requireBinding(document.contextRawSha256 === sha(contextBytes), 'GATEWAY_CONTEXT_IDENTITY');
      requireBinding(context && ref.pointer === `/contexts/${context.association.receivingProfileId}` && context.association.ownerProfileId === tuple.profileId, 'GATEWAY_CONTEXT_PROFILE');
      const managed = structuredClone(profile.settings.gatewayOpenClaw); managed.memory.search.remote.baseUrl = profile.settings.litellm.endpoint;
      const gateway = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-gateway-sources.json', import.meta.url), 'utf8'));
      const keys = Object.keys(gateway.profileSchema.properties.readonlyBindings.properties);
      const bindings = Object.fromEntries(keys.filter(key => Object.hasOwn(profile.readonlyBindings, key)).map(key => [key, profile.readonlyBindings[key]]));
      requireBinding(isDeepStrictEqual(document.policy, { schemaVersion: 'gateway-openclaw-profile.v1-proposal', profileId: context.association.receivingProfileId,
        role: profile.role, instanceId: profile.instanceId, managedOpenClaw: managed, readonlyBindings: bindings }), 'SELECTED_CONFIGURATION');
    }
  }
  inputs.assertCurrent();
  return Object.freeze({ ...identity, selectedConfigurationVerified: true as const,
    profileDigestVerified: family === 'provider' && ['kubeclaw.size-budget@1', 'kubeclaw.coverage-budget@1'].includes(document.contractId), originalAuthorizationVerified: false as const, c3AuthorizationVerified: false as const });
}

/** Existing controller/recovery sourceAssociations.selected business-profile
 * projection only (same-entry-deployment-binding-02/check-selection-stands).
 * These contracts do NOT declare a root/input/issuer transport wrapper. Never
 * fabricate one or treat this local selection argument as a caller identity.
 */
export function inspectPipelineV10InfrastructureSourceIdentity(family: 'controller' | 'recovery', selection: unknown,
  output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  requireBinding(family === 'controller' || family === 'recovery', 'INFRA_FAMILY');
  const controller = family === 'controller';
  const fields = controller
    ? ['role','deploymentInstanceId','ownerPath','profileId','consumer','serviceInstanceId','busterComponentInstanceId','controlComponentInstanceId']
    : ['role','deploymentInstanceId','ownerPath','profileId'];
  requireBinding(selection && typeof selection === 'object' && !Array.isArray(selection), 'INFRA_SELECTION');
  // Snapshot the caller-supplied tuple before reading the retained generation.
  const tuple = parse(Buffer.from(JSON.stringify(selection)));
  requireBinding(Object.keys(tuple).length === fields.length && fields.every(key => typeof tuple[key] === 'string'), 'INFRA_SELECTION');
  const raw = Buffer.from(output), projected = parse(raw);
  inputs.assertCurrent();
  const rootBytes = inputs.read('config/pipeline.config.json'), root = parse(rootBytes);
  requireBinding(root.schemaVersion === 'pipeline-entry.v10', 'ROOT_VERSION');
  const rows = controller ? root.deploymentSelections : root.infrastructureSelections;
  requireBinding(Array.isArray(rows) && rows.filter((row: any) => isDeepStrictEqual(row, tuple)).length === 1, 'EXACT_INFRA_TUPLE');
  requireBinding(controller ? tuple.role === 'buster' && tuple.consumer === 'namespace-controller'
    : tuple.role === 'postgresql-recovery', 'INFRA_SCOPE');
  const ownerPath = controller ? 'charts/kubeclaw/values.yaml' : 'my-values/infra/postgresql-recovery.yaml';
  requireBinding(tuple.ownerPath === ownerPath, 'INFRA_OWNER_PATH');
  const ownerBytes = inputs.read(ownerPath);
  const ownerDocument = parseDocument(ownerBytes.toString('utf8'), {version:'1.2',uniqueKeys:true,strict:true});
  requireBinding(ownerDocument.errors.length === 0, 'INFRA_OWNER_PARSE');
  const owner = ownerDocument.toJS();
  const components = Object.fromEntries(Object.entries(root.components).map(([name, relative]) =>
    [name, parse(inputs.read(`config/${relative}`))]));
  // ALL original owner profiles, intrinsic relations and exact component peers,
  // not just a schema-valid selected profile. No source code is imported here.
  preflightPipelineV10Infrastructure(root, components, relative => inputs.read(relative));
  requireBinding(isDeepStrictEqual(projected, owner.profiles[tuple.profileId]), 'SELECTED_CONFIGURATION');
  const schemaPath = controller ? 'schemas/controller-owner.schema.json' : 'schemas/recovery02/postgresql-recovery-policy.schema.json';
  const ownerSchemaRawSha256 = sha(inputs.read(schemaPath));
  inputs.assertCurrent();
  return Object.freeze({family, rootRawSha256:sha(rootBytes), inputGenerationSha256:inputs.inputGenerationSha256,
    outputRawSha256:sha(raw), ownerRawSha256:sha(ownerBytes), ownerSchemaRawSha256,
    selectedConfigurationVerified:true as const, profileDigestVerified:false as const,
    originalAuthorizationVerified:false as const, c3AuthorizationVerified:false as const, activationAllowed:false as const});
}

/** Network HTTP consumes plain AdapterActivationContext.config, NOT the
 * Test-Provider v2 wrapper. Selection/content inspection is not installation,
 * SDK/capability/registry/caller authorization, and never executes activate().
 */
export function inspectPipelineV10NetworkAdapterSourceIdentity(selection: unknown, output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>,
  registry?: RegistrySnapshot) {
  requireBinding(selection && typeof selection === 'object' && !Array.isArray(selection), 'ADAPTER_SELECTION');
  const tuple = parse(Buffer.from(JSON.stringify(selection))), raw = Buffer.from(output), configuration = parse(raw);
  const fields = ['kind','packageId','registrationId','instanceId','ownerPath','profileId','serviceInstanceId'];
  requireBinding(Object.keys(tuple).length === fields.length && fields.every(key => typeof tuple[key] === 'string'), 'ADAPTER_SELECTION');
  requireBinding(tuple.kind === 'adapter' && tuple.packageId === 'kubeclaw.network-http'
    && tuple.registrationId === 'kubeclaw.network-http:http' && tuple.ownerPath === 'plugins/kubeclaw.network-http.config.json', 'ADAPTER_FAMILY');
  inputs.assertCurrent();
  const rootBytes = inputs.read('config/pipeline.config.json'), root = parse(rootBytes);
  requireBinding(root.schemaVersion === 'pipeline-entry.v10', 'ROOT_VERSION');
  requireBinding(Array.isArray(root.pluginSelections)
    && root.pluginSelections.filter((row: any) => isDeepStrictEqual(row, tuple)).length === 1, 'EXACT_ADAPTER_TUPLE');
  const sources = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-plugin-schemas.json', import.meta.url), 'utf8'));
  const source = sources.packages['kubeclaw.network-http'];
  const ownerBytes = inputs.read('config/plugins/kubeclaw.network-http.config.json'), owner = parse(ownerBytes);
  const manifestBytes = inputs.read(source.manifestPath), manifest = parse(manifestBytes);
  requireBinding(isDeepStrictEqual(manifest, source.manifest), 'ADAPTER_MANIFEST');
  const declaration = manifest.adapters.find((row: any) => row.id === 'http');
  requireBinding(declaration && declaration.module === 'src/adapter.ts' && declaration.export === 'activate'
    && declaration.configSchema === 'schemas/config.schema.json', 'ADAPTER_DECLARATION');
  const packageRoot = source.manifestPath.slice(0, source.manifestPath.lastIndexOf('/'));
  const configSchemaBytes = inputs.read(`${packageRoot}/schemas/config.schema.json`);
  const packages = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-package-sources.json', import.meta.url), 'utf8'));
  const pkg = packages.packages['kubeclaw.network-http'];
  const sourcePackageDigest = computePackageFileSetDigest(pkg.files.map((row: any) =>
    ({relative:row.path,bytes:inputs.read(`${pkg.generationRoot}/${row.path}`)})));
  requireBinding(sourcePackageDigest === pkg.contentDigest, 'ADAPTER_PACKAGE_CONTENT');
  const validate = (key: string, schema: object, value: unknown) => {
    let validator = validators.get(key);
    if (!validator) {
      // No defaults/coercion: all selected processing values are authored.
      const compiler = new Constructor({strict:true,allErrors:true,allowUnionTypes:true});
      (addFormats as unknown as (value:unknown)=>void)(compiler);
      validator = compiler.compile(schema); validators.set(key, validator);
    }
    requireBinding(validator(value), 'ADAPTER_SCHEMA');
  };
  validate('network-owner', source.schema, owner);
  requireBinding(owner.instanceId === tuple.instanceId && owner.registrationId === tuple.registrationId
    && Object.hasOwn(owner.profiles, tuple.profileId), 'ADAPTER_OWNER_SELECTION');
  // The inherited owner processing schema is intentionally stricter than the
  // original optional/defaulted adapter config. Preserve every authored field;
  // validate the original config too, without silently inserting defaults.
  const configSchema = parse(configSchemaBytes);
  for (const profile of Object.values(owner.profiles) as any[]) {
    validate('network-config', configSchema, profile.processing);
    for (const origin of profile.processing.allowedOrigins) {
      try { new URL(origin); } catch { throw new Error('PIPELINE_V10_RECEIVER_INVALID:ADAPTER_ORIGIN'); }
    }
  }
  requireBinding(isDeepStrictEqual(configuration, owner.profiles[tuple.profileId].processing), 'SELECTED_CONFIGURATION');
  const ownerSchemaRawSha256 = sha(inputs.read('schemas/security/kubeclaw.network-http.schema.json'));
  if (registry) {
    // Use the original effect-free configuration consumer and its retained
    // compiled schemas, not a freshly imported adapter or output-shaped grant.
    const entry = registry.adapters.get(tuple.registrationId);
    const installed = registry.packages.get(tuple.packageId);
    requireBinding(registry.apiVersion === manifest.apiVersion, 'ADAPTER_REGISTRY_API_VERSION');
    requireBinding(entry && installed && entry.package === installed
      && isDeepStrictEqual(installed.manifest, manifest), 'ADAPTER_REGISTRY_PACKAGE');
    requireBinding(isDeepStrictEqual(entry!.registration, declaration)
      && entry!.provenance.schemaVersion === 'registration-provenance.v2'
      && entry!.provenance.surface === 'adapter'
      && entry!.provenance.registrationId === declaration.id
      && isDeepStrictEqual(entry!.provenance.package, installed!.provenance), 'ADAPTER_REGISTRY_PROVENANCE');
    const identity = installed!.provenance.package;
    requireBinding(identity.pluginId === tuple.packageId && identity.apiVersion === manifest.apiVersion
      && identity.packageVersion === manifest.packageVersion && identity.contentDigest === sourcePackageDigest,
      'ADAPTER_REGISTRY_SOURCE');
    // All original profiles must work in the same actual registry ABI. No
    // resolve/default insertion, stage/provider wrapper or activation is used.
    for (const profile of Object.values(owner.profiles) as any[]) {
      validateRuntimeRegistrationConfiguration(registry, new Set([tuple.registrationId]), {
        stages: [], observers: new Map(), adapters: new Map([[tuple.registrationId, profile.processing]]),
      });
    }
  }
  inputs.assertCurrent();
  return Object.freeze({family:'network-adapter' as const, rootRawSha256:sha(rootBytes), inputGenerationSha256:inputs.inputGenerationSha256,
    outputRawSha256:sha(raw), ownerRawSha256:sha(ownerBytes), ownerSchemaRawSha256, manifestRawSha256:sha(manifestBytes),
    configSchemaRawSha256:sha(configSchemaBytes), sourcePackageDigest,
    registrySourceCoherent: registry !== undefined, installedSourceAuthorizationVerified:false as const,
    callerAuthorizationVerified:false as const,
    selectedConfigurationVerified:true as const, profileDigestVerified:false as const,
    originalAuthorizationVerified:false as const, c3AuthorizationVerified:false as const, activationAllowed:false as const});
}

/** PACKAGE core.receiving names three separate settings projections, not a new
 * transport wrapper. Raw Platform paths remain relative to the original Core
 * AUTHOR directory: this inspector neither resolves them against delivered
 * capture/CWD nor calls prepareRuntime/compiler/journal/lock effect paths.
 */
export function inspectPipelineV10CoreSourceIdentity(member: 'platform' | 'projectCompiler' | 'runtimeLocks',
  selection: unknown, output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'members' | 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  requireBinding(['platform','projectCompiler','runtimeLocks'].includes(member), 'CORE_MEMBER');
  requireBinding(selection && typeof selection === 'object' && !Array.isArray(selection), 'CORE_SELECTION');
  const tuple = parse(Buffer.from(JSON.stringify(selection))), raw = Buffer.from(output), projected = parse(raw);
  const fields = ['role','instanceId','ownerPath','profileId'];
  requireBinding(Object.keys(tuple).length === fields.length && fields.every(key => typeof tuple[key] === 'string'), 'CORE_SELECTION');
  requireBinding(tuple.role === 'nova' && tuple.ownerPath === 'nova/core.config.json', 'CORE_SCOPE');
  inputs.assertCurrent();
  const rootBytes = inputs.read('config/pipeline.config.json'), root = parse(rootBytes);
  requireBinding(root.schemaVersion === 'pipeline-entry.v10', 'ROOT_VERSION');
  requireBinding(isDeepStrictEqual(root.novaCoreSelection, tuple), 'EXACT_CORE_TUPLE');
  const ownerBytes = inputs.read('config/nova/core.config.json'), owner = parse(ownerBytes);
  const components = Object.fromEntries(Object.entries(root.components).map(([name, relative]) =>
    [name, parse(inputs.read(`config/${relative}`))]));
  // Complete owner validation includes ALL four Core profiles, exact original
  // Platform/compiler schema dependencies and renewEvery < TTL. Lock policies
  // and compiler helper groups are never inferred from other timeout leaves.
  preflightPipelineV10Infrastructure(root, components, relative => inputs.read(relative));
  requireBinding(isDeepStrictEqual(projected, owner.profiles[tuple.profileId].settings[member]), 'SELECTED_CONFIGURATION');
  const ownerSchemaRawSha256 = sha(inputs.read('schemas/nova-core-owner.schema.json'));
  const sourceInspection = inspectPipelineV10CoreSourceClosure(inputs);
  inputs.assertCurrent();
  return Object.freeze({family:'nova-core' as const, member, rootRawSha256:sha(rootBytes),
    inputGenerationSha256:inputs.inputGenerationSha256, outputRawSha256:sha(raw),
    ownerRawSha256:sha(ownerBytes), ownerSchemaRawSha256, sourceInspection, selectedConfigurationVerified:true as const,
    canonicalAuthorPathVerified:false as const, profileDigestVerified:false as const,
    originalAuthorizationVerified:false as const, c3AuthorizationVerified:false as const, activationAllowed:false as const});
}

/** Observed ORIGINAL Core substrate subset from PACKAGE core.receiving and
 * WFINAL-01/02 consumers. Not an exhaustive SDK/NPM/transitive import graph.
 * Missing members remain missing: no live-source read or roster append repairs
 * them. No canonical AUTHOR/issuer/task binding exists in the current capture.
 */
export function inspectPipelineV10CoreSourceClosure(
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'members' | 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  inputs.assertCurrent();
  const rootBytes = inputs.read('config/pipeline.config.json');
  requireBinding(parse(rootBytes).schemaVersion === 'pipeline-entry.v10', 'ROOT_VERSION');
  const schemaBytes = inputs.read('schemas/pipeline-entry.schema.json');
  const descriptor = (relativePath: string, bytes: Buffer) => ({relativePath,byteLength:bytes.byteLength,sha256:sha(bytes)});
  const declared = composePipelineV10InputSet([descriptor('config/pipeline.config.json',rootBytes),
    descriptor('schemas/pipeline-entry.schema.json',schemaBytes)]);
  requireBinding(isDeepStrictEqual(inputs.members,declared.members)
    && inputs.inputGenerationSha256 === declared.inputGenerationSha256, 'CORE_SOURCE_ROSTER');
  const paths = [
    'skills/common/plugin-runtime/foundation/config/platform.ts',
    'skills/common/plugin-runtime/foundation/config/platform.schema.json',
    'skills/nova/core/state/journal.ts', 'skills/nova/core/state/file-mutex.ts',
    'skills/nova/core/state/json-value.ts', 'skills/nova/core/execution/run-mutation.ts',
    'skills/nova/core/effects/locks.ts', 'skills/common/plugin-runtime/foundation/observability/hash-journal.ts',
    'skills/nova/core/execution/engine-runtime.ts', 'skills/nova/project/compiler.ts',
  ].map(path => `source-current/${path}`);
  const observed: {relativePath:string;byteLength:number;sha256:string}[] = [], missing: string[] = [];
  for (const relativePath of paths) {
    const row = declared.members.find(member => member.relativePath === relativePath);
    if (!row) { missing.push(relativePath); continue; }
    const actual = descriptor(relativePath,inputs.read(relativePath));
    requireBinding(isDeepStrictEqual(actual,row), 'CORE_SOURCE_RAW_IDENTITY');
    observed.push(Object.freeze(actual));
  }
  // Named direct local edges of the observed lock/journal/Platform substrate,
  // NOT a claim that all imports of engine-runtime/compiler are closed.
  const edges = [[0,1],[2,3],[2,4],[2,7],[5,6],[6,2],[6,3]] as const;
  const present = new Set(observed.map(row => row.relativePath));
  const localDependencies = edges.map(([from,to]) => Object.freeze({from:paths[from]!,to:paths[to]!,
    fromCaptured:present.has(paths[from]!),toCaptured:present.has(paths[to]!)}));
  inputs.assertCurrent();
  return Object.freeze({inputGenerationSha256:inputs.inputGenerationSha256, declaredMemberCount:declared.members.length,
    observed:Object.freeze(observed), missing:Object.freeze(missing), localDependencies:Object.freeze(localDependencies),
    sourceClosureVerified:false as const, canonicalAuthorPathVerified:false as const,
    originalAuthorizationVerified:false as const, activationAllowed:false as const});
}

/** Local source-to-real-registry Quality bridge. The returned immutable v2
 * configuration is the SAME ABI used by the resolver/runner, not a new policy
 * author. This deliberately returns no caller grant or activated root. The
 * production boot/original inputStore admission remains required before use.
 */
export function inspectPipelineV10QualityRegistryConfiguration(output: Uint8Array, registry: RegistrySnapshot,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  const raw = Buffer.from(output), document = parse(raw) as ProviderConfigurationV2;
  requireBinding(['kubeclaw.size-budget@1', 'kubeclaw.coverage-budget@1'].includes(document.contractId), 'QUALITY_CONTRACT');
  const identity = inspectPipelineV10SelectedSourceIdentity('provider', raw, inputs);
  const binding = document.selectedPolicy.binding;
  const sources = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-plugin-schemas.json', import.meta.url), 'utf8'));
  const source = sources.packages[binding.packageId];
  const manifest = parse(inputs.read(source.manifestPath));
  const entry = registry.testProviderContracts.get(document.contractId);
  requireBinding(entry && isDeepStrictEqual(entry.package.manifest, manifest), 'QUALITY_REGISTRY_MANIFEST');
  const pkg = registry.packages.get(binding.packageId);
  requireBinding(entry && pkg && pkg === entry.package
    && pkg.provenance.package.pluginId === binding.packageId
    && pkg.provenance.package.packageVersion === binding.packageVersion
    && pkg.provenance.package.contentDigest === binding.packageContentDigest, 'QUALITY_REGISTRY_PACKAGE');
  const declaration = manifest.testProviders.find((row: any) => row.contractId === document.contractId);
  requireBinding(registry.apiVersion === manifest.apiVersion, 'QUALITY_REGISTRY_API_VERSION');
  requireBinding(entry && isDeepStrictEqual(entry.declaration, declaration)
    && entry.provenance.schemaVersion === 'registration-provenance.v2'
    && entry.provenance.surface === 'test_provider'
    && entry.provenance.registrationId === declaration.id
    && isDeepStrictEqual(entry.provenance.package, pkg!.provenance), 'QUALITY_REGISTRY_PROVENANCE');

  // The real resolver checks original package version/content/registration and
  // immutable support. Apply it to every profile, not just the chosen one.
  const owner = parse(inputs.read(`config/${source.ownerPath}`));
  for (const [profileId, profile] of Object.entries(owner.profiles) as [string, any][]) {
    resolveTestProviderConfiguration(registry, document.contractId, {}, {
      ...document.selectedPolicy, processing: profile.processing, declarations: profile.declarations,
      binding: { ...binding, profileId, profileDigest: remotePlanDigest(profile) },
    });
  }
  const configuration = resolveTestProviderConfiguration(registry, document.contractId, document.values, document.selectedPolicy);
  inputs.assertCurrent();
  return Object.freeze({ ...identity, configuration, registrySourceCoherent: true as const,
    installedSourceAuthorizationVerified: false as const, callerAuthorizationVerified: false as const });
}

/** Complete service-scoped Quality selection from ONE retained input set.
 * No caller-authored policy/output is accepted. This is a nonactivating source
 * projection for the existing Nova map seam, NOT boot/caller authentication.
 * All selected owners/profiles/registry joins succeed before any map escapes.
 */
export function inspectPipelineV10QualityServiceSelection(serviceInstanceId: string, registry: RegistrySnapshot,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  requireBinding(typeof serviceInstanceId === 'string' && serviceInstanceId.length > 0, 'QUALITY_SERVICE');
  inputs.assertCurrent();
  const rootBytes = inputs.read('config/pipeline.config.json'), root = parse(rootBytes);
  requireBinding(root.schemaVersion === 'pipeline-entry.v10' && Array.isArray(root.pluginSelections), 'ROOT_VERSION');
  const packages = ['kubeclaw.size-budget', 'kubeclaw.coverage-budget'];
  const tuples = root.pluginSelections.filter((tuple: any) => packages.includes(tuple.packageId)
    && tuple.serviceInstanceId === serviceInstanceId);
  requireBinding(tuples.length === packages.length && packages.every(packageId =>
    tuples.filter((tuple: any) => tuple.packageId === packageId && tuple.kind === 'test-provider').length === 1), 'QUALITY_SERVICE_SELECTIONS');
  const sources = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-plugin-schemas.json', import.meta.url), 'utf8'));
  const arms = (catalog.provider.schema as any).oneOf;
  const configurations: ProviderConfigurationV2[] = [];
  for (const tuple of tuples) {
    const source = sources.packages[tuple.packageId];
    requireBinding(source && source.ownerPath === tuple.ownerPath, 'PROVIDER_SOURCE');
    const manifest = parse(inputs.read(source.manifestPath));
    const declarations = manifest.testProviders.filter((row: any) => `${manifest.id}:${row.id}` === tuple.registrationId);
    requireBinding(declarations.length === 1, 'MANIFEST_REGISTRATION');
    const contractId = declarations[0].contractId;
    const arm = arms.find((row: any) => row.properties.contractId.const === contractId);
    requireBinding(arm, 'QUALITY_CONTRACT');
    const ownerBytes = inputs.read(`config/${source.ownerPath}`), owner = parse(ownerBytes);
    const profile = owner.profiles[tuple.profileId];
    requireBinding(profile, 'OWNER_PROFILE');
    // Fixed ABI constants (reader identity) come from the SAME
    // reviewed receiver arm, never from a historical example/default policy.
    const properties = arm.properties.selectedPolicy.properties.binding.properties;
    const binding: Record<string, unknown> = {};
    for (const [key, schema] of Object.entries(properties) as [string, any][]) {
      if (schema.const !== undefined) binding[key] = schema.const;
      if (Object.hasOwn(tuple, key)) binding[key] = tuple[key];
    }
    const schemaName = source.provenance.schemaPath.split('/schemas/')[1];
    requireBinding(schemaName && !schemaName.split('/').some((part: string) => !part || part === '.' || part === '..'), 'OWNER_SCHEMA_PATH');
    Object.assign(binding, { rootDigest: `sha256:${sha(rootBytes)}`, ownerDigest: `sha256:${sha(ownerBytes)}`,
      ownerSchemaDigest: `sha256:${sha(inputs.read(`schemas/${schemaName}`))}`,
      profileDigest: remotePlanDigest(profile), packageVersion: manifest.packageVersion,
      packageContentDigest: registry.packages.get(tuple.packageId)?.provenance.package.contentDigest,
      taskSchemaDigest: QUALITY_TASK_SCHEMA_DIGEST,
      c3RuntimeSchemaDigest: `sha256:${sha(inputs.read('schemas/provider03/c3-generated-runtime.schema.json'))}`,
      c3ReferenceContractDigest: `sha256:${sha(inputs.read('schemas/provider03/c3-registry-peer-reference-contract.json'))}` });
    const document = { schemaVersion: 'provider-configuration.v2', contractId,
      taskSchemaDigest: QUALITY_TASK_SCHEMA_DIGEST, values: {}, selectedPolicy: {
        schemaVersion: 'selected-registration-policy.v1', processing: profile.processing,
        declarations: profile.declarations, binding } };
    const inspected = inspectPipelineV10QualityRegistryConfiguration(Buffer.from(JSON.stringify(document)), registry, inputs);
    requireBinding(inspected.configuration.schemaVersion === 'provider-configuration.v2', 'QUALITY_VERSION');
    configurations.push(inspected.configuration as ProviderConfigurationV2);
  }
  inputs.assertCurrent();
  const retained = new Map<string, SelectedProviderPolicyV1>(configurations.map(configuration => [configuration.contractId, configuration.selectedPolicy]));
  requireBinding(retained.size === packages.length, 'QUALITY_CONTRACT_DUPLICATE');
  // Object.freeze(Map) does not freeze its entries. Expose only closures over
  // the private map; callers cannot set/delete/clear a selected policy.
  const selectedProviderPolicies: ReadonlyMap<string, SelectedProviderPolicyV1> = Object.freeze({
    size: retained.size, get: (key: string) => retained.get(key), has: (key: string) => retained.has(key),
    entries: () => retained.entries(), keys: () => retained.keys(), values: () => retained.values(),
    [Symbol.iterator]: () => retained[Symbol.iterator](),
    forEach: (callback: (value: SelectedProviderPolicyV1, key: string, map: ReadonlyMap<string, SelectedProviderPolicyV1>) => void, thisArg?: unknown) => {
      retained.forEach((value, key) => callback.call(thisArg, value, key, selectedProviderPolicies));
    },
  });
  return Object.freeze({ serviceInstanceId, rootRawSha256: sha(rootBytes), inputGenerationSha256: inputs.inputGenerationSha256,
    selectedProviderPolicies, registrySourceCoherent: true as const, installedSourceAuthorizationVerified: false as const,
    callerAuthorizationVerified: false as const, activationAllowed: false as const });
}

/** Resolve the service policy from the SAME retained root and complete owner
 * set, not a policy passed by an output producer. Local source coherence only:
 * the materializer still denies v10 source/caller and output admission. */
export function inspectPipelineV10BusterServiceSelection(selection: unknown,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  const tuple = parse(Buffer.from(JSON.stringify(selection)));
  requireBinding(tuple && typeof tuple === 'object' && !Array.isArray(tuple)
    && Object.keys(tuple).sort().join(',') === 'callerId,role,serviceInstanceId'
    && tuple.role === 'buster' && ['buster-preparation', 'buster-runtime'].includes(tuple.callerId)
    && typeof tuple.serviceInstanceId === 'string', 'BUSTER_SERVICE_SELECTION');
  inputs.assertCurrent();
  const rootBytes = inputs.read('config/pipeline.config.json'), root = parse(rootBytes);
  requireBinding(root.schemaVersion === 'pipeline-entry.v10', 'ROOT_VERSION');
  // Fixed original owner paths only. Never follow output-selected locators.
  const names = ['buster-engine', 'worker-core', 'prism-control', 'prism-studio', 'prism-worker', 'prism-execution'];
  requireBinding(names.every(name => root.components?.[name] === `components/${name}.config.json`), 'BUSTER_OWNER_PATH');
  const rawOwners = new Map(names.map(name => [name, inputs.read(`config/components/${name}.config.json`)]));
  const owners = Object.fromEntries(Array.from(rawOwners, ([name, bytes]) => [name, parse(bytes)]));
  const busterOwnerBytes = rawOwners.get('buster-engine');
  requireBinding(busterOwnerBytes, 'BUSTER_OWNER_SOURCE_REQUIRED');
  preflightPipelineV10Owners(root, owners);
  const matches = root.bindings.filter((row: any) => row.role === 'buster'
    && row.owner === 'buster-engine' && row.instanceId === tuple.serviceInstanceId);
  requireBinding(matches.length === 1, 'EXACT_BUSTER_TUPLE');
  const binding = matches[0];
  // Versioned WorkerCore v3 is consumed by BOTH preparation and runtime.
  // Each caller must retain its exact SAME-instance root-selected peer.
  const peers = root.bindings.filter((row: any) => row.role === 'buster' && row.owner === 'worker-core'
    && row.instanceId === tuple.serviceInstanceId);
  requireBinding(peers.length === 1, 'BUSTER_WORKER_PEER');
  // Both callers receive the complete native policy of their SAME-instance
  // Worker, never a current
  // default or a union of another caller's grants. This snapshot is not native
  // installation, caller or delivery authorization.
  const workerBytes = rawOwners.get('worker-core');
  requireBinding(workerBytes, 'BUSTER_WORKER_SOURCE_REQUIRED');
  const worker = Object.freeze({
    ownerRawSha256: sha(workerBytes), profileId: peers[0].profileId as string,
    capture: captureWorkerCorePolicy(owners['worker-core'].profiles[peers[0].profileId].settings),
  });
  const settings = owners['buster-engine'].profiles[binding.profileId].settings;
  // Run the existing production admission/readiness codecs for EVERY original Buster profile,
  // not only the selected schema-valid service policy. These snapshots remain
  // public source data, not native/source/caller admission authority.
  for (const profile of Object.values(owners['buster-engine'].profiles) as any[]) {
    validateBusterAdmissionSettings(profile.settings.admission);
    validateBusterDependencyReadinessSettings(profile.settings.dependencyReadiness);
  }
  const preparation = captureBusterPreparationV10(settings.preparation);
  const admission = validateBusterAdmissionSettings(settings.admission);
  const dependencyReadiness = validateBusterDependencyReadinessSettings(settings.dependencyReadiness);
  const policy = readBusterRemotePlanServicePolicy(settings.remotePlanService);
  // The actual production consumer receives this whole SAME-profile owner
  // policy separately from runtime.clusterBindings (namespace only). Never
  // manufacture cluster policy fields in the generated v2 wire or mistake
  // these public settings for an installed namespace/registry/native receipt.
  // These are the original public policy leaves, not executable, credential,
  // cluster or registry receipts. Keep the complete owner captured above; emit
  // only active provider policies, never a union of another service's sources.
  const providerPolicies: Record<string, Readonly<Record<string, unknown>>> = {};
  const providers = { directCommand: 'command.execute', containerBuild: 'container.build',
    networkHttp: 'network.http', browserAxe: 'browser.axe', browserLighthouse: 'browser.lighthouse',
    browserVisual: 'browser.visual', browserPlaywright: 'browser.playwright', securityScan: 'security.scan' };
  const freeze = (value: any): any => {
    if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
    return value;
  };
  // Keep the historical schema's complete validated node, including
  // maximumSecretReferenceEntries. Native source/registry/installation authority
  // remains separate from this public policy. All owner profiles were validated
  // by preflight above.
  const clusterInvokers: Readonly<Record<string, unknown>> | null = tuple.callerId === 'buster-runtime'
    ? freeze(structuredClone(settings.clusterInvokers)) : null;
  if (tuple.callerId === 'buster-runtime') for (const [field, capability] of Object.entries(providers)) {
    if (!policy.allowedCapabilities.includes(capability)) continue;
    const selected = structuredClone(settings.execution.capabilityProviders[field]);
    // Browser origin policy is the shared original browserAccess owner node,
    // not a generated per-browser override or installed executable locator.
    if (field.startsWith('browser')) selected.allowedOrigins = structuredClone(settings.execution.capabilityProviders.browserAccess.allowedOrigins);
    providerPolicies[field] = freeze(selected);
  }
  Object.freeze(providerPolicies);
  inputs.assertCurrent();
  return Object.freeze({ role: tuple.role as 'buster', callerId: tuple.callerId as 'buster-preparation' | 'buster-runtime',
    serviceInstanceId: tuple.serviceInstanceId as string,
    rootRawSha256: sha(rootBytes), inputGenerationSha256: inputs.inputGenerationSha256,
    ownerRawSha256: sha(busterOwnerBytes), profileId: binding.profileId as string, policy, worker, preparation, admission, dependencyReadiness, clusterInvokers, providerPolicies,
    selectedConfigurationVerified: true as const, originalAuthorizationVerified: false as const, activationAllowed: false as const });
}

/** Runtime.v2 equality against original root-selected policy; not a grant. */
export function inspectPipelineV10BusterRuntimeSourceIdentity(selection: unknown, output: Uint8Array,
  inputs: Pick<ReturnType<typeof capturePipelineInputSet>, 'inputGenerationSha256' | 'read' | 'assertCurrent'>) {
  requireBinding(selection && typeof selection === 'object'
    && (selection as { callerId?: unknown }).callerId === 'buster-runtime', 'BUSTER_RUNTIME_CALLER');
  const raw = Buffer.from(output), original = inspectPipelineV10BusterServiceSelection(selection, inputs);
  const runtime = parse(raw);
  const policy = receiveBusterRuntimeV2ServicePolicy(runtime, original.policy);
  validateBusterRuntimeSourceMetadata(runtime, 'buster-remote-plan-runtime.v2');
  // Compare every selected public leaf before treating output as coherent.
  // Extra source fields may carry separately admitted native/registry locators;
  // their presence is NOT verified or authorized by this local equality check.
  for (const field of ['directCommand', 'containerBuild', 'networkHttp', 'browserAxe',
    'browserLighthouse', 'browserVisual', 'browserPlaywright', 'securityScan']) {
    const selected = original.providerPolicies[field];
    if (!selected) { requireBinding(!Object.hasOwn(runtime, field), `BUSTER_INACTIVE_PROVIDER:${field}`); continue; }
    const received = runtime[field];
    requireBinding(received && typeof received === 'object' && !Array.isArray(received), `BUSTER_PROVIDER_REQUIRED:${field}`);
    for (const [key, value] of Object.entries(selected)) {
      requireBinding(Object.hasOwn(received, key) && isDeepStrictEqual(received[key], value), `BUSTER_PROVIDER_POLICY:${field}:${key}`);
    }
  }
  // Cluster namespace is authored by the original selected deployment, not
  // Buster's policy owner or an output-selected namespace. This joins public
  // sources only; installed cluster/issuer/caller receipts remain mandatory.
  const clusterActive = policy.allowedCapabilities.some(capability =>
    ['kubernetes.fixture', 'kubernetes.exposure', 'kubernetes.runtime-security'].includes(capability));
  if (clusterActive) {
    const root = parse(inputs.read('config/pipeline.config.json'));
    const deployments = root.deploymentSelections.filter((row: any) => row.role === 'buster'
      && row.consumer === 'namespace-controller' && row.busterComponentInstanceId === original.serviceInstanceId);
    requireBinding(deployments.length === 1, 'BUSTER_CLUSTER_DEPLOYMENT_REQUIRED');
    const deployment = deployments[0];
    requireBinding(deployment.ownerPath === 'charts/kubeclaw/values.yaml', 'BUSTER_CLUSTER_OWNER_PATH');
    const chart = parseDocument(inputs.read('charts/kubeclaw/values.yaml').toString('utf8'),
      { version: '1.2', uniqueKeys: true, strict: true });
    requireBinding(chart.errors.length === 0, 'BUSTER_CLUSTER_OWNER_PARSE');
    const profile = chart.toJS().profiles[deployment.profileId];
    requireBinding(profile, 'BUSTER_CLUSTER_PROFILE_REQUIRED');
    inspectPipelineV10InfrastructureSourceIdentity('controller', deployment,
      Buffer.from(JSON.stringify(profile)), inputs);
    requireBinding(profile.settings.busterNamespaceBroker.enabled, 'BUSTER_CLUSTER_CONTROLLER_DISABLED');
    requireBinding(isDeepStrictEqual(runtime.clusterBindings,
      { controllerNamespace: profile.readonlyBindings.releaseNamespace }), 'BUSTER_CLUSTER_NAMESPACE_SOURCE');
  } else {
    // The complete owner cluster policy remains captured, but an inactive
    // generated source must not escape through the nonactivating inspector.
    // A valid-looking namespace is not a reason to admit an unselected branch.
    requireBinding(!Object.hasOwn(runtime, 'clusterBindings'), 'BUSTER_INACTIVE_CLUSTER_SOURCE');
  }
  inputs.assertCurrent();
  return Object.freeze({ ...original, policy, outputRawSha256: sha(raw) });
}
