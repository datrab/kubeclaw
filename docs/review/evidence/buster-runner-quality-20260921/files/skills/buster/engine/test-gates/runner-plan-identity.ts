import { validatePipelineTestGateContract, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';
import { canonical } from './canonical-value.ts';
import { digest } from './runner-values.ts';
export function assertPlanIdentity(
  plan: ResolvedTestPlanV1,
  registry: RegistrySnapshot,
): void {
  validatePipelineTestGateContract("resolvedTestPlan", plan);
  const { planDigest, ...unsigned } = plan;
  if (digest(unsigned) !== planDigest)
    throw new Error("TEST_PLAN_DIGEST_MISMATCH");
  if (plan.registrySnapshotDigest !== registry.snapshotDigest)
    throw new Error("TEST_PLAN_REGISTRY_SNAPSHOT_MISMATCH");
  for (const node of plan.nodes) {
    const entry = registry.testProviderContracts.get(node.provider.contractId);
    if (
      !entry ||
      canonical(entry.registration.package) !==
        canonical({
          packageId: node.provider.packageId,
          packageVersion: node.provider.packageVersion,
          contentDigest: node.provider.contentDigest,
        }) ||
      entry.registration.registrationId !== node.provider.registrationId
    ) {
      throw new Error(`TEST_PLAN_PROVIDER_IDENTITY_MISMATCH:${node.id}`);
    }
    for (const adapter of node.reportAdapters) {
      const adapterEntry = [...registry.reportAdapters.values()].find((candidate) =>
        candidate.registration.adapterId === adapter.adapterId
        && candidate.registration.format === adapter.format
        && candidate.registration.contractVersion === adapter.contractVersion
        && canonical(candidate.registration.package) === canonical(adapter.package));
      if (!adapterEntry) throw new Error(`TEST_PLAN_REPORT_ADAPTER_IDENTITY_MISMATCH:${node.id}:${adapter.format}`);
    }
  }
}

