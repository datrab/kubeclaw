export interface ArchitectureInput {
    readonly task: string;
    readonly architecture?: Readonly<Record<string, unknown>>;
}
export declare function buildArchitectureRequest(agent: string, input: ArchitectureInput, guidance: unknown): Readonly<Record<string, unknown>>;
