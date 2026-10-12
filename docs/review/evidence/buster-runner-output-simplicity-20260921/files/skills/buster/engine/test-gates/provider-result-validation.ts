import { E2E_RESULT_SCHEMA_ID, validateE2eProviderDetails, validatePipelineTestGateContract,
  type DeclaredEvidenceV1, type ProviderResultV1, type EvidenceRefV1, type ProducedOutputV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderRegistryEntry } from '@kubeclaw/plugin-foundation/registry/types';

/** Validate the provider's serialized result before the runner stages any evidence. */
export function validateBusterProviderResult(entry: TestProviderRegistryEntry, result: ProviderResultV1,
  maximumBytes: number): void {
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded) > maximumBytes) throw new Error('TEST_PROVIDER_RESULT_LIMIT');
  validatePipelineTestGateContract('providerResult', result);
  validateProviderResultCounts(result);
  validateProviderDetails(entry, result);
  validateEvidenceDeclarations(entry, result.evidenceFiles);
  validateProviderReports(entry, result);
}

export function validateProviderResultCounts(result: ProviderResultV1): void {
  const { total, passed, failed, skipped } = result.counts;
  if (total !== passed + failed + skipped)
    throw new Error("TEST_PROVIDER_COUNTS_INVALID");
  if (result.outcome === "passed" && failed !== 0)
    throw new Error("TEST_PROVIDER_OUTCOME_INVALID");
}

function validateProviderDetails(entry: TestProviderRegistryEntry, result: ProviderResultV1): void {
  if (entry.registration.contractId === 'kubeclaw.playwright@1') validateE2eProviderDetails(result.providerDetails);
  else if (result.providerDetails?.schemaId === E2E_RESULT_SCHEMA_ID) validateE2eProviderDetails(result.providerDetails);
}

function validateEvidenceDeclarations(
  entry: TestProviderRegistryEntry,
  files: readonly DeclaredEvidenceV1[],
): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const file of files) {
    if (file.evidenceId === "runner-log")
      throw new Error("TEST_PROVIDER_EVIDENCE_ID_RESERVED:runner-log");
    if (!entry.registration.evidenceTypes.includes(file.type))
      throw new Error(`TEST_PROVIDER_EVIDENCE_TYPE_INVALID:${file.type}`);
    // One physical file has one evidence identity. This keeps file limits, selection, and storage ownership unambiguous.
    if (ids.has(file.evidenceId) || paths.has(file.file))
      throw new Error(`TEST_PROVIDER_EVIDENCE_DUPLICATE:${file.evidenceId}`);
    ids.add(file.evidenceId);
    paths.add(file.file);
  }
}

function validateProviderReports(entry: TestProviderRegistryEntry, result: ProviderResultV1): void {
  const ids = new Set<string>();
  for (const report of result.reports) {
    if (ids.has(report.evidenceId)) throw new Error(`TEST_PROVIDER_REPORT_DUPLICATE:${report.evidenceId}`);
    ids.add(report.evidenceId);
    if (!entry.registration.reportFormats.includes(report.format)) {
      throw new Error(`TEST_PROVIDER_REPORT_FORMAT_INVALID:${report.format}`);
    }
    const evidence = result.evidenceFiles.find((item) => item.evidenceId === report.evidenceId);
    if (!evidence) throw new Error(`TEST_PROVIDER_REPORT_EVIDENCE_MISSING:${report.evidenceId}`);
    if (evidence.type !== 'test-report') throw new Error(`TEST_PROVIDER_REPORT_EVIDENCE_TYPE_INVALID:${report.evidenceId}`);
  }
}


/** Map declared outputs only after their evidence has been staged and verified. */
export function validateAndMapOutputs(
  entry: TestProviderRegistryEntry,
  result: ProviderResultV1,
  artifacts: ReadonlyMap<string, EvidenceRefV1>,
): ProducedOutputV1[] {
  const outputs: ProducedOutputV1[] = [];
  const seen = new Set<string>();
  for (const output of result.outputs) {
    if (seen.has(output.name))
      throw new Error(`TEST_PROVIDER_OUTPUT_DUPLICATE:${output.name}`);
    seen.add(output.name);
    const declaration = entry.registration.outputs.find(
      (item) => item.name === output.name,
    );
    if (!declaration || declaration.kind !== output.kind)
      throw new Error(`TEST_PROVIDER_OUTPUT_INVALID:${output.name}`);
    if (output.kind === "value" && declaration.kind === "value") {
      if (output.schemaId !== declaration.schemaId)
        throw new Error(`TEST_PROVIDER_OUTPUT_SCHEMA_INVALID:${output.name}`);
      outputs.push({
        name: output.name,
        kind: "value",
        schemaId: output.schemaId,
        value: structuredClone(output.value),
      });
    } else if (output.kind === "artifact" && declaration.kind === "artifact") {
      const evidence = artifacts.get(output.evidenceId);
      if (
        !evidence ||
        !declaration.mediaTypes.includes(evidence.artifact.mediaType)
      )
        throw new Error(`TEST_PROVIDER_OUTPUT_ARTIFACT_INVALID:${output.name}`);
      outputs.push({
        name: output.name,
        kind: "artifact",
        artifact: evidence.artifact,
      });
    }
  }
  validateRequiredOutputs(entry, result, seen);
  return outputs;
}

function validateRequiredOutputs(
  entry: TestProviderRegistryEntry,
  result: ProviderResultV1,
  seen: ReadonlySet<string>,
): void {
  for (const declaration of entry.registration.outputs) {
    if (result.outcome === "passed" && declaration.required && !seen.has(declaration.name))
      throw new Error(`TEST_PROVIDER_OUTPUT_REQUIRED:${declaration.name}`);
  }
}
