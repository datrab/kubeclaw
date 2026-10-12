import type {
  EvidenceRef,
  ProposedFinding,
  RequirementResult,
} from './echo-review-contract.ts';

function evidenceKey(value: EvidenceRef): string {
  return `${value.kind}\0${value.digest}`;
}

export function verifyInspectedEvidence(
  inspectedEvidence: readonly EvidenceRef[],
  requirementAssessments: Readonly<Record<string, RequirementResult>>,
  proposedFindings: readonly ProposedFinding[],
): void {
  const inspected = new Set(inspectedEvidence.map(evidenceKey));
  const references = [
    ...Object.entries(requirementAssessments).map(([key, entry]) => (
      [`requirementAssessments.${key}.evidence`, entry.evidence] as const
    )),
    ...proposedFindings.map((entry, index) => (
      [`proposedFindings[${index}].evidence`, entry.evidence] as const
    )),
  ];
  for (const [label, evidence] of references) {
    if (evidence.some((entry) => !inspected.has(evidenceKey(entry)))) {
      throw new Error(`${label} references evidence not listed in inspectedEvidence`);
    }
  }
}
