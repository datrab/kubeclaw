import fs from 'fs';
import path from 'path';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import { addDiagnostic, discoverLatestLifecycleReadModels, extToLang, readJsonData, readJsonRecord } from './project-summary-lifecycle.ts';
import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown, pct } from './project-summary-formatters.ts';
import * as Core from './project-summary-core.ts';
const { firstDefined, recordOrEmpty, arrayOrEmpty, entriesOf, keysOf, countMatches, numberOrZero, integerTextOrZero, firstNonEmptyLine, requiredNonEmptyConfigString, optionalEnvString, envFlag, projectSummaryDiscordMuted, resolveRepoDir, git, gitText, validateProjectSelector, resolveProjectPaths } = Core;
function discoverPipelineEventLogs(swarmRoot: any) {
  const logs = [
    path.join(swarmRoot, 'logs', 'pipeline', 'pipeline.jsonl'),
  ];
  const runsDir = path.join(swarmRoot, 'logs', 'pipeline', 'runs');
  if (fs.existsSync(runsDir)) {
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) logs.push(path.join(runsDir, entry.name, 'pipeline.jsonl'));
    }
  }
  return [...new Set(logs)];
}

const PROJECT_SUMMARY_AGENT_KIND_BY_TOKEN = Object.freeze({
  forge: 'forge',
  module_forge: 'forge',
  buster: 'buster',
  module_buster: 'buster',
  echo: 'echo',
  review: 'echo',
  reviewer: 'echo',
  gate_fix: 'gateFix',
  forge_gatefix: 'gateFix',
  gatefix: 'gateFix',
  review_fix: 'reviewFix',
  forge_reviewfix: 'reviewFix',
  reviewfix: 'reviewFix',
});

type AgentInvocationKind = 'forge' | 'buster' | 'echo' | 'gateFix' | 'reviewFix';

export function normalizeAgentInvocationKind(event: any = {}): AgentInvocationKind | null {
  const agentType = firstDefined(event.agent_type, event.agentType, event.payload?.agent_type, event.payload?.agentType, event.label, event.gateway_label, event.gatewayLabel, null);
  if (agentType === null) return null;
  const raw = String(agentType).trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (!raw) return null;
  const direct = selectDefinedValue(() => (PROJECT_SUMMARY_AGENT_KIND_BY_TOKEN[raw as keyof typeof PROJECT_SUMMARY_AGENT_KIND_BY_TOKEN]), () => (null));
  if (direct) return direct;
  if (raw.startsWith('forge_')) return 'forge';
  if (raw.startsWith('buster_')) return 'buster';
  if (raw.startsWith('echo_')) return 'echo';
  if (raw.startsWith('gate_fix_')) return 'gateFix';
  if (raw.startsWith('review_fix_')) return 'reviewFix';
  return null;
}

function eventDedupPart(value: any) {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function eventDedupKey(event: any = {}, filePath: any, lineNumber: any) {
  return selectDefinedValue(() => (firstDefined(event.event_id, event.id, event.trace_id)), () => ([
    eventDedupPart(selectDefinedValue(() => (event.run_id), () => (event.runId))),
    eventDedupPart(event.type),
    eventDedupPart(firstDefined(event.agent_type, event.agentType)),
    eventDedupPart(selectDefinedValue(() => (event.session_key), () => (event.sessionKey))),
    eventDedupPart(selectDefinedValue(() => (event.dispatch_id), () => (event.dispatchId))),
    eventDedupPart(selectDefinedValue(() => (event.ts), () => (event.timestamp))),
    filePath,
    String(lineNumber),
].join(':')));
}

export function collectAgentInvocations(swarmRoot: any, diagnostics: any = null) {
  const result: Record<AgentInvocationKind | 'total' | 'source', number | string> = {
    forge: 0,
    buster: 0,
    echo: 0,
    gateFix: 0,
    reviewFix: 0,
    total: 0,
    source: 'pipeline_jsonl_agent_spawned',
  };
  const seen = new Set();

  for (const filePath of discoverPipelineEventLogs(swarmRoot)) {
    if (!fs.existsSync(filePath)) continue;
    const lines = readEventLines(filePath, diagnostics);
    let lineNumber = 0;
    for (const line of lines) {
      lineNumber++;
      const event = parseEventLine(line, filePath, lineNumber, diagnostics);
      if (!event) continue;
      if (event?.type !== 'agent.spawned' && event?.event_type !== 'agent.spawned') continue;
      const key = eventDedupKey(event, filePath, lineNumber);
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = normalizeAgentInvocationKind(event);
      if (!kind) {
        addDiagnostic(diagnostics, {
          source: 'agent_invocations',
          status: 'unsupported_agent_type',
          path: filePath,
          line: lineNumber,
          optional: true,
          agent_type: firstDefined(event.agent_type, event.agentType, null),
        });
        continue;
      }
      result[kind] = numberOrZero(result[kind]) + 1;
    }
  }

  result.total = numberOrZero(result.forge) + numberOrZero(result.buster) + numberOrZero(result.echo) + numberOrZero(result.gateFix) + numberOrZero(result.reviewFix);
  return result;
}

function readEventLines(filePath: string, diagnostics: any): string[] {
  try {
    return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  } catch (error: any) {
    addDiagnostic(diagnostics, {
      source: 'jsonl', status: 'unavailable', path: filePath, optional: true,
      reason: selectTruthyValue(() => error?.message, () => 'missing_error_message'),
    });
    return [];
  }
}

function parseEventLine(line: string, filePath: string, lineNumber: number, diagnostics: any): any | null {
  try {
    return JSON.parse(line);
  } catch (error: any) {
    addDiagnostic(diagnostics, {
      source: 'jsonl', status: 'malformed', path: filePath, line: lineNumber, optional: true,
      reason: selectTruthyValue(() => error?.message, () => 'missing_error_message'),
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// REPORT BUILDER
// ═══════════════════════════════════════════════════════════════
