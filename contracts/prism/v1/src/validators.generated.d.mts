export type StandaloneValidator = ((value: unknown) => boolean) & {
  errors?: Array<{ instancePath: string; message?: string }> | null;
};

export const validateDesignRequest: StandaloneValidator;
export const validateDesignDocument: StandaloneValidator;
export const validateOperation: StandaloneValidator;
export const validateBaselineManifest: StandaloneValidator;
export const validateAcceptanceCriteria: StandaloneValidator;
export const validatePreviewIndex: StandaloneValidator;
export const validatePreferenceEvent: StandaloneValidator;
export const validateRetrievalQuery: StandaloneValidator;
export const validateEngineRequestGenerate: StandaloneValidator;
export const validateEngineRequestRender: StandaloneValidator;
export const validateEngineRequestEvaluate: StandaloneValidator;
export const validateEngineRequestIngest: StandaloneValidator;
export const validateEngineRequestPublish: StandaloneValidator;
export const validateEngineResultGenerate: StandaloneValidator;
export const validateEngineResultRender: StandaloneValidator;
export const validateEngineResultEvaluate: StandaloneValidator;
export const validateEngineResultIngest: StandaloneValidator;
export const validateEngineResultPublish: StandaloneValidator;
