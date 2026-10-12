import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validatePipelineTestGateContract, type ExecutionState, type ProducedOutputV1, type ProviderInvocationV1, type ResolvedInputV1, type ResolvedPlanNodeV1, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import { containedRelative } from './runner-paths.ts';
import { providerEntry, grantedCapabilities } from './runner-worker-profile.ts';
import { compareText, detail, resultIdentity } from './runner-values.ts';
interface PreparationOwner {
  readonly options: TestPlanRunnerOptions;
  readonly workspaceRoot: string;
  readonly id: () => string;
}
class RunnerFault extends Error {
  readonly state: Exclude<ExecutionState, "completed">;
  constructor(state: Exclude<ExecutionState, "completed">, message: string) {
    super(message);
    this.name = "RunnerFault";
    this.state = state;
  }
}

function invocationInputs(
  plan: ResolvedTestPlanV1,
  node: ResolvedPlanNodeV1,
  outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>,
): ResolvedInputV1[] {
  return plan.links
    .filter((link) => link.to.nodeId === node.id)
    .sort((a, b) => compareText(a.to.input, b.to.input))
    .map((link) => {
      const output = outputs
        .get(link.from.nodeId)
        ?.find((item) => item.name === link.from.output);
      if (!output)
        throw new Error(
          `TEST_PLAN_LINK_OUTPUT_MISSING:${link.from.nodeId}:${link.from.output}`,
        );
      if (link.kind === "value" && output.kind === "value")
        return {
          name: link.to.input,
          kind: "value",
          schemaId: link.schemaId,
          value: structuredClone(output.value),
        };
      if (link.kind === "artifact" && output.kind === "artifact")
        return {
          name: link.to.input,
          kind: "artifact",
          artifact: output.artifact,
        };
      throw new Error(
        `TEST_PLAN_LINK_OUTPUT_MISMATCH:${link.from.nodeId}:${link.from.output}`,
      );
    });
}


function attemptDirectories(owner: PreparationOwner, node: ResolvedPlanNodeV1, attemptNumber: number) {
    const attemptId = `attempt:${crypto.createHash("sha256").update(`${node.executionId}:${attemptNumber}:${owner.id()}`).digest("hex")}`;
    const attemptDirectory = path.join(
      owner.workspaceRoot,
      "test-attempts",
      attemptId.slice("attempt:".length),
    );
    const scratchDirectory = path.join(attemptDirectory, "scratch");
    const attemptRepository = path.join(attemptDirectory, "repository");
    const evidenceDirectory = path.join(attemptDirectory, "evidence");
    const stagingRoot = path.join(owner.options.artifactRoot, ".staging");
    fs.mkdirSync(stagingRoot, { recursive: true });
    const stagingBase = fs.mkdtempSync(
      path.join(stagingRoot, `${attemptId.slice("attempt:".length)}-`),
    );
    const stagedEvidenceDirectory = path.join(stagingBase, "selected");
    const stagedErrorEvidenceDirectory = path.join(stagingBase, "error");
    const runnerEvidenceDirectory = path.join(
      attemptDirectory,
      "runner-evidence",
    );
    fs.mkdirSync(scratchDirectory, { recursive: true });
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.mkdirSync(runnerEvidenceDirectory, { recursive: true });
    fs.cpSync(owner.options.sourceRepositoryRoot ?? owner.options.repositoryRoot, attemptRepository, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    const attemptRepositoryRelative = containedRelative(
      owner.workspaceRoot,
      attemptRepository,
      "TEST_RUNNER_ATTEMPT_REPOSITORY",
    );
    return { attemptId, attemptRepository, stagingBase, evidenceDirectory, stagedEvidenceDirectory, stagedErrorEvidenceDirectory, runnerEvidenceDirectory, attemptRepositoryRelative, scratchDirectory };
}

export function prepareRunnerAttempt(owner: PreparationOwner, node: ResolvedPlanNodeV1,
  attemptNumber: number, outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>) {
    const directories = attemptDirectories(owner, node, attemptNumber);
    const { attemptId, attemptRepositoryRelative, scratchDirectory, evidenceDirectory } = directories;
    const entry = providerEntry(owner.options.registry, node);
    const granted = grantedCapabilities(
      { registry: owner.options.registry, grants: owner.options.grants },
      node,
    );
    const missingCapability = entry.registration.capabilities.find(
      (capability) => !granted.includes(capability),
    );
    let resolvedInputs: ResolvedInputV1[] = [];
    let preparationFault: RunnerFault | null = null;
    try {
      resolvedInputs = invocationInputs(owner.options.plan, node, outputs);
    } catch (error) {
      preparationFault = new RunnerFault("errored", detail(error));
    }
    const invocation: ProviderInvocationV1 = {
      schemaVersion: "provider-invocation.v1",
      ...resultIdentity(owner.options.plan, node),
      attemptId,
      attemptNumber,
      provider: node.provider,
      configuration: node.configuration,
      inputs: resolvedInputs,
      evidence: node.evidence,
      grantedCapabilities: granted,
      timeoutMs: node.timeoutMs,
      limits: node.limits,
      workspace: {
        repository: attemptRepositoryRelative,
        scratch: path
          .relative(owner.workspaceRoot, scratchDirectory)
          .split(path.sep)
          .join("/"),
        evidence: path
          .relative(owner.workspaceRoot, evidenceDirectory)
          .split(path.sep)
          .join("/"),
      },
    };
    validatePipelineTestGateContract("providerInvocation", invocation);
    return { ...directories, entry, granted, missingCapability, preparationFault, invocation };
}
