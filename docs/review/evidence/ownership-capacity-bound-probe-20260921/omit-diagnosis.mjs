import { registerHooks } from 'node:module';

registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/skills/worker/core/worker/ownership-capacity.ts')) return result;
  const source = String(result.source);
  const original = "const maximumDiagnosis = '\\u0000'.repeat(maximumOwnershipDiagnosisUnits);";
  if (source.split(original).length !== 2) throw new Error('MUTATION_TARGET_MISMATCH');
  return { ...result, source: source.replace(original, "const maximumDiagnosis = 'x';") };
} });
