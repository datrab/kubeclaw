import { createHash } from "node:crypto";
import type { PrismDocument, PrismNode } from "@kubeclaw/prism-contracts-v1";

export type Finding = {
  id: string;
  level: "blocking" | "review" | "information";
  gate:
    | "coverage"
    | "references"
    | "flow"
    | "responsive"
    | "accessibility"
    | "content"
    | "visual-quality";
  message: string;
  target?: string;
};
const walk = (node: PrismNode): PrismNode[] => [
  node,
  ...(node.children ?? []).flatMap(walk),
];
const ref = (value: unknown): { view?: string; state?: string } =>
  value && typeof value === "object"
    ? (value as { view?: string; state?: string })
    : {};

export function evaluate(document: PrismDocument): {
  status: "ready" | "needs-attention" | "blocked";
  findings: Finding[];
} {
  const findings: Finding[] = [];
  const add = (finding: Omit<Finding, "id">) =>
    findings.push({
      id: `${finding.gate}-${createHash("sha256").update(JSON.stringify(finding)).digest("hex").slice(0, 16)}`,
      ...finding,
    });
  const viewIds = Object.keys(document.views);
  if (!viewIds.length)
    add({
      level: "blocking",
      gate: "coverage",
      message: "Add at least one view.",
    });
  for (const [id, view] of Object.entries(document.views)) {
    const nodes = walk(view.root);
    const nodeIds = new Set(nodes.map((node) => node.id));
    if (new Set(nodes.map((node) => node.id)).size !== nodes.length)
      add({
        level: "blocking",
        gate: "references",
        message: "The view has duplicate node IDs.",
        target: id,
      });
    if (!nodes.some((node) => node.type === "heading"))
      add({
        level: "review",
        gate: "content",
        message: "The view has no heading.",
        target: id,
      });
    const levels = nodes
      .filter((node) => node.type === "heading")
      .map((node) => Number(node.props?.level));
    for (let index = 1; index < levels.length; index++)
      if (levels[index]! > levels[index - 1]! + 1)
        add({
          level: "review",
          gate: "content",
          message: "The heading hierarchy skips a level.",
          target: id,
        });
    const interactive = nodes.filter((node) =>
      [
        "button",
        "link",
        "checkbox",
        "select",
        "text-input",
        "tabs",
        "navigation",
      ].includes(node.type),
    );
    for (const node of interactive) {
      if (!node.props?.accessibilityLabel && !node.props?.label)
        add({
          level: "blocking",
          gate: "accessibility",
          message: "An interactive item has no accessible label.",
          target: node.id,
        });
      const action = String(node.props?.action ?? "");
      if (
        action &&
        !Object.values(document.flows).some((raw) =>
          (
            (raw as { transitions?: Array<{ trigger?: { action?: string } }> })
              .transitions ?? []
          ).some((transition) => transition.trigger?.action === action),
        )
      )
        add({
          level: "review",
          gate: "flow",
          message: "An interactive action is not connected to a flow.",
          target: node.id,
        });
    }
    for (const node of nodes.filter((node) =>
      ["image", "icon"].includes(node.type),
    )) {
      const assetId = String(node.props?.asset ?? "");
      const asset = document.assets[assetId] as
        { alt?: string; role?: string } | undefined;
      if (!asset)
        add({
          level: "blocking",
          gate: "references",
          message: `A ${node.type} references a missing asset.`,
          target: node.id,
        });
      else if (
        node.type === "icon"
          ? node.props?.decorative !== true && !asset.alt
          : asset.role !== "decoration" && !asset.alt
      )
        add({
          level: "blocking",
          gate: "accessibility",
          message: `A meaningful ${node.type} has no alternative text.`,
          target: node.id,
        });
    }
    for (const [state, stateValue] of Object.entries(view.states)) {
      for (const target of Object.keys(stateValue.patches))
        if (!nodeIds.has(target))
          add({
            level: "blocking",
            gate: "references",
            message: `State ${state} patches a missing node.`,
            target,
          });
    }
    for (const [viewport, responsive] of Object.entries(view.responsive)) {
      for (const target of Object.keys(responsive.patches))
        if (!nodeIds.has(target))
          add({
            level: "blocking",
            gate: "responsive",
            message: `Viewport ${viewport} patches a missing node.`,
            target,
          });
    }
    for (const viewport of ["compact", "regular", "wide"])
      if (!(viewport in view.responsive))
        add({
          level: "blocking",
          gate: "responsive",
          message: `The ${viewport} viewport is missing.`,
          target: id,
        });
  }
  for (const [flowId, raw] of Object.entries(document.flows)) {
    const flow = raw as {
      start?: unknown;
      success?: unknown;
      recovery?: unknown[];
      transitions?: Array<{
        from?: unknown;
        to?: unknown;
        trigger?: { node?: string };
      }>;
    };
    for (const [kind, value] of [
      ["start", flow.start],
      ["success", flow.success],
    ] as const) {
      const target = ref(value);
      if (
        !target.view ||
        !document.views[target.view] ||
        !target.state ||
        !document.views[target.view]?.states[target.state]
      )
        add({
          level: "blocking",
          gate: "flow",
          message: `Flow ${kind} references a missing view or state.`,
          target: flowId,
        });
    }
    if (!flow.transitions?.length)
      add({
        level: "review",
        gate: "flow",
        message: "The flow has no transitions.",
        target: flowId,
      });
    for (const transition of flow.transitions ?? [])
      for (const endpoint of [transition.from, transition.to]) {
        const target = ref(endpoint);
        if (
          !target.view ||
          !document.views[target.view] ||
          !target.state ||
          !document.views[target.view]?.states[target.state]
        )
          add({
            level: "blocking",
            gate: "flow",
            message: "A transition references a missing view or state.",
            target: flowId,
          });
      }
    if (flowId.includes("auth") && !flow.recovery?.length)
      add({
        level: "blocking",
        gate: "coverage",
        message: "Authentication needs a recovery path.",
        target: flowId,
      });
  }
  if (Object.keys(document.flows).length === 0)
    add({
      level: "review",
      gate: "coverage",
      message: "The design has no user flow.",
    });
  return {
    status: findings.some((finding) => finding.level === "blocking")
      ? "blocked"
      : findings.some((finding) => finding.level === "review")
        ? "needs-attention"
        : "ready",
    findings,
  };
}
