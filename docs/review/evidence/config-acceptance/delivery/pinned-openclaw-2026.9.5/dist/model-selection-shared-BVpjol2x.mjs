import { a as asOptionalRecord } from "./record-coerce-DItp3I4t.mjs";
import { l as normalizeOptionalString, o as normalizeLowercaseStringOrEmpty } from "./string-coerce-CIXf7egm.mjs";
import { n as getActivePluginRegistryWorkspaceDirFromState } from "./runtime-state-C5tDvNBc.mjs";
import { n as findNormalizedProviderValue, r as normalizeProviderId } from "./provider-id-DCtsDflE.mjs";
import { E as hasExplicitModelPolicyAllow, T as computeModelPolicyAllowlist, j as parseModelPolicyWildcardRef, r as resolveAgentConfig } from "./agent-scope-config-D2MQzbc-.mjs";
import { i as stripAnsi, n as sanitizeForLog } from "./ansi-CWsy0bu4.mjs";
import { t as createSubsystemLogger } from "./subsystem-De62xgJV.mjs";
import { n as getCurrentPluginMetadataSnapshot } from "./current-plugin-metadata-snapshot-Bl6gHWQE.mjs";
import { s as resolveAgentModelPrimaryValue } from "./model-input-DKxKaZGG.mjs";
import { a as normalizeConfiguredProviderCatalogModelId, o as normalizeModelRef, t as createConfiguredProviderCatalogModelIdNormalizer } from "./model-ref-shared-DLJ88KpR.mjs";
import { t as modelKey } from "./model-key-2xbDA5NJ.mjs";
import { r as isModelThinkingFormat } from "./model-config-vocabulary-CIfiDXNP.mjs";
import "./types.models-ZwQV51CR.mjs";
import { a as resolveConfiguredProviderFallback, t as hasUtilityModelSeparationMigrationMarker } from "./utility-model-separation-migration-OIgZUbN9.mjs";
import { r as DEFAULT_PROVIDER } from "./defaults-BbU4k6fu.mjs";
import { t as splitTrailingAuthProfile } from "./model-ref-profile-BIKs-96s.mjs";
import { n as resolveCatalogOwnedModelCompat, t as modelTransportRoutesMatch } from "./model-compat-catalog-DU9GPmr_.mjs";
import { a as resolveMergedModelProviderConfig } from "./model-provider-config-C9RHF_Fs.mjs";
import { i as resolveProviderModelPolicySurface, n as createProviderModelRoutesResolver, r as resolveProviderModelCatalogId } from "./provider-model-routes-DKsqmeq1.mjs";
import { c as loadManifestMetadataSnapshot } from "./manifest-contract-eligibility-Di_vvjmz.mjs";
import { n as dedupeByKey, r as indexFirstByKey, t as PREPARED_THINKING_POLICY } from "./provider-thinking-catalog-B0d_iUnw.mjs";
import { o as selectProviderModelRouteAuth } from "./provider-model-route-auth-DkAaX3ui.mjs";
import { n as resolveModelRouteIntent } from "./model-runtime-policy-BLaXzaLP.mjs";
import { n as createProviderModelCatalogRoutePolicy, t as canonicalizeProviderModelId } from "./provider-model-route-CfRnEOc0.mjs";
import { n as parseModelRef, t as findNormalizedProviderValue$1 } from "./model-selection-normalize-khCHijeG.mjs";
//#region src/agents/configured-provider-model.ts
/** Configured provider rows own exact model ids before plugin normalization. */
/** Find the first configured provider without rediscovering its normalized key. */
function findConfiguredModelProvider(cfg, provider) {
	return provider.trim() ? findNormalizedProviderValue(cfg?.models?.providers, provider) : void 0;
}
/** Exact configured model rows must survive provider-owned alias rewriting. */
function hasExactConfiguredProviderModel(params) {
	const model = params.model.trim();
	return Boolean(model && findConfiguredModelProvider(params.cfg, params.provider)?.models?.some((entry) => entry.id.trim() === model));
}
/** Authored API routes and exact model rows own their IDs before runtime aliases. */
function allowsPluginModelNormalization(params) {
	const provider = findConfiguredModelProvider(params.cfg, params.provider);
	if (!provider) return true;
	if (params.cfg?.plugins?.enabled === false || provider.api && normalizeProviderId(provider.api) !== normalizeProviderId(params.provider)) return false;
	const model = params.model.trim();
	return !model || !(provider.models ?? []).some((entry) => entry.id.trim() === model);
}
//#endregion
//#region src/agents/openai-model-routes.ts
const OPENAI_PROVIDER_ID = "openai";
function createOpenAIModelRoutesResolver(params) {
	const resolveRoutes = createProviderModelRoutesResolver({
		provider: OPENAI_PROVIDER_ID,
		config: params.config,
		env: params.env,
		requestTransportOverrides: params.requestTransportOverrides
	});
	return (observed) => {
		const routeIntent = observed.routeIntent ?? resolveModelRouteIntent({
			config: params.config,
			provider: OPENAI_PROVIDER_ID,
			modelId: observed.modelId,
			agentId: params.agentId,
			primaryModel: params.primaryModel,
			resolveProfileAuthMode: params.resolveProfileAuthMode
		});
		return resolveRoutes({
			modelId: observed.modelId ? splitTrailingAuthProfile(observed.modelId).model : void 0,
			routeIntent: routeIntent?.source === "inherited" && routeIntent.authRequirement && observed.pinnedAuthRequirement && routeIntent.authRequirement !== observed.pinnedAuthRequirement ? {
				...routeIntent,
				authRequirement: observed.pinnedAuthRequirement,
				source: "explicit"
			} : routeIntent,
			observedRoutes: observed.observedRoutes ?? (observed.api != null || observed.baseUrl !== void 0 && observed.baseUrl !== null ? [{
				api: observed.api,
				baseUrl: observed.baseUrl
			}] : void 0)
		});
	};
}
/** Returns the authored OpenAI provider auth mode, if one exists. */
function resolveConfiguredOpenAIAuthMode(config) {
	return resolveMergedModelProviderConfig(config, OPENAI_PROVIDER_ID)?.auth;
}
function selectOpenAIModelRouteAuth(params) {
	return selectProviderModelRouteAuth({
		provider: OPENAI_PROVIDER_ID,
		...params
	});
}
const openAIModelCatalogRoutePolicy = createProviderModelCatalogRoutePolicy(OPENAI_PROVIDER_ID);
/** Canonical catalog identity without ambiguity between provider and model segments. */
function resolveModelCatalogIdentityKey(entry) {
	return resolveModelCatalogIdentityKeyWithPolicies(entry);
}
/** Reuses each provider policy only for one synchronous catalog operation. */
function createModelCatalogIdentityKeyResolver() {
	const policies = /* @__PURE__ */ new Map();
	return (entry) => resolveModelCatalogIdentityKeyWithPolicies(entry, policies);
}
function resolveModelCatalogIdentityKeyWithPolicies(entry, policies) {
	const provider = normalizeProviderId(entry.provider);
	const modelId = splitTrailingAuthProfile(entry.id).model;
	let surface = policies?.get(provider);
	if (policies && surface === void 0) {
		surface = resolveProviderModelPolicySurface(provider);
		policies.set(provider, surface);
	}
	const id = resolveProviderModelCatalogId({
		provider,
		modelId,
		surface
	}) ?? entry.id;
	return JSON.stringify([provider, id]);
}
/** Resolves provider-owned OpenAI route state without loading the full provider runtime. */
function resolveOpenAIModelRoutes(params) {
	if (normalizeProviderId(params.provider ?? "") !== OPENAI_PROVIDER_ID) return null;
	return createOpenAIModelRoutesResolver({
		config: params.config,
		agentId: params.agentId,
		primaryModel: params.primaryModel,
		resolveProfileAuthMode: params.resolveProfileAuthMode,
		env: params.env,
		requestTransportOverrides: params.requestTransportOverrides
	})({
		modelId: params.modelId,
		api: params.api,
		baseUrl: params.baseUrl,
		routeIntent: params.routeIntent,
		pinnedAuthRequirement: params.pinnedAuthRequirement
	});
}
//#endregion
//#region src/agents/model-catalog-lookup.ts
/**
* Looks up model catalog entries and input capability support.
*/
/** Projects only thinking policy fields from broader model compatibility metadata. */
function projectModelThinkingCompat(compat) {
	const record = asOptionalRecord(compat);
	if (!record) return;
	const projected = {};
	if (typeof record.thinkingFormat === "string" && isModelThinkingFormat(record.thinkingFormat)) projected.thinkingFormat = record.thinkingFormat;
	if (record.supportedReasoningEfforts === null) projected.supportedReasoningEfforts = null;
	else if (Array.isArray(record.supportedReasoningEfforts) && record.supportedReasoningEfforts.every((effort) => typeof effort === "string")) projected.supportedReasoningEfforts = [...record.supportedReasoningEfforts];
	return Object.keys(projected).length > 0 ? projected : void 0;
}
/** Freezes thinking capability from the selected prepared catalog row. */
function prepareModelThinkingCapability(params) {
	const compat = projectModelThinkingCompat(params.entry?.compat);
	const provider = normalizeProviderId(params.entry?.provider ?? "");
	const modelId = normalizeOptionalString(params.entry?.id);
	const agentRuntime = normalizeLowercaseStringOrEmpty(params.agentRuntime);
	if (!compat || !provider || !modelId || !agentRuntime) return;
	const routeSource = params.route ?? (agentRuntime === "openclaw" ? params.entry : void 0);
	const api = normalizeOptionalString(routeSource?.api);
	const baseUrl = normalizeOptionalString(routeSource?.baseUrl);
	if (agentRuntime === "openclaw" && (!api || !baseUrl)) return;
	return {
		provider,
		modelId,
		agentRuntime,
		...api && baseUrl ? { route: {
			api,
			baseUrl
		} } : {},
		compat
	};
}
/** Resolves prepared thinking metadata only for the exact final model route and harness. */
function resolvePreparedModelThinkingCompat(params) {
	const capability = params.capability;
	if (!capability) return;
	const runtimeModelId = canonicalizeProviderModelId(capability.provider, params.model.id);
	const preparedModelId = canonicalizeProviderModelId(capability.provider, capability.modelId);
	if (normalizeProviderId(params.model.provider) !== capability.provider || runtimeModelId !== preparedModelId || normalizeLowercaseStringOrEmpty(params.agentRuntime) !== capability.agentRuntime || capability.route && !modelTransportRoutesMatch(params.model, capability.route)) return;
	const { supportedReasoningEfforts: efforts, ...compat } = capability.compat;
	if (efforts === void 0) return compat;
	const routeEfforts = projectModelThinkingCompat(params.model.compat)?.supportedReasoningEfforts;
	const enabledEfforts = efforts?.filter((effort) => effort !== "none");
	return {
		...compat,
		supportedReasoningEfforts: capability.route ? efforts?.slice() : routeEfforts?.includes("none") ? ["none", ...enabledEfforts ?? []] : enabledEfforts
	};
}
/** Projects the prepared capabilities needed by one selected run candidate. */
function prepareModelRunCapabilities([catalog, configuredCatalog], [provider, modelId, agentRuntime]) {
	const entry = findModelInCatalog(catalog ?? [], provider, modelId);
	const configuredEntry = findModelInCatalog(configuredCatalog, provider, modelId);
	return {
		modelHasVision: modelSupportsInput(entry, "image"),
		modelThinkingCapability: prepareModelThinkingCapability({
			entry: entry ?? configuredEntry,
			route: agentRuntime === "openclaw" ? configuredEntry ?? entry : void 0,
			agentRuntime
		})
	};
}
/** Returns whether a catalog entry declares support for an input modality. */
function modelSupportsInput(entry, input) {
	return entry?.input?.includes(input) ?? false;
}
/** Prefers canonical identity; the shipped SDK's case-insensitive fallback must be unique. */
function findModelInCatalog(catalog, provider, modelId) {
	const normalizedProvider = normalizeProviderId(provider);
	const providerCatalog = catalog.filter((entry) => normalizeProviderId(entry.provider) === normalizedProvider);
	const literal = providerCatalog.find((entry) => entry.id === modelId.trim());
	if (literal) return literal;
	const surface = resolveProviderModelPolicySurface(normalizedProvider);
	const identityOf = (id) => resolveProviderModelCatalogId({
		provider: normalizedProvider,
		modelId: splitTrailingAuthProfile(id).model,
		surface
	}) ?? id;
	const identity = identityOf(modelId.trim());
	const exact = providerCatalog.find((entry) => identityOf(entry.id) === identity);
	if (exact) return exact;
	const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
	const matches = providerCatalog.filter((entry) => normalizeLowercaseStringOrEmpty(entry.id) === normalizedModelId);
	return matches.length === 1 ? matches[0] : void 0;
}
/** Finds a model entry, requiring uniqueness when provider is omitted. */
function findModelCatalogEntry(catalog, params) {
	const modelId = normalizeOptionalString(params.modelId) ?? "";
	if (!modelId) return;
	const provider = normalizeOptionalString(params.provider);
	if (provider) return findModelInCatalog(catalog, provider, modelId);
	const keyOf = createModelCatalogIdentityKeyResolver();
	const exact = catalog.filter((entry) => keyOf(entry) === keyOf({
		provider: entry.provider,
		id: modelId
	}));
	const normalizedModelId = normalizeLowercaseStringOrEmpty(modelId);
	const matches = exact.length ? exact : catalog.filter((entry) => normalizeLowercaseStringOrEmpty(entry.id) === normalizedModelId);
	return matches.length === 1 ? matches[0] : void 0;
}
//#endregion
//#region src/agents/model-catalog-metadata.ts
function mergeCatalogFields(base, override) {
	return base && override ? {
		...base,
		...override
	} : override ?? base;
}
function normalizeCatalogRouteBaseUrl(value) {
	if (!value) return;
	try {
		const url = new URL(value);
		url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
		return url.toString();
	} catch {
		return value.replace(/\/+$/u, "");
	}
}
function catalogRouteChanges(base, overlay) {
	if (overlay.api === void 0 && overlay.baseUrl === void 0) return false;
	return overlay.api !== void 0 && base.api !== void 0 && overlay.api !== base.api || overlay.baseUrl !== void 0 && base.baseUrl !== void 0 && normalizeCatalogRouteBaseUrl(overlay.baseUrl) !== normalizeCatalogRouteBaseUrl(base.baseUrl);
}
function clearRouteBoundCatalogMetadata(entry) {
	const { contextWindow: _contextWindow, contextWindows: _contextWindows, contextWindowDefault: _contextWindowDefault, contextTokens: _contextTokens, reasoning: _reasoning, configuredReasoning: _configuredReasoning, thinkingPolicyProvider: _thinkingPolicyProvider, [PREPARED_THINKING_POLICY]: _thinkingPolicy, thinkingLevelMap: _thinkingLevelMap, input: _input, params: _params, compat: _compat, mediaInput: _mediaInput, ...routeNeutral } = entry;
	return routeNeutral;
}
function overlayCatalogMetadata(base, overlay, options) {
	const routeChanged = catalogRouteChanges(base, overlay);
	const routeBase = routeChanged ? clearRouteBoundCatalogMetadata(base) : base;
	const params = mergeCatalogFields(routeBase.params, overlay.params);
	const thinkingLevelMap = overlay.thinkingLevelMap ?? routeBase.thinkingLevelMap;
	const { contextWindows: _baseContextWindows, contextWindowDefault: _baseContextWindowDefault, ...selectionNeutralBase } = routeBase;
	const contextWindowSelection = overlay.contextWindows !== void 0 ? {
		contextWindows: overlay.contextWindows,
		...overlay.contextWindowDefault !== void 0 ? { contextWindowDefault: overlay.contextWindowDefault } : {}
	} : {
		...routeBase.contextWindows !== void 0 ? { contextWindows: routeBase.contextWindows } : {},
		...overlay.contextWindowDefault ?? routeBase.contextWindowDefault ? { contextWindowDefault: overlay.contextWindowDefault ?? routeBase.contextWindowDefault } : {}
	};
	const applyRoute = !options?.preserveBaseRoute;
	return {
		...selectionNeutralBase,
		...contextWindowSelection,
		...routeChanged ? { name: overlay.name } : {},
		...applyRoute && overlay.api !== void 0 ? { api: overlay.api } : {},
		...applyRoute && overlay.baseUrl !== void 0 ? { baseUrl: overlay.baseUrl } : {},
		...overlay.contextWindow !== void 0 ? { contextWindow: overlay.contextWindow } : {},
		...overlay.contextTokens !== void 0 ? { contextTokens: overlay.contextTokens } : {},
		...overlay.reasoning !== void 0 ? { reasoning: overlay.reasoning } : {},
		...overlay.configuredReasoning !== void 0 ? { configuredReasoning: overlay.configuredReasoning } : {},
		...thinkingLevelMap ? { thinkingLevelMap } : {},
		...overlay.input !== void 0 ? { input: overlay.input } : {},
		...params ? { params } : {},
		...overlay.mediaInput !== void 0 ? { mediaInput: overlay.mediaInput } : {},
		...overlay.providerOrder !== void 0 ? { providerOrder: overlay.providerOrder } : {},
		...overlay.status !== void 0 ? { status: overlay.status } : {},
		...overlay.statusReason !== void 0 ? { statusReason: overlay.statusReason } : {},
		...overlay.replaces !== void 0 ? { replaces: overlay.replaces } : {},
		...overlay.replacedBy !== void 0 ? { replacedBy: overlay.replacedBy } : {},
		compat: options?.preserveBaseCompat ? resolveCatalogOwnedModelCompat({
			catalogRoute: base,
			catalogCompat: base.compat,
			configuredRoute: {
				api: overlay.api ?? base.api,
				baseUrl: overlay.baseUrl ?? base.baseUrl
			},
			configuredCompat: overlay.compat
		}) : mergeCatalogFields(routeBase.compat, overlay.compat)
	};
}
//#endregion
//#region src/agents/utility-model-setting.ts
/** An agent's defined empty value disables utility routing instead of inheriting defaults. */
function readUtilityModelSetting(cfg, agentId) {
	const value = (agentId ? resolveAgentConfig(cfg, agentId)?.utilityModel : void 0) ?? cfg.agents?.defaults?.utilityModel;
	if (value === void 0) return { kind: "auto" };
	const trimmed = value.trim();
	return trimmed ? {
		kind: "explicit",
		modelRef: trimmed
	} : { kind: "disabled" };
}
//#endregion
//#region src/agents/model-selection-shared.ts
/**
* Shared model-selection resolution, alias, allowlist, and visibility logic.
*/
let log = null;
function getLog() {
	log ??= createSubsystemLogger("model-selection");
	return log;
}
const OPENROUTER_COMPAT_FREE_ALIAS = "openrouter:free";
function isStaticDefaultProviderAliasCandidate(candidate, cfg) {
	const raw = candidate.keyRaw.trim();
	const slash = raw.indexOf("/");
	return slash > 0 && slash < raw.length - 1 && normalizeProviderId(raw.slice(0, slash)) === normalizeProviderId("openai") && !findExactConfiguredProviderRefParts({
		cfg,
		raw
	});
}
function providerAliasKey(provider, alias) {
	return `${normalizeProviderId(provider)}/${normalizeLowercaseStringOrEmpty(alias)}`;
}
function hasSlashFormModelRef(raw) {
	const trimmed = raw.trim();
	const slash = trimmed.indexOf("/");
	return slash > 0 && slash < trimmed.length - 1;
}
function resolveManifestPluginsForModelIdNormalization(params) {
	if (params.allowManifestNormalization === false || params.manifestPlugins !== void 0) return params.manifestPlugins;
	const workspaceDir = params.workspaceDir ?? getActivePluginRegistryWorkspaceDirFromState();
	if (!workspaceDir) {
		const currentManifestPlugins = getCurrentPluginMetadataSnapshot({
			config: params.cfg,
			env: process.env
		});
		if (currentManifestPlugins) return currentManifestPlugins;
	}
	return loadManifestMetadataSnapshot({
		config: params.cfg,
		env: process.env,
		...workspaceDir ? { workspaceDir } : {}
	});
}
function createModelManifestPluginContext(params) {
	let manifestPlugins = params.manifestPlugins;
	let resolved = params.allowManifestNormalization === false || params.manifestPlugins !== void 0;
	return {
		peek: () => manifestPlugins,
		get: () => {
			if (!resolved) {
				manifestPlugins = resolveManifestPluginsForModelIdNormalization(params);
				resolved = true;
			}
			return manifestPlugins;
		}
	};
}
function listConfiguredModelMaps(cfg, agentId) {
	return [{ models: cfg.agents?.defaults?.models }, ...agentId ? [{ models: resolveAgentConfig(cfg, agentId)?.models }] : []];
}
function listModelAliasCandidates(cfg, agentId) {
	return listConfiguredModelMaps(cfg, agentId).flatMap(({ models }) => Object.entries(models ?? {}).flatMap(([keyRaw, entryRaw]) => {
		if (parseModelPolicyWildcardRef(keyRaw)) return [];
		if (!entryRaw || typeof entryRaw !== "object" || !Object.hasOwn(entryRaw, "alias")) return [];
		return [{
			keyRaw,
			alias: normalizeOptionalString(entryRaw.alias) ?? ""
		}];
	}));
}
function buildEffectiveModelAliases(params) {
	const aliasesByKey = /* @__PURE__ */ new Map();
	const candidates = listModelAliasCandidates(params.cfg, params.agentId);
	if (candidates.length === 0) return {
		aliases: [],
		disabledKeys: /* @__PURE__ */ new Set()
	};
	const useStaticDefaultProviderAliases = params.allowManifestNormalization !== false && candidates.every((candidate) => isStaticDefaultProviderAliasCandidate(candidate, params.cfg)) && params.manifestPluginContext.peek() === void 0 && !getActivePluginRegistryWorkspaceDirFromState() && !getCurrentPluginMetadataSnapshot({
		config: params.cfg,
		env: process.env
	});
	const manifestPlugins = useStaticDefaultProviderAliases ? void 0 : params.manifestPluginContext.get();
	for (const candidate of candidates) {
		const ref = parseModelRefWithCompatAlias({
			cfg: params.cfg,
			agentId: params.agentId,
			raw: candidate.keyRaw,
			defaultProvider: params.defaultProvider,
			allowManifestNormalization: useStaticDefaultProviderAliases ? false : params.allowManifestNormalization,
			allowPluginNormalization: useStaticDefaultProviderAliases ? false : params.allowPluginNormalization,
			manifestPlugins
		});
		if (!ref) continue;
		const key = modelKey(ref.provider, ref.model);
		aliasesByKey.delete(key);
		aliasesByKey.set(key, candidate.alias ? {
			...candidate,
			ref
		} : null);
	}
	return {
		aliases: [...aliasesByKey.values()].filter((alias) => alias !== null),
		disabledKeys: new Set([...aliasesByKey].flatMap(([key, alias]) => alias === null ? [key] : []))
	};
}
function findModelAliasCandidate(candidates, raw, provider) {
	const aliasKey = normalizeLowercaseStringOrEmpty(raw);
	const scopedProvider = provider ? normalizeProviderId(provider) : void 0;
	let match;
	for (const candidate of candidates) if (normalizeLowercaseStringOrEmpty(candidate.alias) === aliasKey && (!scopedProvider || normalizeProviderId(candidate.ref.provider) === scopedProvider)) match = candidate;
	return match;
}
function sanitizeModelWarningValue(value) {
	const stripped = value ? stripAnsi(value) : "";
	let controlBoundary = -1;
	for (let index = 0; index < stripped.length; index += 1) {
		const code = stripped.charCodeAt(index);
		if (code <= 31 || code === 127) {
			controlBoundary = index;
			break;
		}
	}
	if (controlBoundary === -1) return sanitizeForLog(stripped);
	return sanitizeForLog(stripped.slice(0, controlBoundary));
}
function modelCatalogEntryKey(entry) {
	return JSON.stringify([entry.provider.trim(), entry.id.trim()]);
}
function mergeModelCatalogEntries(params) {
	const merged = [...params.primary];
	const seen = new Set(merged.map(modelCatalogEntryKey));
	for (const entry of params.secondary) {
		const key = modelCatalogEntryKey(entry);
		if (seen.has(key)) continue;
		merged.push(entry);
		seen.add(key);
	}
	return merged;
}
/** One scope ranks exact IDs ahead of folded matches; ambiguity remains a match. */
function createModelProviderMatcher(raw) {
	const model = raw.trim();
	const foldedModel = normalizeLowercaseStringOrEmpty(model);
	const exact = /* @__PURE__ */ new Set();
	const folded = /* @__PURE__ */ new Set();
	return {
		add(provider, ...ids) {
			const providerId = normalizeProviderId(provider);
			if (!model || !providerId) return;
			if (ids.some((id) => id.trim() === model)) exact.add(providerId);
			else if (ids.some((id) => normalizeLowercaseStringOrEmpty(id) === foldedModel)) folded.add(providerId);
		},
		get matches() {
			return exact.size > 0 ? exact : folded;
		}
	};
}
/** Infer a unique provider for a bare model from configured model rows. */
function inferUniqueProviderFromConfiguredModels(params) {
	if (!params.model.trim()) return;
	const collectModelMapProviders = (models) => {
		const matcher = createModelProviderMatcher(params.model);
		for (const key of Object.keys(models ?? {})) {
			const ref = key.trim();
			if (!ref.includes("/") || ref.endsWith("/*")) continue;
			const parsed = parseModelRef(ref, DEFAULT_PROVIDER, {
				allowManifestNormalization: params.allowManifestNormalization,
				allowPluginNormalization: false,
				manifestPlugins: params.manifestPlugins
			});
			if (parsed) matcher.add(parsed.provider, parsed.model);
		}
		return matcher;
	};
	if (params.agentId) {
		const { matches } = collectModelMapProviders(resolveAgentConfig(params.cfg, params.agentId)?.models);
		if (matches.size > 0) return matches.size === 1 ? matches.values().next().value : void 0;
	}
	const matcher = collectModelMapProviders(params.cfg.agents?.defaults?.models);
	const normalizeModelId = createConfiguredProviderCatalogModelIdNormalizer({
		allowManifestNormalization: params.allowManifestNormalization,
		manifestPlugins: params.manifestPlugins
	});
	for (const [providerId, providerConfig] of Object.entries(params.cfg.models?.providers ?? {})) {
		if (!Array.isArray(providerConfig?.models)) continue;
		for (const entry of providerConfig.models) {
			const modelId = entry?.id?.trim();
			if (modelId) matcher.add(providerId, modelId, normalizeModelId(providerId, modelId));
		}
	}
	const { matches } = matcher;
	return matches.size === 1 ? matches.values().next().value : void 0;
}
/** Infer a unique provider for a bare model from a provider catalog. */
function inferUniqueProviderFromCatalog(params) {
	const matcher = createModelProviderMatcher(params.model);
	for (const entry of params.catalog) matcher.add(entry.provider, entry.id);
	const { matches } = matcher;
	return matches.size === 1 ? matches.values().next().value : void 0;
}
/** Resolve the provider used when a model string omits provider/id syntax. */
function resolveBareModelDefaultProvider(params) {
	return inferUniqueProviderFromConfiguredModels({
		cfg: params.cfg,
		model: params.model,
		agentId: params.agentId,
		manifestPlugins: params.manifestPlugins
	}) ?? inferUniqueProviderFromCatalog({
		catalog: params.catalog,
		model: params.model
	}) ?? params.defaultProvider;
}
function isConcreteOpenRouterFreeModelRef(ref) {
	return ref.provider === "openrouter" && ref.model.includes("/") && ref.model.endsWith(":free");
}
function resolveConfiguredOpenRouterCompatFreeRef(params) {
	const agentModels = params.agentId ? resolveAgentConfig(params.cfg, params.agentId)?.models : void 0;
	for (const models of [agentModels, params.cfg.agents?.defaults?.models]) for (const raw of Object.keys(models ?? {})) {
		if (!raw.includes("/")) continue;
		const parsed = parseModelRef(raw, params.defaultProvider, {
			allowManifestNormalization: params.allowManifestNormalization,
			allowPluginNormalization: params.allowPluginNormalization,
			manifestPlugins: params.manifestPlugins
		});
		if (parsed && isConcreteOpenRouterFreeModelRef(parsed)) return parsed;
	}
	const openrouterProviderConfig = findNormalizedProviderValue$1(params.cfg.models?.providers, "openrouter");
	for (const entry of openrouterProviderConfig?.models ?? []) {
		const modelId = entry?.id?.trim();
		if (!modelId || !modelId.includes("/") || !modelId.endsWith(":free")) continue;
		return normalizeModelRef("openrouter", modelId, {
			allowManifestNormalization: params.allowManifestNormalization,
			allowPluginNormalization: params.allowPluginNormalization,
			manifestPlugins: params.manifestPlugins
		});
	}
	return null;
}
/** Resolve OpenRouter compatibility aliases such as openrouter:auto/free. */
function resolveConfiguredOpenRouterCompatAlias(params) {
	const normalized = normalizeLowercaseStringOrEmpty(params.raw);
	if (normalized === "openrouter:auto") return normalizeModelRef("openrouter", "auto", {
		allowManifestNormalization: params.allowManifestNormalization,
		allowPluginNormalization: params.allowPluginNormalization,
		manifestPlugins: params.manifestPlugins
	});
	if (normalized !== OPENROUTER_COMPAT_FREE_ALIAS || !params.cfg) return null;
	return resolveConfiguredOpenRouterCompatFreeRef({
		cfg: params.cfg,
		agentId: params.agentId,
		defaultProvider: params.defaultProvider,
		allowManifestNormalization: params.allowManifestNormalization,
		allowPluginNormalization: params.allowPluginNormalization,
		manifestPlugins: params.manifestPlugins
	});
}
function parseModelRefWithCompatAlias(params) {
	const exactConfiguredProviderRef = resolveExactConfiguredProviderRef(params);
	const exactDefaultProviderRef = params.raw.includes("/") ? null : resolveExactConfiguredProviderRef({
		...params,
		raw: `${params.defaultProvider}/${params.raw}`
	});
	return resolveConfiguredOpenRouterCompatAlias(params) ?? exactConfiguredProviderRef ?? exactDefaultProviderRef ?? parseModelRef(params.raw, params.defaultProvider, {
		allowManifestNormalization: params.allowManifestNormalization,
		allowPluginNormalization: params.allowPluginNormalization,
		manifestPlugins: params.manifestPlugins
	});
}
function findExactConfiguredProviderRefParts(params) {
	const slash = params.raw.indexOf("/");
	if (slash <= 0 || !params.cfg?.models?.providers) return null;
	const providerRaw = params.raw.slice(0, slash).trim();
	const modelRaw = params.raw.slice(slash + 1).trim();
	if (!providerRaw || !modelRaw) return null;
	const providerKey = normalizeLowercaseStringOrEmpty(providerRaw);
	const exactConfigured = Object.entries(params.cfg.models.providers).find(([key]) => normalizeLowercaseStringOrEmpty(key) === providerKey);
	if (!exactConfigured) return null;
	const [configuredProvider, providerConfig] = exactConfigured;
	const normalizedConfiguredProvider = normalizeProviderId(configuredProvider);
	const apiOwner = typeof providerConfig?.api === "string" ? normalizeProviderId(providerConfig.api) : "";
	if (!apiOwner || apiOwner === normalizedConfiguredProvider) return null;
	return {
		configuredProvider,
		modelRaw
	};
}
function normalizeExactConfiguredProviderRef(parts, params) {
	const { configuredProvider, modelRaw } = parts;
	const provider = normalizeLowercaseStringOrEmpty(configuredProvider);
	return {
		provider,
		model: normalizeConfiguredProviderCatalogModelId(provider, modelRaw.trim(), {
			allowManifestNormalization: params.allowManifestNormalization,
			manifestPlugins: params.manifestPlugins
		})
	};
}
function resolveExactConfiguredProviderRef(params) {
	const exactConfigured = findExactConfiguredProviderRefParts({
		cfg: params.cfg,
		raw: params.raw
	});
	if (!exactConfigured) return null;
	return normalizeExactConfiguredProviderRef(exactConfigured, params);
}
function buildModelAliasIndexWithManifestContext(params) {
	const byAlias = /* @__PURE__ */ new Map();
	const byProviderAlias = /* @__PURE__ */ new Map();
	const byKey = /* @__PURE__ */ new Map();
	const { aliases, disabledKeys } = buildEffectiveModelAliases(params);
	if (aliases.length === 0) return {
		byAlias,
		byProviderAlias,
		byKey,
		disabledKeys
	};
	for (const { alias, ref } of aliases) {
		const aliasKey = normalizeLowercaseStringOrEmpty(alias);
		const match = {
			alias,
			ref
		};
		const key = modelKey(ref.provider, ref.model);
		byAlias.set(aliasKey, match);
		byProviderAlias.set(providerAliasKey(ref.provider, alias), match);
		byKey.set(key, [alias]);
	}
	return {
		byAlias,
		byProviderAlias,
		byKey,
		disabledKeys
	};
}
/** Build lookup maps from user-facing aliases to normalized model refs. */
function buildModelAliasIndex(params) {
	return buildModelAliasIndexWithManifestContext({
		cfg: params.cfg,
		defaultProvider: params.defaultProvider,
		agentId: params.agentId,
		allowManifestNormalization: params.allowManifestNormalization,
		allowPluginNormalization: params.allowPluginNormalization,
		manifestPluginContext: createModelManifestPluginContext(params)
	});
}
function buildModelCatalogMetadata(params) {
	const configuredByKey = /* @__PURE__ */ new Map();
	for (const entry of params.configuredCatalog) configuredByKey.set(modelCatalogEntryKey(entry), entry);
	return {
		configuredByKey,
		aliasByKey: new Map([...params.aliasIndex.byKey].flatMap(([key, aliases]) => {
			const alias = aliases.at(-1);
			return alias ? [[key, alias]] : [];
		}))
	};
}
function applyModelCatalogMetadata(params) {
	const configuredEntry = params.metadata.configuredByKey.get(modelCatalogEntryKey(params.entry));
	const alias = params.metadata.aliasByKey.get(modelKey(params.entry.provider, params.entry.id));
	if (!configuredEntry && !alias) return params.entry;
	const entry = configuredEntry ? {
		...overlayCatalogMetadata(params.entry, configuredEntry, {
			preserveBaseCompat: true,
			preserveBaseRoute: true
		}),
		name: configuredEntry.name
	} : params.entry;
	return alias ? {
		...entry,
		alias
	} : entry;
}
function resolveModelRefFromString(params) {
	const { model } = splitTrailingAuthProfile(params.raw);
	if (!model) return null;
	const aliasKey = normalizeLowercaseStringOrEmpty(model);
	const aliasMatch = params.aliasIndex?.byAlias.get(aliasKey);
	if (aliasMatch) return {
		ref: aliasMatch.ref,
		alias: aliasMatch.alias
	};
	const slash = model.indexOf("/");
	if (slash > 0) {
		const providerAliasMatch = params.aliasIndex?.byProviderAlias?.get(providerAliasKey(model.slice(0, slash), model.slice(slash + 1)));
		if (providerAliasMatch) return {
			ref: providerAliasMatch.ref,
			alias: providerAliasMatch.alias
		};
	}
	const parsed = parseModelRefWithCompatAlias({
		cfg: params.cfg,
		agentId: params.agentId,
		raw: model,
		defaultProvider: params.defaultProvider,
		allowManifestNormalization: params.allowManifestNormalization,
		allowPluginNormalization: params.allowPluginNormalization,
		manifestPlugins: params.manifestPlugins
	});
	if (!parsed) return null;
	return { ref: parsed };
}
/** Prepare implicit provider selection without promoting the agent's utility route. */
function resolveConfiguredPrimaryProviderFallback(params) {
	const utility = readUtilityModelSetting(params.cfg, params.agentId);
	const excludedModel = utility.kind === "explicit" && hasUtilityModelSeparationMigrationMarker(params.cfg) ? resolveModelRefFromString({
		...params,
		raw: utility.modelRef,
		aliasIndex: buildModelAliasIndex(params)
	})?.ref : void 0;
	return resolveConfiguredProviderFallback({
		...params,
		excludedModel
	});
}
/** Resolve the default configured model ref, including aliases and fallback provider rows. */
function resolveConfiguredModelRef(params) {
	const rawModel = (params.agentId ? resolveAgentModelPrimaryValue(resolveAgentConfig(params.cfg, params.agentId)?.model) : void 0) ?? resolveAgentModelPrimaryValue(params.cfg.agents?.defaults?.model) ?? "";
	if (rawModel) {
		const trimmed = rawModel.trim();
		const { model: modelWithoutProfile } = splitTrailingAuthProfile(trimmed);
		const manifestPluginContext = createModelManifestPluginContext(params);
		const profileStripped = Boolean(modelWithoutProfile && modelWithoutProfile !== trimmed);
		const providerSeparator = modelWithoutProfile.indexOf("/");
		const qualifiedProvider = providerSeparator > 0 ? modelWithoutProfile.slice(0, providerSeparator) : void 0;
		const qualifiedModel = qualifiedProvider ? modelWithoutProfile.slice(providerSeparator + 1) : void 0;
		const aliasKeys = new Set([
			trimmed,
			...profileStripped ? [modelWithoutProfile] : [],
			...qualifiedModel ? [qualifiedModel] : []
		].map(normalizeLowercaseStringOrEmpty));
		const aliasCandidates = listModelAliasCandidates(params.cfg, params.agentId).some((candidate) => aliasKeys.has(normalizeLowercaseStringOrEmpty(candidate.alias))) ? buildEffectiveModelAliases({
			cfg: params.cfg,
			agentId: params.agentId,
			defaultProvider: params.defaultProvider,
			allowManifestNormalization: params.allowManifestNormalization,
			allowPluginNormalization: params.allowPluginNormalization,
			manifestPluginContext
		}).aliases : [];
		const exactAliasCandidate = findModelAliasCandidate(aliasCandidates, trimmed);
		const strippedAliasCandidate = profileStripped ? findModelAliasCandidate(aliasCandidates, modelWithoutProfile) : void 0;
		const profileAliasCandidate = profileStripped ? exactAliasCandidate ?? strippedAliasCandidate : void 0;
		if (profileAliasCandidate) return profileAliasCandidate.ref;
		if (!exactAliasCandidate && qualifiedProvider && qualifiedModel) {
			const qualifiedAliasCandidate = findModelAliasCandidate(aliasCandidates, qualifiedModel, qualifiedProvider);
			if (qualifiedAliasCandidate && !hasExactConfiguredProviderModel({
				cfg: params.cfg,
				provider: qualifiedProvider,
				model: qualifiedModel
			})) return qualifiedAliasCandidate.ref;
		}
		const primaryWithoutProfile = modelWithoutProfile || trimmed;
		const exactConfiguredPrimary = findExactConfiguredProviderRefParts({
			cfg: params.cfg,
			raw: primaryWithoutProfile
		});
		if (exactConfiguredPrimary) return normalizeExactConfiguredProviderRef(exactConfiguredPrimary, {
			allowManifestNormalization: params.allowManifestNormalization,
			manifestPlugins: manifestPluginContext.get()
		});
		const aliasCandidate = profileStripped ? void 0 : exactAliasCandidate;
		const manifestPlugins = manifestPluginContext.peek();
		if (aliasCandidate && hasSlashFormModelRef(primaryWithoutProfile) && !hasSlashFormModelRef(aliasCandidate.keyRaw)) {
			const primaryRef = parseModelRefWithCompatAlias({
				cfg: params.cfg,
				agentId: params.agentId,
				raw: primaryWithoutProfile,
				defaultProvider: params.defaultProvider,
				allowManifestNormalization: params.allowManifestNormalization,
				allowPluginNormalization: params.allowPluginNormalization,
				manifestPlugins: manifestPluginContext.get()
			});
			if (primaryRef) return primaryRef;
		}
		if (aliasCandidate) return aliasCandidate.ref;
		if (!trimmed.includes("/")) {
			const normalizedTrimmed = normalizeLowercaseStringOrEmpty(trimmed);
			const needsOpenRouterCompatManifestPlugins = normalizedTrimmed === "openrouter:auto" || normalizedTrimmed === OPENROUTER_COMPAT_FREE_ALIAS;
			const openrouterCompatRef = resolveConfiguredOpenRouterCompatAlias({
				cfg: params.cfg,
				agentId: params.agentId,
				raw: trimmed,
				defaultProvider: params.defaultProvider,
				allowManifestNormalization: params.allowManifestNormalization,
				allowPluginNormalization: params.allowPluginNormalization,
				manifestPlugins: needsOpenRouterCompatManifestPlugins ? manifestPluginContext.get() : manifestPlugins
			});
			if (openrouterCompatRef) return openrouterCompatRef;
			let inferredProvider = inferUniqueProviderFromConfiguredModels({
				cfg: params.cfg,
				model: trimmed,
				agentId: params.agentId,
				allowManifestNormalization: false,
				manifestPlugins
			});
			let inferredProviderManifestPlugins = manifestPlugins;
			if ((!inferredProvider || inferredProvider !== "openai") && hasConfiguredRowsNeedingManifestLookup(params.cfg, params.defaultProvider, params.agentId)) {
				inferredProviderManifestPlugins = manifestPluginContext.get();
				inferredProvider = inferUniqueProviderFromConfiguredModels({
					cfg: params.cfg,
					model: trimmed,
					agentId: params.agentId,
					allowManifestNormalization: params.allowManifestNormalization,
					manifestPlugins: inferredProviderManifestPlugins
				}) ?? inferredProvider;
			}
			if (inferredProvider) return normalizeModelRef(inferredProvider, trimmed, {
				allowManifestNormalization: inferredProviderManifestPlugins ? params.allowManifestNormalization : false,
				allowPluginNormalization: params.allowPluginNormalization,
				manifestPlugins: inferredProviderManifestPlugins
			});
			const safeTrimmed = sanitizeModelWarningValue(trimmed);
			const safeResolved = sanitizeForLog(`${params.defaultProvider}/${safeTrimmed}`);
			getLog().warn(`Model "${safeTrimmed}" specified without provider. Falling back to "${safeResolved}". Please use "${safeResolved}" in your config.`);
		}
		const useManifest = trimmed.includes("/") || manifestPluginContext.peek() !== void 0;
		const resolved = resolveModelRefFromString({
			cfg: params.cfg,
			agentId: params.agentId,
			raw: trimmed,
			defaultProvider: params.defaultProvider,
			allowManifestNormalization: useManifest ? params.allowManifestNormalization : false,
			allowPluginNormalization: params.allowPluginNormalization,
			manifestPlugins: useManifest ? manifestPluginContext.get() : void 0
		});
		if (resolved) return resolved.ref;
		const safe = sanitizeForLog(trimmed);
		const safeFallback = sanitizeForLog(`${params.defaultProvider}/${params.defaultModel}`);
		getLog().warn(`Model "${safe}" could not be resolved. Falling back to default "${safeFallback}".`);
	}
	const fallbackProvider = resolveConfiguredPrimaryProviderFallback(params);
	if (fallbackProvider) return fallbackProvider;
	return {
		provider: params.defaultProvider,
		model: params.defaultModel
	};
}
/** Build explicit model override authorization without widening it for automatic fallbacks. */
function buildAllowedModelSet(params) {
	return buildAllowedModelSetFromPrepared(params, prepareModelPolicy(params));
}
function prepareModelPolicy(params) {
	const visibility = parseConfiguredModelVisibilityEntries(params);
	const policyAliasAgentId = resolvePolicyAliasAgentId(visibility.configPath, params.agentId);
	const policyAliasIndex = buildModelAliasIndex({
		...params,
		agentId: policyAliasAgentId
	});
	const selectionAliasIndex = params.agentId && policyAliasAgentId !== params.agentId ? buildModelAliasIndex(params) : policyAliasIndex;
	const configuredCatalog = buildConfiguredModelCatalog({
		cfg: params.cfg,
		catalog: params.catalog,
		manifestPlugins: params.manifestPlugins
	});
	const metadata = buildModelCatalogMetadata({
		configuredCatalog,
		aliasIndex: selectionAliasIndex
	});
	const catalog = mergeModelCatalogEntries({
		primary: params.catalog,
		secondary: configuredCatalog
	}).map((entry) => applyModelCatalogMetadata({
		entry,
		metadata
	}));
	const capturedByKey = indexFirstByKey(params.catalog, modelCatalogEntryKey);
	return {
		visibility,
		defaultRef: typeof params.defaultModel === "string" ? resolveModelRefFromString({
			...params,
			raw: params.defaultModel,
			aliasIndex: selectionAliasIndex
		})?.ref ?? null : params.defaultModel ?? null,
		policyAliasIndex,
		selectionAliasIndex,
		configuredCatalog: configuredCatalog.map((entry) => applyModelCatalogMetadata({
			entry: capturedByKey.get(modelCatalogEntryKey(entry)) ?? entry,
			metadata
		})),
		metadata,
		catalog
	};
}
function buildAllowedModelSetFromPrepared(params, { visibility, policyAliasIndex, metadata, catalog, defaultRef }) {
	const wildcardModelKeys = visibility.wildcardModelKeys;
	const allowAny = !visibility.hasEntries;
	const defaultKey = defaultRef ? modelKey(defaultRef.provider, defaultRef.model) : void 0;
	const resolvePolicyModelRef = (raw) => {
		const trimmed = raw.trim();
		const defaultProvider = !trimmed.includes("/") ? resolveBareModelDefaultProvider({
			cfg: params.cfg,
			catalog,
			model: trimmed,
			defaultProvider: params.defaultProvider,
			agentId: params.agentId,
			manifestPlugins: params.manifestPlugins
		}) : params.defaultProvider;
		return resolveModelRefFromString({
			cfg: params.cfg,
			agentId: params.agentId,
			raw,
			defaultProvider,
			aliasIndex: policyAliasIndex,
			allowManifestNormalization: params.allowManifestNormalization,
			allowPluginNormalization: params.allowPluginNormalization,
			manifestPlugins: params.manifestPlugins
		})?.ref;
	};
	if (allowAny) {
		const allowedKeys = new Set(catalog.map((entry) => modelKey(entry.provider, entry.id)));
		if (defaultKey) allowedKeys.add(defaultKey);
		return {
			allowAny: true,
			allowedCatalog: catalog,
			allowedKeys,
			allows: () => true
		};
	}
	const allowedKeys = /* @__PURE__ */ new Set();
	const resolveModelCatalogIdentityKey = createModelCatalogIdentityKeyResolver();
	const catalogIdentities = new Set(catalog.map(resolveModelCatalogIdentityKey));
	const allowedCatalogIdentities = /* @__PURE__ */ new Set();
	const exactAllowedIdentities = /* @__PURE__ */ new Set();
	const allowedCaseInsensitiveIdentities = /* @__PURE__ */ new Set();
	const caseInsensitiveIdentity = (provider, model) => JSON.stringify([normalizeProviderId(provider), normalizeLowercaseStringOrEmpty(model)]);
	const syntheticCatalogEntries = /* @__PURE__ */ new Map();
	for (const wildcardKey of wildcardModelKeys) allowedKeys.add(wildcardKey);
	const addAllowedCatalogRef = (ref) => {
		const identity = resolveModelCatalogIdentityKey({
			provider: ref.provider,
			id: ref.model
		});
		allowedCatalogIdentities.add(identity);
		allowedCaseInsensitiveIdentities.add(caseInsensitiveIdentity(ref.provider, ref.model));
		return modelCatalogEntryKey({
			provider: ref.provider,
			id: ref.model
		});
	};
	for (const entry of expandModelCatalogWildcards(catalog, wildcardModelKeys)) {
		allowedKeys.add(modelKey(entry.provider, entry.id));
		addAllowedCatalogRef({
			provider: entry.provider,
			model: entry.id
		});
	}
	const addAllowedModelRef = (raw) => {
		const parsed = resolvePolicyModelRef(raw);
		if (!parsed) return;
		const key = modelKey(parsed.provider, parsed.model);
		allowedKeys.add(key);
		exactAllowedIdentities.add(addAllowedCatalogRef(parsed));
		const syntheticKey = modelCatalogEntryKey({
			provider: parsed.provider,
			id: parsed.model
		});
		if (!catalogIdentities.has(resolveModelCatalogIdentityKey({
			provider: parsed.provider,
			id: parsed.model
		})) && !findModelCatalogEntry(catalog, {
			provider: parsed.provider,
			modelId: parsed.model
		}) && !syntheticCatalogEntries.has(syntheticKey)) {
			const alias = metadata.aliasByKey.get(key);
			syntheticCatalogEntries.set(syntheticKey, {
				id: parsed.model,
				name: parsed.model,
				provider: parsed.provider,
				...alias ? { alias } : {}
			});
		}
	};
	for (const raw of visibility.exactModelRefs) addAllowedModelRef(raw);
	return {
		allowAny: false,
		allowedCatalog: [...catalog.filter((entry) => allowedCatalogIdentities.has(resolveModelCatalogIdentityKey(entry)) || allowedCaseInsensitiveIdentities.has(caseInsensitiveIdentity(entry.provider, entry.id))), ...syntheticCatalogEntries.values()],
		allowedKeys,
		allows: (ref) => {
			const provider = normalizeProviderId(ref.provider);
			return exactAllowedIdentities.has(modelCatalogEntryKey({
				provider,
				id: ref.model
			})) || visibility.providerWildcards.has(provider) && isModelKeyAllowedBySet(wildcardModelKeys, `${provider}/${ref.model}`);
		}
	};
}
function getModelRefStatus(params) {
	const allowed = buildAllowedModelSet(params);
	return {
		key: modelKey(params.ref.provider, params.ref.model),
		inCatalog: Boolean(findModelCatalogEntry(params.catalog, {
			provider: params.ref.provider,
			modelId: params.ref.model
		})),
		allowAny: allowed.allowAny,
		allowed: allowed.allows(params.ref)
	};
}
/** Resolve a requested model string only if it is allowed by the supplied status check. */
function resolveAllowedModelRefFromAliasIndex(params) {
	const trimmed = params.raw.trim();
	if (!trimmed) return { error: "invalid model: empty" };
	const effectiveDefaultProvider = !trimmed.includes("/") ? inferUniqueProviderFromConfiguredModels({
		cfg: params.cfg,
		model: trimmed,
		agentId: params.agentId,
		manifestPlugins: params.manifestPlugins
	}) ?? params.defaultProvider : params.defaultProvider;
	const resolved = resolveModelRefFromString({
		cfg: params.cfg,
		agentId: params.agentId,
		raw: trimmed,
		defaultProvider: effectiveDefaultProvider,
		aliasIndex: params.aliasIndex,
		manifestPlugins: params.manifestPlugins
	});
	if (!resolved) return { error: `invalid model: ${trimmed}` };
	const status = params.getStatus(resolved.ref);
	if (!status.allowed) return { error: `model not allowed: ${status.key}` };
	return {
		ref: resolved.ref,
		key: status.key
	};
}
/** True when config contains provider model rows that should seed catalogs. */
function hasConfiguredProviderModelRows(cfg) {
	const providers = cfg.models?.providers;
	if (!providers || typeof providers !== "object") return false;
	return Object.values(providers).some((provider) => Array.isArray(provider?.models));
}
function hasConfiguredProviderRowsNeedingManifestLookup(cfg) {
	const providers = cfg.models?.providers;
	if (!providers || typeof providers !== "object") return false;
	return Object.entries(providers).some(([providerRaw, provider]) => Array.isArray(provider?.models) && normalizeProviderId(providerRaw) !== "openai");
}
function hasConfiguredModelRefsNeedingManifestLookup(cfg, defaultProvider, agentId) {
	const normalizedDefaultProvider = normalizeProviderId(defaultProvider);
	return listConfiguredModelMaps(cfg, agentId).some(({ models }) => Object.keys(models ?? {}).some((keyRaw) => {
		const key = keyRaw.trim();
		if (!key || key.endsWith("/*")) return false;
		const slashIndex = key.indexOf("/");
		if (slashIndex <= 0) return false;
		const provider = normalizeProviderId(key.slice(0, slashIndex));
		return Boolean(provider && provider !== normalizedDefaultProvider);
	}));
}
function hasConfiguredRowsNeedingManifestLookup(cfg, defaultProvider, agentId) {
	return hasConfiguredProviderRowsNeedingManifestLookup(cfg) || hasConfiguredModelRefsNeedingManifestLookup(cfg, defaultProvider, agentId);
}
function resolveConfiguredModelManifestPlugins(params) {
	if (params.manifestPlugins) return params.manifestPlugins;
	if (!hasConfiguredProviderModelRows(params.cfg)) return;
	const workspaceDir = params.workspaceDir ?? getActivePluginRegistryWorkspaceDirFromState();
	if (!workspaceDir) return getCurrentPluginMetadataSnapshot({
		config: params.cfg,
		env: process.env
	});
	return loadManifestMetadataSnapshot({
		config: params.cfg,
		env: process.env,
		...workspaceDir ? { workspaceDir } : {}
	});
}
/** Build catalog entries from configured provider model rows. */
function buildConfiguredModelCatalog(params) {
	const providers = params.cfg.models?.providers;
	if (!providers || typeof providers !== "object") return [];
	const manifestPlugins = resolveConfiguredModelManifestPlugins(params);
	const normalizeModelId = createConfiguredProviderCatalogModelIdNormalizer({ manifestPlugins });
	const resolveModelCatalogIdentityKey = createModelCatalogIdentityKeyResolver();
	const capturedByIdentity = params.catalog?.length ? indexFirstByKey(params.catalog, resolveModelCatalogIdentityKey) : void 0;
	const catalog = [];
	for (const [providerRaw, provider] of Object.entries(providers)) {
		const providerId = normalizeProviderId(providerRaw);
		if (!providerId || !Array.isArray(provider?.models)) continue;
		for (const model of provider.models) {
			const rawId = normalizeOptionalString(model?.id) ?? "";
			const id = rawId ? normalizeModelId(providerId, rawId) : "";
			if (!id) continue;
			const accepted = capturedByIdentity?.get(resolveModelCatalogIdentityKey({
				provider: providerId,
				id
			}));
			const api = model.api ?? accepted?.api ?? provider.api;
			const baseUrl = model.baseUrl ?? accepted?.baseUrl ?? provider.baseUrl;
			const name = normalizeOptionalString(model?.name) || id;
			const contextWindow = typeof model?.contextWindow === "number" && model.contextWindow > 0 ? model.contextWindow : void 0;
			const contextTokens = typeof model?.contextTokens === "number" && model.contextTokens > 0 ? model.contextTokens : void 0;
			const input = Array.isArray(model?.input) ? model.input : void 0;
			const modelParams = model?.params && typeof model.params === "object" ? model.params : void 0;
			const compat = model?.compat && typeof model.compat === "object" ? model.compat : void 0;
			const reasoning = typeof model?.reasoning === "boolean" ? model.reasoning : isVllmQwenThinkingCompat(providerId, compat) ? true : void 0;
			catalog.push({
				provider: providerId,
				id,
				name,
				api,
				...baseUrl ? { baseUrl } : {},
				contextWindow,
				contextTokens,
				reasoning,
				...typeof model?.reasoning === "boolean" ? { configuredReasoning: model.reasoning } : {},
				...model.thinkingLevelMap ? { thinkingLevelMap: model.thinkingLevelMap } : {},
				input,
				...modelParams ? { params: modelParams } : {},
				compat
			});
		}
	}
	return catalog;
}
function isVllmQwenThinkingCompat(providerId, compat) {
	return providerId === "vllm" && (compat?.thinkingFormat === "qwen" || compat?.thinkingFormat === "qwen-chat-template");
}
function resolveHooksGmailModel(params) {
	const hooksModel = params.cfg.hooks?.gmail?.model;
	if (!hooksModel?.trim()) return null;
	const aliasIndex = buildModelAliasIndex({
		cfg: params.cfg,
		defaultProvider: params.defaultProvider,
		manifestPlugins: params.manifestPlugins
	});
	return resolveModelRefFromString({
		cfg: params.cfg,
		raw: hooksModel,
		defaultProvider: params.defaultProvider,
		aliasIndex,
		manifestPlugins: params.manifestPlugins
	})?.ref ?? null;
}
const DEFAULT_MODEL_POLICY_ALLOW_CONFIG_PATH = "agents.defaults.modelPolicy.allow";
const AGENT_MODEL_POLICY_ALLOW_CONFIG_PATH = "agents.entries.*.modelPolicy.allow";
const LEGACY_MODEL_POLICY_ALLOW_CONFIG_PATH = "agents.defaults.models";
function resolvePolicyAliasAgentId(configPath, agentId) {
	return configPath === AGENT_MODEL_POLICY_ALLOW_CONFIG_PATH ? agentId : void 0;
}
function resolveConfiguredModelPolicyAllow(params) {
	const defaults = params.cfg?.agents?.defaults;
	if (params.agentId) {
		const agentPolicy = (params.cfg ? resolveAgentConfig(params.cfg, params.agentId) : void 0)?.modelPolicy;
		if (hasExplicitModelPolicyAllow(agentPolicy)) return {
			refs: agentPolicy?.allow ?? [],
			configPath: AGENT_MODEL_POLICY_ALLOW_CONFIG_PATH,
			repairConfigPath: AGENT_MODEL_POLICY_ALLOW_CONFIG_PATH
		};
	}
	const defaultPolicy = defaults?.modelPolicy;
	if (hasExplicitModelPolicyAllow(defaultPolicy)) return {
		refs: defaultPolicy?.allow ?? [],
		configPath: DEFAULT_MODEL_POLICY_ALLOW_CONFIG_PATH,
		repairConfigPath: DEFAULT_MODEL_POLICY_ALLOW_CONFIG_PATH
	};
	const legacyDefaultRefs = computeModelPolicyAllowlist({
		root: params.cfg,
		defaults
	});
	if (legacyDefaultRefs) return {
		refs: legacyDefaultRefs,
		configPath: LEGACY_MODEL_POLICY_ALLOW_CONFIG_PATH,
		repairConfigPath: DEFAULT_MODEL_POLICY_ALLOW_CONFIG_PATH
	};
	return {
		refs: [],
		configPath: null,
		repairConfigPath: DEFAULT_MODEL_POLICY_ALLOW_CONFIG_PATH
	};
}
function parseConfiguredModelVisibilityEntries(params) {
	const configured = resolveConfiguredModelPolicyAllow(params);
	const exactModelRefs = [];
	const providerWildcards = /* @__PURE__ */ new Set();
	const wildcardModelKeys = /* @__PURE__ */ new Set();
	for (const raw of configured.refs) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const wildcard = parseModelPolicyWildcardRef(trimmed);
		if (wildcard) {
			providerWildcards.add(wildcard.provider);
			wildcardModelKeys.add(wildcard.key);
			continue;
		}
		exactModelRefs.push(raw);
	}
	return {
		exactModelRefs,
		providerWildcards,
		wildcardModelKeys,
		hasEntries: configured.refs.length > 0,
		configPath: configured.configPath,
		repairConfigPath: configured.repairConfigPath
	};
}
/** Expand segment-boundary prefix wildcard policy entries against discovered catalog rows. */
function expandModelCatalogWildcards(catalog, wildcardModelKeys) {
	return catalog.filter((entry) => isModelKeyAllowedBySet(wildcardModelKeys, modelKey(entry.provider, entry.id)));
}
function isModelKeyAllowedBySet(allowedKeys, key) {
	if (allowedKeys.has(key)) return true;
	let separator = key.indexOf("/");
	while (separator > 0) {
		if (allowedKeys.has(`${key.slice(0, separator + 1)}*`)) return true;
		separator = key.indexOf("/", separator + 1);
	}
	return false;
}
function resolveInitialModelSelection(params) {
	const current = params.routeResolution === "resolved" ? {
		provider: params.provider,
		model: params.model
	} : resolveExactConfiguredProviderRef({
		cfg: params.cfg,
		raw: `${params.provider}/${params.model}`,
		allowManifestNormalization: params.allowManifestNormalization,
		manifestPlugins: params.manifestPlugins
	}) ?? normalizeModelRef(params.provider, params.model, {
		allowManifestNormalization: params.allowManifestNormalization,
		allowPluginNormalization: params.allowPluginNormalization,
		manifestPlugins: params.manifestPlugins
	});
	if (params.allows(current) || current.provider === params.configuredDefault?.provider && current.model === params.configuredDefault.model) return current;
	const fallback = params.allowedCatalog.find((entry) => params.allows({
		provider: entry.provider,
		model: entry.id
	}));
	return fallback ? {
		provider: fallback.provider,
		model: fallback.id
	} : null;
}
function dedupeModelCatalogEntries(entries) {
	return dedupeByKey(entries, modelCatalogEntryKey);
}
function createModelVisibilityPolicyWithFallbacks(params) {
	const prepared = prepareModelPolicy(params);
	const { visibility, policyAliasIndex, selectionAliasIndex, configuredCatalog } = prepared;
	const wildcardModelKeys = visibility.wildcardModelKeys;
	const allowed = buildAllowedModelSetFromPrepared(params, prepared);
	const resolveModelCatalogIdentityKey = createModelCatalogIdentityKeyResolver();
	const configuredKeys = new Set(configuredCatalog.map(resolveModelCatalogIdentityKey));
	const retainedKeys = /* @__PURE__ */ new Set();
	const addConfiguredRef = (input, retained, aliasIndex) => {
		if (!input || typeof input === "string" && (!input.trim() || parseModelPolicyWildcardRef(input))) return;
		const ref = typeof input === "string" ? resolveModelRefFromString({
			...params,
			raw: input,
			aliasIndex
		})?.ref : input;
		if (!ref) return;
		const key = resolveModelCatalogIdentityKey({
			provider: ref.provider,
			id: ref.model
		});
		configuredKeys.add(key);
		if (retained) retainedKeys.add(key);
		return ref;
	};
	const exactConfiguredKeys = /* @__PURE__ */ new Set();
	for (const raw of visibility.exactModelRefs) {
		const resolved = addConfiguredRef(raw, false, policyAliasIndex);
		if (resolved) exactConfiguredKeys.add(modelKey(resolved.provider, resolved.model));
	}
	for (const raw of params.additionalConfiguredModelRefs ?? []) addConfiguredRef(raw, false, selectionAliasIndex);
	addConfiguredRef(prepared.defaultRef, true, selectionAliasIndex);
	for (const fallback of params.fallbackModels) addConfiguredRef(fallback, true, selectionAliasIndex);
	return {
		allowAny: allowed.allowAny,
		catalog: prepared.catalog,
		configuredCatalog,
		allowedCatalog: allowed.allowedCatalog,
		allowedKeys: allowed.allowedKeys,
		policyAliasIndex,
		selectionAliasIndex,
		configuredKeys,
		retainedKeys,
		exactModelRefs: visibility.exactModelRefs,
		providerWildcards: visibility.providerWildcards,
		hasConfiguredEntries: visibility.hasEntries,
		hasProviderWildcards: wildcardModelKeys.size > 0,
		allowConfigPath: visibility.configPath,
		allowRepairConfigPath: visibility.repairConfigPath,
		allows: allowed.allows,
		allowsByWildcard: (ref) => {
			const provider = normalizeProviderId(ref.provider);
			return visibility.providerWildcards.has(provider) && isModelKeyAllowedBySet(wildcardModelKeys, `${provider}/${ref.model}`);
		},
		resolveSelection: (ref) => resolveInitialModelSelection({
			...ref,
			cfg: params.cfg,
			allows: allowed.allows,
			allowedCatalog: allowed.allowedCatalog,
			configuredDefault: visibility.exactModelRefs.length > 0 && wildcardModelKeys.size === 0 ? prepared.defaultRef : null,
			allowManifestNormalization: params.allowManifestNormalization,
			allowPluginNormalization: params.allowPluginNormalization,
			manifestPlugins: params.manifestPlugins
		}),
		visibleCatalog: ({ catalog, defaultVisibleCatalog, view }) => {
			if (view === "all") return [...catalog];
			if (allowed.allowAny) return [...defaultVisibleCatalog];
			if (wildcardModelKeys.size === 0) return [...allowed.allowedCatalog];
			return dedupeModelCatalogEntries([...defaultVisibleCatalog.filter((entry) => isModelKeyAllowedBySet(wildcardModelKeys, modelKey(entry.provider, entry.id))), ...allowed.allowedCatalog.filter((entry) => exactConfiguredKeys.has(modelKey(entry.provider, entry.id)))]);
		}
	};
}
//#endregion
export { openAIModelCatalogRoutePolicy as A, findModelInCatalog as C, resolvePreparedModelThinkingCompat as D, projectModelThinkingCompat as E, allowsPluginModelNormalization as F, hasExactConfiguredProviderModel as I, resolveModelCatalogIdentityKey as M, resolveOpenAIModelRoutes as N, createModelCatalogIdentityKeyResolver as O, selectOpenAIModelRouteAuth as P, findModelCatalogEntry as S, prepareModelRunCapabilities as T, resolveHooksGmailModel as _, createModelVisibilityPolicyWithFallbacks as a, normalizeCatalogRouteBaseUrl as b, inferUniqueProviderFromConfiguredModels as c, parseConfiguredModelVisibilityEntries as d, resolveAllowedModelRefFromAliasIndex as f, resolveConfiguredPrimaryProviderFallback as g, resolveConfiguredModelRef as h, buildModelAliasIndex as i, resolveConfiguredOpenAIAuthMode as j, createOpenAIModelRoutesResolver as k, isModelKeyAllowedBySet as l, resolveConfiguredModelPolicyAllow as m, buildAllowedModelSet as n, dedupeModelCatalogEntries as o, resolveBareModelDefaultProvider as p, buildConfiguredModelCatalog as r, getModelRefStatus as s, LEGACY_MODEL_POLICY_ALLOW_CONFIG_PATH as t, listModelAliasCandidates as u, resolveModelRefFromString as v, modelSupportsInput as w, overlayCatalogMetadata as x, readUtilityModelSetting as y };
