import { validateBrowserNativeProfile, validatePlaywrightNativePolicy } from './browser-native-profile.ts';
import fs from 'node:fs';
import { portableJson } from '@kubeclaw/plugin-sdk/values';

// Internal JSON inputs have already passed the complete root/owner schemas.
// These local relations do NOT authenticate source, installed roles or grants.
type Json = Record<string, any>;
const associations = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-source-relations.json', import.meta.url), 'utf8')) as Json;
const same = (left: unknown, right: unknown) => left !== undefined && right !== undefined && portableJson(left) === portableJson(right);
const unique = (values: unknown[]) => new Set(values).size === values.length;
const fail = (code: string): never => { throw new Error(`PIPELINE_V10_RELATION_INVALID:${code}`); };

function evidence(profile: Json, declaration: Json, size = false) {
  const value = profile.declarations;
  for (const outcome of ['onPass', 'onFail', 'onError']) {
    const selected: string[] = value.evidenceDefaults[outcome];
    const mandatory: string[] = size && outcome !== 'onError' ? ['log', 'size-budget-baseline'] : ['log'];
    if (mandatory.some(type => !selected.includes(type)) || selected.some(type => !declaration.evidenceTypes.includes(type))) fail('MANDATORY_EVIDENCE');
  }
  if (value.matrixFields.length || (value.retrySafe && !declaration.retrySafe)) fail('UNSUPPORTED_DECLARATION');
}
function securityOwner(owner: Json) {
  for (const profile of Object.values(owner.profiles) as Json[]) {
    const h = profile.registrations.headers.processing;
    for (const rules of Object.values(h.presets) as Json[][]) {
      if (!unique(rules.map(rule => rule.id))) fail('SECURITY_DUPLICATE_HEADER');
    }
    const base: Json[] = h.presets[h.profile], add: Json[] = h.rules.add, replace: Json[] = h.rules.replace;
    for (const rule of [...(Object.values(h.presets) as Json[][]).flat(), ...add, ...replace]) {
      if (typeof rule.id !== 'string' || !/^[a-z0-9.-]+$/u.test(rule.id) || rule.id.length > 128
        || typeof rule.header !== 'string' || !/^[a-z0-9-]+$/u.test(rule.header) || rule.header.length > 128
        || !['critical', 'high', 'medium', 'low', 'info'].includes(rule.severity)
        || !['present', 'equals', 'contains', 'hsts-min-age'].includes(rule.kind)
        || (rule.kind !== 'present' && (typeof rule.value !== 'string' || rule.value.length < 1 || rule.value.length > 1024))) fail('SECURITY_NATIVE_HEADER_RULE');
      if (rule.kind === 'hsts-min-age'
        && (!/^\d+$/u.test(rule.value) || !Number.isSafeInteger(Number(rule.value)) || Number(rule.value) < 1)) fail('SECURITY_HSTS');
    }
    const remove: string[] = h.rules.remove;
    if (!unique(add.map(rule => rule.id)) || !unique(replace.map(rule => rule.id)) || !unique(remove)
      || add.some(rule => base.some(original => original.id === rule.id) || replace.some(other => other.id === rule.id))
      || replace.some(rule => !base.some(original => original.id === rule.id))) fail('SECURITY_HEADER_COMPOSITION');
    const count = base.filter(rule => !remove.includes(rule.id)).length + add.length;
    if (count < 1 || count > 64) fail('SECURITY_HEADER_COUNT');
    if (h.requestTimeoutMs > associations.security.network.maximumExecutionMs
      || h.maximumResponseBytes > associations.security.network.maximumResponseBytes) fail('SECURITY_NETWORK_CEILING');
    for (const body of Object.values(profile.registrations) as Json[]) {
      const acceptances: Json[] = body.processing.policy.acceptances;
      if (!unique(acceptances.map(row => row.findingId))
        || acceptances.some(row => row.reason.trim().length < 8 || !Number.isFinite(Date.parse(row.expiresAt)))) fail('SECURITY_ACCEPTANCE');
    }
  }
}
function browserOwner(packageId: string, owner: Json, declaration: Json) {
  const source = associations.browser.settings.execution.capabilityProviders;
  for (const profile of Object.values(owner.profiles) as Json[]) {
    evidence(profile, declaration);
    for (const outcome of ['onPass', 'onFail', 'onError']) {
      if (declaration.evidenceDefaults[outcome].some((type: string) => !profile.declarations.evidenceDefaults[outcome].includes(type))) fail('BROWSER_EVIDENCE_BASELINE');
    }
    const q = profile.processing;
    if (packageId === 'kubeclaw.playwright') validatePlaywrightNativePolicy(q);
    if (['kubeclaw.axe', 'kubeclaw.visual'].includes(packageId)) {
      for (const [name, value] of Object.entries(q.profiles)) validateBrowserNativeProfile(packageId === 'kubeclaw.axe' ? 'axe' : 'visual', name, value);
    }
    if (packageId === 'kubeclaw.lighthouse') {
      for (const [name, value] of Object.entries(q.settings.profiles)) validateBrowserNativeProfile('lighthouse', name, value);
    }
    if (packageId === 'kubeclaw.axe') {
      if (q.selectedProfiles.some((name: string) => !Object.hasOwn(q.profiles, name))) fail('AXE_PROFILE_REQUIRED');
      if (q.timeoutMs > source.browserAxe.maximumExecutionMs) fail('BROWSER_TIMEOUT');
    }
    if (packageId === 'kubeclaw.lighthouse') {
      for (const [purpose, value] of Object.entries(q.byPurpose) as [string, Json][]) {
        if (!Object.hasOwn(q.settings.profiles, value.selectedProfile)
          || (value.selectedBudget !== null && !Object.hasOwn(q.settings.budgets, value.selectedBudget))) fail('LIGHTHOUSE_SELECTION');
        if (purpose !== 'performance' && (value.runs !== 1 || value.selectedBudget !== null)) fail('LIGHTHOUSE_PURPOSE');
        if (value.timeoutMs > source.browserLighthouse.maximumExecutionMs) fail('BROWSER_TIMEOUT');
      }
    }
    if (packageId === 'kubeclaw.visual') {
      if (!unique(q.masks.map((mask: Json) => mask.target))) fail('VISUAL_MASK');
      if (q.timeoutMs > source.browserVisual.maximumExecutionMs) fail('BROWSER_TIMEOUT');
    }
    // Playwright deliberately has NO raw workers/timeout <= H-ceiling check:
    // its real invoker admits workers1..64 and timeout1000..3600000 then uses
    // Math.min(requested, original maximumWorkers/maximumExecutionMs). Rejecting
    // those raw values here would narrow that source domain. The original H
    // resource projection is still compared below; no larger grant is issued.
  }
}

