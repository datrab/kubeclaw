/** Deliberately mutable raw JSON documents, including invalid values authored by negative tests. */
type RawDocument = ReturnType<typeof JSON.parse>;
export type TestSwarmBundle = Record<string, RawDocument>;
export const componentOwners: readonly string[];
export const bundleNames: readonly string[];
export const canonicalSwarmEntry: string;
export function readTestBundle(entryFile: string | URL): TestSwarmBundle;
export function writeTestBundle(entryFile: string, documents: TestSwarmBundle): void;
export function projectTestBundle(documents: TestSwarmBundle): RawDocument;
export function bundleFromConfigMap(data: Record<string, string>): TestSwarmBundle;
