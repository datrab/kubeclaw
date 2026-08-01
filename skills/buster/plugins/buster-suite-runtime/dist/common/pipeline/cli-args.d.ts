type CliFlagType = 'boolean' | 'string';
type CliFlagSpec = {
    type?: CliFlagType;
    default?: unknown;
    required?: boolean;
};
type CliSchema = {
    flags?: Record<string, CliFlagSpec>;
    allowPositionals?: boolean;
    minPositionals?: number;
    maxPositionals?: number;
};
type ParsedCliArgs = {
    values: Record<string, unknown>;
    positionals: string[];
};
export declare function parseCliArgs(argv?: string[], schema?: CliSchema): ParsedCliArgs;
export declare function parseCliFlagValues(argv?: string[], schema?: CliSchema): Record<string, unknown>;
export {};
