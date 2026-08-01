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
  readonly outputContract: Readonly<Record<string, unknown>>;
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
  const issueContract = {
    type: 'object',
    additionalProperties: false,
    required: ['source', 'description', 'affected_files', 'recommended_fix'],
    properties: {
      source: { type: 'string' },
      description: { type: 'string' },
      affected_files: { type: 'array', items: { type: 'string' } },
      recommended_fix: { type: 'string' },
    },
  } as const;

  return {
    protocol: 'kubeclaw.review.v2',
    agent,
    task: buildReviewTask(input, helperPrompt),
    review: {
      subject: input.task,
      evidence: input.evidence ?? {},
      allowedStatuses: ['PASS', 'FAIL'],
    },
    outputContract: {
      type: 'object',
      additionalProperties: false,
      required: [
        'status',
        'critical_issues',
        'deferred_issues',
        'checked_contracts',
        'opened_artifacts',
        'failed_commands',
        'unverified_requirements',
        'summary',
      ],
      properties: {
        status: { enum: ['PASS', 'FAIL'] },
        critical_issues: { type: 'array', items: issueContract },
        deferred_issues: { type: 'array', items: issueContract },
        checked_contracts: { type: 'array', items: { type: 'string' } },
        opened_artifacts: { type: 'array', items: { type: 'string' } },
        failed_commands: { type: 'array', items: { type: 'string' } },
        unverified_requirements: { type: 'array', items: { type: 'string' } },
        summary: { type: 'string' },
      },
    },
  };
}
