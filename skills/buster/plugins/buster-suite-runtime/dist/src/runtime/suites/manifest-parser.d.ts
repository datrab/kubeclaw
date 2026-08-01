type AnyRecord = Record<string, any>;
export interface ManifestData {
    kind: string | null;
    workloadCount: number;
    images: string[];
    env: AnyRecord[];
    envFrom: AnyRecord[];
    imagePullSecrets: boolean;
    hasLimits: boolean;
    hasReadinessProbe: boolean;
    hasLivenessProbe: boolean;
}
export interface SecretInfo {
    name: string;
    keys: string[];
}
export declare function loadYamlDocuments(content: string): AnyRecord[];
export declare function dumpYamlDocuments(docs: AnyRecord[]): string;
export declare function parseSecretYaml(content: string): SecretInfo;
export declare function extractFromParsedDocs(docs: AnyRecord[]): ManifestData;
export {};
