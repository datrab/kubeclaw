import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = process.argv[2];
if (!sourceRoot) {
  throw new Error('usage: node apply.mjs <openclaw-source-root>');
}

const replacements = [
  {
    path: 'src/agents/openclaw-tools.swarm.ts',
    before: `import { createStructuredOutputTool } from "./tools/structured-output-tool.js";`,
    after: `import {
  consumeSwarmStructuredOutput,
  createStructuredOutputTool,
} from "./tools/structured-output-tool.js";`,
  },
  {
    path: 'src/agents/openclaw-tools.swarm.ts',
    before: `  const childSessionKey = params.runSessionKey ?? params.agentSessionKey;
  const collectorEntry =
    params.swarmCollector && params.runId && params.swarmOutputSchema
      ? (getSubagentRunByRunId(params.runId) ??
        (childSessionKey ? getLatestSubagentRunByChildSessionKey(childSessionKey) : undefined))
      : undefined;
  const structuredOutput =
    params.swarmCollector && params.runId && params.swarmOutputSchema
      ? [
          createStructuredOutputTool({
            runId: params.runId,
            schema: params.swarmOutputSchema,
            initialState: collectorEntry?.structuredOutput,
            onStateChange: (state) =>
              recordSwarmStructuredOutput({ runId: params.runId, childSessionKey }, state),
          }),
        ]
      : [];`,
    after: `  const childSessionKey = params.runSessionKey ?? params.agentSessionKey;
  const runId = params.runId;
  const collectorEntry =
    params.swarmCollector && runId && params.swarmOutputSchema
      ? (getSubagentRunByRunId(runId) ??
        (childSessionKey ? getLatestSubagentRunByChildSessionKey(childSessionKey) : undefined))
      : undefined;
  const structuredOutput =
    params.swarmCollector && runId && params.swarmOutputSchema
      ? [
          createStructuredOutputTool({
            runId,
            schema: params.swarmOutputSchema,
            initialState: collectorEntry?.structuredOutput,
            onStateChange: (state) => {
              const reconciled = recordSwarmStructuredOutput({ runId, childSessionKey }, state);
              if (reconciled) {
                consumeSwarmStructuredOutput(runId);
              }
            },
          }),
        ]
      : [];`,
  },
  {
    path: 'src/agents/subagents/registry/subagent-registry-public-api.ts',
    before: `  function recordSwarmStructuredOutput(
    identity: { runId?: string; childSessionKey?: string },
    state: SwarmStructuredOutputState,
  ): void {`,
    after: `  function recordSwarmStructuredOutput(
    identity: { runId?: string; childSessionKey?: string },
    state: SwarmStructuredOutputState,
  ): boolean {`,
  },
  {
    path: 'src/agents/subagents/registry/subagent-registry-public-api.ts',
    before: `    if (!entry?.collect || entry.collectorCompletion) {
      throw new Error("collector run is unavailable");
    }
    const previous = entry.structuredOutput;`,
    after: `    if (!entry?.collect) {
      throw new Error("collector run is unavailable");
    }
    if (entry.collectorCompletion) {
      const previousCompletion = entry.collectorCompletion;
      const executionSucceeded = entry.execution.outcome?.status === "ok";
      const canReconcileLateSuccess =
        executionSucceeded &&
        previousCompletion.status === "failed" &&
        previousCompletion.schemaError === "structured_output was not called" &&
        previousCompletion.structured === undefined &&
        state.structured !== undefined;
      if (!canReconcileLateSuccess) {
        throw new Error("collector run is unavailable");
      }
      const { schemaError: _discardedSchemaError, ...completion } = previousCompletion;
      entry.collectorCompletion = {
        ...completion,
        status: "done",
        structured: structuredClone(state.structured),
      };
      try {
        persistOrThrow(entry.runId);
      } catch (error) {
        entry.collectorCompletion = previousCompletion;
        throw error;
      }
      return true;
    }
    const previous = entry.structuredOutput;`,
  },
  {
    path: 'src/agents/subagents/registry/subagent-registry-public-api.ts',
    before: `      entry.structuredOutput = previous;
      throw error;
    }
  }

  function listSwarmRunsForGroup(`,
    after: `      entry.structuredOutput = previous;
      throw error;
    }
    return false;
  }

  function listSwarmRunsForGroup(`,
  },
];

for (const replacement of replacements) {
  const file = join(sourceRoot, replacement.path);
  const source = readFileSync(file, 'utf8');
  const occurrences = source.split(replacement.before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${replacement.path}: expected one patch anchor, found ${occurrences}`);
  }
  writeFileSync(file, source.replace(replacement.before, replacement.after));
}
