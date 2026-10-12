import { c as normalizeOptionalLowercaseString, l as normalizeOptionalString } from "./string-coerce-CIXf7egm.mjs";
import { t as formatErrorMessage } from "./errors-CaVNZEd2.mjs";
import { n as defaultSlotIdForKey } from "./slots-ByFaRAcU.mjs";
import { o as isTestDefaultMemorySlotDisabled } from "./config-state-BxYVV2MR.mjs";
import { n as isAutomationsToolName, t as AUTOMATIONS_TOOL_NAME } from "./automations-tool-name-DBMZPbPL.mjs";
import { r as isKnownCoreToolId } from "./tool-catalog-BAOwO8Un.mjs";
import { t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.mjs";
import { i as logWarn } from "./logger-CYc3jrPs.mjs";
import "./method-scopes-CF6Mdynq.mjs";
import { x as runBeforeToolCallHook } from "./agent-tools.before-tool-call-ya9NNSXc.mjs";
import { a as isAgentHarnessSessionKey, r as AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE, s as isAgentHarnessSessionStoreEntryProtected } from "./agent-harness-session-key-IBcnBzM1.mjs";
import { n as ToolInputError } from "./tool-input-error-mjW74R8m.mjs";
import { n as resolveRequestedSessionAgentId } from "./session-request-agent-DrCIg9-j.mjs";
import { a as resolveStoredSessionKeyForAgentStore } from "./session-store-key-5u_wUL39.mjs";
import { r as getPluginToolMeta } from "./tool-metadata-CFDycgJB.mjs";
import { c as getChannelAgentToolMeta } from "./agent-tool-metadata-BQ6-cP8z.mjs";
import "./common-_-PPQbg1.mjs";
import { o as withOperatorToolGatewayAuthority } from "./server-plugin-in-process-dispatch-YzD1iLQ5.mjs";
import { t as authorizeGatewaySessionCreation } from "./operator-role-policy-CQ0LLlEF.mjs";
import { t as createSyntheticPluginRuntimeClient } from "./server-plugin-runtime-client-CVLwaQsf.mjs";
import { i as loadGatewaySessionEntryReadOnly } from "./session-utils-store-59AWACc7.mjs";
import "./session-utils-DCz7_NNh.mjs";
import { R as authorizeResolvedSessionMutation, Y as resolveSessionSharingTarget } from "./session-sharing-DbNvvW-4.mjs";
import "./agent-tools-lIZNv5a0.mjs";
import "./channel-tools-q4LqLLCO.mjs";
import { t as normalizeConversationReadInvocationOrigin } from "./conversation-read-origin-E3olMOwo.mjs";
import { t as resolveToolLoopDetectionConfig } from "./tool-loop-detection-config-CKIQC-fJ.mjs";
import { t as resolveGatewayScopedTools } from "./tool-resolution-By0BnXxU.mjs";
//#region src/gateway/tools-invoke-shared.ts
const MEMORY_TOOL_NAMES = /* @__PURE__ */ new Set(["memory_search", "memory_get"]);
function resolveSessionTarget(params) {
	const rawSessionKey = normalizeOptionalString(params.input.sessionKey) ?? "main";
	const resolved = resolveRequestedSessionAgentId(params.cfg, rawSessionKey, normalizeOptionalString(params.input.agentId));
	if (!resolved.ok) return resolved;
	return {
		ok: true,
		agentId: resolved.agentId,
		sessionKey: resolveStoredSessionKeyForAgentStore({
			cfg: params.cfg,
			agentId: resolved.agentId,
			sessionKey: rawSessionKey
		})
	};
}
function resolveMemoryToolDisableReasons(cfg) {
	if (!process.env.VITEST) return [];
	const reasons = [];
	const plugins = cfg.plugins;
	const slotRaw = plugins?.slots?.memory;
	const slotDisabled = slotRaw === null || normalizeOptionalLowercaseString(slotRaw) === "none";
	const pluginsDisabled = plugins?.enabled === false;
	const defaultDisabled = isTestDefaultMemorySlotDisabled(cfg);
	if (pluginsDisabled) reasons.push("plugins.enabled=false");
	if (slotDisabled) reasons.push(slotRaw === null ? "plugins.slots.memory=null" : "plugins.slots.memory=\"none\"");
	if (!pluginsDisabled && !slotDisabled && defaultDisabled) reasons.push("memory plugin disabled by test default");
	return reasons;
}
function mergeActionIntoArgsIfSupported(params) {
	const { toolSchema, action, args } = params;
	if (!action || args.action !== void 0) return args;
	const schemaObj = toolSchema;
	return Boolean(schemaObj && typeof schemaObj === "object" && schemaObj.properties && "action" in schemaObj.properties) ? {
		...args,
		action
	} : args;
}
function resolveToolInputErrorStatus(err) {
	if (err instanceof ToolInputError) {
		const status = err.status;
		return typeof status === "number" ? status : 400;
	}
	if (typeof err !== "object" || err === null || !("name" in err)) return null;
	const name = err.name;
	if (name !== "ToolInputError" && name !== "ToolAuthorizationError") return null;
	const status = err.status;
	if (typeof status === "number") return status;
	return name === "ToolAuthorizationError" ? 403 : 400;
}
function resolveToolSource(tool) {
	if (getPluginToolMeta(tool)) return "plugin";
	if (getChannelAgentToolMeta(tool)) return "channel";
	return "core";
}
async function invokeGatewayToolWithSignal(params) {
	const conversationReadOrigin = normalizeConversationReadInvocationOrigin(params.conversationReadOrigin);
	const requestedToolName = normalizeOptionalString(params.input.name ?? params.input.tool) ?? "";
	const toolName = isAutomationsToolName(requestedToolName) ? AUTOMATIONS_TOOL_NAME : requestedToolName;
	if (!toolName) return {
		ok: false,
		status: 400,
		toolName: "",
		error: {
			type: "invalid_request",
			message: "tools.invoke requires name"
		}
	};
	if (process.env.VITEST && MEMORY_TOOL_NAMES.has(toolName)) {
		const reasons = resolveMemoryToolDisableReasons(params.cfg);
		if (reasons.length > 0) return {
			ok: false,
			status: 400,
			toolName,
			error: {
				type: "invalid_request",
				message: `memory tools are disabled in tests${` (${reasons.join(", ")})`}. Enable by setting plugins.slots.memory="${defaultSlotIdForKey("memory")}" (and ensure plugins.enabled is not false).`
			}
		};
	}
	const knownCoreTool = isKnownCoreToolId(toolName);
	const gatewayRequestedTools = knownCoreTool ? [] : [toolName];
	const action = normalizeOptionalString(params.input.action);
	const argsRaw = params.input.args;
	const args = argsRaw && typeof argsRaw === "object" && !Array.isArray(argsRaw) ? argsRaw : {};
	const sessionTarget = resolveSessionTarget({
		cfg: params.cfg,
		input: params.input
	});
	if (!sessionTarget.ok) return {
		ok: false,
		status: 400,
		toolName,
		error: {
			type: "invalid_request",
			message: sessionTarget.error.message
		}
	};
	const { agentId: selectedAgentId, sessionKey } = sessionTarget;
	const authenticatedUserProfile = params.cfg.gateway?.roles ? params.authenticatedUserProfile : void 0;
	const client = createSyntheticPluginRuntimeClient({
		...authenticatedUserProfile ? { authenticatedUserProfile } : {},
		operatorRoleActor: params.operatorRoleActor,
		scopes: params.senderIsOwner ? [ADMIN_SCOPE] : [...params.operatorScopes ?? []]
	});
	const primarySessionAuthorizationError = authorizeResolvedSessionMutation({
		cfg: params.cfg,
		client,
		sessionKey,
		agentId: selectedAgentId
	});
	if (primarySessionAuthorizationError) return {
		ok: false,
		status: 403,
		toolName,
		error: {
			type: "tool_call_blocked",
			message: primarySessionAuthorizationError.message
		}
	};
	if (authenticatedUserProfile && (toolName === "sessions_spawn" || toolName === "sessions_send")) {
		const nestedSessionKey = normalizeOptionalString(args.sessionKey);
		const nestedAgentId = normalizeOptionalString(args.agentId);
		const targetAgent = nestedSessionKey ? resolveRequestedSessionAgentId(params.cfg, nestedSessionKey, nestedAgentId) : void 0;
		if (targetAgent && !targetAgent.ok) return {
			ok: false,
			status: 400,
			toolName,
			error: {
				type: "invalid_request",
				message: targetAgent.error.message
			}
		};
		const targetAgentId = targetAgent?.agentId ?? nestedAgentId ?? selectedAgentId;
		const existingTarget = toolName === "sessions_send" && nestedSessionKey ? resolveSessionSharingTarget({
			cfg: params.cfg,
			sessionKey: nestedSessionKey,
			agentId: targetAgentId
		}) : null;
		const authorizationError = (toolName === "sessions_send" && nestedSessionKey ? authorizeResolvedSessionMutation({
			cfg: params.cfg,
			client,
			sessionKey: nestedSessionKey,
			agentId: targetAgentId
		}) : null) ?? (!existingTarget ? authorizeGatewaySessionCreation({
			cfg: params.cfg,
			client,
			agentId: targetAgentId
		}) : null);
		if (authorizationError) return {
			ok: false,
			status: 403,
			toolName,
			error: {
				type: "tool_call_blocked",
				message: authorizationError.message
			}
		};
	}
	const sessionEntry = loadGatewaySessionEntryReadOnly(sessionKey, { agentId: selectedAgentId }).entry;
	if (isAgentHarnessSessionKey(sessionKey) && (!sessionEntry || isAgentHarnessSessionStoreEntryProtected(sessionKey, sessionEntry))) return {
		ok: false,
		status: 400,
		toolName,
		error: {
			type: "invalid_request",
			message: AGENT_HARNESS_SESSION_KEY_RESERVED_MESSAGE
		}
	};
	const resolveTools = (disablePluginTools) => resolveGatewayScopedTools({
		cfg: params.cfg,
		sessionKey,
		sessionId: sessionEntry?.sessionId,
		agentId: selectedAgentId,
		messageProvider: params.messageChannel,
		accountId: params.accountId,
		agentTo: params.agentTo,
		agentThreadId: params.agentThreadId,
		senderIsOwner: params.senderIsOwner,
		clientCaps: params.clientCaps,
		conversationReadOrigin,
		allowGatewaySubagentBinding: true,
		allowMediaInvokeCommands: true,
		surface: "http",
		disablePluginTools,
		gatewayRequestedTools
	});
	let { agentId, tools, workspaceDir } = resolveTools(knownCoreTool);
	if (knownCoreTool && !tools.some((candidate) => candidate.name === toolName)) ({agentId, tools, workspaceDir} = resolveTools(false));
	const requestedAgentId = normalizeOptionalString(params.input.agentId);
	if (requestedAgentId && agentId && requestedAgentId !== agentId) return {
		ok: false,
		status: 400,
		toolName,
		error: {
			type: "invalid_request",
			message: `agent id "${requestedAgentId}" does not match session agent "${agentId}"`
		}
	};
	const tool = tools.find((candidate) => candidate.name === toolName);
	if (!tool) return {
		ok: false,
		status: 404,
		toolName,
		error: {
			type: "not_found",
			message: `Tool not available: ${toolName}`
		}
	};
	try {
		const gatewayTool = tool;
		const idempotencyKey = normalizeOptionalString(params.input.idempotencyKey);
		const toolCallId = idempotencyKey ? `${params.toolCallIdPrefix}-${conversationReadOrigin}-${idempotencyKey}` : `${params.toolCallIdPrefix}-${conversationReadOrigin}-${Date.now()}`;
		const toolArgs = mergeActionIntoArgsIfSupported({
			toolSchema: gatewayTool.parameters,
			action,
			args
		});
		const hookResult = await runBeforeToolCallHook({
			toolName,
			params: toolArgs,
			toolCallId,
			ctx: {
				agentId,
				config: params.cfg,
				sessionKey,
				workspaceDir,
				loopDetection: resolveToolLoopDetectionConfig({
					cfg: params.cfg,
					agentId
				})
			},
			signal: params.signal,
			approvalMode: params.approvalMode
		});
		if (hookResult.blocked) return {
			ok: false,
			status: 403,
			toolName,
			error: {
				type: "tool_call_blocked",
				message: hookResult.reason,
				requiresApproval: hookResult.deniedReason === "plugin-approval"
			}
		};
		params.signal?.throwIfAborted();
		const executeTool = async () => await gatewayTool.execute?.(toolCallId, hookResult.params, params.signal);
		const result = authenticatedUserProfile ? await withOperatorToolGatewayAuthority({
			authenticatedUserProfile,
			operatorRoleActor: params.operatorRoleActor,
			scopes: params.operatorScopes ?? []
		}, executeTool) : await executeTool();
		return {
			ok: true,
			status: 200,
			toolName,
			source: resolveToolSource(gatewayTool),
			result
		};
	} catch (err) {
		const inputStatus = resolveToolInputErrorStatus(err);
		if (inputStatus !== null) return {
			ok: false,
			status: inputStatus === 403 ? 403 : 400,
			toolName,
			error: {
				type: "tool_error",
				message: formatErrorMessage(err) || "invalid tool arguments"
			}
		};
		if (!params.signal?.aborted) logWarn(`tools-invoke: tool execution failed: ${String(err)}`);
		return {
			ok: false,
			status: 500,
			toolName,
			error: {
				type: "tool_error",
				message: "tool execution failed"
			}
		};
	}
}
/** Resolves, authorizes, and invokes one gateway-visible core/plugin/channel tool. */
async function invokeGatewayTool(params) {
	const requestAbort = new AbortController();
	const signal = params.signal ? AbortSignal.any([params.signal, requestAbort.signal]) : requestAbort.signal;
	try {
		return await invokeGatewayToolWithSignal({
			...params,
			signal
		});
	} finally {
		requestAbort.abort();
	}
}
//#endregion
export { invokeGatewayTool as t };
