import { preferencePrompt } from './preference-prompt.mjs';

export function agentPrompt(job) {
  const input=job.request;
  const action=job.operation==='design-set' ? [
    'You are Prism, the single OpenClaw design agent. Create exactly three materially different, complete Prism design documents.',
    'Read /app/skills/packages/prism-contract/schemas/prism-v1.schema.json and /app/skills/packages/prism-contract/fixtures/minimal-web.json from the versioned bundle before drafting.',
    `Design request: ${JSON.stringify(input.preferences.request)}`,
    'Finish by calling prism_create_design_set exactly once. Do not return a prose-only answer.'
  ] : [
    'Continue this Prism project in its v2 session. The complete current document is supplied; do not adopt a legacy session.',
    `Apply this Studio feedback: ${input.instruction}`,
    `Target documentId: ${input.documentId}; expected revision: ${input.expectedRevision}`,
    `Current document: ${JSON.stringify(input.document)}`,
    'Finish by calling prism_apply_revision with the complete updated document.'
  ];
  return [...action,`External projectId: ${input.projectId}`,
    'Do not call any model provider directly; the OpenClaw gateway owns model routing.',
    preferencePrompt(input.preferences),
    `Every Prism result tool call MUST include jobId ${job.id} and fence ${job.fence}. These identify this exact action, not a reusable project authority.`
  ].join('\n\n');
}
