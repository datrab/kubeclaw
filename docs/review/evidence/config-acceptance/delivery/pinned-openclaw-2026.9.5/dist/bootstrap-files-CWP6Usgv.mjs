import { l as normalizeOptionalString } from "./string-coerce-CIXf7egm.mjs";
import { o as resolveUserPath } from "./home-dir-BKwhAL2c.mjs";
import "./utils-5NRg_vUS.mjs";
import { m as resolveDefaultAgentId, r as resolveAgentConfig } from "./agent-scope-config-D2MQzbc-.mjs";
import { l as resolveAgentIdFromSessionKey } from "./session-key-CPlMYURm.mjs";
import "./agent-scope-PkvoRuZC.mjs";
import { S as workspaceFilesShareSourceIdentity, _ as loadWorkspaceBootstrapFiles, f as filterBootstrapFilesForSession, h as isWorkspaceSetupCompleted, i as DEFAULT_MEMORY_FILENAME, n as DEFAULT_BOOTSTRAP_FILENAME } from "./workspace-Cq_koaHZ.mjs";
import "./session-accessor-BSDPCHmp.mjs";
import { r as readRecentSessionTranscriptActiveEvents } from "./session-accessor.sqlite-active-events-CWFJNkoL.mjs";
import { i as resolveBootstrapTotalMaxChars, n as buildBootstrapContextFiles, r as resolveBootstrapMaxChars } from "./bootstrap-DKwqzU8D.mjs";
import "./embedded-agent-helpers-DAKZaPtq.mjs";
import { n as createInternalHookEvent, u as triggerInternalHook } from "./internal-hooks-DpYiNKF7.mjs";
import { i as getOrLoadBootstrapFiles } from "./bootstrap-cache-CEpXmByl.mjs";
import { r as isMemoryOriginEligibleForAutomaticInjection } from "./types-BD_8nD8R.mjs";
import { n as classifyActiveMemoryWorkspacePaths } from "./memory-runtime-BVdCynaX.mjs";
import path from "node:path";
//#region src/agents/bootstrap-hooks.ts
/** Runs bootstrap hooks and returns the effective bootstrap file list. */
async function applyBootstrapHookOverrides(params) {
	const sessionKey = params.sessionKey ?? params.sessionId ?? "unknown";
	const agentId = params.agentId ?? (params.sessionKey ? resolveAgentIdFromSessionKey(params.sessionKey) : void 0);
	const context = {
		workspaceDir: params.workspaceDir,
		bootstrapFiles: params.files,
		cfg: params.config,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId,
		agentId
	};
	const event = createInternalHookEvent("agent", "bootstrap", sessionKey, context);
	await triggerInternalHook(event);
	const updated = event.context.bootstrapFiles;
	return Array.isArray(updated) ? updated : params.files;
}
//#endregion
//#region src/agents/bootstrap-files.ts
/**
* Resolves workspace bootstrap files for agent runs and converts them into
* bounded context files.
*/
const CONTINUATION_SCAN_MAX_RECORDS = 500;
const FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE = "openclaw:bootstrap-context:full";
const BOOTSTRAP_WARNING_DEDUPE_LIMIT = 1024;
const seenBootstrapWarnings = /* @__PURE__ */ new Set();
const bootstrapWarningOrder = [];
function rememberBootstrapWarning(key) {
	if (seenBootstrapWarnings.has(key)) return false;
	if (seenBootstrapWarnings.size >= BOOTSTRAP_WARNING_DEDUPE_LIMIT) {
		const oldest = bootstrapWarningOrder.shift();
		if (oldest) seenBootstrapWarnings.delete(oldest);
	}
	seenBootstrapWarnings.add(key);
	bootstrapWarningOrder.push(key);
	return true;
}
/** Resolves the effective bootstrap injection mode for a session agent. */
function resolveContextInjectionMode(config, agentId) {
	const agentMode = config && agentId ? resolveAgentConfig(config, agentId)?.contextInjection : void 0;
	if (agentMode === "always" || agentMode === "continuation-skip" || agentMode === "never") return agentMode;
	return config?.agents?.defaults?.contextInjection ?? "always";
}
/** Checks the active SQLite transcript branch for a valid full-bootstrap marker. */
async function hasCompletedBootstrapTurn(sessionTarget) {
	const { agentId, sessionId, sessionKey, storePath } = sessionTarget ?? {};
	if (!agentId || !sessionId || !sessionKey || !storePath) return false;
	try {
		const records = readRecentSessionTranscriptActiveEvents({
			agentId,
			sessionId,
			sessionKey,
			storePath
		}, CONTINUATION_SCAN_MAX_RECORDS);
		for (const entry of records.toReversed()) {
			const record = entry;
			if (record?.type === "compaction" || record?.type === "reset") return false;
			if (record?.type === "custom" && record.customType === "openclaw:bootstrap-context:full") return true;
		}
		return false;
	} catch {
		return false;
	}
}
/** Builds a session-scoped warning sink that dedupes repeated bootstrap warnings. */
function makeBootstrapWarn(params) {
	const warn = params.warn;
	if (!warn) return;
	const workspacePrefix = params.workspaceDir ?? "";
	return (message) => {
		if (!rememberBootstrapWarning(`${workspacePrefix}\u0000${params.sessionLabel}\u0000${message}`)) return;
		warn(`${message} (sessionKey=${params.sessionLabel})`);
	};
}
function sanitizeBootstrapFiles(files, workspaceDir, warn) {
	const workspaceRoot = resolveUserPath(workspaceDir);
	const seenPaths = /* @__PURE__ */ new Set();
	const sanitized = [];
	for (const file of files) {
		const pathValue = normalizeOptionalString(file.path) ?? "";
		if (!pathValue) {
			warn?.(`skipping bootstrap file "${file.name}" — missing or invalid "path" field (hook may have used "filePath" instead)`);
			continue;
		}
		const resolvedPath = path.isAbsolute(pathValue) ? path.resolve(pathValue) : pathValue.startsWith("~") ? resolveUserPath(pathValue) : path.resolve(workspaceRoot, pathValue);
		const dedupeKey = path.normalize(path.relative(workspaceRoot, resolvedPath));
		if (seenPaths.has(dedupeKey)) continue;
		seenPaths.add(dedupeKey);
		sanitized.push({
			...file,
			path: resolvedPath
		});
	}
	return sanitized;
}
function applyContextModeFilter(params) {
	if ((params.contextMode ?? "full") !== "lightweight") return params.files;
	return [];
}
function filterCompletedWorkspaceBootstrapFile(files, setupCompleted, workspaceDir) {
	if (!setupCompleted) return files;
	const workspaceRoot = resolveUserPath(workspaceDir);
	const rootBootstrapPath = path.join(workspaceRoot, DEFAULT_BOOTSTRAP_FILENAME);
	return files.filter((file) => {
		if (file.name !== "BOOTSTRAP.md") return true;
		const pathValue = normalizeOptionalString(file.path);
		if (!pathValue) return true;
		return (path.isAbsolute(pathValue) ? path.resolve(pathValue) : pathValue.startsWith("~") ? resolveUserPath(pathValue) : path.resolve(workspaceRoot, pathValue)) !== rootBootstrapPath;
	});
}
async function isWorkspaceSetupCompletedForContext(workspaceDir, readOnlyState = false) {
	try {
		return await isWorkspaceSetupCompleted(workspaceDir, readOnlyState ? { readOnly: true } : {});
	} catch {
		return false;
	}
}
function filterBootstrapFilesAfterHooks(params) {
	const sessionFiltered = filterBootstrapFilesForSession(params.files, params.session);
	const protectedFiles = params.protectedFiles ?? [];
	if (protectedFiles.length === 0) return sessionFiltered;
	return sessionFiltered.filter((file) => !protectedFiles.some((protectedFile) => {
		if (workspaceFilesShareSourceIdentity(file, protectedFile)) return true;
		const filePath = normalizeOptionalString(file.path);
		const protectedPath = normalizeOptionalString(protectedFile.path);
		return Boolean(filePath && protectedPath && path.resolve(filePath) === path.resolve(protectedPath));
	}));
}
async function resolveIneligibleAutomaticMemoryFiles(params) {
	const candidates = params.files.filter((file) => !file.missing && (file.name === DEFAULT_MEMORY_FILENAME || file.name === "USER.md"));
	if (candidates.length === 0 || !params.config) return [];
	let agentId;
	try {
		agentId = params.agentId ?? resolveDefaultAgentId(params.config);
	} catch (error) {
		params.warn?.(`excluding automatic memory context: ${String(error)}`);
		return candidates;
	}
	const relativePaths = candidates.map((file) => path.relative(resolveUserPath(params.workspaceDir), file.path).replaceAll(path.sep, "/"));
	let classificationResult;
	try {
		classificationResult = await classifyActiveMemoryWorkspacePaths({
			cfg: params.config,
			agentId,
			workspaceDir: params.workspaceDir,
			relativePaths
		});
	} catch (error) {
		params.warn?.(`excluding automatic memory context: ${String(error)}`);
		return candidates;
	}
	if (classificationResult.status === "unavailable") return [];
	if (classificationResult.status === "unsupported") {
		params.warn?.("excluding automatic memory context: selected memory runtime does not support provenance classification");
		return candidates;
	}
	const origins = new Map(classificationResult.classifications.map((entry) => [entry.relativePath, entry.originClass]));
	return candidates.filter((_file, index) => !isMemoryOriginEligibleForAutomaticInjection(origins.get(relativePaths[index])));
}
/** Prepare the same bounded workspace facts without invoking run-owned bootstrap hooks. */
async function resolveBootstrapFilesForPreparation(params) {
	return resolveBootstrapFiles({
		...params,
		readOnlyState: true
	}, "none");
}
async function resolveBootstrapFilesForRun(params) {
	return resolveBootstrapFiles(params, "registered");
}
async function resolveBootstrapFiles(params, hooks) {
	const session = {
		sessionKey: params.sessionKey ?? params.sessionId,
		chatType: params.chatType,
		workspaceDir: params.workspaceDir
	};
	const workspaceSetupCompleted = await isWorkspaceSetupCompletedForContext(params.workspaceDir, params.readOnlyState);
	const rawFiles = params.sessionKey ? await getOrLoadBootstrapFiles({
		workspaceDir: params.workspaceDir,
		sessionKey: params.sessionKey
	}) : await loadWorkspaceBootstrapFiles(params.workspaceDir);
	const ineligibleAutomaticMemoryFiles = await resolveIneligibleAutomaticMemoryFiles({
		files: rawFiles,
		workspaceDir: params.workspaceDir,
		config: params.config,
		agentId: params.agentId,
		warn: params.warn
	});
	const rootMemoryFile = rawFiles.find((file) => file.name === DEFAULT_MEMORY_FILENAME && !file.missing);
	const protectedRootMemoryFile = rootMemoryFile && filterBootstrapFilesForSession([rootMemoryFile], session).length === 0 ? rootMemoryFile : void 0;
	const protectedFiles = [...protectedRootMemoryFile ? [protectedRootMemoryFile] : [], ...ineligibleAutomaticMemoryFiles];
	const bootstrapFiles = applyContextModeFilter({
		files: filterCompletedWorkspaceBootstrapFile(filterBootstrapFilesForSession(rawFiles, session).filter((file) => !ineligibleAutomaticMemoryFiles.some((ineligible) => workspaceFilesShareSourceIdentity(file, ineligible))), workspaceSetupCompleted, params.workspaceDir),
		contextMode: params.contextMode,
		runKind: params.runKind
	});
	const hooked = hooks === "registered" ? await applyBootstrapHookOverrides({
		files: bootstrapFiles,
		workspaceDir: params.workspaceDir,
		config: params.config,
		sessionKey: params.sessionKey,
		sessionId: params.sessionId,
		agentId: params.agentId
	}) : bootstrapFiles;
	return sanitizeBootstrapFiles(filterCompletedWorkspaceBootstrapFile(filterBootstrapFilesAfterHooks({
		files: typeof hooks === "object" ? [...hooked, ...hooks.projected] : hooked,
		session,
		protectedFiles
	}), workspaceSetupCompleted, params.workspaceDir), params.workspaceDir, params.warn);
}
/** Resolves both raw bootstrap metadata and bounded context files for a run. */
async function resolveBootstrapContextForRun(params) {
	const bootstrapFiles = await resolveBootstrapFilesForRun(params);
	return {
		bootstrapFiles,
		contextFiles: buildBootstrapContextForFiles(bootstrapFiles, params)
	};
}
/** Applies declared additions through the normal bootstrap filters and budgets. */
async function resolveBootstrapContextWithProjectedHookFiles(params, projected) {
	const bootstrapFiles = await resolveBootstrapFiles({
		...params,
		readOnlyState: true
	}, { projected });
	return {
		bootstrapFiles,
		contextFiles: buildBootstrapContextForFiles(bootstrapFiles, params)
	};
}
/** Builds bounded context files from already-resolved bootstrap file metadata. */
function buildBootstrapContextForFiles(bootstrapFiles, params) {
	return buildBootstrapContextFiles(bootstrapFiles, {
		maxChars: resolveBootstrapMaxChars(params.config, params.agentId),
		totalMaxChars: resolveBootstrapTotalMaxChars(params.config, params.agentId),
		warn: params.warn
	});
}
//#endregion
export { resolveBootstrapContextForRun as a, resolveBootstrapFilesForRun as c, makeBootstrapWarn as i, resolveContextInjectionMode as l, buildBootstrapContextForFiles as n, resolveBootstrapContextWithProjectedHookFiles as o, hasCompletedBootstrapTurn as r, resolveBootstrapFilesForPreparation as s, FULL_BOOTSTRAP_COMPLETED_CUSTOM_TYPE as t };
