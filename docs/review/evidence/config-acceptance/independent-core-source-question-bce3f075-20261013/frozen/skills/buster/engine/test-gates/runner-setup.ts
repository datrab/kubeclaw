import { validateBusterExecutionSettings } from '../../../common/plugin-runtime/foundation/config/buster-execution.ts';
import fs from 'node:fs';
import path from 'node:path';
import { validateLocalWorkerRuntimePolicy, LocalWorkerRuntime, type LocalWorkerRuntimePolicy } from '@kubeclaw/worker-core';
import type { TestPlanRunnerOptions, WorkerAttemptRuntime } from './runner-types.ts';
import { assertPlanIdentity } from './runner-plan-identity.ts';
import { containedRelative, secureDirectory } from './runner-paths.ts';
import { createBusterWorkerProfiles } from './runner-worker-profile.ts';

export function validateRunnerOptions(options: TestPlanRunnerOptions) {
    const workerLocalRuntime = validateLocalWorkerRuntimePolicy(options.workerLocalRuntime);
    assertPlanIdentity(options.plan, options.registry);
    if (
      !Number.isSafeInteger(options.maximumConcurrency) ||
      options.maximumConcurrency < 1
    )
      throw new Error("TEST_RUNNER_CONCURRENCY_INVALID");
    for (const legacy of ['cleanupTimeoutMs', 'maximumProviderResultBytes']) {
      if (Object.hasOwn(options, legacy)) throw new Error(`TEST_RUNNER_LEGACY_POLICY:${legacy}`);
    }
    const executionPolicy = validateBusterExecutionSettings(options.executionPolicy);
    if (
      !path.isAbsolute(options.workspaceRoot) ||
      !path.isAbsolute(options.repositoryRoot) ||
      !path.isAbsolute(options.artifactRoot) ||
      !path.isAbsolute(options.observabilityRoot)
    ) {
      throw new Error("TEST_RUNNER_PATH_NOT_ABSOLUTE");
    }
    return { workerLocalRuntime, executionPolicy };
}

function prepareWorkspace(options: TestPlanRunnerOptions) {
    fs.mkdirSync(options.workspaceRoot, { recursive: true });
    const workspaceRoot = fs.realpathSync(options.workspaceRoot);
    fs.mkdirSync(options.artifactRoot, { recursive: true });
    const artifactRoot = fs.realpathSync(options.artifactRoot);
    if (
      artifactRoot === workspaceRoot ||
      artifactRoot.startsWith(`${workspaceRoot}${path.sep}`) ||
      workspaceRoot.startsWith(`${artifactRoot}${path.sep}`)
    ) {
      throw new Error("TEST_RUNNER_ARTIFACT_ROOT_OVERLAPS_WORKSPACE");
    }
    return { workspaceRoot, artifactRoot };
}

export function prepareRunnerPaths(options: TestPlanRunnerOptions) {
    const { workspaceRoot, artifactRoot } = prepareWorkspace(options);
    const observabilityRoot = secureDirectory(
      options.observabilityRoot,
      "TEST_RUNNER_OBSERVABILITY_ROOT",
    );
    if (
      observabilityRoot === workspaceRoot ||
      observabilityRoot.startsWith(`${workspaceRoot}${path.sep}`) ||
      workspaceRoot.startsWith(`${observabilityRoot}${path.sep}`)
    )
      throw new Error("TEST_RUNNER_OBSERVABILITY_ROOT_OVERLAPS_WORKSPACE");
    if (options.durableAttemptStore)
      secureDirectory(
        options.durableAttemptStore.storageDirectory(),
        "TEST_RUNNER_ATTEMPT_STORE_ROOT",
      );
    if (options.observabilityAdmissionStore)
      secureDirectory(
        options.observabilityAdmissionStore.storageDirectory(),
        "TEST_RUNNER_ADMISSION_STORE_ROOT",
      );
    if (
      options.durableAttemptStore &&
      fs.realpathSync(options.durableAttemptStore.storageDirectory()) !==
        path.join(observabilityRoot, "attempts")
    )
      throw new Error("TEST_RUNNER_ATTEMPT_STORE_ROOT_MISMATCH");
    if (
      options.observabilityAdmissionStore &&
      fs.realpathSync(
        options.observabilityAdmissionStore.storageDirectory(),
      ) !== path.join(observabilityRoot, "admission")
    )
      throw new Error("TEST_RUNNER_ADMISSION_STORE_ROOT_MISMATCH");
    containedRelative(
      workspaceRoot,
      options.repositoryRoot,
      "TEST_RUNNER_REPOSITORY",
    );
    if (options.sourceRepositoryRoot !== undefined && (
      !path.isAbsolute(options.sourceRepositoryRoot)
      || fs.realpathSync(options.sourceRepositoryRoot) !== options.sourceRepositoryRoot
      || !fs.statSync(options.sourceRepositoryRoot).isDirectory()
    )) throw new Error("TEST_RUNNER_SOURCE_REPOSITORY_INVALID");
    return { workspaceRoot, artifactRoot, observabilityRoot };
}

export function configuredWorkerRuntime(options: TestPlanRunnerOptions,
  workerLocalRuntime: LocalWorkerRuntimePolicy, now: () => Date): WorkerAttemptRuntime {
    if (options.workerRuntime) {
      return options.workerRuntime;
    } else {
      const runtime = new LocalWorkerRuntime({
        workerId: "worker:buster:local",
        workerType: "buster",
        coreVersion: "1.0.0",
        protocolVersions: ["worker-protocol.v1"],
        profiles: createBusterWorkerProfiles(
          options.plan,
          options.registry,
          options.grants,
        ),
        capacity: options.maximumConcurrency,
        drainTimeoutMs: workerLocalRuntime.drainTimeoutMs,
        cancellationTimeoutMs: workerLocalRuntime.cancellationTimeoutMs,
        replayLimit: workerLocalRuntime.replayLimit,
        now,
      });
      runtime.markReady();
      return runtime;
    }
}
