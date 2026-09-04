export type BaselineTarget = {
  id: string;
  view: string;
  state: string;
  viewport: "compact" | "regular" | "wide";
  fidelity: "exact" | "intent";
  path: string;
};
export type BaselineHandoff = {
  baselineDigest: string;
  projectId: string;
  targets: BaselineTarget[];
};
export type ModuleDesignAssignment = { moduleId: string; targetIds: string[] };
const viewport = {
  compact: { width: 390, height: 844 },
  regular: { width: 768, height: 1024 },
  wide: { width: 1440, height: 1000 },
} as const;
export function toBusterPlan(input: BaselineHandoff) {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.baselineDigest))
    throw new Error("approved baseline digest is required");
  if (!input.targets.length)
    throw new Error("at least one fidelity target is required");
  return {
    baselineDigest: input.baselineDigest,
    visual: {
      uses: "kubeclaw.visual@1",
      config: {
        manifestFile: ".swarm/visual/baselines.json",
        profileFile: ".swarm/browser-profiles.json",
        targets: input.targets.map((target) => target.id),
        comparisonProfile: "strict-v1",
      },
    },
    targets: input.targets.map((target) => ({
      name: target.id,
      path: target.path,
      prism: {
        view: target.view,
        state: target.state,
        viewport: target.viewport,
        fidelity: target.fidelity,
      },
      viewport: viewport[target.viewport],
    })),
    legacySuites: ["a11y", "e2e"],
  };
}

export function toForgeAssignments(input: BaselineHandoff, assignments: ModuleDesignAssignment[]) {
  const byId = new Map(input.targets.map((target) => [target.id, target]));
  if (!/^sha256:[a-f0-9]{64}$/.test(input.baselineDigest)) throw new Error("approved baseline digest is required");
  return assignments.map(({ moduleId, targetIds }) => {
    const targets = targetIds.map((id) => { const target = byId.get(id); if (!target) throw new Error(`unknown design target: ${id}`); return target; });
    return { moduleId, baselineDigest: input.baselineDigest, access: "read-only" as const, targets };
  });
}
