import { readNativeGatewayPruningDurationMs } from './gateway-native-duration.ts';
import fs from 'node:fs';
import { parseDocument } from 'yaml';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const sources = JSON.parse(fs.readFileSync(new URL('./pipeline-v10-gateway-sources.json', import.meta.url), 'utf8'));
interface Validator { (value: unknown): boolean; errors?: unknown }
const Constructor = Ajv2020 as unknown as new (options: object) => { compile(schema: object): Validator };
const ajv = new Constructor({ strict: true, allErrors: true });
(addFormats as unknown as (ajv: unknown) => void)(ajv);
const validators: Record<string, Validator> = Object.fromEntries(
  ['profileSchema', 'busterContextSchema', 'novaContextSchema', 'prismContextSchema'].map(key => [key, ajv.compile(sources[key]) ]));
const paths: Record<string, string> = { buster: 'managed-bootstrap-context.json',
  nova: 'generated-contexts/nova-bootstrap-context.json', prism: 'generated-contexts/prism-bootstrap-context.json' };
function requireRelation(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`PIPELINE_V10_GATEWAY_RELATION_INVALID:${reason}`);
}
function valid(name: string, value: unknown) {
  const validator = validators[name]!;
  requireRelation(validator(value), `${name}:${JSON.stringify(validator.errors)}`);
}

/** Reviewed source-context prerequisites only, never installed native grants or
 * authenticated caller authority. No source code or credential is executed/read.
 */
