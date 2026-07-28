import { ownerKey } from './plugin-system-inventory-analysis.mjs';

function packageRecord(packageId) {
  return {
    packageId,
    registrations: [],
    runtimeFileCount: 0,
    supportFileCount: 0,
    effectCounts: {},
    outboundOwnerDependencies: 0,
    hardcodingCount: 0,
    legacyContractCount: 0,
  };
}

function addFileAssessment(packages, file) {
  const current = packages.get(file.target.id);
  if (!current) return;
  if (file.scope === 'runtime') current.runtimeFileCount += 1;
  else current.supportFileCount += 1;
  current.hardcodingCount += file.hardcodings.length;
  current.legacyContractCount += file.legacyContracts.length;
  if (file.scope !== 'runtime') return;
  for (const effect of file.effects) {
    current.effectCounts[effect.id] = (current.effectCounts[effect.id] ?? 0) + 1;
  }
}

export function registrationAssessment(registrations, files, graph) {
  const packages = new Map();
  for (const registration of registrations) {
    const current = packages.get(registration.targetPackage) ?? packageRecord(registration.targetPackage);
    current.registrations.push(registration.targetRegistrationId);
    packages.set(registration.targetPackage, current);
  }
  for (const file of files) addFileAssessment(packages, file);
  for (const edge of graph) {
    const fromId = edge.from.slice(edge.from.indexOf(':') + 1);
    const current = packages.get(fromId);
    if (current) current.outboundOwnerDependencies += edge.count;
  }
  return [...packages.values()]
    .map((item) => ({
      ...item,
      registrations: item.registrations.sort(),
      effectCounts: Object.fromEntries(Object.entries(item.effectCounts).sort()),
    }))
    .sort((left, right) => left.packageId.localeCompare(right.packageId));
}

const effectWeights = {
  'runtime.dispatch': 50,
  'network.http': 30,
  'command.execute': 20,
  'redis.execute': 15,
  'git.execute': 10,
  'secret.read': 8,
  'operator.notify': 5,
  'filesystem.write': 2,
  'filesystem.read': 1,
  'telemetry.emit': 1,
};

function effectRisk(assessment) {
  return Object.entries(assessment?.effectCounts ?? {})
    .reduce((total, [effect, count]) => total + (effectWeights[effect] ?? 5) * count, 0);
}

function candidateScore(assessment, risk, registrationCount, notRegistryBacked) {
  return (assessment?.runtimeFileCount ?? 0)
    + (assessment?.outboundOwnerDependencies ?? 0)
    + (assessment?.legacyContractCount ?? 0) * 3
    + (assessment?.hardcodingCount ?? 0) * 2
    + risk
    + (notRegistryBacked ? 25 : 0)
    + Math.max(0, registrationCount - 1) * 10;
}

function candidateRecord(packageId, registrations, assessment) {
  const packageRegistrations = registrations.filter((item) => item.targetPackage === packageId);
  const risk = effectRisk(assessment);
  const notRegistryBacked = packageRegistrations.every((item) => !item.currentId.startsWith('builtin.'));
  return {
    packageId,
    score: candidateScore(assessment, risk, packageRegistrations.length, notRegistryBacked),
    currentRegistryBacked: !notRegistryBacked,
    registrationCount: packageRegistrations.length,
    runtimeFileCount: assessment?.runtimeFileCount ?? 0,
    outboundOwnerDependencies: assessment?.outboundOwnerDependencies ?? 0,
    effectRisk: risk,
    legacyContractCount: assessment?.legacyContractCount ?? 0,
    hardcodingCount: assessment?.hardcodingCount ?? 0,
  };
}

export function referenceCandidateRanking(registrations, packageAssessment) {
  const assessmentByPackage = new Map(packageAssessment.map((item) => [item.packageId, item]));
  const stageRegistrations = registrations.filter((item) => item.targetSurface === 'stage');
  const packages = [...new Set(stageRegistrations.map((item) => item.targetPackage))];
  return packages
    .map((packageId) => candidateRecord(packageId, stageRegistrations, assessmentByPackage.get(packageId)))
    .sort((left, right) => left.score - right.score || left.packageId.localeCompare(right.packageId));
}

export function referenceAssessment(registrations, packageAssessment, candidateRanking) {
  const packageId = 'kubeclaw.delivery-lint';
  const delivery = packageAssessment.find((item) => item.packageId === packageId);
  const registration = registrations.find((item) => item.targetPackage === packageId);
  return {
    decision: 'confirm',
    packageId,
    registrationId: registration.targetRegistrationId,
    evidence: {
      deterministicDomainEvaluation: true,
      directRuntimeDispatch: Boolean(delivery?.effectCounts['runtime.dispatch']),
      directNetwork: Boolean(delivery?.effectCounts['network.http']),
      classifiedRuntimeFileCount: delivery?.runtimeFileCount ?? 0,
      classifiedSupportFileCount: delivery?.supportFileCount ?? 0,
      outboundOwnerDependencies: delivery?.outboundOwnerDependencies ?? 0,
      currentMixedFacade: 'skills/nova/pipeline/services/module-validators.ts',
      requiredPreparatorySplit: true,
    },
    rationale: [
      'The delivery-lint decision is deterministic and exercises canonical passed, request_fix, and blocked outcomes.',
      'Its target implementation does not require agent dispatch, durable waits, or network authority.',
      `It has the lowest migration-risk score among current or discovered stage packages (${candidateRanking.find((item) => item.packageId === packageId)?.score ?? 'unknown'}).`,
      'The current module-validators.ts facade mixes delivery, pre-check, and full-lint behavior and must be deleted after its exports are split; it must not be moved wholesale.',
      'The extraction should produce a single-stage kubeclaw.delivery-lint package first. Pre-check and full-lint remain outside that package until independent cohesion evidence supports combining them.',
    ],
  };
}

export function targetOwnerCounts(files) {
  const counts = new Map();
  for (const file of files) {
    const key = ownerKey(file.target);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => ({ id, count }));
}
