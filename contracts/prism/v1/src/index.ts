import { assertPrismComplexity } from "./complexity.ts";
export { PRISM_JSON_LIMITS, PrismContractError } from "./complexity.ts";
import schema from "../schemas/prism-v1.schema.json" with { type: "json" };
import {
  validateAcceptanceCriteria,
  validateBaselineManifest,
  validateDesignDocument,
  validateDesignRequest,
  validateEngineRequestEvaluate,
  validateEngineRequestGenerate,
  validateEngineRequestIngest,
  validateEngineRequestPublish,
  validateEngineRequestRender,
  validateEngineResultEvaluate,
  validateEngineResultGenerate,
  validateEngineResultIngest,
  validateEngineResultPublish,
  validateEngineResultRender,
  validateOperation,
  validatePreferenceEvent,
  validatePreviewIndex,
  validateRetrievalQuery,
  type StandaloneValidator,
} from "./validators.generated.mjs";
import { validateDocumentSemantics } from "./document-semantics.ts";
import { validateNodeCatalog as checkNodeCatalog } from "./node-catalog.ts";
export { prismNodeTypes } from "./node-catalog.ts";
export function validateNodeCatalog(node: Parameters<typeof checkNodeCatalog>[0], path = "root"): void {
  assertPrismComplexity(node, "PRISM_INPUT_INVALID: nodeCatalog");
  checkNodeCatalog(node, path);
}

export const PRISM_CONTRACT_ID = "kubeclaw.prism-design-engine@1";
export const PRISM_SCHEMA_ID = schema.$id;
const validators = new Map<string, StandaloneValidator>([
  ["designRequest", validateDesignRequest],
  ["designDocument", validateDesignDocument],
  ["operation", validateOperation],
  ["baselineManifest", validateBaselineManifest],
  ["acceptanceCriteria", validateAcceptanceCriteria],
  ["previewIndex", validatePreviewIndex],
  ["preferenceEvent", validatePreferenceEvent],
  ["retrievalQuery", validateRetrievalQuery],
]);

export function validatePrism<T>(
  name:
    | "designRequest"
    | "designDocument"
    | "operation"
    | "baselineManifest"
    | "acceptanceCriteria"
    | "previewIndex"
    | "preferenceEvent"
    | "retrievalQuery",
  value: unknown,
): T {
  assertPrismComplexity(value, `PRISM_INPUT_INVALID: ${name}`);
  const validator = validators.get(name);
  if (!validator || !validator(value)) {
    const details =
      validator?.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .slice(0, 8)
        .join("; ") ?? "unknown schema";
    throw new Error(`PRISM_INPUT_INVALID: ${name}: ${details}`);
  }
  if (name === "designDocument") validateDocumentSemantics(value as PrismDocument);
  return value as T;
}

const requestValidators = new Map<string, StandaloneValidator>([
  ["generate", validateEngineRequestGenerate],
  ["render", validateEngineRequestRender],
  ["evaluate", validateEngineRequestEvaluate],
  ["ingest", validateEngineRequestIngest],
  ["publish", validateEngineRequestPublish],
]);
const resultValidators = new Map<string, StandaloneValidator>([
  ["generate", validateEngineResultGenerate],
  ["render", validateEngineResultRender],
  ["evaluate", validateEngineResultEvaluate],
  ["ingest", validateEngineResultIngest],
  ["publish", validateEngineResultPublish],
]);
function validateEngine(
  map: Map<string, StandaloneValidator>,
  operation: string,
  value: unknown,
  kind: string,
): void {
  assertPrismComplexity(value, `PRISM_${kind}_INVALID: ${operation}`);
  const validator = map.get(operation);
  if (!validator || !validator(value)) {
    const details =
      validator?.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .slice(0, 8)
        .join("; ") ?? "unknown operation";
    throw new Error(`PRISM_${kind}_INVALID: ${operation}: ${details}`);
  }
}
export function validateEngineRequest(operation: string, value: unknown): void {
  validateEngine(requestValidators, operation, value, "ENGINE_REQUEST");
}
export function validateEngineResult(operation: string, value: unknown): void {
  validateEngine(resultValidators, operation, value, "ENGINE_RESULT");
}

export type PrismNode = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: PrismNode[];
};
export type PrismDocument = {
  meta: {
    schema: "prism.design-document.v1";
    documentId: string;
    projectId: string;
    revision: number;
    title: string;
    createdAt: string;
    updatedAt: string;
  };
  theme: Record<string, unknown>;
  assets: Record<string, unknown>;
  components: Record<string, unknown>;
  views: Record<
    string,
    {
      title: string;
      surface: string;
      root: PrismNode;
      initialState?: string;
      states: Record<
        string,
        { patches: Record<string, Record<string, unknown>> }
      >;
      responsive: Record<
        string,
        { patches: Record<string, Record<string, unknown>> }
      >;
      mockData?: Record<string, unknown>;
    }
  >;
  flows: Record<string, unknown>;
};
