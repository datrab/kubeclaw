// Only retired runtime authorities are forbidden. A v1 data/provider schema is
// independent of the pipeline runtime version and remains valid when registered.
export const retiredHarnessContracts = Object.freeze([
  'logs/pipeline', 'pipeline_lifecycle_read_models.v1',
  'canonical-events.jsonl', 'pipeline_run.halted',
]);
export function retiredHarnessHits(source) {
  return retiredHarnessContracts.filter(contract => source.includes(contract));
}
