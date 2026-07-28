export const VALIDATION_CODES = {
  FORGE_BLUEPRINT_MISSING:       'FORGE_BLUEPRINT_MISSING',
  FORGE_BLUEPRINT_READ_FAILED:   'FORGE_BLUEPRINT_READ_FAILED',
  FORGE_SUBSTEP_INVALID:         'FORGE_SUBSTEP_INVALID',
  SERVE_DOCKERFILE_NOT_DECLARED: 'SERVE_DOCKERFILE_NOT_DECLARED',
  API_SPEC_NOT_DECLARED:         'API_SPEC_NOT_DECLARED',
} as const;

export function validationFailure(stage: any, code: any, explanation: any, nextStep: any) {
  return { stage, code, explanation, next_step: nextStep };
}
