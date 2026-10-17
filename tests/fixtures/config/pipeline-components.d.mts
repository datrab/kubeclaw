/** Deliberately mutable complete raw authors, including invalid test values. */
import type { SwarmSelection } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';
type RawDocument = ReturnType<typeof JSON.parse>;
export type TestPipelineDocuments = Record<string, RawDocument>;
export const canonicalPipelineEntry: string;
export function readTestPipeline(entryFile?: string | URL): TestPipelineDocuments;
export function writeTestPipeline(entryFile: string, documents: TestPipelineDocuments): void;
export function busterRuntimeSelection(documents: TestPipelineDocuments): SwarmSelection;
