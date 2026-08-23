import type {
  SpecialistOperationV1,
  WorkerSpecialistResultV1,
} from "@kubeclaw/pipeline-worker-core-contract";
import { engineRequestSchema, engineResultSchema } from "@kubeclaw/prism-contracts-v1/digest";
import { validateEngineRequest, validateEngineResult, validatePrism } from "@kubeclaw/prism-contracts-v1";
import { PrismEngine, type EngineOperation } from "./index.ts";
const supportedOperations = new Set<EngineOperation>([
  "generate",
  "render",
  "evaluate",
  "ingest",
  "publish",
]);
export async function executePrismOperation(
  engine: PrismEngine,
  operation: SpecialistOperationV1,
  idempotencyKey: string,
  hydratedInput?: Record<string,unknown>,
): Promise<WorkerSpecialistResultV1> {
  if (operation.contractId !== "kubeclaw.prism-design-engine@1")
    throw new Error("worker operation is not for Prism");
  const rawName = operation.values.operation;
  if (
    typeof rawName !== "string" ||
    !supportedOperations.has(rawName as EngineOperation)
  )
    throw new Error("unsupported Prism operation");
  const name = rawName as EngineOperation;
  const requestContract = engineRequestSchema(name);
  if (operation.inputSchemaId !== requestContract.schemaId || operation.inputSchemaDigest !== requestContract.schemaDigest)
    throw new Error("Prism request schema does not match the installed contract");
  const input = hydratedInput??operation.values.input as Record<string, unknown>;
  validateEngineRequest(name,{operation:name,input});
  if(name!=="ingest")validatePrism("designDocument",input.document);
  const result = await engine.execute({
    contract: "kubeclaw.prism-design-engine@1",
    operation: name,
    input,
    idempotencyKey,
  });
  const resultContract = engineResultSchema(name);
  validateEngineResult(name,result.output);
  return {
    schemaId: resultContract.schemaId,
    schemaDigest: resultContract.schemaDigest,
    values: result.output as WorkerSpecialistResultV1["values"],
  };
}