export function validatePipelineV10Gateway(root: any, chart: any, read: (relative: string) => Buffer): void {
  const readJson = (relative: string) => {
    const raw = read(relative).toString('utf8');
    requireRelation(parseDocument(raw, { version: '1.2', schema: 'json', uniqueKeys: true, strict: true }).errors.length === 0, 'CONTEXT_DUPLICATE_KEYS');
    return JSON.parse(raw);
  };
  for (const [name, relative] of [['busterRecipes', 'source-current/generated/gateway-context-source-recipes.json'],
    ['roleRecipes', 'source-current/generated/role-source-recipes.json']] as const) {
    requireRelation(equal(readJson(relative), sources[name]), 'CAPTURED_RECIPE_INPUT');
  }
  const captures = new Map<string, any>();
  for (const [id, profile] of Object.entries(chart.profiles) as [string, any][]) {
    const role = profile.role, bindings = profile.readonlyBindings, ref = bindings.bootstrapContextRef;
    requireRelation(ref.path === paths[role], 'ORIGINAL_CONTEXT_PATH');
    let capture = captures.get(ref.path);
    if (!capture) {
      capture = readJson(ref.path);
      valid(`${role}ContextSchema`, capture); captures.set(ref.path, capture);
    }
    // Original context codec hashes the canonical pretty-printed source object,
    // not a substitute new root/input-set codec. Raw bytes remain observed too.
    requireRelation(createHash('sha256').update(JSON.stringify(capture, null, 2) + '\n').digest('hex') === ref.sha256, 'CONTEXT_SOURCE_SHA');
    const context = capture.contexts[ref.pointer.slice('/contexts/'.length)];
    requireRelation(context && ref.pointer === `/contexts/${context.association.receivingProfileId}`, 'CONTEXT_POINTER');
    const association = context.association;
    for (const [key, value] of Object.entries({ ownerPath: 'charts/kubeclaw/values.yaml', ownerProfileId: id,
      role, instanceId: profile.instanceId })) requireRelation(association[key] === value, `ASSOCIATION_${key}`);
    if (role === 'buster') {
      requireRelation(equal(Object.keys(association).sort(), ['ownerPath','ownerProfileId','receivingProfileId','role','instanceId','sourceRecipeId','sourceInputs'].sort()), 'ASSOCIATION_KEYS');
      requireRelation(equal(association.sourceInputs, sources.busterSourceInputs), 'CONTEXT_ORIGINAL_INPUTS');
      requireRelation(capture.nativeFullSchema === sources.nativeFullSchema, 'CONTEXT_NATIVE_SCHEMA_SOURCE');
    }
    const recipe = structuredClone(context); delete recipe.association;
    const recipes = role === 'buster' ? sources.busterRecipes.recipes : sources.roleRecipes.recipes;
    requireRelation(Object.hasOwn(recipes, association.sourceRecipeId) && equal(recipe, recipes[association.sourceRecipeId]), 'ORIGINAL_SOURCE_RECIPE');
    requireRelation(context.agentRole === role, 'CONTEXT_AGENT_ROLE');
    requireRelation(equal(context.agentModel, bindings.modelRoute), 'MODEL_SOURCE_PROFILE');
    requireRelation(equal(profile.settings.agent.model, { primary: bindings.modelRoute.primary, fallbacks: bindings.modelRoute.fallbacks }), 'AGENT_MODEL_ALIAS');
    const managed = structuredClone(profile.settings.gatewayOpenClaw);
    managed.memory.search.remote.baseUrl = profile.settings.litellm.endpoint;
    valid('profileSchema', { schemaVersion: 'gateway-openclaw-profile.v1-proposal', profileId: association.receivingProfileId,
      role, instanceId: profile.instanceId, managedOpenClaw: managed, readonlyBindings: Object.fromEntries(
        Object.keys(sources.profileSchema.properties.readonlyBindings.properties).filter(key => Object.hasOwn(bindings, key)).map(key => [key, bindings[key]])) });
    requireRelation(role === bindings.deployment.role && profile.instanceId === bindings.deployment.instanceId, 'ROLE_INSTANCE_SOURCE');
    if (role !== 'buster') {
      const native = context.nativeRoleSource;
      requireRelation(bindings.deployment.namespace === native.namespace && bindings.deployment.instanceId === `agent-${role}-gateway`, 'ROLE_NAMESPACE_SOURCE');
      requireRelation(bindings.embedding.credential.locator === native.litellmAlias.locator
        && bindings.embedding.credential.authoritySourceRef === `${native.roleValuesPath}#/litellm/existingSecret+existingSecretKey`, 'ROLE_CREDENTIAL_SOURCE');
      requireRelation(managed.memory.search.remote.baseUrl === native.litellmAlias.endpoint && managed.memory.search.model === 'gemini-embedding-001', 'ROLE_MEMORY_SOURCE');
      requireRelation(equal(managed.agents.entries.main.skills, native.skillSelection), 'ROLE_SKILL_SOURCE');
    }
    const requiredPlugin = role === 'buster' ? 'kubeclaw-agent-observer' : role === 'prism' ? 'kubeclaw-prism' : undefined;
    requireRelation(!requiredPlugin || context.installedPluginAllow.includes(requiredPlugin), 'ROLE_PLUGIN_SOURCE');
    requireRelation(!(role !== 'buster' && context.installedPluginAllow.includes('kubeclaw-agent-observer'))
      && !(role !== 'prism' && context.installedPluginAllow.includes('kubeclaw-prism')), 'FOREIGN_ROLE_PLUGIN');
    const key = managed.memory.search.remote.apiKey, provider = context.secretsProviderContext.providers[key.provider];
    requireRelation(!Object.hasOwn(key, 'value') && provider && provider.source === key.source, 'SECRET_PROVIDER_SOURCE');
    if (['env', 'store'].includes(key.source)) requireRelation(/^[A-Z][A-Z0-9_]{0,127}$/.test(key.id), 'SECRET_ID_DOMAIN');
    else if (key.source === 'file') requireRelation(key.id === 'value' || key.id.startsWith('/'), 'FILE_REF_DOMAIN');
    else requireRelation(false, 'EXEC_REF_NATIVE_SOURCE_RECEIPT_REQUIRED');
    requireRelation(!provider.allowlist || provider.allowlist.includes(key.id), 'SECRET_PROVIDER_ALLOWLIST');
    const endpoint = new URL(managed.memory.search.remote.baseUrl);
    requireRelation(['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password && !endpoint.hash, 'EMBEDDING_ORIGIN');
    requireRelation(managed.memory.search.model.length > 0 && managed.memory.search.model.trim() === managed.memory.search.model, 'EMBEDDING_MODEL');
    readNativeGatewayPruningDurationMs(managed.agents.defaults.contextPruning.ttl);
    const allow = managed.agents.defaults.modelPolicy.allow;
    const admits = (route: string) => !allow.length || allow.some((item: string) => item === route || item.endsWith('/*') && route.startsWith(item.slice(0, -1)));
    requireRelation(admits(bindings.modelRoute.primary) && bindings.modelRoute.fallbacks.every(admits), 'MODEL_ROUTE_POLICY');
    requireRelation(context.installedPluginAllow.includes('acpx') || !managed.plugins.entries.acpx.enabled, 'ACP_PLUGIN_ALLOW');
    requireRelation(!managed.acp.enabled || managed.plugins.entries.acpx.enabled, 'ACP_BACKEND');
    requireRelation(!managed.acp.allowedAgents.length || managed.acp.allowedAgents.includes(managed.acp.defaultAgent), 'ACP_DEFAULT');
  }
  for (const tuple of root.deploymentSelections.filter((t: any) => t.consumer === 'openclaw-gateway')) {
    const selected = chart.profiles[tuple.profileId];
    requireRelation(selected && selected.role === tuple.role && selected.instanceId === tuple.serviceInstanceId, 'SELECTED_SERVICE_IDENTITY');
  }
  // Native full Zod/duration parser, installed source/issuer/revision receipts and
  // exact original caller scope are still required behind final source gate.
}
