export interface ReviewInput {
  readonly task: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface ReviewDispatchRequest {
  readonly [key: string]: unknown;
  readonly protocol: 'kubeclaw.review.v2';
  readonly agent: string;
  readonly task: string;
  readonly review: {
    readonly subject: string;
    readonly evidence: Readonly<Record<string, unknown>>;
    readonly allowedStatuses: readonly ['PASS', 'FAIL'];
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function evidenceJson(evidence: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(stableValue(evidence), null, 2);
}

export function buildReviewTask(
  input: ReviewInput,
  helperPrompt: unknown,
): string {
  const guidance = typeof helperPrompt === 'string' && helperPrompt.trim()
    ? helperPrompt.trim()
    : 'No additional reviewer guidance was supplied.';

  return [
    '# KubeClaw review protocol v2',
    '',
    'Review the stated subject using the supplied evidence. Exercise reviewer judgment, but return only the closed JSON contract below.',
    '',
    '## Subject',
    input.task,
    '',
    '## Evidence',
    evidenceJson(input.evidence ?? {}),
    '',
    '## Additional guidance',
    guidance,
    '',
    '## Required output',
    '{',
    '  "status": "PASS | FAIL",',
    '  "critical_issues": [{ "source": "string", "description": "string", "affected_files": ["string"], "recommended_fix": "string" }],',
    '  "deferred_issues": [{ "source": "string", "description": "string", "affected_files": ["string"], "recommended_fix": "string" }],',
    '  "checked_contracts": ["string"],',
    '  "opened_artifacts": ["string"],',
    '  "failed_commands": ["string"],',
    '  "unverified_requirements": ["string"],',
    '  "summary": "string"',
    '}',
    '',
    'Return raw JSON only. Every listed field is required and unknown fields are forbidden.',
    'PASS requires no critical issues, at least one checked contract, at least one opened artifact, no failed commands, and no unverified requirements.',
    'FAIL requires at least one critical issue, failed command, or unverified requirement.',
    'Do not report PASS for evidence you did not inspect.',
  ].join('\n');
}

export function buildReviewDispatchRequest(
  agent: string,
  input: ReviewInput,
  helperPrompt: unknown,
): ReviewDispatchRequest {
  return {
    protocol: 'kubeclaw.review.v2',
    agent,
    task: buildReviewTask(input, helperPrompt),
    review: {
      subject: input.task,
      evidence: input.evidence ?? {},
      allowedStatuses: ['PASS', 'FAIL'],
    },
  };
}
