import { createHash } from "node:crypto";
import { evaluate } from "../evaluation/index.ts";
import type { ControlContext } from "./control-context.ts";
export async function validateBaseline(
  context: Pick<ControlContext, "pool" | "repository">,
  input: BaselineInput,
) {
  const { pool, repository } = context;
  const documentOwner = await pool.query<{ project_id: string }>(
    "SELECT project_id FROM prism.design_document WHERE id=$1",
    [input.documentId],
  );
  if (
    !documentOwner.rows[0] ||
    documentOwner.rows[0].project_id !== input.projectId
  )
    throw new Error("document does not belong to the baseline project");
  const currentDocument = await repository.current(input.documentId);
  const approval = await pool.query<{
    design_digest: string;
    approved_at: string;
    accepted_warning_ids: string[];
  }>(
    "SELECT a.design_digest,a.approved_at::text,a.accepted_warning_ids FROM prism.approval a JOIN prism.design_revision rev ON rev.id=a.design_revision_id JOIN prism.design_document d ON d.id=rev.document_id JOIN prism.design_request req ON req.id=d.design_request_id AND req.status='active' AND d.design_round_id IS NOT DISTINCT FROM req.current_round_id WHERE a.id=$1 AND a.project_id=$2 AND a.design_revision_id=$3 AND a.architecture_digest=req.architecture_digest",
    [input.approvalId, input.projectId, currentDocument.id],
  );
  if (!approval.rows[0])
    throw new Error("approval does not match the current design revision");
  const content = Buffer.from(JSON.stringify(currentDocument.document));
  const designDigest = `sha256:${createHash("sha256").update(content).digest("hex")}`;
  if (designDigest !== approval.rows[0].design_digest)
    throw new Error("stale approval digest");
  const quality = evaluate(currentDocument.document);
  if (quality.status === "blocked")
    throw new Error("design quality gate blocked publication");
  const warningIds = quality.findings
    .filter((finding) => finding.level === "review")
    .map((finding) => finding.id)
    .sort();
  if (
    JSON.stringify(warningIds) !==
    JSON.stringify([...(approval.rows[0].accepted_warning_ids ?? [])].sort())
  )
    throw new Error("design warnings changed after approval");
  return { currentDocument, approval: approval.rows[0], quality, warningIds };
}

export interface BaselineInput {
  projectId: string;
  documentId: string;
  approvalId: string;
}
export type CurrentDocument = Awaited<
  ReturnType<ControlContext["repository"]["current"]>
>;

import { validatePrism } from "@kubeclaw/prism-contracts-v1";
export async function baselineSpecification(
  pool: ControlContext["pool"],
  input: BaselineInput,
  currentDocument: CurrentDocument,
) {
  const requestRow = await pool.query<{ request: Record<string, unknown> }>(
    "SELECT request FROM prism.design_request WHERE project_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1",
    [input.projectId],
  );
  const approvedRequest = requestRow.rows[0]?.request ?? {};
  const selectedDirection = await pool.query<{
    title: string;
    summary: string;
    evidence: Record<string, unknown>;
  }>(
    "SELECT dir.title,dir.summary,dir.evidence FROM prism.direction dir JOIN prism.design_document d ON d.id=dir.source_document_id JOIN prism.design_request req ON req.id=d.design_request_id AND req.status='active' AND d.design_round_id IS NOT DISTINCT FROM req.current_round_id WHERE dir.project_id=$1 AND dir.source_document_id=$2 AND dir.state='selected' ORDER BY dir.created_at DESC LIMIT 1",
    [input.projectId, input.documentId],
  );
  if (!selectedDirection.rows[0])
    throw new Error(
      "an active design direction must be selected before publication",
    );
  const specification = `# Design specification\n\n## Experience goal\n${currentDocument.document.meta.title}\n\n## Approved architecture and users\n${JSON.stringify(approvedRequest.architectureContent ?? approvedRequest, null, 2)}\n\n## Approved direction\n${selectedDirection.rows[0]?.title ?? "Approved Design Document direction"}: ${selectedDirection.rows[0]?.summary ?? ""}\n\n## Reference evidence and trade-offs\n${JSON.stringify(selectedDirection.rows[0]?.evidence ?? {}, null, 2)}\n\n## Screen, state, and flow inventory\n${Object.entries(
    currentDocument.document.views,
  )
    .map(([id, view]) => `${id}: ${Object.keys(view.states).join(", ")}`)
    .join("\n")}\n${Object.entries(currentDocument.document.flows)
    .map(
      ([id, flow]) =>
        `${id}: ${(flow as { goal?: string }).goal ?? "user journey"}`,
    )
    .join(
      "\n",
    )}\n\n## Responsive behavior\nCompact, regular, and wide behavior is defined for every view.\n\n## Accessibility requirements\nUse semantic controls, visible keyboard focus, sufficient contrast, reduced motion, accessible names, and complete keyboard operation.\n\n## Content guidance\nUse clear task language from the approved architecture. Do not invent production facts.\n\n## Important design rules\n${(currentDocument.document.theme.rules as Array<{ instruction?: string }>).map((rule) => `- ${rule.instruction ?? ""}`).join("\n")}\n\n## Implementation notes\nPreserve Prism IDs and implement every required state and flow.\n\n## Known limits\nAll prototype data is synthetic. Production behavior remains owned by the implementation pipeline.\n`;
  const criteria = baselineCriteria(currentDocument);
  return { specification, criteria };
}

function baselineCriteria(currentDocument: CurrentDocument) {
  const criteria = {
    schema: "prism.acceptance-criteria.v1",
    criteria: [
      ...Object.entries(currentDocument.document.views).flatMap(
        ([view, value]) =>
          Object.keys(value.states).map((state) => ({
            id: `${view.slice(0, 55)}-${state.slice(0, 15)}-visible`,
            category: "visual",
            requirement: `The ${value.title} ${state} state is visible, usable, and keyboard accessible.`,
            targets: [{ view, state }],
            priority: "required",
            verification: ["visual", "automated"],
          })),
      ),
      ...Object.entries(currentDocument.document.flows).map(
        ([flow, value]) => ({
          id: `flow-${flow}`.slice(0, 80),
          category: "flow",
          requirement: `The ${String((value as { title?: string }).title ?? flow)} journey reaches its declared success state and supports each declared recovery path.`,
          targets: [{ flow }],
          priority: "required",
          verification: ["automated", "manual"],
        }),
      ),
    ],
  };
  validatePrism("acceptanceCriteria", criteria);
  return criteria;
}
