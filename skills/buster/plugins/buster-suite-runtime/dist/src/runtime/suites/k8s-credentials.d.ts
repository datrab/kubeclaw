export type AnyRecord = Record<string, any>;
export type TestCredentialSpec = {
    secretName: string;
    keys: string[];
    purpose: string | null;
};
export declare function parseSecretNameFromRef(ref: string | null): string | null;
export declare function normalizeTestCredentialSpecs(k8sCfg?: AnyRecord, previewCfg?: AnyRecord): TestCredentialSpec[];
export declare function buildPreviewCredentialCommand(secretName: string | null, keys: string[], namespace: string): string | null;
