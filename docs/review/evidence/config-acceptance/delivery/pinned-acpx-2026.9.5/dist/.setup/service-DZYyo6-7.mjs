import { t as __exportAll } from "./rolldown-runtime-8H4AJuhK.mjs";
import { n as createLazyAcpRuntimeProxy } from "./register.runtime-CTfxhkFm.mjs";
import { _ as splitCommandParts, c as openAcpxProcessLeaseStateStore, d as ACPX_GATEWAY_INSTANCE_KEY, f as ACPX_GATEWAY_INSTANCE_NAMESPACE, h as normalizeAcpxGatewayInstanceRecord, i as createAcpxProcessLeaseStore, l as readAcpxProcessLeaseIdentity, n as OPENCLAW_ACPX_LEASE_ID_ARG, r as OPENCLAW_GATEWAY_INSTANCE_ID_ARG } from "./process-lease-B83BGiLj.mjs";
import { i as toAcpMcpServers, n as resolveAcpxPluginRoot, r as resolveOpenClawRoot, t as resolveAcpxPluginConfig } from "./config-DvCm0_Dp.mjs";
import { createRequire } from "node:module";
import { createLazyRuntimeModule } from "openclaw/plugin-sdk/lazy-runtime";
import { isRecord, normalizeLowercaseStringOrEmpty } from "openclaw/plugin-sdk/string-coerce-runtime";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fs$1 from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { escapeRegExp } from "openclaw/plugin-sdk/text-utility-runtime";
import { finiteSecondsToTimerSafeMilliseconds } from "openclaw/plugin-sdk/number-runtime";
import { inspect } from "node:util";
import { isPidAlive, runExec } from "openclaw/plugin-sdk/process-runtime";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { readJsonFileWithFallback } from "openclaw/plugin-sdk/json-store";
import { parse, stringify } from "smol-toml";
//#region extensions/acpx/src/codex-adapter.ts
const CODEX_ACP_PACKAGE = "@agentclientprotocol/codex-acp";
const CODEX_ACP_BIN = "codex-acp";
const LEGACY_CODEX_ACP_PACKAGE = "@zed-industries/codex-acp";
const OPENCLAW_CODEX_CONFIG_ARG = "--openclaw-codex-config";
//#endregion
//#region extensions/acpx/src/process-reaper.ts
/**
* ACPX process ownership checks and cleanup. The reaper only terminates
* OpenClaw-owned wrapper trees after validating paths, packages, and lease ids.
*/
const requireFromHere$1 = createRequire(import.meta.url);
const GENERATED_WRAPPER_BASENAMES = /* @__PURE__ */ new Set(["codex-acp-wrapper.mjs", "claude-agent-acp-wrapper.mjs"]);
const OPENCLAW_PLUGIN_DEPS_MARKER = "/plugin-runtime-deps/";
const ACPX_PROCESS_LIST_TIMEOUT_MS = 2e3;
const OWNED_ACP_PACKAGE_NAMES = [
	CODEX_ACP_PACKAGE,
	LEGACY_CODEX_ACP_PACKAGE,
	"@zed-industries/codex-acp-darwin-arm64",
	"@zed-industries/codex-acp-darwin-x64",
	"@zed-industries/codex-acp-linux-arm64",
	"@zed-industries/codex-acp-linux-x64",
	"@zed-industries/codex-acp-win32-arm64",
	"@zed-industries/codex-acp-win32-x64",
	"@agentclientprotocol/claude-agent-acp",
	"acpx"
];
const PLUGIN_DEPS_CODEX_PACKAGE_NAMES = [
	"@openai/codex",
	"@openai/codex-darwin-arm64",
	"@openai/codex-darwin-x64",
	"@openai/codex-linux-arm64",
	"@openai/codex-linux-x64",
	"@openai/codex-win32-arm64",
	"@openai/codex-win32-x64"
];
const ACP_PACKAGE_MARKERS = [
	...OWNED_ACP_PACKAGE_NAMES.map((packageName) => `/node_modules/${packageName}/`),
	...PLUGIN_DEPS_CODEX_PACKAGE_NAMES.map((packageName) => `/node_modules/${packageName}/`),
	"/acpx/dist/"
];
function normalizePathLike(value) {
	return value.replaceAll("\\", "/");
}
function resolvePackageRoot(packageName) {
	try {
		return normalizePathLike(path.dirname(requireFromHere$1.resolve(`${packageName}/package.json`)));
	} catch {
		return;
	}
}
function resolveOwnedAcpPackageRootCandidates(packageName) {
	const pluginRoot = resolveAcpxPluginRoot(import.meta.url);
	const openClawRoot = resolveOpenClawRoot(pluginRoot);
	return [
		resolvePackageRoot(packageName),
		path.join(pluginRoot, "node_modules", packageName),
		path.join(openClawRoot, "node_modules", packageName)
	].flatMap((root) => root ? [normalizePathLike(root)] : []);
}
const OWNED_ACP_PACKAGE_ROOTS = Array.from(new Set(OWNED_ACP_PACKAGE_NAMES.flatMap(resolveOwnedAcpPackageRootCandidates)));
function commandBelongsToResolvedAcpPackage(command) {
	return OWNED_ACP_PACKAGE_ROOTS.some((root) => command.includes(`${root}/`));
}
function commandMentionsGeneratedWrapper(command) {
	return Array.from(GENERATED_WRAPPER_BASENAMES).some((basename) => command.includes(basename));
}
function commandContainsExactWrapperPath(command, wrapperPath) {
	const expectedPath = normalizePathLike(wrapperPath);
	return new RegExp(`(?:^|[\\s"'])${escapeRegExp(expectedPath)}(?=$|[\\s"'])`).test(normalizePathLike(command));
}
function wrapperPathBelongsToRoot(wrapperPath, wrapperRoot) {
	const normalizedPath = normalizePathLike(wrapperPath);
	const normalizedRoot = normalizePathLike(wrapperRoot).replace(/\/+$/, "");
	return GENERATED_WRAPPER_BASENAMES.has(path.posix.basename(normalizedPath)) && normalizedPath.startsWith(`${normalizedRoot}/`);
}
/** Check whether a command references an OpenClaw-generated ACPX wrapper path. */
function isOpenClawLeaseAwareAcpxProcessCommand(params) {
	const command = normalizePathLike(Array.isArray(params.command) ? params.command.join(" ") : params.command ?? "");
	const root = params.wrapperRoot ? `${normalizePathLike(params.wrapperRoot).replace(/\/+$/, "")}/` : "";
	return Array.from(GENERATED_WRAPPER_BASENAMES).some((basename) => command.includes(`${root}${basename}`));
}
function commandsReferToSameRootCommand(liveCommand, storedCommand) {
	if (!storedCommand?.trim()) return true;
	return normalizePathLike(liveCommand).trim() === normalizePathLike(storedCommand).trim();
}
function liveCommandMatchesLeaseIdentity(params) {
	if (!params.expectedLeaseId && !params.expectedGatewayInstanceId) return true;
	const identity = readAcpxProcessLeaseIdentity(params.command);
	return (!params.expectedLeaseId || identity?.leaseId === params.expectedLeaseId) && (!params.expectedGatewayInstanceId || identity?.gatewayInstanceId === params.expectedGatewayInstanceId);
}
/** Check whether a command is owned by OpenClaw ACPX runtime packages or wrappers. */
function isOpenClawOwnedAcpxProcessCommand(params) {
	const command = params.command?.trim();
	if (!command) return false;
	const normalized = normalizePathLike(command);
	if (isOpenClawLeaseAwareAcpxProcessCommand({
		command: normalized,
		wrapperRoot: params.wrapperRoot
	})) return true;
	if (commandBelongsToResolvedAcpPackage(normalized)) return true;
	if (!normalized.includes(OPENCLAW_PLUGIN_DEPS_MARKER)) return false;
	return ACP_PACKAGE_MARKERS.some((marker) => normalized.includes(marker));
}
function parseProcessList(stdout) {
	const processes = [];
	for (const line of stdout.split(/\r?\n/)) {
		const match = /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?<command>.+?)\s*$/.exec(line);
		const pid = match?.groups?.pid;
		const ppid = match?.groups?.ppid;
		const command = match?.groups?.command;
		if (!pid || !ppid || !command) continue;
		processes.push({
			pid: Number.parseInt(pid, 10),
			ppid: Number.parseInt(ppid, 10),
			command
		});
	}
	return processes;
}
/** List host processes in the compact shape needed by ACPX cleanup. */
async function listPlatformProcesses() {
	if (process.platform === "win32") return [];
	const { stdout } = await runExec("ps", ["-axo", "pid=,ppid=,command="], {
		logOutput: false,
		maxBuffer: 8388608,
		timeoutMs: ACPX_PROCESS_LIST_TIMEOUT_MS
	});
	return parseProcessList(stdout);
}
function collectProcessTree(processes, rootPid) {
	const childrenByParent = /* @__PURE__ */ new Map();
	for (const processInfo of processes) {
		const children = childrenByParent.get(processInfo.ppid) ?? [];
		children.push(processInfo);
		childrenByParent.set(processInfo.ppid, children);
	}
	const root = new Map(processes.map((processInfo) => [processInfo.pid, processInfo])).get(rootPid);
	const collected = [];
	if (root) collected.push(root);
	const queue = [...childrenByParent.get(rootPid) ?? []];
	while (queue.length > 0) {
		const next = queue.shift();
		if (!next || collected.some((processInfo) => processInfo.pid === next.pid)) continue;
		collected.push(next);
		queue.push(...childrenByParent.get(next.pid) ?? []);
	}
	return collected;
}
function uniquePids(processes) {
	return Array.from(new Set(processes.map((processInfo) => processInfo.pid).filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)));
}
async function terminatePids(pids, deps) {
	const killProcess = deps?.killProcess ?? ((pid, signal) => process.kill(pid, signal));
	const sleep = deps?.sleep ?? ((ms) => new Promise((resolve) => {
		setTimeout(resolve, ms);
	}));
	const terminated = [];
	for (const pid of pids) try {
		killProcess(pid, "SIGTERM");
		terminated.push(pid);
	} catch {}
	if (terminated.length === 0) return terminated;
	await sleep(750);
	for (const pid of terminated) if (deps?.killProcess || isPidAlive(pid)) try {
		killProcess(pid, "SIGKILL");
	} catch {}
	return terminated;
}
/** Terminate one validated OpenClaw-owned ACPX wrapper process tree. */
async function cleanupOpenClawOwnedAcpxProcessTree(params) {
	const rootPid = params.rootPid;
	if (!rootPid || rootPid <= 0 || rootPid === process.pid) return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "missing-root"
	};
	if ((params.deps?.platform ?? process.platform) === "win32") return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "unsupported-platform"
	};
	let processes;
	try {
		processes = await (params.deps?.listProcesses ?? listPlatformProcesses)();
	} catch {
		return {
			inspectedPids: [],
			terminatedPids: [],
			skippedReason: "process-list-unavailable"
		};
	}
	const listedTree = collectProcessTree(processes, rootPid);
	if (listedTree.length === 0) return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "unverified-root"
	};
	const rootCommand = listedTree[0]?.command ?? params.rootCommand;
	const liveCommandWasGeneratedWrapper = commandMentionsGeneratedWrapper(normalizePathLike(rootCommand ?? ""));
	const storedCommandWasGeneratedWrapper = commandMentionsGeneratedWrapper(normalizePathLike(params.rootCommand ?? ""));
	if (!liveCommandWasGeneratedWrapper && (storedCommandWasGeneratedWrapper || !commandsReferToSameRootCommand(rootCommand ?? "", params.rootCommand)) || !isOpenClawOwnedAcpxProcessCommand({
		command: rootCommand,
		wrapperRoot: params.wrapperRoot
	}) || !liveCommandMatchesLeaseIdentity({
		command: rootCommand,
		expectedLeaseId: params.expectedLeaseId,
		expectedGatewayInstanceId: params.expectedGatewayInstanceId
	})) return {
		inspectedPids: listedTree.map((processInfo) => processInfo.pid),
		terminatedPids: [],
		skippedReason: "not-openclaw-owned"
	};
	const pids = uniquePids(listedTree.toReversed());
	return {
		inspectedPids: uniquePids(listedTree),
		terminatedPids: await terminatePids(pids, params.deps)
	};
}
/** Recover a pending lease by matching its exact live wrapper identity. */
async function cleanupOpenClawOwnedAcpxPendingLease(params) {
	if ((params.deps?.platform ?? process.platform) === "win32") return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "unsupported-platform"
	};
	if (!params.wrapperPath || !wrapperPathBelongsToRoot(params.wrapperPath, params.wrapperRoot)) return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "unverified-root"
	};
	let processes;
	try {
		processes = await (params.deps?.listProcesses ?? listPlatformProcesses)();
	} catch {
		return {
			inspectedPids: [],
			terminatedPids: [],
			skippedReason: "process-list-unavailable"
		};
	}
	const matchingRoots = processes.filter((processInfo) => commandContainsExactWrapperPath(processInfo.command, params.wrapperPath) && liveCommandMatchesLeaseIdentity({
		command: processInfo.command,
		expectedLeaseId: params.leaseId,
		expectedGatewayInstanceId: params.gatewayInstanceId
	}));
	if (matchingRoots.length === 0) return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "missing-root"
	};
	if (matchingRoots.length > 1) return {
		inspectedPids: uniquePids(matchingRoots),
		terminatedPids: [],
		skippedReason: "ambiguous-root"
	};
	const listedTree = collectProcessTree(processes, matchingRoots[0].pid);
	const pids = uniquePids(listedTree.toReversed());
	return {
		inspectedPids: uniquePids(listedTree),
		terminatedPids: await terminatePids(pids, params.deps)
	};
}
/** Reap orphaned OpenClaw-owned ACPX wrapper trees during runtime startup. */
async function reapStaleOpenClawOwnedAcpxOrphans(params) {
	if ((params.deps?.platform ?? process.platform) === "win32") return {
		inspectedPids: [],
		terminatedPids: [],
		skippedReason: "unsupported-platform"
	};
	let processes;
	try {
		processes = await (params.deps?.listProcesses ?? listPlatformProcesses)();
	} catch {
		return {
			inspectedPids: [],
			terminatedPids: [],
			skippedReason: "process-list-unavailable"
		};
	}
	const orphanTrees = processes.filter((processInfo) => processInfo.ppid === 1 && !readAcpxProcessLeaseIdentity(processInfo.command) && isOpenClawOwnedAcpxProcessCommand({
		command: processInfo.command,
		wrapperRoot: params.wrapperRoot
	})).map((orphan) => collectProcessTree(processes, orphan.pid));
	return {
		inspectedPids: uniquePids(orphanTrees.flat()),
		terminatedPids: await terminatePids(uniquePids(orphanTrees.flatMap((tree) => tree.toReversed())), params.deps)
	};
}
//#endregion
//#region extensions/acpx/src/codex-trust-config.ts
/**
* Builds isolated Codex config for ACPX sessions. It preserves safe inherited
* runtime options while rendering only trusted project entries for the session.
*/
function stripTomlComment(line) {
	let quote = null;
	let escaping = false;
	for (let index = 0; index < line.length; index += 1) {
		const ch = line[index];
		if (escaping) {
			escaping = false;
			continue;
		}
		if (quote === "\"" && ch === "\\") {
			escaping = true;
			continue;
		}
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === "\"") {
			quote = ch;
			continue;
		}
		if (ch === "#") return line.slice(0, index);
	}
	return line;
}
function parseTomlString(value) {
	const trimmed = value.trim();
	if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) try {
		return JSON.parse(trimmed);
	} catch {
		return;
	}
	if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
}
function parseTomlDottedKey(value) {
	const parts = [];
	let current = "";
	let quote = null;
	let escaping = false;
	for (const ch of value.trim()) {
		if (escaping) {
			current += ch;
			escaping = false;
			continue;
		}
		if (quote === "\"" && ch === "\\") {
			current += ch;
			escaping = true;
			continue;
		}
		if (quote) {
			current += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === "'" || ch === "\"") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === ".") {
			parts.push(current.trim());
			current = "";
			continue;
		}
		current += ch;
	}
	if (current.trim()) parts.push(current.trim());
	return parts.map((part) => parseTomlString(part) ?? part);
}
function parseProjectHeader(line) {
	const trimmed = line.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]") || trimmed.startsWith("[[")) return;
	const parts = parseTomlDottedKey(trimmed.slice(1, -1));
	return parts.length === 2 && parts[0] === "projects" ? parts[1] : void 0;
}
function parseTrustedInlineProjectEntries(value) {
	const trusted = [];
	for (const match of value.matchAll(/(?<key>"(?:\\.|[^"\\])*"|'[^']*'|[A-Za-z0-9_\-/.~:]+)\s*=\s*\{(?<body>[^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
		const key = match.groups?.key;
		const body = match.groups?.body;
		if (!key || !body || !/\btrust_level\s*=\s*["']trusted["']/.test(body)) continue;
		const projectPath = parseTomlString(key) ?? key.trim();
		if (projectPath) trusted.push(projectPath);
	}
	return trusted;
}
/** Extract trusted project paths from Codex TOML config. */
function extractTrustedCodexProjectPaths(configToml) {
	const trusted = /* @__PURE__ */ new Set();
	let currentProjectPath;
	let inProjectsTable = false;
	for (const rawLine of configToml.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine).trim();
		if (!line) continue;
		if (line.startsWith("[")) {
			currentProjectPath = parseProjectHeader(line);
			inProjectsTable = line === "[projects]";
			continue;
		}
		if (currentProjectPath && /^trust_level\s*=\s*["']trusted["']\s*$/.test(line)) {
			trusted.add(currentProjectPath);
			continue;
		}
		const assignment = /^(?<key>"(?:\\.|[^"\\])*"|'[^']*'|[A-Za-z0-9_\-/.~:]+)\s*=\s*(?<value>.+)$/.exec(line);
		const rawKey = assignment?.groups?.key;
		const rawValue = assignment?.groups?.value;
		if (!rawKey || rawValue === void 0) continue;
		const key = parseTomlString(rawKey) ?? rawKey;
		const value = rawValue.trim();
		if (inProjectsTable && /^\{.*\}$/.test(value)) {
			if (/\btrust_level\s*=\s*["']trusted["']/.test(value) && key) trusted.add(key);
			continue;
		}
		if (key === "projects" || inProjectsTable) for (const projectPath of parseTrustedInlineProjectEntries(value)) trusted.add(projectPath);
	}
	return Array.from(trusted);
}
const INHERITED_TOP_LEVEL_CODEX_CONFIG_KEYS = /* @__PURE__ */ new Set([
	"model",
	"model_provider",
	"model_reasoning_effort",
	"sandbox_mode"
]);
const INHERITED_MODEL_PROVIDER_CONFIG_KEYS = /* @__PURE__ */ new Set([
	"name",
	"base_url",
	"wire_api",
	"env_key",
	"env_key_instructions",
	"requires_openai_auth",
	"request_max_retries",
	"stream_max_retries",
	"stream_idle_timeout_ms"
]);
function parseTableHeader(line) {
	const trimmed = line.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]") || trimmed.startsWith("[[")) return;
	return parseTomlDottedKey(trimmed.slice(1, -1));
}
function isInheritedModelProviderTable(parts) {
	return parts?.[0] === "model_providers" && parts.length === 2;
}
function parseTopLevelAssignmentKey(line) {
	return /^(?<key>[A-Za-z0-9_-]+)\s*=\s*(?<value>.+)$/.exec(line)?.groups?.key;
}
function extractInheritedCodexRuntimeConfig(configToml) {
	const inheritedLines = [];
	let inAnyTable = false;
	let inInheritedTable = false;
	let pendingInheritedTableHeader = "";
	function flushInheritedTableHeader() {
		if (!pendingInheritedTableHeader) return;
		if (inheritedLines.length > 0 && inheritedLines[inheritedLines.length - 1] !== "") inheritedLines.push("");
		inheritedLines.push(pendingInheritedTableHeader);
		pendingInheritedTableHeader = "";
	}
	for (const rawLine of configToml.split(/\r?\n/)) {
		const trimmedLine = rawLine.trim();
		const semanticLine = stripTomlComment(rawLine).trim();
		if (trimmedLine.startsWith("[")) {
			const tableParts = parseTableHeader(trimmedLine);
			inAnyTable = true;
			inInheritedTable = isInheritedModelProviderTable(tableParts);
			if (inInheritedTable) pendingInheritedTableHeader = rawLine.trimEnd();
			else pendingInheritedTableHeader = "";
			continue;
		}
		if (inInheritedTable) {
			if (!semanticLine) continue;
			const key = parseTopLevelAssignmentKey(semanticLine);
			if (!key || !INHERITED_MODEL_PROVIDER_CONFIG_KEYS.has(key)) continue;
			flushInheritedTableHeader();
			inheritedLines.push(rawLine.trimEnd());
			continue;
		}
		if (inAnyTable) continue;
		const key = parseTopLevelAssignmentKey(semanticLine);
		if (!key) continue;
		if (!INHERITED_TOP_LEVEL_CODEX_CONFIG_KEYS.has(key)) continue;
		inheritedLines.push(rawLine.trimEnd());
	}
	while (inheritedLines.length > 0 && inheritedLines[inheritedLines.length - 1] === "") inheritedLines.pop();
	return inheritedLines.join("\n");
}
/** Render a session-local Codex config with inherited runtime settings and trust entries. */
function renderIsolatedCodexConfig(params) {
	const normalized = Array.from(new Set(params.projectPaths.map((projectPath) => projectPath.trim()).filter(Boolean).map((projectPath) => path.resolve(projectPath)))).toSorted((left, right) => left.localeCompare(right));
	return [
		"# Generated by OpenClaw for Codex ACP sessions.",
		params.sourceConfigToml ? extractInheritedCodexRuntimeConfig(params.sourceConfigToml) : "",
		...normalized.flatMap((projectPath) => [
			"",
			`[projects.${JSON.stringify(projectPath)}]`,
			"trust_level = \"trusted\""
		]),
		""
	].filter((line, index, lines) => !(line === "" && lines[index - 1] === "")).join("\n");
}
//#endregion
//#region extensions/acpx/src/codex-auth-bridge.ts
/**
* Prepares isolated Codex and Claude ACP wrapper commands for ACPX. The bridge
* copies safe auth/config state into plugin-owned homes and redacts diagnostics.
*/
const CLAUDE_ACP_PACKAGE = "@agentclientprotocol/claude-agent-acp";
const CLAUDE_ACP_BIN = "claude-agent-acp";
const RUN_CONFIGURED_COMMAND_SENTINEL = "--openclaw-run-configured";
const requireFromHere = createRequire(import.meta.url);
function readSelfManifest() {
	const manifestPath = path.join(resolveAcpxPluginRoot(import.meta.url), "package.json");
	return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}
function readManifestDependencyVersion(packageName) {
	const version = readSelfManifest().dependencies?.[packageName];
	if (typeof version !== "string" || version.trim() === "") throw new Error(`Missing ${packageName} dependency version in @openclaw/acpx manifest`);
	return version;
}
const CODEX_ACP_PACKAGE_VERSION = readManifestDependencyVersion(CODEX_ACP_PACKAGE);
const CLAUDE_ACP_PACKAGE_VERSION = readManifestDependencyVersion(CLAUDE_ACP_PACKAGE);
function basename(value) {
	return value.split(/[\\/]/).pop() ?? value;
}
function resolvePackageBinPath(packageJsonPath, manifest, binName) {
	const { bin } = manifest;
	const relativeBinPath = typeof bin === "string" ? bin : bin && typeof bin === "object" ? bin[binName] : void 0;
	if (typeof relativeBinPath !== "string" || relativeBinPath.trim() === "") return;
	return path.resolve(path.dirname(packageJsonPath), relativeBinPath);
}
async function resolveInstalledAcpPackageBinPath(packageName, binName) {
	try {
		const packageJsonPath = requireFromHere.resolve(`${packageName}/package.json`);
		const { value: manifest } = await readJsonFileWithFallback(packageJsonPath, {});
		if (manifest.name !== packageName) return;
		const binPath = resolvePackageBinPath(packageJsonPath, manifest, binName);
		if (!binPath) return;
		await fs$1.access(binPath);
		return binPath;
	} catch {
		return;
	}
}
async function resolveInstalledCodexAcpBinPath() {
	return await resolveInstalledAcpPackageBinPath(CODEX_ACP_PACKAGE, CODEX_ACP_BIN);
}
async function resolveInstalledClaudeAcpBinPath() {
	return await resolveInstalledAcpPackageBinPath(CLAUDE_ACP_PACKAGE, CLAUDE_ACP_BIN);
}
const DIAGNOSTIC_REDACTION_RULES = [
	{
		source: String.raw`(authorization\s*[:=]\s*bearer\s+)[^\s'"<>]+`,
		flags: "gi",
		replacement: "$1[REDACTED]"
	},
	{
		source: String.raw`((?:api[_-]?key|apiKey|access[_-]?token|refresh[_-]?token|client[_-]?secret|token|secret|password|passwd|credential)\s*[:=]\s*)[^\s'"<>]+`,
		flags: "gi",
		replacement: "$1[REDACTED]"
	},
	{
		source: String.raw`("(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*")[^"]+`,
		flags: "g",
		replacement: "$1[REDACTED]"
	},
	{
		source: String.raw`(["']?(?:api[-_]?key|apiKey|access[-_]?token|accessToken|refresh[-_]?token|refreshToken|id[-_]?token|idToken|auth[-_]?token|authToken|client[-_]?secret|clientSecret|app[-_]?secret|appSecret|token|secret|password|passwd|credential)["']?\s*[:=]\s*["']?)[^"',}\s<>]+`,
		flags: "gi",
		replacement: "$1[REDACTED]"
	},
	{
		source: String.raw`([?&](?:access[-_]?token|auth[-_]?token|refresh[-_]?token|api[-_]?key|client[-_]?secret|token|key|secret|password|pass|passwd|auth|signature)=)[^&\s'"<>]+`,
		flags: "gi",
		replacement: "$1[REDACTED]"
	},
	{
		source: String.raw`(--(?:api[-_]?key|token|secret|password|passwd)\s+)[^\s'"]+`,
		flags: "gi",
		replacement: "$1[REDACTED]"
	},
	{
		source: String.raw`-----BEGIN [A-Z ]*PRI` + String.raw`VATE KEY-----[\s\S]+?-----END [A-Z ]*PRI` + String.raw`VATE KEY-----`,
		flags: "g",
		replacement: "[REDACTED_PRIVATE_KEY]"
	},
	{
		source: String.raw`\b(sk-[A-Za-z0-9_-]{8,})\b`,
		flags: "g",
		replacement: "[REDACTED_OPENAI_KEY]"
	},
	{
		source: String.raw`\b(gh[pousr]_[A-Za-z0-9_]{20,})\b`,
		flags: "g",
		replacement: "[REDACTED_GITHUB_TOKEN]"
	},
	{
		source: String.raw`\b(github_pat_[A-Za-z0-9_]{20,})\b`,
		flags: "g",
		replacement: "[REDACTED_GITHUB_TOKEN]"
	},
	{
		source: String.raw`\b(xox[baprs]-[A-Za-z0-9-]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_SLACK_TOKEN]"
	},
	{
		source: String.raw`\b(gsk_[A-Za-z0-9_-]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_API_KEY]"
	},
	{
		source: String.raw`\b(AIza[0-9A-Za-z\-_]{20,})\b`,
		flags: "g",
		replacement: "[REDACTED_GOOGLE_KEY]"
	},
	{
		source: String.raw`\b(ya29\.[0-9A-Za-z_\-./+=]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_GOOGLE_TOKEN]"
	},
	{
		source: String.raw`\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_JWT]"
	},
	{
		source: String.raw`\b(pplx-[A-Za-z0-9_-]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_API_KEY]"
	},
	{
		source: String.raw`\b(npm_[A-Za-z0-9]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_NPM_TOKEN]"
	},
	{
		source: String.raw`\b(LTAI[A-Za-z0-9]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_ACCESS_KEY]"
	},
	{
		source: String.raw`\b(hf_[A-Za-z0-9]{10,})\b`,
		flags: "g",
		replacement: "[REDACTED_API_KEY]"
	},
	{
		source: String.raw`\bbot(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
		flags: "g",
		replacement: "bot[REDACTED_TELEGRAM_TOKEN]"
	},
	{
		source: String.raw`\b(\d{6,}:[A-Za-z0-9_-]{20,})\b`,
		flags: "g",
		replacement: "[REDACTED_TELEGRAM_TOKEN]"
	}
];
function buildAdapterWrapperScript(params) {
	return `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

${params.envSetup}
const stderrLogFileNamePrefix = ${params.stderrLogFileNamePrefix ? JSON.stringify(params.stderrLogFileNamePrefix) : "undefined"};
const stderrLogMaxChars = 256 * 1024;

const openClawWrapperArgs = new Set([
  ${JSON.stringify(OPENCLAW_ACPX_LEASE_ID_ARG)},
  ${JSON.stringify(OPENCLAW_GATEWAY_INSTANCE_ID_ARG)},
  ${(params.openClawWrapperArgs ?? []).map((arg) => JSON.stringify(arg)).join(",\n  ")}
]);

function readOpenClawWrapperArg(args, name) {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  const value = args[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOpenClawWrapperArgs(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) {
      continue;
    }
    const value = args[index + 1];
    if (typeof value === "string" && value.trim()) {
      values.push(value.trim());
    }
    index += 1;
  }
  return values;
}

function safeDiagnosticFilePart(value) {
  const sanitized = String(value || "").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return sanitized || "pid-" + process.pid;
}

function resolveStderrLogPath(args) {
  if (!stderrLogFileNamePrefix) {
    return undefined;
  }
  const leaseId =
    readOpenClawWrapperArg(args, ${JSON.stringify(OPENCLAW_ACPX_LEASE_ID_ARG)}) ||
    "pid-" + process.pid;
  const fileName = stderrLogFileNamePrefix + "." + safeDiagnosticFilePart(leaseId) + ".log";
  return fileURLToPath(new URL("./" + fileName, import.meta.url));
}

const diagnosticRedactionRules = ${JSON.stringify(DIAGNOSTIC_REDACTION_RULES)}.map((rule) => [
  new RegExp(rule.source, rule.flags),
  rule.replacement,
]);

function redactDiagnosticText(text) {
  let redacted = text;
  for (const [pattern, replacement] of diagnosticRedactionRules) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

function tailUtf16Safe(text, maxChars) {
  let start = Math.max(0, text.length - maxChars);
  const startsInsideSurrogatePair =
    start > 0 &&
    start < text.length &&
    text.charCodeAt(start) >= 0xdc00 &&
    text.charCodeAt(start) <= 0xdfff &&
    text.charCodeAt(start - 1) >= 0xd800 &&
    text.charCodeAt(start - 1) <= 0xdbff;
  if (startsInsideSurrogatePair) {
    start += 1;
  }
  return text.slice(start);
}

let pendingStderrLogText = "";
// Pipe chunks can split a UTF-8 sequence. Preserve decoder state so diagnostic
// capture does not manufacture replacement characters between chunks.
const stderrDecoder = new StringDecoder("utf8");
const stderrPrivateKeyEndPattern = /-----END [A-Z ]*PRIVATE KEY-----/;

function hasUnclosedPrivateKeyBlock(text) {
  let lastBeginIndex = -1;
  for (const match of text.matchAll(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g)) {
    lastBeginIndex = match.index ?? lastBeginIndex;
  }
  if (lastBeginIndex === -1) {
    return -1;
  }
  return stderrPrivateKeyEndPattern.test(text.slice(lastBeginIndex)) ? -1 : lastBeginIndex;
}

function writeRedactedStderrLog(text) {
  if (!stderrLogPath) {
    return;
  }
  if (!text) {
    return;
  }
  try {
    appendFileSync(stderrLogPath, redactDiagnosticText(text), "utf8");
    const current = readFileSync(stderrLogPath, "utf8");
    if (current.length > stderrLogMaxChars) {
      writeFileSync(stderrLogPath, tailUtf16Safe(current, stderrLogMaxChars), "utf8");
    }
  } catch {
    // Stderr capture is diagnostic-only; never break the ACP adapter.
  }
}

function redactIncompletePrivateKeyTail(text) {
  const unclosedPrivateKeyStart = hasUnclosedPrivateKeyBlock(text);
  if (unclosedPrivateKeyStart === -1) {
    return text;
  }
  return text.slice(0, unclosedPrivateKeyStart) + "[REDACTED_PRIVATE_KEY]";
}

function flushFinalizedStderrLogText() {
  const lastLineBreak = pendingStderrLogText.lastIndexOf("\\n");
  if (lastLineBreak === -1) {
    if (pendingStderrLogText.length > stderrLogMaxChars) {
      pendingStderrLogText = tailUtf16Safe(pendingStderrLogText, stderrLogMaxChars);
    }
    return;
  }
  let flushEnd = lastLineBreak + 1;
  const unclosedPrivateKeyStart = hasUnclosedPrivateKeyBlock(
    pendingStderrLogText.slice(0, flushEnd),
  );
  if (unclosedPrivateKeyStart !== -1) {
    flushEnd = unclosedPrivateKeyStart;
  }
  if (flushEnd <= 0) {
    if (pendingStderrLogText.length > stderrLogMaxChars) {
      pendingStderrLogText = tailUtf16Safe(pendingStderrLogText, stderrLogMaxChars);
    }
    return;
  }
  const finalizedText = pendingStderrLogText.slice(0, flushEnd);
  pendingStderrLogText = pendingStderrLogText.slice(flushEnd);
  writeRedactedStderrLog(finalizedText);
}

function appendStderrLog(chunk) {
  const text = stderrDecoder.write(chunk);
  if (!text) {
    return;
  }
  pendingStderrLogText += text;
  flushFinalizedStderrLogText();
}

function finishStderrLog() {
  pendingStderrLogText += stderrDecoder.end();
  const text = redactIncompletePrivateKeyTail(pendingStderrLogText);
  pendingStderrLogText = "";
  writeRedactedStderrLog(text);
}

function stripOpenClawWrapperArgs(args) {
  const stripped = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (openClawWrapperArgs.has(value)) {
      index += 1;
      continue;
    }
    stripped.push(value);
  }
  return stripped;
}

const rawConfiguredArgs = process.argv.slice(2);
${params.envConfigSetup ?? ""}
const stderrLogPath = resolveStderrLogPath(rawConfiguredArgs);
if (stderrLogPath) {
  try {
    rmSync(stderrLogPath, { force: true });
  } catch {
    // Diagnostic cleanup must never prevent the adapter from starting.
  }
}

const configuredArgs = stripOpenClawWrapperArgs(rawConfiguredArgs);

function resolveNpmCliPath() {
  const candidate = path.resolve(
    path.dirname(process.execPath),
    "..",
    "lib",
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  return existsSync(candidate) ? candidate : undefined;
}

const npmCliPath = resolveNpmCliPath();
const installedBinPath = ${params.installedBinPath ? JSON.stringify(params.installedBinPath) : "undefined"};
let defaultCommand;
let defaultArgs;
if (installedBinPath) {
  defaultCommand = process.execPath;
  defaultArgs = [installedBinPath];
} else if (npmCliPath) {
  defaultCommand = process.execPath;
  defaultArgs = [npmCliPath, "exec", "--yes", "--package", "${params.packageSpec}", "--", "${params.binName}"];
} else {
  defaultCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  defaultArgs = ["--yes", "--package", "${params.packageSpec}", "--", "${params.binName}"];
}
const command =
  configuredArgs[0] === "${RUN_CONFIGURED_COMMAND_SENTINEL}" ? configuredArgs[1] : defaultCommand;
const args =
  configuredArgs[0] === "${RUN_CONFIGURED_COMMAND_SENTINEL}"
    ? configuredArgs.slice(2)
    : [...defaultArgs, ...configuredArgs];

if (!command) {
  console.error("[openclaw] missing configured ${params.displayName} ACP command");
  process.exit(1);
}

const child = spawn(command, args, {
  detached: process.platform !== "win32",
  env,
  stdio: ["inherit", "inherit", "pipe"],
  windowsHide: true,
});

child.stderr?.on("data", (chunk) => {
  appendStderrLog(chunk);
  process.stderr.write(chunk);
});

let forceKillTimer;
let orphanCleanupStarted = false;
let childExitCode = 1;

function killChildTree(signal, options = {}) {
  if (!child.pid || (!options.force && child.killed)) {
    return;
  }
  if (process.platform !== "win32") {
    try {
      // The adapter can spawn grandchildren; signaling the process group keeps
      // the generated wrapper from leaving an ACP tree behind.
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to direct child signaling below.
    }
  }
  child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(signal, () => {
    killChildTree(signal);
  });
}

const originalParentPid = process.ppid;
const parentWatcher =
  process.platform === "win32"
    ? undefined
    : setInterval(() => {
        // Orphan detection: parent PID changed means our original parent died.
        // The new parent could be PID 1 (init) on bare-metal hosts, OR a
        // systemd user-session manager, OR a container init, OR a session
        // leader — depending on environment. Previously this only triggered
        // on PPID == 1, which missed all systemd-managed deployments and
        // leaked codex-acp adapter trees on every gateway restart.
        if (process.ppid === originalParentPid) {
          return;
        }
        if (orphanCleanupStarted) {
          return;
        }
        orphanCleanupStarted = true;
        if (parentWatcher) {
          clearInterval(parentWatcher);
        }
        killChildTree("SIGTERM");
        // Keep the wrapper alive long enough for stubborn adapters to receive
        // a forced fallback signal after SIGTERM.
        forceKillTimer = setTimeout(() => {
          killChildTree("SIGKILL", { force: true });
          childExitCode = 1;
        }, 1_500);
      }, 1_000);
parentWatcher?.unref?.();

child.on("error", (error) => {
  console.error(\`[openclaw] failed to launch ${params.displayName} ACP wrapper: \${error.message}\`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (parentWatcher) {
    clearInterval(parentWatcher);
  }
  if (orphanCleanupStarted) {
    return;
  }
  if (forceKillTimer) {
    clearTimeout(forceKillTimer);
  }
  if (code !== null) {
    childExitCode = code;
    return;
  }
  childExitCode = signal ? 1 : 0;
});

child.on("close", () => {
  finishStderrLog();
  process.exit(childExitCode);
});
`;
}
function buildCodexAcpWrapperScript(installedBinPath) {
	return buildAdapterWrapperScript({
		displayName: "Codex",
		packageSpec: `${CODEX_ACP_PACKAGE}@${CODEX_ACP_PACKAGE_VERSION}`,
		binName: CODEX_ACP_BIN,
		installedBinPath,
		stderrLogFileNamePrefix: "codex-acp-wrapper.stderr",
		openClawWrapperArgs: [OPENCLAW_CODEX_CONFIG_ARG],
		envSetup: `const codexHome = fileURLToPath(new URL("./codex-home/", import.meta.url));
const codexAuthPath = fileURLToPath(new URL("./codex-home/auth.json", import.meta.url));
const codexApiKey = (process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || "").trim();
let shouldWriteCodexApiKeyAuth = false;
if (codexApiKey) {
  if (!existsSync(codexAuthPath)) {
    shouldWriteCodexApiKeyAuth = true;
  } else {
    try {
      const existingCodexAuth = JSON.parse(readFileSync(codexAuthPath, "utf8"));
      shouldWriteCodexApiKeyAuth =
        !existingCodexAuth ||
        typeof existingCodexAuth !== "object" ||
        typeof existingCodexAuth.OPENAI_API_KEY === "string";
    } catch {
      shouldWriteCodexApiKeyAuth = true;
    }
  }
}
if (shouldWriteCodexApiKeyAuth) {
  writeFileSync(
    codexAuthPath,
    JSON.stringify({
      OPENAI_API_KEY: codexApiKey,
      tokens: null,
      last_refresh: null,
    }) + "\\n",
    { mode: 0o600 },
  );
}
const env = {
  ...process.env,
  CODEX_HOME: codexHome,
};`,
		envConfigSetup: `function isCodexConfigObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeCodexConfig(base, override) {
  const merged = Object.assign(Object.create(null), base);
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      isCodexConfigObject(existing) && isCodexConfigObject(value)
        ? mergeCodexConfig(existing, value)
        : value;
  }
  return merged;
}

const openClawCodexConfigs = readOpenClawWrapperArgs(
  rawConfiguredArgs,
  ${JSON.stringify(OPENCLAW_CODEX_CONFIG_ARG)},
);
if (openClawCodexConfigs.length > 0) {
  let existingCodexConfig = {};
  if (typeof env.CODEX_CONFIG === "string" && env.CODEX_CONFIG.trim()) {
    try {
      const parsedCodexConfig = JSON.parse(env.CODEX_CONFIG);
      if (!parsedCodexConfig || typeof parsedCodexConfig !== "object" || Array.isArray(parsedCodexConfig)) {
        throw new Error("CODEX_CONFIG must be a JSON object");
      }
      existingCodexConfig = parsedCodexConfig;
    } catch {
      console.error("[openclaw] CODEX_CONFIG must be a valid JSON object");
      process.exit(1);
    }
  }
  for (const openClawCodexConfig of openClawCodexConfigs) {
    try {
      const parsedOpenClawCodexConfig = JSON.parse(openClawCodexConfig);
      if (
        !parsedOpenClawCodexConfig ||
        typeof parsedOpenClawCodexConfig !== "object" ||
        Array.isArray(parsedOpenClawCodexConfig)
      ) {
        throw new Error("invalid OpenClaw Codex config");
      }
      existingCodexConfig = mergeCodexConfig(existingCodexConfig, parsedOpenClawCodexConfig);
    } catch {
      console.error("[openclaw] invalid generated Codex ACP startup config");
      process.exit(1);
    }
  }
  env.CODEX_CONFIG = JSON.stringify(existingCodexConfig);
}`
	});
}
function buildClaudeAcpWrapperScript(installedBinPath) {
	return buildAdapterWrapperScript({
		displayName: "Claude",
		packageSpec: `${CLAUDE_ACP_PACKAGE}@${CLAUDE_ACP_PACKAGE_VERSION}`,
		binName: CLAUDE_ACP_BIN,
		installedBinPath,
		envSetup: `const env = {
  ...process.env,
};`
	});
}
async function readSourceCodexConfig(codexHome) {
	try {
		return await fs$1.readFile(path.join(codexHome, "config.toml"), "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
}
async function prepareIsolatedCodexHome(params) {
	const sourceConfig = await readSourceCodexConfig(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"));
	const trustedProjectPaths = [...sourceConfig ? extractTrustedCodexProjectPaths(sourceConfig) : [], params.workspaceDir];
	const codexHome = path.join(params.baseDir, "codex-home");
	await fs$1.mkdir(codexHome, { recursive: true });
	await fs$1.writeFile(path.join(codexHome, "config.toml"), renderIsolatedCodexConfig({
		sourceConfigToml: sourceConfig,
		projectPaths: trustedProjectPaths
	}), "utf8");
	return codexHome;
}
async function writeAdapterWrapper(baseDir, fileName, script) {
	await fs$1.mkdir(baseDir, { recursive: true });
	const wrapperPath = path.join(baseDir, fileName);
	await fs$1.writeFile(wrapperPath, script, { encoding: "utf8" });
	try {
		await fs$1.chmod(wrapperPath, 493);
	} catch {}
	return wrapperPath;
}
function buildWrapperCommand(wrapperPath, args = []) {
	return [
		process.execPath,
		wrapperPath,
		...args
	];
}
function isAcpPackageSpec(value, packageName) {
	const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escapedPackageName}(?:@.+)?$`, "i").test(value.trim());
}
function isAcpBinName(value, binName) {
	const commandName = basename(value);
	const escapedBinName = binName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^${escapedBinName}(?:\\.exe|\\.[cm]?js)?$`, "i").test(commandName);
}
function isPackageRunnerCommand(value) {
	return /^(?:npx|npm|pnpm|bunx)(?:\.cmd|\.exe)?$/i.test(basename(value));
}
function extractConfiguredAdapterArgs(params) {
	const parts = splitCommandParts(params.configuredCommand ?? []);
	if (!parts.length) return [];
	const packageIndex = parts.findIndex((part) => isAcpPackageSpec(part, params.packageName));
	if (packageIndex >= 0) {
		if (!isPackageRunnerCommand(parts[0] ?? "")) return;
		const afterPackage = parts.slice(packageIndex + 1);
		if (afterPackage[0] === "--" && isAcpBinName(afterPackage[1] ?? "", params.binName)) return afterPackage.slice(2);
		if (isAcpBinName(afterPackage[0] ?? "", params.binName)) return afterPackage.slice(1);
		return afterPackage[0] === "--" ? afterPackage.slice(1) : afterPackage;
	}
	if (isAcpBinName(parts[0] ?? "", params.binName)) return parts.slice(1);
	if (basename(parts[0] ?? "") === "node" && isAcpBinName(parts[1] ?? "", params.binName)) return parts.slice(2);
}
function mergeConfigRecords(base, override) {
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		const existing = merged[key];
		const nextValue = isRecord(existing) && isRecord(value) ? mergeConfigRecords(existing, value) : value;
		Object.defineProperty(merged, key, {
			value: nextValue,
			configurable: true,
			enumerable: true,
			writable: true
		});
	}
	return merged;
}
function parseLegacyCodexConfigAssignment(assignment) {
	const separator = assignment.indexOf("=");
	if (separator <= 0) throw new Error(`Invalid legacy Codex ACP config override: ${assignment}`);
	const rawKey = assignment.slice(0, separator).trim();
	const key = rawKey === "use_legacy_landlock" ? "features.use_legacy_landlock" : rawKey;
	const rawValue = assignment.slice(separator + 1).trim();
	try {
		return parse(`${key} = ${rawValue}`);
	} catch {
		const literal = rawValue.replace(/^["']+|["']+$/g, "");
		return parse(`${key} = ${JSON.stringify(literal)}`);
	}
}
function migrateLegacyCodexArgs(args) {
	let config = {};
	const forwardedArgs = [];
	let hadOverrides = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index] ?? "";
		let assignment;
		if (arg === "-c" || arg === "--config") assignment = args[index += 1];
		else if (arg.startsWith("--config=")) assignment = arg.slice(9);
		else if (arg.startsWith("-c=")) assignment = arg.slice(3);
		else if (arg.startsWith("-c") && arg.length > 2) assignment = arg.slice(2);
		else {
			forwardedArgs.push(arg);
			continue;
		}
		if (!assignment) throw new Error(`Missing value for legacy Codex ACP option ${arg}`);
		hadOverrides = true;
		config = mergeConfigRecords(config, parseLegacyCodexConfigAssignment(assignment));
	}
	return {
		config,
		forwardedArgs,
		hadOverrides
	};
}
function resolveCodexAdapterLaunch(configuredCommand) {
	const legacyAdapterArgs = extractConfiguredAdapterArgs({
		configuredCommand,
		packageName: LEGACY_CODEX_ACP_PACKAGE,
		binName: CODEX_ACP_BIN
	});
	if (legacyAdapterArgs) {
		const migration = migrateLegacyCodexArgs(legacyAdapterArgs);
		return {
			args: [...migration.hadOverrides ? [OPENCLAW_CODEX_CONFIG_ARG, JSON.stringify(migration.config)] : [], ...migration.forwardedArgs],
			...migration.hadOverrides ? { migratedConfig: migration.config } : {}
		};
	}
	const maintainedAdapterArgs = extractConfiguredAdapterArgs({
		configuredCommand,
		packageName: CODEX_ACP_PACKAGE,
		binName: CODEX_ACP_BIN
	});
	if (!maintainedAdapterArgs) return;
	return { args: maintainedAdapterArgs };
}
async function persistMigratedCodexMcpConfig(params) {
	const mcpServers = params.migratedConfig?.mcp_servers;
	if (!isRecord(mcpServers)) return;
	const configPath = path.join(params.codexHome, "config.toml");
	const merged = mergeConfigRecords(parse(await fs$1.readFile(configPath, "utf8")), { mcp_servers: mcpServers });
	await fs$1.writeFile(configPath, stringify(merged), "utf8");
}
function buildClaudeAcpWrapperCommand(wrapperPath, configuredCommand) {
	const configuredAdapterArgs = extractConfiguredAdapterArgs({
		configuredCommand,
		packageName: CLAUDE_ACP_PACKAGE,
		binName: CLAUDE_ACP_BIN
	});
	if (configuredAdapterArgs) return buildWrapperCommand(wrapperPath, configuredAdapterArgs);
	return configuredCommand ?? buildWrapperCommand(wrapperPath);
}
/** Prepare ACPX agent commands and isolated auth homes for Codex/Claude adapters. */
async function prepareAcpxCodexAuthConfig(params) {
	params.logger;
	const codexBaseDir = path.join(params.stateDir, "acpx");
	const configuredCodexCommand = params.pluginConfig.agents.codex;
	const configuredClaudeCommand = params.pluginConfig.agents.claude;
	const codexLaunch = resolveCodexAdapterLaunch(configuredCodexCommand);
	await persistMigratedCodexMcpConfig({
		codexHome: await prepareIsolatedCodexHome({
			baseDir: codexBaseDir,
			workspaceDir: params.pluginConfig.cwd
		}),
		migratedConfig: codexLaunch?.migratedConfig
	});
	const installedCodexBinPath = await (params.resolveInstalledCodexAcpBinPath ?? resolveInstalledCodexAcpBinPath)();
	const installedClaudeBinPath = await (params.resolveInstalledClaudeAcpBinPath ?? resolveInstalledClaudeAcpBinPath)();
	const wrapperPath = await writeAdapterWrapper(codexBaseDir, "codex-acp-wrapper.mjs", buildCodexAcpWrapperScript(installedCodexBinPath));
	const claudeWrapperPath = await writeAdapterWrapper(codexBaseDir, "claude-agent-acp-wrapper.mjs", buildClaudeAcpWrapperScript(installedClaudeBinPath));
	return {
		...params.pluginConfig,
		agents: {
			...params.pluginConfig.agents,
			codex: buildWrapperCommand(wrapperPath, codexLaunch?.args ?? [RUN_CONFIGURED_COMMAND_SENTINEL, ...splitCommandParts(configuredCodexCommand ?? [])]),
			claude: buildClaudeAcpWrapperCommand(claudeWrapperPath, configuredClaudeCommand)
		}
	};
}
//#endregion
//#region extensions/acpx/src/service.ts
/**
* ACPX plugin service lifecycle. It resolves config, prepares isolated adapter
* wrappers, registers the ACP backend, and manages startup/cleanup probes.
*/
var service_exports = /* @__PURE__ */ __exportAll({
	createAcpxRuntimeService: () => createAcpxRuntimeService,
	resolveAcpxTimerTimeoutMs: () => resolveAcpxTimerTimeoutMs
});
const ENABLE_STARTUP_PROBE_ENV = "OPENCLAW_ACPX_RUNTIME_STARTUP_PROBE";
const SKIP_RUNTIME_PROBE_ENV = "OPENCLAW_SKIP_ACPX_RUNTIME_PROBE";
const loadRuntimeModule = createLazyRuntimeModule(() => import("./runtime-Du-YvDnr.mjs"));
/** Convert ACPX timeout seconds into timer-safe milliseconds. */
function resolveAcpxTimerTimeoutMs(timeoutSeconds) {
	if (timeoutSeconds === void 0) return;
	return finiteSecondsToTimerSafeMilliseconds(timeoutSeconds) ?? 1;
}
function createLazyDefaultRuntime(params) {
	let runtime = null;
	let runtimePromise = null;
	async function resolveRuntime() {
		if (runtime) return runtime;
		runtimePromise ??= loadRuntimeModule().then(async (module) => {
			const names = await fs$1.readdir(path.join(params.pluginConfig.stateDir, "sessions")).catch((error) => {
				if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
				throw error;
			});
			const legacyBareSessionKeys = /* @__PURE__ */ new Set();
			for (const name of names) {
				if (!name.endsWith(".json")) continue;
				const recordId = decodeURIComponent(name.slice(0, -5));
				if (!recordId.startsWith("agent:") && !recordId.startsWith(".openclaw-owner-") && !recordId.includes(":oneshot:")) legacyBareSessionKeys.add(recordId.toLowerCase());
			}
			runtime = new module.AcpxRuntime({
				cwd: params.pluginConfig.cwd,
				openclawLegacyBareSessionKeys: legacyBareSessionKeys,
				openclawGatewayInstanceId: params.gatewayInstanceId,
				openclawProcessLeaseStore: params.processLeaseStore,
				openclawWrapperRoot: params.wrapperRoot,
				sessionStore: module.createFileSessionStore({ stateDir: params.pluginConfig.stateDir }),
				agentRegistry: module.createAgentRegistry({ overrides: params.pluginConfig.agents }),
				probeAgent: params.pluginConfig.probeAgent,
				mcpServers: toAcpMcpServers(params.pluginConfig.mcpServers),
				pluginToolsMcpBridgeEnabled: params.pluginConfig.pluginToolsMcpBridge,
				openclawToolsMcpBridgeEnabled: params.pluginConfig.openClawToolsMcpBridge,
				permissionMode: params.pluginConfig.permissionMode,
				nonInteractivePermissions: params.pluginConfig.nonInteractivePermissions,
				elicitationModes: ["form", "url"],
				timeoutMs: resolveAcpxTimerTimeoutMs(params.pluginConfig.timeoutSeconds)
			});
			return runtime;
		});
		return await runtimePromise;
	}
	return {
		...createLazyAcpRuntimeProxy(resolveRuntime),
		async shutdown() {
			await runtimePromise;
			await runtime?.shutdown();
		},
		isHealthy() {
			return runtime?.isHealthy() ?? false;
		}
	};
}
function formatDoctorDetail(detail) {
	if (!detail) return null;
	if (typeof detail === "string") return detail.trim() || null;
	if (detail instanceof Error) return formatErrorMessage(detail);
	if (typeof detail === "object") try {
		return JSON.stringify(detail) ?? inspect(detail, {
			breakLength: Infinity,
			depth: 3
		});
	} catch {
		return inspect(detail, {
			breakLength: Infinity,
			depth: 3
		});
	}
	if (typeof detail === "number" || typeof detail === "boolean" || typeof detail === "bigint" || typeof detail === "symbol") return detail.toString();
	return inspect(detail, {
		breakLength: Infinity,
		depth: 3
	});
}
function formatDoctorFailureMessage(report) {
	const detailText = report.details?.map(formatDoctorDetail).filter(Boolean).join("; ").trim();
	return detailText ? `${report.message} (${detailText})` : report.message;
}
function resolveAllowedAgentsProbeAgent(ctx) {
	for (const agent of ctx.config.acp?.allowedAgents ?? []) {
		const normalized = normalizeLowercaseStringOrEmpty(agent);
		if (normalized) return normalized;
	}
}
async function measureAcpxStartup(ctx, name, run) {
	return ctx.startupTrace ? await ctx.startupTrace.measure(name, run) : await run();
}
function detailAcpxStartup(ctx, name, metrics) {
	ctx.startupTrace?.detail?.(name, metrics);
}
function shouldRunStartupProbe(env = process.env) {
	return env[ENABLE_STARTUP_PROBE_ENV] !== "0";
}
function shouldProbeRuntimeAtStartup(env = process.env) {
	return shouldRunStartupProbe(env) && env[SKIP_RUNTIME_PROBE_ENV] !== "1";
}
async function withStartupProbeTimeout(params) {
	let timeout;
	const timeoutMs = resolveAcpxTimerTimeoutMs(params.timeoutSeconds) ?? 1;
	try {
		return await Promise.race([params.promise, new Promise((_, reject) => {
			timeout = setTimeout(() => {
				reject(/* @__PURE__ */ new Error(`embedded acpx runtime backend startup probe timed out after ${params.timeoutSeconds}s`));
			}, timeoutMs);
			timeout.unref?.();
		})]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}
function openGatewayInstanceStateStore(openKeyedStore) {
	return openKeyedStore({
		namespace: ACPX_GATEWAY_INSTANCE_NAMESPACE,
		maxEntries: 1
	});
}
async function resolveGatewayInstanceId(openKeyedStore) {
	const store = openGatewayInstanceStateStore(openKeyedStore);
	const existing = normalizeAcpxGatewayInstanceRecord(await store.lookup(ACPX_GATEWAY_INSTANCE_KEY));
	if (existing) return existing.instanceId;
	const next = randomUUID();
	await store.register(ACPX_GATEWAY_INSTANCE_KEY, {
		instanceId: next,
		createdAt: Date.now()
	});
	return next;
}
async function reapOpenAcpxProcessLeases(params) {
	const leases = await params.leaseStore.listOpen(params.gatewayInstanceId);
	const inspectedPids = [];
	const terminatedPids = [];
	const legacyWrapperRoots = /* @__PURE__ */ new Set();
	for (const lease of leases) {
		if (lease.rootPid <= 0) {
			legacyWrapperRoots.add(lease.wrapperRoot);
			await params.leaseStore.markState(lease.leaseId, "closing");
			const result = await cleanupOpenClawOwnedAcpxPendingLease({
				leaseId: lease.leaseId,
				gatewayInstanceId: lease.gatewayInstanceId,
				wrapperRoot: lease.wrapperRoot,
				wrapperPath: lease.wrapperPath,
				deps: params.deps
			});
			inspectedPids.push(...result.inspectedPids);
			terminatedPids.push(...result.terminatedPids);
			const retryableEvidenceFailure = result.skippedReason === "ambiguous-root" || result.skippedReason === "process-list-unavailable" || result.skippedReason === "unsupported-platform" || result.skippedReason === "unverified-root" || lease.sessionKey === "openclaw:acpx:probe" && result.skippedReason === "missing-root";
			await params.leaseStore.markState(lease.leaseId, retryableEvidenceFailure ? "open" : result.terminatedPids.length > 0 ? "closed" : "lost");
			continue;
		}
		await params.leaseStore.markState(lease.leaseId, "closing");
		const result = await cleanupOpenClawOwnedAcpxProcessTree({
			rootPid: lease.rootPid,
			expectedLeaseId: lease.leaseId,
			expectedGatewayInstanceId: lease.gatewayInstanceId,
			wrapperRoot: lease.wrapperRoot,
			deps: params.deps
		});
		inspectedPids.push(...result.inspectedPids);
		terminatedPids.push(...result.terminatedPids);
		await params.leaseStore.markState(lease.leaseId, result.skippedReason === "process-list-unavailable" || result.skippedReason === "unsupported-platform" ? "open" : result.terminatedPids.length > 0 ? "closed" : "lost");
	}
	for (const wrapperRoot of legacyWrapperRoots) {
		const legacyResult = await reapStaleOpenClawOwnedAcpxOrphans({
			wrapperRoot,
			deps: params.deps
		});
		inspectedPids.push(...legacyResult.inspectedPids);
		terminatedPids.push(...legacyResult.terminatedPids);
	}
	return {
		inspectedPids,
		terminatedPids
	};
}
/** Create the ACPX plugin service that owns runtime registration and cleanup. */
function createAcpxRuntimeService(params) {
	let runtime = null;
	let lifecycleRevision = 0;
	return {
		id: "acpx-runtime",
		async start(ctx) {
			if (process.env.OPENCLAW_SKIP_ACPX_RUNTIME === "1") {
				ctx.logger.info("skipping embedded acpx runtime backend (OPENCLAW_SKIP_ACPX_RUNTIME=1)");
				return;
			}
			const openKeyedStore = params.openKeyedStore;
			if (!openKeyedStore) throw new Error("ACPX runtime service requires plugin keyed state");
			const basePluginConfig = await measureAcpxStartup(ctx, "config.resolve", () => resolveAcpxPluginConfig({
				rawConfig: params.pluginConfig,
				workspaceDir: ctx.workspaceDir
			}));
			const effectiveBasePluginConfig = {
				...basePluginConfig,
				probeAgent: basePluginConfig.probeAgent ?? resolveAllowedAgentsProbeAgent(ctx)
			};
			const pluginConfig = await measureAcpxStartup(ctx, "config.prepare-codex-auth", () => prepareAcpxCodexAuthConfig({
				pluginConfig: effectiveBasePluginConfig,
				stateDir: ctx.stateDir,
				logger: ctx.logger
			}));
			const wrapperRoot = path.join(ctx.stateDir, "acpx");
			await measureAcpxStartup(ctx, "filesystem.prepare", async () => {
				await fs$1.mkdir(pluginConfig.stateDir, { recursive: true });
				await fs$1.mkdir(wrapperRoot, { recursive: true });
			});
			const gatewayInstanceId = await measureAcpxStartup(ctx, "gateway-instance-id", () => resolveGatewayInstanceId(openKeyedStore));
			const processLeaseStore = createAcpxProcessLeaseStore({ store: openAcpxProcessLeaseStateStore(openKeyedStore) });
			const startupReap = await measureAcpxStartup(ctx, "process-leases.reap", () => reapOpenAcpxProcessLeases({
				gatewayInstanceId,
				leaseStore: processLeaseStore,
				deps: params.processCleanupDeps
			}));
			if (startupReap.terminatedPids.length > 0) ctx.logger.info(`reaped ${startupReap.terminatedPids.length} stale OpenClaw-owned ACPX process${startupReap.terminatedPids.length === 1 ? "" : "es"}`);
			const startedRuntime = await measureAcpxStartup(ctx, "runtime.create", () => params.runtimeFactory ? params.runtimeFactory({
				pluginConfig,
				gatewayInstanceId,
				processLeaseStore,
				wrapperRoot,
				logger: ctx.logger
			}) : createLazyDefaultRuntime({
				pluginConfig,
				gatewayInstanceId,
				processLeaseStore,
				wrapperRoot,
				logger: ctx.logger
			}));
			runtime = startedRuntime;
			const shouldProbeRuntime = shouldProbeRuntimeAtStartup();
			detailAcpxStartup(ctx, "probe-policy", [["startupProbeEnabledCount", shouldProbeRuntime ? 1 : 0], ["probeAgent", pluginConfig.probeAgent ?? "default"]]);
			await measureAcpxStartup(ctx, "backend.register", () => {
				const backend = {
					runtime: startedRuntime,
					...shouldProbeRuntime ? { healthy: () => runtime?.isHealthy() ?? false } : {}
				};
				params.backendLifecycle.publish(backend);
				ctx.logger.info(`embedded acpx runtime backend registered (cwd: ${pluginConfig.cwd})`);
			});
			if (!shouldProbeRuntime) return;
			lifecycleRevision += 1;
			const currentRevision = lifecycleRevision;
			try {
				const doctorReport = await measureAcpxStartup(ctx, "probe.availability", () => withStartupProbeTimeout({
					promise: startedRuntime.doctor(),
					timeoutSeconds: pluginConfig.timeoutSeconds ?? 120
				}));
				if (currentRevision !== lifecycleRevision) return;
				if (doctorReport.ok) {
					detailAcpxStartup(ctx, "probe.result", [["healthyCount", 1]]);
					ctx.logger.info("embedded acpx runtime backend ready");
					return;
				}
				detailAcpxStartup(ctx, "probe.result", [["healthyCount", 0]]);
				ctx.logger.warn(`embedded acpx runtime backend probe failed: ${formatDoctorFailureMessage(doctorReport)}`);
			} catch (err) {
				if (currentRevision !== lifecycleRevision) return;
				detailAcpxStartup(ctx, "probe.result", [["healthyCount", 0]]);
				ctx.logger.warn(`embedded acpx runtime setup failed: ${formatErrorMessage(err)}`);
			}
		},
		async stop(_ctx) {
			lifecycleRevision += 1;
			if (runtime) {
				params.backendLifecycle.retract(runtime);
				await runtime.shutdown();
			}
			runtime = null;
		}
	};
}
//#endregion
export { CODEX_ACP_PACKAGE as a, createAcpxRuntimeService, isOpenClawLeaseAwareAcpxProcessCommand as i, cleanupOpenClawOwnedAcpxPendingLease as n, OPENCLAW_CODEX_CONFIG_ARG as o, cleanupOpenClawOwnedAcpxProcessTree as r, resolveAcpxTimerTimeoutMs, service_exports as t };