/** Called ONLY inside the still-gated physical v10 intake. No caller scope is
 * merged, no public fixture service/profile string becomes installed authority.
 */
export function validatePipelineV10PluginRelations(root: Json, components: Json, owners: ReadonlyMap<string, Json>, sources: Json) {
  const browsers = ['kubeclaw.axe', 'kubeclaw.lighthouse', 'kubeclaw.visual', 'kubeclaw.playwright'];
  for (const [packageId, owner] of owners) {
    const declarations: Json[] = sources[packageId].manifest.testProviders ?? [];
    if (packageId === 'kubeclaw.security-providers') {
      securityOwner(owner);
      for (const profile of Object.values(owner.profiles) as Json[]) for (const declaration of declarations) {
        evidence(profile.registrations[declaration.id], declaration);
      }
    } else if (browsers.includes(packageId)) browserOwner(packageId, owner, declarations[0] ?? fail('PROVIDER_DECLARATION_REQUIRED'));
    else if (packageId === 'kubeclaw.size-budget' || packageId === 'kubeclaw.coverage-budget') {
      const declaration = declarations[0] ?? fail('PROVIDER_DECLARATION_REQUIRED');
      for (const profile of Object.values(owner.profiles) as Json[]) evidence(profile, declaration, packageId === 'kubeclaw.size-budget');
    }
  }
  const security = root.pluginSelections.filter((row: Json) => row.packageId === 'kubeclaw.security-providers');
  if (security.length !== 5 || !unique(security.map((row: Json) => row.registrationId))
    || ['instanceId', 'profileId', 'serviceInstanceId', 'ownerPath'].some(key => new Set(security.map((row: Json) => row[key])).size !== 1)) fail('SECURITY_PACKAGE_SPLIT');
  for (const selection of root.pluginSelections as Json[]) {
    if (selection.kind !== 'test-provider') continue;
    const peers = root.bindings.filter((row: Json) => row.instanceId === selection.serviceInstanceId);
    const engines = peers.filter((row: Json) => row.owner === 'buster-engine'), workers = peers.filter((row: Json) => row.owner === 'worker-core');
    if (engines.length !== 1 || workers.length !== 1 || engines[0].role !== 'buster' || workers[0].role !== 'buster') fail('BUSTER_RUNTIME_PEERS');
    const settings = components['buster-engine'].profiles[engines[0].profileId]?.settings;
    if (!settings || !components['worker-core'].profiles[workers[0].profileId]) fail('BUSTER_RUNTIME_PROFILE');
    const declaration = sources[selection.packageId].manifest.testProviders.find((row: Json) => `${selection.packageId}:${row.id}` === selection.registrationId);
    if (declaration.requiredCapabilities.some((capability: string) => !settings.remotePlanService.allowedCapabilities.includes(capability))) fail('SERVICE_CAPABILITY_CEILING');
    const actual = settings.execution.capabilityProviders;
    if (selection.packageId === 'kubeclaw.security-providers') {
      if ((!same(actual.networkHttp, associations.security.network) && !same(actual.networkHttp, associations.security.httpsStand))
        || !same(actual.securityScan, associations.security.securityScan)
        || !same(settings.clusterInvokers.runtimeSecurity, associations.security.runtimeSecurity)) fail('SECURITY_SOURCE_RESOURCE_JOIN');
    }
    if (browsers.includes(selection.packageId)) {
      const expected = associations.browser.settings.execution.capabilityProviders;
      for (const key of ['browserAccess', ...Object.keys(expected).filter(key => key.startsWith('browser') && key !== 'browserAccess')]) {
        if (!same(actual[key], expected[key])) fail('BROWSER_SOURCE_RESOURCE_JOIN');
      }
    }
  }
  // Runtime target fields stay distinct from a stage's diagnostic agentRole.
  const runtime = owners.get('kubeclaw.runtime-dispatch')!;
  for (const profile of Object.values(runtime.profiles) as Json[]) {
    const targets = Object.values(profile.processing.targets) as Json[];
    if (!targets.length) fail('NOVA_TARGET_MAP');
    for (const target of targets) {
      const total = target.maxInputTokens + target.maxOutputTokens;
      if (!Number.isSafeInteger(total) || total > target.maxContextTokens
        || target.maxPollMs < target.pollMs || target.sessionTimeoutMs < target.pollMs) fail('NOVA_TARGET_RELATION');
    }
  }
  for (const tuple of root.pluginSelections.filter((row: Json) => row.packageId === 'kubeclaw.runtime-dispatch') as Json[]) {
    const targets = runtime.profiles[tuple.profileId].processing.targets;
    for (const selection of root.pluginSelections as Json[]) {
      if (sources[selection.packageId].family !== 'nova-module' || selection.packageId === 'kubeclaw.runtime-dispatch') continue;
      if (selection.serviceInstanceId !== tuple.serviceInstanceId) fail('NOVA_SERVICE_SCOPE');
      for (const profile of Object.values(owners.get(selection.packageId)!.profiles) as Json[]) {
        const policy = profile.processing[selection.registrationId];
        if (Object.hasOwn(policy, 'agent') && !Object.hasOwn(targets, policy.agent)) fail('NOVA_TARGET_MEMBERSHIP');
        if (selection.packageId === 'kubeclaw.prism-design' && policy.agent !== 'prism') fail('NOVA_PRISM_TARGET');
      }
    }
  }
}
