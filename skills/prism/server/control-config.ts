import { authorizePipelinePreferenceSubject } from '../control/pipeline-preference-subject.ts';

export interface ControlConfig {
  readonly pipelinePreferenceSubject: string | undefined;
}

/** Load and validate platform-owned Control configuration once at startup. */
export function loadControlConfig(environment: NodeJS.ProcessEnv = process.env): ControlConfig {
  const pipelinePreferenceSubject = environment.PRISM_PIPELINE_PREFERENCE_SUBJECT;
  authorizePipelinePreferenceSubject(undefined, pipelinePreferenceSubject);
  return Object.freeze({pipelinePreferenceSubject});
}
