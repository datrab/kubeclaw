import { registerHooks } from 'node:module';
const mode = process.env.WAIT_PROJECTION_MUTANT;
const selections = {
  'selected-audience': ['skills/nova/core/execution/adapter-startup.ts', " && selectedWait?.package.manifest.id === 'kubeclaw.wait-store'\n        && selectedWait.registration.id === 'waits'", ''],
  'events-prefix': ['skills/nova/core/state/wait-projection-reader.ts', 'hash(events) !== source.eventsDigest || ', ''],
  'receipt-authority': ['scripts/retire-wait-value.mjs', 'receiptAuthority(receipts, scope.intent, confirmed);', 'void receipts;'],
  'original-wait-digest': ['scripts/observability-retirement/operator-authority.mjs', 'payloadDigest: payloadDigest(original)', 'payloadDigest: record.payloadDigest'],
};
const selection = selections[mode];
if (!selection) throw new Error('MUTANT_SELECTION_INVALID');
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith(`/${selection[0]}`)) return result;
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString();
  if (source.split(selection[1]).length !== 2) throw new Error('MUTANT_TARGET_NOT_UNIQUE');
  process.stderr.write(`SEMANTIC_MUTANT_APPLIED:${mode}\n`);
  return { ...result, source: source.replace(selection[1], selection[2]) };
} });
