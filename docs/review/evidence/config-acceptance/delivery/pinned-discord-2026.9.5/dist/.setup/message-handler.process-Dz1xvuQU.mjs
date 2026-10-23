import { ft as editChannelMessage, st as createChannelMessage, t as discord_exports, ut as deleteChannelMessage } from "./discord-BXpHW-cu.mjs";
import { C as resolveTimestampMs, i as normalizeDiscordAllowList, o as normalizeDiscordSlug } from "./channel-type-DKnjV1XW.mjs";
import { p as resolveDiscordMaxLinesPerMessage } from "./accounts-CwJQoLjM.mjs";
import { b as resolveDiscordChannelId, o as chunkDiscordTextWithMode } from "./retry-DBfcEgmO.mjs";
import { F as createDiscordRuntimeAccountContext, P as createDiscordRestClient, d as resolveDiscordTargetChannelId, k as resolveDiscordMessageFlags } from "./send.shared-Zwx6BxQ5.mjs";
import { a as discordTextHasBroadcastMention } from "./send.outbound-D0hQ7s50.mjs";
import { D as resolveDiscordMessageStickers, b as resolveDiscordMessageText, h as resolveDiscordThreadStarter, p as resolveDiscordAutoThreadReplyPlan, w as resolveReferencedReplyMediaList, x as formatDiscordMediaText } from "./transcripts-source-CuWYgayu.mjs";
import { a as removeReactionDiscord, f as editMessageDiscord, r as reactMessageDiscord } from "./send-CKDczUNL.mjs";
import { n as DISCORD_ATTACHMENT_TOTAL_TIMEOUT_MS, t as DISCORD_ATTACHMENT_IDLE_TIMEOUT_MS } from "./timeouts-D86uWLt_.mjs";
import "./targets-D1mAB5yO.mjs";
import { b as discordInboundEventDelivery, h as resolveDiscordConversationIdentity, u as buildDiscordRoutePeer } from "./outbound-session-route-CqWbuMOm.mjs";
import { t as DISCORD_TEXT_CHUNK_LIMIT } from "./outbound-adapter-C8v79z9Z.mjs";
import { a as formatDiscordReplySkip, c as buildGuildLabel, g as createDiscordSupplementalContextAccessChecker, h as buildDiscordInboundAccessContext, i as formatDiscordReplyDeliveryFailure, l as resolveReplyContext, o as sanitizeDiscordFrontChannelReplyPayloads, r as deliverDiscordReply, s as buildDirectLabel } from "./provider-72zIvN-i.mjs";
import { n as resolveDiscordWebhookId } from "./sender-identity-0Ymgvmaj.mjs";
import { t as beginDiscordActiveTurnThreadRoute } from "./active-turn-thread-route-fmHl1HNd.mjs";
import { n as filterDiscordHistoryEntriesForContext, t as createDiscordHistorySenderProvenance } from "./message-handler.history-CJOsN9w5.mjs";
import { t as sendTyping } from "./typing-BKZL5fGj.mjs";
import { expectDefined } from "openclaw/plugin-sdk/expect-runtime";
import { formatErrorMessage } from "openclaw/plugin-sdk/error-runtime";
import { buildAgentSessionKey, resolveThreadSessionKeys } from "openclaw/plugin-sdk/routing";
import { getReplyPayloadTtsSupplement, isReplyPayloadNonTerminalToolErrorWarning, resolveSendableOutboundReplyParts } from "openclaw/plugin-sdk/reply-payload";
import { danger, logVerbose, shouldLogVerbose, sleepWithAbort } from "openclaw/plugin-sdk/runtime-env";
import { truncateUtf16Safe } from "openclaw/plugin-sdk/text-utility-runtime";
import { resolveChunkMode } from "openclaw/plugin-sdk/reply-chunking";
import { resolveMarkdownTableMode } from "openclaw/plugin-sdk/markdown-table-runtime";
import { convertMarkdownTables, stripInlineDirectiveTagsForDelivery, stripReasoningTagsFromText } from "openclaw/plugin-sdk/text-chunking";
import { bindIngressLifecycleToReplyOptions, createChannelMessageReplyPipeline, createChannelProgressDraftCompositor, createFinalizableDraftStreamControlsForState, createTypingCallbacks, defineFinalizableLivePreviewAdapter, deliverWithFinalizableLivePreviewAdapter, resolveChannelDraftStreamingChunking, resolveChannelMessageSourceReplyDeliveryMode, resolveChannelPreviewStreamMode, resolveChannelStreamingBlockEnabled, resolveChannelStreamingPreviewCommandText, resolveChannelStreamingProgressNarration, resolveTranscriptBackedChannelFinalText } from "openclaw/plugin-sdk/channel-outbound";
import { getAgentScopedMediaLocalRoots } from "openclaw/plugin-sdk/media-runtime";
import { buildChannelInboundEventContext, createCommandTurnContext, dispatchChannelInboundTurn, formatInboundEnvelope, formatInboundMediaUnavailableText, getGroupThreadDeliverySession, hasFinalInboundReplyDispatch, readAgentRunTerminalOutcome, resolveEnvelopeFormatOptions, toHistoryMediaEntries, toInboundMediaFactsWithMetadata } from "openclaw/plugin-sdk/channel-inbound";
import { evaluateSupplementalContextVisibility } from "openclaw/plugin-sdk/security-runtime";
import { resolvePinnedMainDmOwnerFromAllowlist } from "openclaw/plugin-sdk/conversation-runtime";
import { resolveAgentConfig } from "openclaw/plugin-sdk/agent-scope-runtime";
import { EmbeddedBlockChunker, resolveAckReaction, resolveAgentConfig as resolveAgentConfig$1, resolveHumanDelayConfig } from "openclaw/plugin-sdk/agent-runtime";
import { isDangerousNameMatchingEnabled } from "openclaw/plugin-sdk/dangerous-name-runtime";
import { getSessionEntry, readSessionUpdatedAt, resolveStorePath } from "openclaw/plugin-sdk/session-store-runtime";
import { getGlobalHookRunner } from "openclaw/plugin-sdk/plugin-runtime";
import { buildHistoryContextFromEntries, buildInboundHistoryFromEntries, createChannelHistoryWindow } from "openclaw/plugin-sdk/reply-history";
import { resolveChannelContextVisibilityMode } from "openclaw/plugin-sdk/context-visibility-runtime";
import { formatAudioTranscriptForAgent } from "openclaw/plugin-sdk/media-understanding-runtime";
import { createStatusReactionController, logAckFailure, logTypingFailure, shouldAckReaction } from "openclaw/plugin-sdk/channel-feedback";
import { readLatestAssistantTextByIdentity } from "openclaw/plugin-sdk/session-transcript-runtime";
//#region extensions/discord/src/monitor/message-handler.retry.ts
const REPLY_SESSION_INIT_CONFLICT_MESSAGE_RE = /^reply session initialization conflicted for \S+$/u;
const DISCORD_SESSION_CONFLICT_FAILURE_TEXT = "⚠️ Couldn't process this message because the session stayed busy. Please try again in a moment.";
async function completeDiscordSessionConflict(error, sourceReplyDeliveryMode, deliver, onDeliveryError) {
	const message = error instanceof Error ? error.message : String(error);
	if (!REPLY_SESSION_INIT_CONFLICT_MESSAGE_RE.test(message)) return;
	if (sourceReplyDeliveryMode === "message_tool_only") return "suppressed";
	try {
		return (await deliver({
			text: DISCORD_SESSION_CONFLICT_FAILURE_TEXT,
			isError: true
		}, { kind: "final" })).visibleReplySent ? "delivered" : "suppressed";
	} catch (deliveryError) {
		onDeliveryError(deliveryError, { kind: "final" });
		throw new Error(`discord: reply session init conflict exhausted and terminal notice failed: ${String(deliveryError)}`, { cause: deliveryError });
	}
}
function removeDiscordReplayHistoryEntry(historyMap, historyKey, messageId) {
	const history = historyMap.get(historyKey);
	if (!history) return;
	for (let index = history.length - 1; index >= 0; index -= 1) if (history[index]?.messageId === messageId) history.splice(index, 1);
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.context.ts
function normalizeDiscordDmOwnerEntry(entry) {
	const candidate = normalizeDiscordAllowList([entry], [
		"discord:",
		"user:",
		"pk:"
	])?.ids.values().next().value;
	return typeof candidate === "string" && /^\d+$/.test(candidate) ? candidate : void 0;
}
async function buildDiscordMessageProcessContext(params) {
	const { ctx, text, mediaList } = params;
	const { cfg, discordConfig, accountId, runtime, botUserId, mediaMaxBytes, discordRestFetch, abortSignal, guildHistories, historyLimit, replyToMode, message, author, sender, canonicalMessageId, data, client, channelInfo, channelName, messageChannelId, isGuildMessage, isDirectMessage, isGroupDm, baseText, preflightAudioTranscript, threadChannel, threadParentId, threadParentName, threadParentType, threadName, displayChannelSlug, guildInfo, guildSlug, memberRoleIds, channelConfig, baseSessionKey, boundSessionKey, route, commandAuthorized, hasControlCommand, resolveChannelIngress } = ctx;
	const fromLabel = isDirectMessage ? buildDirectLabel(author) : buildGuildLabel({
		guild: data.guild ?? void 0,
		channelName: channelName ?? messageChannelId,
		channelId: messageChannelId
	});
	const senderLabel = sender.label;
	const isForumParent = threadParentType === discord_exports.ChannelType.GuildForum || threadParentType === discord_exports.ChannelType.GuildMedia;
	const forumParentSlug = isForumParent && threadParentName ? normalizeDiscordSlug(threadParentName) : "";
	const threadChannelId = threadChannel?.id;
	const threadParentInheritanceEnabled = discordConfig?.thread?.inheritParent ?? false;
	const forumContextLine = Boolean(threadChannelId && isForumParent && forumParentSlug) && message.id === threadChannelId ? `[Forum parent: #${forumParentSlug}]` : null;
	const groupChannel = isGuildMessage && displayChannelSlug ? `#${displayChannelSlug}` : void 0;
	const senderName = sender.isPluralKit ? sender.name ?? author.username : data.member?.nickname ?? author.globalName ?? author.username;
	const senderUsername = sender.isPluralKit ? sender.tag ?? sender.name ?? author.username : author.username;
	const { groupSystemPrompt, ownerAllowFrom, channelStructuredContext } = buildDiscordInboundAccessContext({
		channelConfig,
		guildInfo,
		sender: {
			id: sender.id,
			name: sender.name,
			tag: sender.tag
		},
		allowNameMatching: isDangerousNameMatchingEnabled(discordConfig),
		isGuild: isGuildMessage,
		channelTopic: channelInfo?.topic
	});
	const pinnedMainDmOwner = isDirectMessage ? resolvePinnedMainDmOwnerFromAllowlist({
		dmScope: cfg.session?.dmScope,
		allowFrom: channelConfig?.users ?? guildInfo?.users,
		normalizeEntry: normalizeDiscordDmOwnerEntry
	}) : null;
	const contextVisibilityMode = resolveChannelContextVisibilityMode({
		cfg,
		channel: "discord",
		accountId
	});
	const allowNameMatching = isDangerousNameMatchingEnabled(discordConfig);
	const isSupplementalContextSenderAllowed = createDiscordSupplementalContextAccessChecker({
		channelConfig,
		guildInfo,
		allowNameMatching,
		isGuild: isGuildMessage
	});
	const storePath = resolveStorePath(cfg.session?.store, { agentId: route.agentId });
	const envelopeOptions = resolveEnvelopeFormatOptions(cfg);
	const previousTimestamp = readSessionUpdatedAt({
		storePath,
		sessionKey: route.sessionKey
	});
	const channelHistory = createChannelHistoryWindow({ historyMap: guildHistories });
	let visibleChannelHistory;
	const unavailableMediaCount = mediaList.filter((media) => !media.path).length;
	const appendMediaUnavailableNotice = (body) => unavailableMediaCount > 0 ? formatInboundMediaUnavailableText({
		body,
		notice: `[discord ${unavailableMediaCount > 1 ? `${unavailableMediaCount} attachments` : "attachment"} unavailable]`
	}) : body;
	const bodyWithMediaNotice = appendMediaUnavailableNotice(text) ?? text;
	const agentFacingBody = preflightAudioTranscript !== void 0 ? formatAudioTranscriptForAgent(preflightAudioTranscript) : text;
	let combinedBody = formatInboundEnvelope({
		channel: "Discord",
		from: fromLabel,
		timestamp: resolveTimestampMs(message.timestamp),
		body: bodyWithMediaNotice,
		chatType: isDirectMessage ? "direct" : "channel",
		senderLabel,
		previousTimestamp,
		envelope: envelopeOptions
	});
	const shouldIncludeChannelHistory = !isDirectMessage && (ctx.inboundEventKind === "room_event" || !(isGuildMessage && channelConfig?.autoThread && !threadChannel));
	if (shouldIncludeChannelHistory) {
		removeDiscordReplayHistoryEntry(guildHistories, messageChannelId, message.id);
		if (historyLimit > 0) {
			const filteredHistory = filterDiscordHistoryEntriesForContext({
				entries: guildHistories.get(messageChannelId) ?? [],
				mode: contextVisibilityMode,
				isSenderAllowed: isSupplementalContextSenderAllowed
			});
			visibleChannelHistory = filteredHistory.entries;
			if (filteredHistory.omitted > 0) logVerbose(`discord: omit ${filteredHistory.omitted} pending history entries (mode=${contextVisibilityMode})`);
			combinedBody = buildHistoryContextFromEntries({
				entries: visibleChannelHistory,
				currentMessage: combinedBody,
				formatEntry: (entry) => formatInboundEnvelope({
					channel: "Discord",
					from: fromLabel,
					timestamp: entry.timestamp,
					body: `${entry.body} [id:${entry.messageId ?? "unknown"} channel:${messageChannelId}]`,
					chatType: "channel",
					senderLabel: entry.sender,
					envelope: envelopeOptions
				}),
				excludeLast: false
			});
		}
	}
	const replyContext = resolveReplyContext(message, resolveDiscordMessageText);
	const replySenderAllowed = replyContext ? isSupplementalContextSenderAllowed({
		id: replyContext.senderId,
		name: replyContext.senderName,
		tag: replyContext.senderTag,
		memberRoleIds: replyContext.memberRoleIds
	}) : true;
	const replyVisible = evaluateSupplementalContextVisibility({
		mode: contextVisibilityMode,
		kind: "quote",
		senderAllowed: replySenderAllowed
	}).include;
	if (replyContext && !replyVisible && isGuildMessage) logVerbose(`discord: drop reply context (mode=${contextVisibilityMode})`);
	if (forumContextLine) combinedBody = `${combinedBody}\n${forumContextLine}`;
	let threadStarterBody;
	let threadLabel;
	let parentSessionKey;
	let modelParentSessionKey;
	if (threadChannel) {
		if (channelConfig?.includeThreadStarter !== false) {
			const starter = await resolveDiscordThreadStarter({
				channel: threadChannel,
				client,
				accountId,
				parentId: threadParentId,
				parentType: threadParentType,
				resolveTimestampMs
			});
			if (starter?.text) {
				if (evaluateSupplementalContextVisibility({
					mode: contextVisibilityMode,
					kind: "thread",
					senderAllowed: isSupplementalContextSenderAllowed({
						id: starter.authorId,
						name: starter.authorName ?? starter.author,
						tag: starter.authorTag,
						memberRoleIds: starter.memberRoleIds
					})
				}).include) threadStarterBody = starter.text;
				else logVerbose(`discord: drop thread starter context (mode=${contextVisibilityMode})`);
			}
		}
		const parentName = threadParentName ?? "parent";
		threadLabel = threadName ? `Discord thread #${normalizeDiscordSlug(parentName)} › ${threadName}` : `Discord thread #${normalizeDiscordSlug(parentName)}`;
		if (threadParentId) {
			parentSessionKey = buildAgentSessionKey({
				agentId: route.agentId,
				mainKey: cfg.session?.mainKey,
				channel: route.channel,
				peer: {
					kind: "channel",
					id: threadParentId
				},
				groupScope: route.groupScope
			});
			modelParentSessionKey = parentSessionKey === baseSessionKey ? void 0 : parentSessionKey;
		}
		parentSessionKey = threadParentInheritanceEnabled ? modelParentSessionKey : void 0;
	}
	const preflightAudioIndex = preflightAudioTranscript === void 0 ? -1 : mediaList.findIndex((media) => media.contentType?.startsWith("audio/"));
	const threadKeys = resolveThreadSessionKeys({
		baseSessionKey,
		threadId: threadChannel ? messageChannelId : void 0,
		parentSessionKey,
		useSuffix: false
	});
	const replyPlan = await resolveDiscordAutoThreadReplyPlan({
		client,
		message,
		messageChannelId,
		isGuildMessage,
		channelConfig: ctx.inboundEventKind === "room_event" ? null : channelConfig,
		threadChannel,
		channelType: channelInfo?.type,
		channelName: channelInfo?.name,
		channelDescription: channelInfo?.topic,
		baseText: baseText ?? "",
		combinedBody,
		replyToMode,
		agentId: route.agentId,
		channel: route.channel,
		cfg,
		parentSessionKey: route.sessionKey,
		groupScope: route.groupScope,
		threadParentInheritanceEnabled
	});
	const deliverTarget = replyPlan.deliverTarget;
	const replyTarget = replyPlan.replyTarget;
	const replyReference = replyPlan.replyReference;
	const autoThreadContext = replyPlan.autoThreadContext;
	const conversationParentId = threadChannel ? threadParentId : autoThreadContext ? messageChannelId : void 0;
	const effectiveFrom = isDirectMessage ? `discord:${author.id}` : autoThreadContext?.From ?? `discord:channel:${messageChannelId}`;
	const dmConversationTarget = isDirectMessage ? resolveDiscordConversationIdentity({
		isDirectMessage,
		userId: author.id
	}) : void 0;
	const effectiveTo = autoThreadContext?.To ?? dmConversationTarget ?? replyTarget;
	if (!effectiveTo) {
		runtime.error(danger("discord: missing reply target"));
		return null;
	}
	const lastRouteTo = dmConversationTarget ?? effectiveTo;
	const inboundHistory = shouldIncludeChannelHistory ? buildInboundHistoryFromEntries({
		entries: visibleChannelHistory ?? [],
		limit: historyLimit
	}) : void 0;
	const originatingTo = autoThreadContext?.OriginatingTo ?? dmConversationTarget ?? replyTarget;
	const effectiveSessionKey = boundSessionKey ?? autoThreadContext?.SessionKey ?? threadKeys.sessionKey;
	const effectivePreviousTimestamp = effectiveSessionKey === route.sessionKey ? previousTimestamp : readSessionUpdatedAt({
		storePath,
		sessionKey: effectiveSessionKey
	});
	const channelIngress = await resolveChannelIngress({
		agentId: route.agentId,
		sessionKey: effectiveSessionKey,
		messageId: canonicalMessageId ?? message.id,
		inboundEventKind: ctx.inboundEventKind
	}, {
		parentId: conversationParentId,
		threadId: threadChannel?.id ?? autoThreadContext?.createdThreadId ?? void 0
	});
	const ctxPayload = await (ctx.buildContext ?? buildChannelInboundEventContext)({
		channelIngress,
		channel: "discord",
		resolveSupplementalMedia: true,
		contextVisibility: contextVisibilityMode,
		accountId: route.accountId,
		messageId: canonicalMessageId ?? message.id,
		messageIdFull: canonicalMessageId && canonicalMessageId !== message.id ? message.id : void 0,
		timestamp: resolveTimestampMs(message.timestamp),
		from: effectiveFrom,
		sender: {
			id: sender.id,
			name: senderName,
			username: senderUsername,
			tag: sender.tag,
			roles: memberRoleIds,
			displayLabel: senderLabel,
			isBot: author.bot && !sender.isPluralKit ? true : void 0
		},
		conversation: {
			kind: isGroupDm ? "group" : isDirectMessage ? "direct" : "channel",
			id: messageChannelId,
			routePeer: buildDiscordRoutePeer({
				isDirectMessage,
				isGroupDm,
				directUserId: author.id,
				conversationId: messageChannelId
			}),
			nativeChannelId: messageChannelId,
			avatar: ctx.conversationAvatar,
			label: fromLabel,
			spaceId: isGuildMessage ? (guildInfo?.id ?? data.guild?.id ?? data.guild_id ?? guildSlug) || void 0 : void 0,
			parentId: conversationParentId,
			threadId: threadChannel?.id ?? autoThreadContext?.createdThreadId ?? void 0
		},
		route: {
			agentId: route.agentId,
			dmScope: route.dmScope,
			accountId: route.accountId,
			routeSessionKey: route.sessionKey,
			dispatchSessionKey: effectiveSessionKey,
			parentSessionKey: autoThreadContext?.ParentSessionKey ?? threadKeys.parentSessionKey,
			modelParentSessionKey: autoThreadContext?.ModelParentSessionKey ?? modelParentSessionKey ?? void 0
		},
		reply: {
			to: effectiveTo,
			...originatingTo !== effectiveTo ? { originatingTo } : {}
		},
		message: {
			inboundEventKind: ctx.inboundEventKind,
			body: combinedBody,
			rawBody: baseText,
			bodyForAgent: appendMediaUnavailableNotice(agentFacingBody),
			commandBody: baseText,
			inboundHistory
		},
		sessionTranscript: { historyLimit: shouldIncludeChannelHistory ? historyLimit : 0 },
		access: {
			mentions: {
				canDetectMention: ctx.canDetectMention,
				wasMentioned: ctx.effectiveWasMentioned,
				hasAnyMention: ctx.hasAnyMention,
				requireMention: ctx.shouldRequireMention,
				effectiveWasMentioned: ctx.effectiveWasMentioned
			},
			commands: { authorized: commandAuthorized }
		},
		commandTurn: createCommandTurnContext(hasControlCommand ? "text" : "message", {
			authorized: commandAuthorized,
			body: baseText
		}),
		media: await toInboundMediaFactsWithMetadata(mediaList, { transcribed: (_media, index) => index === preflightAudioIndex }),
		supplemental: {
			quote: replyContext && replyVisible ? {
				id: replyContext.id,
				body: replyContext.body,
				sender: replyContext.sender,
				senderAllowed: replySenderAllowed,
				isSelf: Boolean(botUserId && replyContext.senderId === botUserId),
				media: async () => {
					const referencedReplyMediaList = await resolveReferencedReplyMediaList(message, mediaMaxBytes, {
						fetchImpl: discordRestFetch,
						ssrfPolicy: cfg.browser?.ssrfPolicy,
						readIdleTimeoutMs: DISCORD_ATTACHMENT_IDLE_TIMEOUT_MS,
						totalTimeoutMs: DISCORD_ATTACHMENT_TOTAL_TIMEOUT_MS,
						abortSignal
					});
					return abortSignal?.aborted ? [] : await toInboundMediaFactsWithMetadata(referencedReplyMediaList, { messageId: replyContext.id });
				}
			} : void 0,
			thread: {
				starterBody: !effectivePreviousTimestamp ? threadStarterBody : void 0,
				label: threadLabel,
				senderAllowed: true
			},
			groupSystemPrompt: isGuildMessage ? groupSystemPrompt : void 0
		},
		extra: {
			GroupThread: ctx.groupThread,
			...preflightAudioTranscript !== void 0 ? { Transcript: preflightAudioTranscript } : {},
			GroupSubject: isDirectMessage ? void 0 : groupChannel,
			GroupChannel: groupChannel,
			...isGuildMessage ? { GroupRequireMention: ctx.groupRequireMention } : {},
			ChannelStructuredContext: channelStructuredContext,
			OwnerAllowFrom: ownerAllowFrom
		}
	});
	const persistedSessionKey = ctxPayload.SessionKey ?? route.sessionKey;
	if (ctx.inboundEventKind === "room_event" && shouldIncludeChannelHistory) {
		const historyText = [text, formatDiscordMediaText({
			attachments: message.attachments ?? void 0,
			stickers: resolveDiscordMessageStickers(message)
		})].filter(Boolean).join("\n");
		await channelHistory.recordWithMedia({
			historyKey: messageChannelId,
			limit: historyLimit,
			entry: {
				sender: senderName,
				body: historyText,
				timestamp: resolveTimestampMs(message.timestamp),
				messageId: message.id,
				senderProvenance: createDiscordHistorySenderProvenance({
					sender,
					memberRoleIds
				})
			},
			media: toHistoryMediaEntries(mediaList, { messageId: message.id }),
			messageId: message.id
		});
	}
	if (shouldLogVerbose()) {
		const preview = truncateUtf16Safe(combinedBody, 200).replace(/\n/g, "\\n");
		logVerbose(`discord inbound: channel=${messageChannelId} deliver=${deliverTarget} from=${ctxPayload.From} preview="${preview}"`);
	}
	return {
		ctxPayload,
		persistedSessionKey,
		turn: {
			storePath,
			record: {
				updateLastRoute: {
					sessionKey: persistedSessionKey,
					channel: "discord",
					to: lastRouteTo,
					accountId: route.accountId,
					mainDmOwnerPin: isDirectMessage && persistedSessionKey === route.mainSessionKey && pinnedMainDmOwner ? {
						ownerRecipient: pinnedMainDmOwner,
						senderRecipient: author.id,
						onSkip: ({ ownerRecipient, senderRecipient }) => {
							logVerbose(`discord: skip main-session last route for ${senderRecipient} (pinned owner ${ownerRecipient})`);
						}
					} : void 0
				},
				onRecordError: (err) => {
					logVerbose(`discord: failed updating session meta: ${String(err)}`);
				}
			}
		},
		replyPlan,
		deliverTarget,
		replyTarget,
		replyReference
	};
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.process-progress.ts
function createDiscordMessageProgressRuntime(params) {
	const { ctx, draftPreview } = params;
	const { cfg, route, abortSignal } = ctx;
	const reasoningLevel = (() => {
		const cfgDefault = resolveAgentConfig(cfg, route.agentId ?? "main")?.reasoningDefault ?? cfg.agents?.defaults?.reasoningDefault;
		const configDefault = cfgDefault === "on" || cfgDefault === "stream" ? cfgDefault : "off";
		if (!params.sessionKey) return configDefault;
		try {
			const storePath = resolveStorePath(cfg.session?.store, { agentId: route.agentId });
			const level = getSessionEntry({
				agentId: route.agentId,
				sessionKey: params.sessionKey,
				storePath
			})?.reasoningLevel;
			if (level === "on" || level === "stream" || level === "off") return level;
		} catch {
			return "off";
		}
		return configDefault;
	})();
	const reasoningDurableEnabled = reasoningLevel === "on";
	const reasoningWindowEnabled = reasoningLevel === "stream";
	let shouldYieldDraftCommentary = () => false;
	const handleAssistantMessageBoundary = () => {
		if (draftPreview.handleAssistantMessageBoundary()) params.onTurnReset();
	};
	return { replyOptions: {
		onAssistantMessageStart: draftPreview.draftStream ? () => {
			handleAssistantMessageBoundary();
			return false;
		} : void 0,
		onReasoningEnd: draftPreview.draftStream ? () => {
			draftPreview.resetReasoningProgress();
			return false;
		} : void 0,
		onQueuedFollowupAdmitted: draftPreview.draftStream ? () => {
			if (draftPreview.handleQueuedFollowupAdmitted()) params.onTurnReset();
		} : void 0,
		suppressDefaultToolProgressMessages: params.sourceRepliesAreToolOnly && params.reactions.statusReactionsExplicitlyEnabled || draftPreview.suppressDefaultToolProgressMessages ? true : void 0,
		allowToolLifecycleWhenProgressHidden: params.reactions.statusReactionsEnabled ? true : void 0,
		commentaryProgressEnabled: draftPreview.isProgressMode ? draftPreview.commentaryProgressEnabled : void 0,
		progressPreambleEnabled: draftPreview.draftStream && draftPreview.isProgressMode ? true : void 0,
		commentaryPayloadsEnabled: draftPreview.isProgressMode ? draftPreview.commentaryProgressEnabled : void 0,
		shouldDeliverCommentaryPayloads: draftPreview.isProgressMode && draftPreview.commentaryProgressEnabled ? () => shouldYieldDraftCommentary() : void 0,
		reasoningPayloadsEnabled: reasoningDurableEnabled,
		onVerboseProgressVisibility: (isActive) => {
			shouldYieldDraftCommentary = isActive;
		},
		onNarrationUpdate: draftPreview.narrationProgressEnabled ? async (payload) => {
			if (abortSignal?.aborted || shouldYieldDraftCommentary()) return;
			await draftPreview.pushNarrationProgress(payload.text);
		} : void 0,
		onProgressNarratorLifecycle: draftPreview.narrationProgressEnabled ? (lifecycle) => draftPreview.setProgressNarratorLifecycle(lifecycle) : void 0,
		isProgressDraftVisible: draftPreview.narrationProgressEnabled ? () => draftPreview.isProgressDraftVisible : void 0,
		narrationHideCommandText: draftPreview.narrationHideCommandText ? true : void 0,
		onReasoningStream: async (payload) => {
			if (payload?.requiresReasoningProgressOptIn === true && !reasoningWindowEnabled) return false;
			await params.reactions.controller.setThinking();
			return await draftPreview.pushReasoningProgress(payload?.text, { snapshot: payload?.isReasoningSnapshot === true });
		},
		streamReasoningInNonStreamModes: reasoningWindowEnabled,
		onToolStart: async (payload) => {
			if (abortSignal?.aborted) return false;
			await params.reactions.maybeBindToToolReaction(payload);
			await params.reactions.controller.setTool(payload.name);
			return await draftPreview.pushToolEvent(payload);
		},
		onItemEvent: async (payload) => {
			if (payload.kind === "preamble") {
				if (shouldYieldDraftCommentary()) return;
				return await draftPreview.pushPreambleItemEvent(payload);
			}
			return await draftPreview.pushItemEvent(payload);
		},
		onPlanUpdate: async (payload) => {
			if (payload.phase === "update") return await draftPreview.pushPlanProgress(payload.steps, {
				explanation: payload.explanation,
				explanationFormat: payload.explanationFormat
			});
			return false;
		},
		onApprovalEvent: async (payload) => {
			return await draftPreview.pushApprovalEvent(payload);
		},
		onCommandOutput: async (payload) => {
			return await draftPreview.pushCommandOutputEvent(payload);
		},
		onPatchSummary: async (payload) => {
			return await draftPreview.pushPatchEvent(payload);
		},
		onCompactionStart: async () => {
			if (!abortSignal?.aborted) await params.reactions.controller.setCompacting();
			return false;
		},
		onCompactionEnd: async () => {
			if (!abortSignal?.aborted) {
				params.reactions.controller.cancelPending();
				await params.reactions.controller.setThinking();
			}
			return false;
		}
	} };
}
//#endregion
//#region extensions/discord/src/monitor/ack-reactions.ts
function createDiscordAckReactionContext(params) {
	return {
		rest: params.rest,
		...createDiscordRuntimeAccountContext({
			cfg: params.cfg,
			accountId: params.accountId
		})
	};
}
function createDiscordAckReactionAdapter(params) {
	return {
		setReaction: async (emoji) => {
			await reactMessageDiscord(params.channelId, params.messageId, emoji, params.reactionContext);
		},
		removeReaction: async (emoji) => {
			await removeReactionDiscord(params.channelId, params.messageId, emoji, params.reactionContext);
		}
	};
}
function queueInitialDiscordAckReaction(params) {
	if (params.enabled) {
		params.statusReactions.setQueued();
		return;
	}
	if (!params.shouldSendAckReaction || !params.ackReaction) return;
	params.reactionAdapter.setReaction(params.ackReaction).catch((err) => {
		logAckFailure({
			log: logVerbose,
			channel: "discord",
			target: params.target,
			error: err
		});
	});
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.process-reactions.ts
function readToolStringArg(args, key) {
	const value = args[key];
	return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readToolBooleanArg(args, key) {
	return args[key] === true;
}
function createDiscordMessageReactionRuntime(params) {
	const { ctx } = params;
	const { cfg, accountId, token, ackReactionScope, message, messageChannelId, isGuildMessage, isDirectMessage, isGroupDm, canDetectMention, effectiveWasMentioned, shouldBypassMention, route } = ctx;
	const ackReaction = resolveAckReaction(cfg, route.agentId, {
		channel: "discord",
		accountId
	});
	const shouldSendAckReaction = Boolean(ackReaction && shouldAckReaction({
		scope: ackReactionScope,
		inboundEventKind: ctx.inboundEventKind,
		isDirect: isDirectMessage,
		isGroup: isGuildMessage || isGroupDm,
		isMentionableGroup: isGuildMessage,
		canDetectMention,
		effectiveWasMentioned,
		shouldBypassMention
	}));
	const statusReactionsExplicitlyEnabled = cfg.messages?.statusReactions?.enabled === true;
	const statusReactionsEnabled = !params.isRoomEvent && shouldSendAckReaction && cfg.messages?.statusReactions?.enabled !== false && (!params.sourceRepliesAreToolOnly || statusReactionsExplicitlyEnabled);
	const feedbackRest = createDiscordRestClient({
		cfg,
		token,
		accountId
	}).rest;
	const deliveryRest = createDiscordRestClient({
		cfg,
		token,
		accountId
	}).rest;
	const ackReactionContext = createDiscordAckReactionContext({
		rest: feedbackRest,
		cfg,
		accountId
	});
	const discordAdapter = createDiscordAckReactionAdapter({
		channelId: messageChannelId,
		messageId: message.id,
		reactionContext: ackReactionContext
	});
	let statusReactionTarget = `${messageChannelId}/${message.id}`;
	let statusReactionsActive = statusReactionsEnabled;
	let statusReactions = createStatusReactionController({
		enabled: statusReactionsEnabled,
		adapter: discordAdapter,
		initialEmoji: ackReaction,
		presentation: "acknowledgement",
		onError: (err) => {
			logAckFailure({
				log: logVerbose,
				channel: "discord",
				target: statusReactionTarget,
				error: err
			});
		}
	});
	const resolveTrackedReactionChannelId = async (args) => {
		const target = readToolStringArg(args, "channelId") ?? readToolStringArg(args, "channel_id") ?? readToolStringArg(args, "to");
		if (!target) return messageChannelId;
		try {
			return resolveDiscordChannelId(target);
		} catch {
			return (await resolveDiscordTargetChannelId(target, {
				cfg,
				token,
				accountId
			})).channelId;
		}
	};
	const maybeBindToToolReaction = async (payload) => {
		if (params.sourceRepliesAreToolOnly || cfg.messages?.statusReactions?.enabled === false || payload.phase !== "start" || payload.name !== "message" || !payload.args) return;
		const args = payload.args;
		if (readToolStringArg(args, "action")?.toLowerCase() !== "react") return;
		if (!(readToolBooleanArg(args, "trackToolCalls") || readToolBooleanArg(args, "track_tool_calls"))) return;
		const emoji = readToolStringArg(args, "emoji");
		if (!emoji || readToolBooleanArg(args, "remove")) return;
		const trackedMessageId = readToolStringArg(args, "messageId") ?? readToolStringArg(args, "message_id") ?? message.id;
		let trackedChannelId;
		try {
			trackedChannelId = await resolveTrackedReactionChannelId(args);
		} catch (err) {
			logAckFailure({
				log: logVerbose,
				channel: "discord",
				target: `${readToolStringArg(args, "to") ?? readToolStringArg(args, "channelId") ?? messageChannelId}/${trackedMessageId}`,
				error: err
			});
			return;
		}
		statusReactionTarget = `${trackedChannelId}/${trackedMessageId}`;
		if (statusReactionsActive) statusReactions.clear();
		statusReactions = createStatusReactionController({
			enabled: true,
			adapter: createDiscordAckReactionAdapter({
				channelId: trackedChannelId,
				messageId: trackedMessageId,
				reactionContext: ackReactionContext
			}),
			initialEmoji: emoji,
			presentation: "acknowledgement",
			onError: (err) => {
				logAckFailure({
					log: logVerbose,
					channel: "discord",
					target: statusReactionTarget,
					error: err
				});
			}
		});
		statusReactionsActive = true;
		statusReactions.setQueued();
	};
	let initialAckReactionQueued = false;
	const queueInitialAckReactionAfterRecord = () => {
		if (initialAckReactionQueued) return;
		initialAckReactionQueued = true;
		if (statusReactionsEnabled) statusReactionsActive = true;
		queueInitialDiscordAckReaction({
			enabled: statusReactionsEnabled,
			shouldSendAckReaction,
			ackReaction,
			statusReactions,
			reactionAdapter: discordAdapter,
			target: `${messageChannelId}/${message.id}`
		});
	};
	const finish = async (result) => {
		if (statusReactionsActive) {
			if (result.dispatchAborted) {
				statusReactions.restoreInitial();
				return;
			}
			if (result.dispatchError || result.finalDeliveryFailed) await statusReactions.setError();
			else await statusReactions.setDone();
			statusReactions.restoreInitial();
		}
	};
	return {
		feedbackRest,
		deliveryRest,
		statusReactionsExplicitlyEnabled,
		statusReactionsEnabled,
		get controller() {
			return statusReactions;
		},
		maybeBindToToolReaction,
		queueInitialAckReactionAfterRecord,
		finish
	};
}
//#endregion
//#region extensions/discord/src/draft-chunking.ts
function resolveDiscordDraftStreamingChunking(cfg, accountId) {
	return resolveChannelDraftStreamingChunking(cfg, "discord", accountId, { fallbackLimit: DISCORD_TEXT_CHUNK_LIMIT });
}
//#endregion
//#region extensions/discord/src/draft-stream.ts
/** Discord messages cap at 2000 characters. */
const DISCORD_STREAM_MAX_CHARS = 2e3;
const DEFAULT_THROTTLE_MS = 1200;
const DISCORD_PREVIEW_ALLOWED_MENTIONS = { parse: [] };
function createDiscordDraftStream(params) {
	const maxChars = Math.min(params.maxChars ?? DISCORD_STREAM_MAX_CHARS, DISCORD_STREAM_MAX_CHARS);
	const throttleMs = Math.max(250, params.throttleMs ?? DEFAULT_THROTTLE_MS);
	const minInitialChars = params.minInitialChars;
	let channelId = params.channelId;
	const rest = params.rest;
	const flags = resolveDiscordMessageFlags({ suppressEmbeds: params.suppressEmbeds });
	const resolveReplyToMessageId = () => typeof params.replyToMessageId === "function" ? params.replyToMessageId() : params.replyToMessageId;
	const streamState = {
		stopped: false,
		final: false
	};
	let streamMessageId;
	let lastSentText = "";
	let streamGeneration = 0;
	let activeCreateGeneration;
	let discardActiveCreate = false;
	let pendingCleanupMessages = [];
	const sendOrEditStreamMessage = async ({ text, complete }) => {
		const generation = streamGeneration;
		if (streamState.stopped && !streamState.final) return false;
		const trimmed = text.trimEnd();
		if (!trimmed) return false;
		if (trimmed.length > maxChars) {
			streamState.stopped = true;
			params.warn?.(`discord stream preview stopped (text length ${trimmed.length} > ${maxChars})`);
			return false;
		}
		if (trimmed === lastSentText) return true;
		if (streamMessageId === void 0 && minInitialChars != null && !streamState.final && !complete) {
			if (trimmed.length < minInitialChars) return false;
		}
		lastSentText = trimmed;
		try {
			if (streamMessageId !== void 0) {
				await editChannelMessage(rest, channelId, streamMessageId, { body: {
					content: trimmed,
					allowed_mentions: DISCORD_PREVIEW_ALLOWED_MENTIONS,
					...flags ? { flags } : {}
				} });
				return true;
			}
			const replyToMessageId = resolveReplyToMessageId()?.trim();
			const messageReference = replyToMessageId ? {
				message_id: replyToMessageId,
				fail_if_not_exists: false
			} : void 0;
			activeCreateGeneration = generation;
			const sentMessageId = (await createChannelMessage(rest, channelId, { body: {
				content: trimmed,
				allowed_mentions: DISCORD_PREVIEW_ALLOWED_MENTIONS,
				...flags ? { flags } : {},
				...messageReference ? { message_reference: messageReference } : {}
			} }))?.id;
			const shouldDiscardStaleCreate = activeCreateGeneration === generation && discardActiveCreate;
			activeCreateGeneration = void 0;
			discardActiveCreate = false;
			if (generation !== streamGeneration) {
				if (shouldDiscardStaleCreate && typeof sentMessageId === "string" && sentMessageId) await deleteCleanupMessage({
					channelId,
					messageId: sentMessageId,
					warnPrefix: "discord stale stream preview cleanup failed"
				});
				return true;
			}
			if (typeof sentMessageId !== "string" || !sentMessageId) {
				streamState.stopped = true;
				params.warn?.("discord stream preview stopped (missing message id from send)");
				return false;
			}
			streamMessageId = sentMessageId;
			return true;
		} catch (err) {
			if (activeCreateGeneration === generation) {
				activeCreateGeneration = void 0;
				discardActiveCreate = false;
			}
			if (generation !== streamGeneration) return true;
			streamState.stopped = true;
			params.warn?.(`discord stream preview failed: ${formatErrorMessage(err)}`);
			return false;
		}
	};
	const { loop, update: updateDraft, stop, discardPending, seal } = createFinalizableDraftStreamControlsForState({
		throttleMs,
		coalesceInFlight: true,
		state: streamState,
		sendOrEditStreamMessage,
		emptyValue: {
			text: "",
			complete: false
		},
		isEmpty: (value) => !value.text
	});
	const update = (text, options) => updateDraft({
		text,
		complete: options?.complete === true
	});
	const forceNewMessage = (mode = "preserve") => {
		if (mode === "discard" && activeCreateGeneration !== void 0) discardActiveCreate = true;
		streamGeneration += 1;
		streamState.stopped = false;
		streamState.final = false;
		streamMessageId = void 0;
		lastSentText = "";
		loop.resetPending();
		loop.resetThrottleWindow();
	};
	const deleteCleanupMessage = async (message) => {
		try {
			await deleteChannelMessage(rest, message.channelId, message.messageId);
		} catch (err) {
			pendingCleanupMessages.push(message);
			params.warn?.(`${message.warnPrefix}: ${formatErrorMessage(err)}`);
		}
	};
	const cleanupPendingMessages = async () => {
		const pending = pendingCleanupMessages;
		pendingCleanupMessages = [];
		for (const message of pending) await deleteCleanupMessage(message);
	};
	const retarget = async (nextChannelId) => {
		const normalized = nextChannelId.trim();
		if (!normalized || normalized === channelId) return;
		await loop.waitForInFlight();
		const pending = loop.takePending();
		const previousChannelId = channelId;
		const previousMessageId = streamMessageId;
		const previousText = pending.text || lastSentText;
		streamGeneration += 1;
		channelId = normalized;
		streamMessageId = void 0;
		lastSentText = "";
		streamState.stopped = false;
		streamState.final = false;
		loop.resetThrottleWindow();
		if (previousText) {
			update(previousText, { complete: pending.text ? pending.complete : true });
			await loop.flush();
		}
		if (previousMessageId) {
			const stale = {
				channelId: previousChannelId,
				messageId: previousMessageId,
				warnPrefix: "discord stream preview retarget cleanup failed"
			};
			if (!streamMessageId) {
				pendingCleanupMessages.push(stale);
				throw new Error("discord stream preview retarget replacement failed");
			}
			await deleteCleanupMessage(stale);
		}
	};
	const deleteCurrentMessage = async () => {
		loop.resetPending();
		await loop.waitForInFlight();
		const currentMessage = streamMessageId ? {
			channelId,
			messageId: streamMessageId,
			warnPrefix: "discord stream preview cleanup failed"
		} : void 0;
		streamMessageId = void 0;
		lastSentText = "";
		loop.resetThrottleWindow();
		if (!currentMessage) return;
		await deleteCleanupMessage(currentMessage);
	};
	const clear = async () => {
		await discardPending();
		await deleteCurrentMessage();
	};
	params.log?.(`discord stream preview ready (maxChars=${maxChars}, throttleMs=${throttleMs})`);
	return {
		update,
		flush: loop.flush,
		messageId: () => streamMessageId,
		clear,
		deleteCurrentMessage,
		discardPending,
		seal,
		stop,
		retarget,
		cleanupPendingMessages,
		forceNewMessage
	};
}
//#endregion
//#region extensions/discord/src/preview-streaming.ts
function resolveDiscordPreviewStreamMode(params = {}) {
	return resolveChannelPreviewStreamMode(params, "off");
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.draft-preview.ts
function createDiscordDraftPreviewController(params) {
	const discordStreamMode = resolveDiscordPreviewStreamMode(params.discordConfig);
	const hookRunner = getGlobalHookRunner();
	const allowProviderPreview = !params.groupThread && !((hookRunner?.hasHooks("reply_payload_sending") ?? false) || (hookRunner?.hasHooks("message_sending") ?? false));
	const draftMaxChars = Math.min(params.textLimit, 2e3);
	const canStreamProgressDraftForToolOnlySource = params.sourceRepliesAreToolOnly && discordStreamMode === "progress";
	const previewAvailable = allowProviderPreview && (!params.sourceRepliesAreToolOnly || canStreamProgressDraftForToolOnlySource) && discordStreamMode !== "off";
	const accountBlockStreamingEnabled = resolveChannelStreamingBlockEnabled(params.discordConfig, {
		previewAvailable,
		blockStreamingDefault: params.cfg.agents?.defaults?.blockStreamingDefault
	});
	const draftStream = previewAvailable && !accountBlockStreamingEnabled ? createDiscordDraftStream({
		rest: params.deliveryRest,
		channelId: params.deliverChannelId,
		maxChars: draftMaxChars,
		replyToMessageId: () => params.replyReference.peek(),
		minInitialChars: discordStreamMode === "progress" ? 0 : 30,
		suppressEmbeds: params.discordConfig?.suppressEmbeds ?? true,
		throttleMs: 1200,
		log: params.log,
		warn: params.log
	}) : void 0;
	const draftChunking = draftStream && discordStreamMode === "block" ? resolveDiscordDraftStreamingChunking(params.cfg, params.accountId) : void 0;
	const shouldSplitPreviewMessages = discordStreamMode === "block";
	const draftChunker = draftChunking ? new EmbeddedBlockChunker(draftChunking) : void 0;
	let lastPartialText = "";
	let draftText = "";
	let hasStreamedAssistantText = false;
	let finalizedViaPreviewMessage = false;
	let finalReplyError;
	let progressDraftStartedBeforeFinal = false;
	let progressDraftCollapsed = false;
	let progressNarratorLifecycle;
	const narrationProgressEnabled = Boolean(draftStream) && discordStreamMode === "progress" && resolveChannelStreamingProgressNarration(params.discordConfig);
	const narrationHideCommandText = narrationProgressEnabled && resolveChannelStreamingPreviewCommandText(params.discordConfig) === "status";
	const progressSeed = `${params.accountId}:${params.deliverChannelId}`;
	const progressDraft = createChannelProgressDraftCompositor({
		entry: params.discordConfig,
		mode: discordStreamMode,
		active: Boolean(draftStream),
		seed: progressSeed,
		reasoningLinePrefix: "🧠 ",
		commentaryLinePrefix: "💬 ",
		commentaryItalics: false,
		update: async (previewText, options) => {
			if (!draftStream) return false;
			lastPartialText = previewText;
			draftText = previewText;
			draftChunker?.reset();
			draftStream.update(previewText, { complete: true });
			if (options?.flush) await draftStream.flush();
			return Boolean(draftStream.messageId());
		},
		deleteCurrent: async () => {
			lastPartialText = "";
			draftText = "";
			hasStreamedAssistantText = false;
			await draftStream?.deleteCurrentMessage();
		},
		isEmptyLine: isEmptyDiscordProgressLine,
		shouldStartNow: shouldStartDiscordProgressDraftNow
	});
	const resetProgressState = () => {
		lastPartialText = "";
		draftText = "";
		hasStreamedAssistantText = false;
		draftChunker?.reset();
	};
	const forceNewMessageIfNeeded = () => {
		if (shouldSplitPreviewMessages && hasStreamedAssistantText) {
			params.log("discord: calling forceNewMessage() for draft stream");
			draftStream?.forceNewMessage();
		}
		resetProgressState();
	};
	const beginNewProgressTurn = (options) => {
		const beganNewTurn = progressDraft.beginNewTurn(options);
		if (!beganNewTurn) progressDraft.beginAssistantMessage();
		if (beganNewTurn) {
			progressDraftCollapsed = false;
			progressDraftStartedBeforeFinal = false;
			finalReplyError = void 0;
			finalizedViaPreviewMessage = false;
			progressNarratorLifecycle?.beginTurn();
		}
		if (discordStreamMode === "progress") {
			if (beganNewTurn) draftStream?.forceNewMessage("discard");
		} else forceNewMessageIfNeeded();
		return beganNewTurn;
	};
	return {
		draftStream,
		narrationProgressEnabled,
		narrationHideCommandText,
		commentaryProgressEnabled: progressDraft.commentaryProgressEnabled,
		suppressDefaultToolProgressMessages: progressDraft.suppressDefaultToolProgressMessages,
		get isProgressMode() {
			return discordStreamMode === "progress";
		},
		get hasProgressDraftStarted() {
			return progressDraft.hasStarted;
		},
		get isProgressDraftVisible() {
			return progressDraft.isVisible;
		},
		get hasProgressDraftToCollapse() {
			return !progressDraftCollapsed && (progressDraft.hasStarted || progressDraftStartedBeforeFinal);
		},
		markProgressDraftCollapsed() {
			progressDraftCollapsed = true;
			progressDraftStartedBeforeFinal = false;
		},
		get finalizedViaPreviewMessage() {
			return finalizedViaPreviewMessage;
		},
		setProgressNarratorLifecycle(lifecycle) {
			progressNarratorLifecycle = lifecycle;
		},
		markFinalReplyStarted() {
			progressDraftStartedBeforeFinal ||= progressDraft.hasStarted;
			progressDraft.markFinalReplyStarted();
			progressNarratorLifecycle?.stopTurn();
		},
		markFinalReplyDelivered(isError = false) {
			finalReplyError = isError;
			progressDraft.markFinalReplyDelivered();
		},
		markPreviewFinalized() {
			finalizedViaPreviewMessage = true;
		},
		async retarget(channelId) {
			await draftStream?.retarget(channelId);
		},
		async finalizeProgressDraft() {
			if (!draftStream || discordStreamMode !== "progress") return false;
			const progressText = lastPartialText.trimEnd();
			if (!progressText) return false;
			draftStream.update(progressText);
			await draftStream.stop();
			if (!draftStream.messageId()) return false;
			finalizedViaPreviewMessage = true;
			return true;
		},
		disableBlockStreamingForDraft: draftStream ? true : void 0,
		pushToolEvent: progressDraft.pushToolEvent,
		pushItemEvent: progressDraft.pushItemEvent,
		pushApprovalEvent: progressDraft.pushApprovalEvent.bind(progressDraft),
		pushCommandOutputEvent: progressDraft.pushCommandOutputEvent,
		pushPatchEvent: progressDraft.pushPatchEvent,
		pushPlanProgress: progressDraft.pushPlanProgress.bind(progressDraft),
		pushReasoningProgress: progressDraft.pushReasoningProgress.bind(progressDraft),
		pushNarrationProgress: progressDraft.pushNarrationProgress.bind(progressDraft),
		async pushPreambleItemEvent(payload) {
			const headlineAccepted = await progressDraft.pushPreambleHeadline(payload.progressText, { itemId: payload.itemId });
			if (!progressDraft.commentaryProgressEnabled) return headlineAccepted;
			const commentaryAccepted = await progressDraft.pushCommentaryProgress(payload.progressText, { itemId: payload.itemId });
			return headlineAccepted || commentaryAccepted;
		},
		resolvePreviewFinalText(text) {
			if (typeof text !== "string") return;
			const formatted = convertMarkdownTables(stripInlineDirectiveTagsForDelivery(text).text, params.tableMode);
			const chunks = chunkDiscordTextWithMode(formatted, {
				maxChars: draftMaxChars,
				maxLines: params.maxLinesPerMessage,
				chunkMode: params.chunkMode
			});
			if (!chunks.length && formatted) chunks.push(formatted);
			if (chunks.length !== 1) return;
			const trimmed = expectDefined(chunks.at(0), "single Discord preview chunk").trim();
			if (!trimmed) return;
			const currentPreviewText = discordStreamMode === "block" ? draftText : lastPartialText;
			if (currentPreviewText && currentPreviewText.startsWith(trimmed) && trimmed.length < currentPreviewText.length) return;
			return trimmed;
		},
		updateFromPartial(text) {
			if (!draftStream || !text) return;
			const cleaned = stripInlineDirectiveTagsForDelivery(stripReasoningTagsFromText(text, {
				mode: "strict",
				trim: "both"
			})).text;
			if (!cleaned || cleaned.startsWith("Reasoning:\n")) return;
			if (cleaned === lastPartialText) return;
			if (discordStreamMode === "progress") return;
			progressDraft.resetActivity({ suppressed: true });
			hasStreamedAssistantText = true;
			if (discordStreamMode === "partial") {
				if (lastPartialText && lastPartialText.startsWith(cleaned) && cleaned.length < lastPartialText.length) return;
				lastPartialText = cleaned;
				draftStream.update(cleaned);
				return;
			}
			let delta = cleaned;
			if (cleaned.startsWith(lastPartialText)) delta = cleaned.slice(lastPartialText.length);
			else {
				draftChunker?.reset();
				draftText = "";
			}
			lastPartialText = cleaned;
			if (!delta) return;
			if (!draftChunker) {
				draftText = cleaned;
				draftStream.update(draftText);
				return;
			}
			draftChunker.append(delta);
			draftChunker.drain({
				force: false,
				emit: (chunk) => {
					draftText += chunk;
					draftStream.update(draftText);
				}
			});
		},
		handleAssistantMessageBoundary() {
			return beginNewProgressTurn();
		},
		resetReasoningProgress: progressDraft.resetReasoningProgress,
		handleQueuedFollowupAdmitted() {
			return beginNewProgressTurn({ force: true });
		},
		async flush() {
			if (!draftStream) return;
			if (draftChunker?.hasBuffered()) {
				draftChunker.drain({
					force: true,
					emit: (chunk) => {
						draftText += chunk;
					}
				});
				draftChunker.reset();
				if (draftText) draftStream.update(draftText);
			}
			await draftStream.flush();
		},
		async cleanup({ finalDeliveryFailed = false } = {}) {
			try {
				progressDraft.cancel();
				if (finalReplyError !== false) await draftStream?.discardPending();
				if (!(discordStreamMode === "progress" && finalDeliveryFailed) && finalReplyError !== true && !finalizedViaPreviewMessage && draftStream?.messageId()) await draftStream.clear();
				await draftStream?.cleanupPendingMessages();
			} catch (err) {
				params.log(`discord: draft cleanup failed: ${String(err)}`);
			}
		}
	};
}
function isEmptyDiscordProgressLine(line) {
	if (!line || typeof line === "string") return false;
	return line.toolName === "apply_patch" && !line.detail && !line.status;
}
function shouldStartDiscordProgressDraftNow(line) {
	return typeof line === "object" && line?.kind === "patch" && Boolean(line.detail);
}
//#endregion
//#region extensions/discord/src/monitor/reply-typing-feedback.ts
const DISCORD_REPLY_TYPING_MAX_DURATION_MS = 12e5;
function createDiscordReplyTypingFeedback(params) {
	const rest = params.rest ?? createDiscordRestClient({
		cfg: params.cfg,
		token: params.token,
		accountId: params.accountId
	}).rest;
	return createTypingCallbacks({
		start: () => sendTyping({
			rest,
			channelId: params.channelId
		}),
		onStartError: (err) => {
			logTypingFailure({
				log: params.log,
				channel: "discord",
				target: params.channelId,
				error: err
			});
		},
		keepaliveIntervalMs: params.keepaliveIntervalMs,
		maxDurationMs: params.maxDurationMs ?? DISCORD_REPLY_TYPING_MAX_DURATION_MS
	});
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.process-reply-runtime.ts
function formatDiscordGroupThreadReply(text, participant) {
	return `**${participant.name.replace(/[\\`*_{}[\]()<>#!|]/g, "\\$&").replace(/\s+/g, " ")}**\n${text}`;
}
function formatDiscordReasoningQuote(quoteText) {
	const lines = quoteText.split("\n").map((line) => line.trim()).filter(Boolean);
	if (!lines.length) return;
	lines[0] = `🧠 ${lines[0]}`;
	return lines.map((line) => `> ${line}`).join("\n");
}
function createDiscordBeforePayloadDelivery(params) {
	return (payload, info) => {
		if (params.abortSignal?.aborted) {
			logVerbose(formatDiscordReplySkip({
				kind: info.kind,
				reason: "aborted before delivery",
				target: params.getDeliverTarget(),
				sessionKey: params.sessionKey
			}));
			return null;
		}
		if (payload.isReasoning || payload.isCommentary) return payload;
		if (params.draftPreview.draftStream && params.draftPreview.isProgressMode && info.kind === "block" && !resolveSendableOutboundReplyParts(payload).hasMedia && !payload.isError) return null;
		if (info.kind === "final" && !params.isFallbackOnlyToolWarningFinal(payload)) params.draftPreview.markFinalReplyStarted();
		return payload;
	};
}
function createDiscordMessageReplyRuntime(params) {
	const { ctx, processContext } = params;
	const { cfg, discordConfig, accountId, token, guildHistories, historyLimit, textLimit, messageChannelId, isDirectMessage, route } = ctx;
	const { ctxPayload, deliverTarget, replyReference } = processContext;
	const typingChannelId = deliverTarget.startsWith("channel:") ? deliverTarget.slice(8) : messageChannelId;
	let typingFeedback;
	const getTypingFeedback = () => typingFeedback ??= createDiscordReplyTypingFeedback({
		cfg,
		token,
		accountId,
		channelId: typingChannelId,
		rest: params.feedbackRest,
		log: logVerbose,
		keepaliveIntervalMs: params.shouldDisableCoreTypingKeepalive ? void 0 : 0
	});
	const { onModelSelected, ...replyPipeline } = createChannelMessageReplyPipeline({
		cfg,
		agentId: route.agentId,
		channel: "discord",
		accountId: route.accountId,
		typingCallbacks: {
			onReplyStart: () => getTypingFeedback().onReplyStart(),
			onIdle: () => typingFeedback?.onIdle?.(),
			onCleanup: () => typingFeedback?.onCleanup?.()
		}
	});
	const tableMode = resolveMarkdownTableMode({
		cfg,
		channel: "discord",
		accountId
	});
	const maxLinesPerMessage = resolveDiscordMaxLinesPerMessage({
		cfg,
		discordConfig,
		accountId
	});
	const chunkMode = resolveChunkMode(cfg, "discord", accountId);
	const clearGroupHistory = () => {
		if (isDirectMessage) return;
		createChannelHistoryWindow({ historyMap: guildHistories }).clear({
			historyKey: messageChannelId,
			limit: historyLimit
		});
	};
	const beginDeliveryCorrelation = () => params.isRoomEvent ? discordInboundEventDelivery.begin(ctxPayload.SessionKey, {
		outboundTo: messageChannelId,
		outboundAccountId: route.accountId,
		markInboundEventDelivered: clearGroupHistory
	}, { inboundEventKind: ctxPayload.InboundEventKind }) : () => {};
	const endDeliveryCorrelation = beginDeliveryCorrelation();
	const resolveCurrentTurnTranscriptFinalText = async () => {
		const sessionKey = ctxPayload.SessionKey;
		if (!sessionKey) return;
		try {
			const storePath = resolveStorePath(cfg.session?.store, { agentId: route.agentId });
			const sessionEntry = getSessionEntry({
				agentId: route.agentId,
				sessionKey,
				storePath
			});
			if (!sessionEntry?.sessionId) return;
			const latest = await readLatestAssistantTextByIdentity({
				agentId: route.agentId,
				sessionId: sessionEntry.sessionId,
				sessionKey,
				storePath
			});
			if (!latest?.timestamp || latest.timestamp < params.dispatchStartedAt) return;
			return latest.text;
		} catch (err) {
			logVerbose(`discord transcript final candidate lookup failed: ${String(err)}`);
			return;
		}
	};
	const deliverChannelId = deliverTarget.startsWith("channel:") ? deliverTarget.slice(8) : messageChannelId;
	return {
		replyPipeline,
		onModelSelected,
		tableMode,
		maxLinesPerMessage,
		chunkMode,
		beginQueuedDeliveryCorrelation: beginDeliveryCorrelation,
		endDeliveryCorrelation,
		resolveCurrentTurnTranscriptFinalText,
		deliverChannelId,
		draftPreview: createDiscordDraftPreviewController({
			groupThread: Boolean(ctxPayload.GroupThread),
			cfg,
			discordConfig,
			accountId,
			sourceRepliesAreToolOnly: params.sourceRepliesAreToolOnly,
			textLimit,
			deliveryRest: params.deliveryRest,
			deliverChannelId,
			replyReference,
			tableMode,
			maxLinesPerMessage,
			chunkMode,
			log: logVerbose
		}),
		resolvedBlockStreamingEnabled: resolveChannelStreamingBlockEnabled(discordConfig)
	};
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.process-thread-route.ts
function createDiscordMessageActiveThreadRoute(params) {
	let adoptedThreadId;
	let threadReplyDelivered = false;
	let onThreadAdopted;
	return {
		replyReference: {
			peek: () => adoptedThreadId ? void 0 : params.sourceReplyReference.peek(),
			use: () => adoptedThreadId ? void 0 : params.sourceReplyReference.use(),
			markSent: () => params.sourceReplyReference.markSent(),
			hasReplied: () => Boolean(adoptedThreadId) || params.sourceReplyReference.hasReplied()
		},
		bindThreadAdoption(callback) {
			onThreadAdopted = callback;
		},
		get threadReplyDelivered() {
			return threadReplyDelivered;
		},
		end: beginDiscordActiveTurnThreadRoute(params.sessionKey, {
			accountId: params.accountId,
			sourceChannelId: params.sourceChannelId,
			sourceMessageId: params.sourceMessageId,
			onThreadAdopted: async (threadId) => {
				adoptedThreadId = threadId;
				await onThreadAdopted?.(threadId);
			},
			onThreadReplyDelivered: () => {
				threadReplyDelivered = true;
			},
			onThreadAdoptionError: (error) => {
				params.log(`discord: failed to move active progress into adopted thread (${String(error)})`);
			}
		})
	};
}
//#endregion
//#region extensions/discord/src/monitor/message-handler.process.ts
const TARGETED_ONLY_ALLOWED_MENTIONS = { parse: ["users", "roles"] };
function isFallbackOnlyToolWarningFinal(payload) {
	if (payload.isError !== true || !isReplyPayloadNonTerminalToolErrorWarning(payload)) return false;
	return !resolveSendableOutboundReplyParts(payload).hasMedia;
}
async function processDiscordMessage(ctx, observer) {
	const dispatchStartedAt = Date.now();
	const { cfg, accountId, token, runtime, textLimit, replyToMode, message, messageChannelId, isGuildMessage, isDirectMessage, isGroupDm, messageText, threadBindings, route, abortSignal, turnAdoptionLifecycle, preparedMedia: mediaList } = ctx;
	if (abortSignal?.aborted) return;
	const text = messageText;
	if (!text && mediaList.length === 0) {
		logVerbose("discord: drop message " + message.id + " (empty content)");
		return;
	}
	const boundThreadId = ctx.threadBinding?.conversation?.conversationId?.trim();
	if (boundThreadId && typeof threadBindings.touchThread === "function") threadBindings.touchThread({ threadId: boundThreadId });
	const sourceReplyDeliveryMode = resolveChannelMessageSourceReplyDeliveryMode({
		cfg,
		ctx: {
			ChatType: isDirectMessage ? "direct" : isGroupDm ? "group" : isGuildMessage ? "channel" : void 0,
			InboundEventKind: ctx.inboundEventKind
		}
	});
	const sourceRepliesAreToolOnly = sourceReplyDeliveryMode === "message_tool_only";
	const configuredTypingMode = resolveAgentConfig$1(cfg, route.agentId)?.typingMode ?? cfg.agents?.defaults?.typingMode;
	const configuredTypingInterval = cfg.agents?.defaults?.typingIntervalSeconds;
	const shouldDisableCoreTypingKeepalive = sourceRepliesAreToolOnly && configuredTypingMode === void 0 && configuredTypingInterval === void 0;
	const mediaLocalRoots = getAgentScopedMediaLocalRoots(cfg, route.agentId);
	const isRoomEvent = ctx.inboundEventKind === "room_event";
	const reactions = createDiscordMessageReactionRuntime({
		ctx,
		sourceRepliesAreToolOnly,
		isRoomEvent
	});
	const processContext = await buildDiscordMessageProcessContext({
		ctx,
		text,
		mediaList
	});
	if (!processContext) return;
	const { ctxPayload, persistedSessionKey, turn, replyPlan, deliverTarget: initialDeliverTarget, replyTarget, replyReference: sourceReplyReference } = processContext;
	let deliverTarget = initialDeliverTarget;
	const activeThreadRoute = createDiscordMessageActiveThreadRoute({
		sessionKey: ctxPayload.SessionKey,
		accountId,
		sourceChannelId: messageChannelId,
		sourceMessageId: ctx.canonicalMessageId ?? message.id,
		sourceReplyReference,
		log: logVerbose
	});
	const replyReference = activeThreadRoute.replyReference;
	observer?.onReplyPlanResolved?.({
		createdThreadId: replyPlan.createdThreadId,
		sessionKey: persistedSessionKey
	});
	const { replyPipeline, onModelSelected, tableMode, maxLinesPerMessage, chunkMode, beginQueuedDeliveryCorrelation, endDeliveryCorrelation, resolveCurrentTurnTranscriptFinalText, deliverChannelId: initialDeliverChannelId, draftPreview, resolvedBlockStreamingEnabled } = createDiscordMessageReplyRuntime({
		ctx,
		processContext: {
			...processContext,
			replyReference
		},
		sourceRepliesAreToolOnly,
		shouldDisableCoreTypingKeepalive,
		isRoomEvent,
		dispatchStartedAt,
		feedbackRest: reactions.feedbackRest,
		deliveryRest: reactions.deliveryRest
	});
	let deliverChannelId = initialDeliverChannelId;
	activeThreadRoute.bindThreadAdoption(async (threadId) => {
		deliverTarget = `channel:${threadId}`;
		deliverChannelId = threadId;
		await draftPreview.retarget(threadId);
	});
	let finalReplyStartNotified = false;
	const notifyFinalReplyStart = () => {
		if (finalReplyStartNotified) return;
		finalReplyStartNotified = true;
		draftPreview.markFinalReplyStarted();
		observer?.onFinalReplyStart?.();
	};
	let userFacingFinalDelivered = false;
	let userFacingFinalDeliveryFailed = false;
	let pendingToolWarningFinal;
	const markFinalReplyDelivered = (isError = false) => {
		draftPreview.markFinalReplyDelivered(isError);
		if (!isError) {
			userFacingFinalDelivered = true;
			userFacingFinalDeliveryFailed = false;
			pendingToolWarningFinal = void 0;
			observer?.onFinalReplyDelivered?.();
		}
	};
	let clearProgressDraftAfterFinalDelivery = false;
	const resetDeliveryState = () => {
		finalReplyStartNotified = false;
		userFacingFinalDelivered = false;
		userFacingFinalDeliveryFailed = false;
		pendingToolWarningFinal = void 0;
		clearProgressDraftAfterFinalDelivery = false;
	};
	const progress = createDiscordMessageProgressRuntime({
		ctx,
		sessionKey: ctxPayload.SessionKey,
		sourceRepliesAreToolOnly,
		draftPreview,
		reactions,
		onTurnReset: resetDeliveryState
	});
	let replyLifecycleStarted = false;
	const onDiscordReplyStart = async () => {
		if (abortSignal?.aborted) return;
		replyLifecycleStarted = true;
		await replyPipeline.typingCallbacks?.onReplyStart();
		await reactions.controller.setThinking();
	};
	const beforeDiscordPayloadDelivery = createDiscordBeforePayloadDelivery({
		abortSignal,
		getDeliverTarget: () => deliverTarget,
		sessionKey: ctxPayload.SessionKey,
		draftPreview,
		isFallbackOnlyToolWarningFinal
	});
	const deliverDiscordPayload = async (incomingPayload, info, options) => {
		if (abortSignal?.aborted) {
			logVerbose(formatDiscordReplySkip({
				kind: info.kind,
				reason: "aborted before delivery",
				target: deliverTarget,
				sessionKey: ctxPayload.SessionKey
			}));
			return { visibleReplySent: false };
		}
		const deliverySession = options?.deliverySession ?? getGroupThreadDeliverySession();
		const deliveryOptions = {
			cfg,
			token,
			accountId,
			rest: reactions.deliveryRest,
			runtime,
			replyToMode,
			textLimit,
			maxLinesPerMessage,
			tableMode,
			chunkMode,
			sessionKey: deliverySession?.sessionKey ?? ctxPayload.SessionKey,
			threadBindings,
			mediaLocalRoots: deliverySession ? getAgentScopedMediaLocalRoots(cfg, deliverySession.agentId) : mediaLocalRoots,
			bindPendingFinalDelivery: info.bindPendingFinalDelivery,
			onPlatformSendDispatch: info.onPlatformSendDispatch,
			assertPlatformSendAuthorized: info.assertPlatformSendAuthorized
		};
		let payload = incomingPayload;
		if (info.participant && (payload.text || payload.mediaUrl || payload.mediaUrls?.length)) payload = {
			...payload,
			text: formatDiscordGroupThreadReply(payload.text ?? "", info.participant)
		};
		const isFinal = info.kind === "final";
		if (payload.isReasoning) {
			const raw = (payload.text ?? "").trim();
			const body = raw.startsWith("Reasoning:\n") ? raw.slice(11).trim() : raw;
			if (!body) return { visibleReplySent: false };
			const chunkLimit = Math.max(256, Math.min(textLimit, 2e3) - 8);
			const chunks = chunkDiscordTextWithMode(body, {
				maxChars: chunkLimit,
				maxLines: maxLinesPerMessage,
				chunkMode
			});
			const replies = (chunks.length ? chunks : [body]).map((chunk) => formatDiscordReasoningQuote(chunk)).filter((quote) => Boolean(quote)).map((quote) => Object.assign({}, payload, {
				text: quote,
				isReasoning: void 0
			}));
			if (!replies.length) return { visibleReplySent: false };
			const result = await deliverDiscordReply({
				...deliveryOptions,
				replies,
				target: deliverTarget,
				replyToId: replyReference.use(),
				kind: "block"
			});
			if (result.visibleReplySent) replyReference.markSent();
			return result;
		}
		if (isFinal && !options?.allowFallbackOnlyToolWarning && isFallbackOnlyToolWarningFinal(payload)) {
			if (!userFacingFinalDelivered && (!finalReplyStartNotified || userFacingFinalDeliveryFailed)) pendingToolWarningFinal = {
				payload,
				info,
				deliverySession
			};
			return { visibleReplySent: false };
		}
		if (isFinal) draftPreview.markFinalReplyStarted();
		const finalText = isFinal && !ctxPayload.GroupThread && typeof payload.text === "string" ? await resolveTranscriptBackedChannelFinalText({
			payload,
			finalText: payload.text,
			resolveCandidateText: resolveCurrentTurnTranscriptFinalText
		}) : payload.text;
		const effectivePayload = finalText !== payload.text ? {
			...payload,
			text: finalText
		} : payload;
		const [deliverablePayload] = sanitizeDiscordFrontChannelReplyPayloads([effectivePayload], { kind: info.kind });
		if (!deliverablePayload) {
			logVerbose(formatDiscordReplySkip({
				kind: info.kind,
				reason: "internal-only payload",
				target: deliverTarget,
				sessionKey: ctxPayload.SessionKey
			}));
			return { visibleReplySent: false };
		}
		if (isFinal && !replyLifecycleStarted && !isRoomEvent && configuredTypingMode !== "never") await onDiscordReplyStart();
		const draftStream = draftPreview.draftStream;
		if (draftStream && draftPreview.isProgressMode && info.kind === "block" && !deliverablePayload.isCommentary && !options?.allowProgressBlock) {
			if (!resolveSendableOutboundReplyParts(deliverablePayload).hasMedia && !deliverablePayload.isError) return { visibleReplySent: false };
		}
		if (draftStream && isFinal && draftPreview.isProgressMode && !deliverablePayload.isError && draftPreview.hasProgressDraftToCollapse && draftStream) {
			await draftPreview.flush();
			clearProgressDraftAfterFinalDelivery = true;
		}
		if (draftStream && isFinal && !draftPreview.isProgressMode && !deliverablePayload.isError) {
			const ttsSupplement = getReplyPayloadTtsSupplement(deliverablePayload);
			if ((await deliverWithFinalizableLivePreviewAdapter({
				kind: info.kind,
				payload: deliverablePayload,
				adapter: defineFinalizableLivePreviewAdapter({
					draft: {
						flush: () => draftPreview.flush(),
						clear: () => draftStream.clear(),
						discardPending: () => draftStream.discardPending(),
						seal: () => draftStream.seal(),
						id: draftStream.messageId
					},
					buildFinalEdit: () => {},
					editFinal: async (previewMessageId, edit) => {
						if (abortSignal?.aborted) throw new Error("process aborted");
						notifyFinalReplyStart();
						await editMessageDiscord(deliverChannelId, previewMessageId, edit, {
							cfg,
							accountId,
							rest: reactions.deliveryRest
						});
					},
					onPreviewFinalized: () => {
						markFinalReplyDelivered();
						draftPreview.markPreviewFinalized();
						replyReference.markSent();
					},
					logPreviewEditFailure: (err) => {
						logVerbose(`discord: preview final edit failed; falling back to standard send (${String(err)})`);
					}
				}),
				deliverNormally: async () => {
					if (abortSignal?.aborted) return false;
					const fallbackPayload = ttsSupplement && ttsSupplement.visibleTextAlreadyDelivered !== true && !deliverablePayload.text?.trim() ? {
						...deliverablePayload,
						text: ttsSupplement.spokenText
					} : deliverablePayload;
					const allowedMentions = discordTextHasBroadcastMention(fallbackPayload.text ?? "") ? TARGETED_ONLY_ALLOWED_MENTIONS : void 0;
					const replyToId = replyReference.use();
					notifyFinalReplyStart();
					return (await deliverDiscordReply({
						...deliveryOptions,
						replies: [fallbackPayload],
						target: deliverTarget,
						replyToId,
						allowedMentions,
						kind: info.kind
					})).visibleReplySent;
				},
				onNormalDelivered: () => {
					markFinalReplyDelivered();
					replyReference.markSent();
				}
			})).kind !== "normal-skipped") return { visibleReplySent: true };
		}
		if (abortSignal?.aborted) {
			logVerbose(formatDiscordReplySkip({
				kind: info.kind,
				reason: "aborted before delivery",
				target: deliverTarget,
				sessionKey: ctxPayload.SessionKey
			}));
			return { visibleReplySent: false };
		}
		const replyToId = replyReference.use();
		if (isFinal) notifyFinalReplyStart();
		const result = await deliverDiscordReply({
			...deliveryOptions,
			replies: [deliverablePayload],
			target: deliverTarget,
			replyToId,
			kind: info.kind
		});
		if (!result.visibleReplySent) return result;
		replyReference.markSent();
		if (isFinal) {
			markFinalReplyDelivered(deliverablePayload.isError === true);
			if (deliverablePayload.isError !== true && clearProgressDraftAfterFinalDelivery) {
				clearProgressDraftAfterFinalDelivery = false;
				draftPreview.markProgressDraftCollapsed();
				await draftStream?.discardPending();
				await draftStream?.clear();
			}
		}
		return result;
	};
	const onDiscordDeliveryError = (err, info) => {
		if (info.kind === "final" && finalReplyStartNotified && !userFacingFinalDelivered) userFacingFinalDeliveryFailed = true;
		runtime.error(danger(formatDiscordReplyDeliveryFailure({
			kind: info.kind,
			err,
			target: deliverTarget,
			sessionKey: ctxPayload.SessionKey
		})));
	};
	let dispatchResult = null;
	let dispatchError = false;
	let dispatchAborted = false;
	const deliverPendingToolWarningFinalIfNeeded = async () => {
		if (!pendingToolWarningFinal || userFacingFinalDelivered || abortSignal?.aborted) return;
		const pending = pendingToolWarningFinal;
		pendingToolWarningFinal = void 0;
		try {
			return await deliverDiscordPayload(pending.payload, pending.info, {
				allowFallbackOnlyToolWarning: true,
				deliverySession: pending.deliverySession
			});
		} catch (err) {
			dispatchError = true;
			onDiscordDeliveryError(err, pending.info);
			return { visibleReplySent: false };
		}
	};
	try {
		if (abortSignal?.aborted) {
			dispatchAborted = true;
			return;
		}
		const preparedResult = await dispatchChannelInboundTurn({
			cfg,
			channel: "discord",
			accountId: route.accountId,
			outboundEchoSourceId: resolveDiscordWebhookId(message) ?? void 0,
			route: {
				agentId: route.agentId,
				sessionKey: persistedSessionKey
			},
			ctxPayload,
			afterRecord: reactions.queueInitialAckReactionAfterRecord,
			sessionInitRetry: {
				delaysMs: [
					250,
					1e3,
					2500
				],
				signal: abortSignal,
				sleep: sleepWithAbort
			},
			dispatcherOptions: {
				...replyPipeline,
				humanDelay: resolveHumanDelayConfig(cfg, route.agentId),
				beforeDeliver: beforeDiscordPayloadDelivery,
				onReplyStart: onDiscordReplyStart,
				onFreshSettledDelivery: deliverPendingToolWarningFinalIfNeeded
			},
			delivery: {
				deliverWithProviderMessageSending: deliverDiscordPayload,
				onError: onDiscordDeliveryError
			},
			record: turn.record,
			history: isRoomEvent ? void 0 : {
				isGroup: isGuildMessage,
				historyKey: messageChannelId,
				historyMap: ctx.guildHistories,
				limit: ctx.historyLimit
			},
			replyOptions: {
				groupThreadReplyFormatter: formatDiscordGroupThreadReply,
				...turnAdoptionLifecycle ? bindIngressLifecycleToReplyOptions(turnAdoptionLifecycle) : {},
				abortSignal,
				skillFilter: ctx.channelConfig?.skills,
				sourceReplyDeliveryMode,
				typingKeepalive: shouldDisableCoreTypingKeepalive ? false : void 0,
				queuedDeliveryCorrelations: isRoomEvent ? [{ begin: beginQueuedDeliveryCorrelation }] : void 0,
				suppressTyping: isRoomEvent ? true : void 0,
				allowProgressCallbacksWhenSourceDeliverySuppressed: sourceRepliesAreToolOnly && draftPreview.draftStream && draftPreview.isProgressMode ? true : void 0,
				disableBlockStreaming: sourceRepliesAreToolOnly ? true : draftPreview.disableBlockStreamingForDraft ?? (typeof resolvedBlockStreamingEnabled === "boolean" ? !resolvedBlockStreamingEnabled : void 0),
				onPartialReply: draftPreview.draftStream && !draftPreview.isProgressMode ? (payload) => draftPreview.updateFromPartial(payload.text) : void 0,
				...progress.replyOptions,
				onModelSelected
			}
		});
		if (!preparedResult.dispatched) return;
		dispatchResult = preparedResult.dispatchResult;
		if (abortSignal?.aborted) {
			dispatchAborted = true;
			return;
		}
		if (activeThreadRoute.threadReplyDelivered && !userFacingFinalDelivered) {
			draftPreview.markFinalReplyStarted();
			if (draftPreview.hasProgressDraftToCollapse) try {
				await draftPreview.finalizeProgressDraft();
			} catch (error) {
				logVerbose(`discord: failed to finalize adopted thread progress (${String(error)})`);
			}
			markFinalReplyDelivered();
		}
	} catch (err) {
		if (abortSignal?.aborted) {
			dispatchAborted = true;
			return;
		}
		dispatchError = true;
		const conflictOutcome = await completeDiscordSessionConflict(err, sourceReplyDeliveryMode, (payload, info) => deliverDiscordPayload(payload, {
			...info,
			onPlatformSendDispatch: () => Promise.resolve(),
			assertPlatformSendAuthorized: () => void 0
		}), onDiscordDeliveryError);
		if (conflictOutcome) {
			runtime.error(`discord: reply session init conflict exhausted; terminal notice ${conflictOutcome} (sourceReplyDeliveryMode=${sourceReplyDeliveryMode}, message=${message.id}, session=${persistedSessionKey})`);
			return;
		}
		throw err;
	} finally {
		activeThreadRoute.end();
		endDeliveryCorrelation();
		await draftPreview.cleanup({ finalDeliveryFailed: userFacingFinalDeliveryFailed });
		dispatchError ||= readAgentRunTerminalOutcome(dispatchResult) === "failed";
		const finalReceipt = dispatchResult?.settledReceipt?.counts.final;
		const finalDeliveryFailed = (finalReceipt?.failedBeforeSend ?? 0) + (finalReceipt?.failedAfterSend ?? 0) > 0;
		await reactions.finish({
			dispatchAborted,
			dispatchError,
			finalDeliveryFailed
		});
	}
	if (dispatchAborted) return;
	const finalDispatchResult = dispatchResult;
	if (!finalDispatchResult || !hasFinalInboundReplyDispatch(finalDispatchResult)) return;
	if (shouldLogVerbose()) {
		const finalCount = finalDispatchResult.settledReceipt?.counts.final.delivered ?? 0;
		logVerbose(`discord: delivered ${finalCount} reply${finalCount === 1 ? "" : "ies"} to ${replyTarget}`);
	}
}
//#endregion
export { formatDiscordReplySkip, processDiscordMessage };
