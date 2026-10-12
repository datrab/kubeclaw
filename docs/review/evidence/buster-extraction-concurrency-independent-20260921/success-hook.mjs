import { registerHooks } from 'node:module';
const target = new URL('../../../../tests/verification/reliability/buster-extraction-concurrency.test.mts', import.meta.url).href;
registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (url !== target) return loaded;
  return { ...loaded, source: String(loaded.source) + `
// Independent modeled published-return boundary; no native success is simulated as proof.
test('independent published fast-path releases coordination after success', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'buster-success-review-'));
  try {
    const options = execution(root);
    const input = staged(77);
    let calls = 0;
    options.ledger.reserveExtraction = async () => {
      calls += 1;
      return { operation: { values: { admissionId: 'a'.repeat(32) } } };
    };
    options.ledger.reservations = async () => [{ admissionId: 'a'.repeat(32), phase: 'published',
      slotReleased: true, source: { modeledRetainedSource: true } }];
    const first = await extractBusterPreparation(options, input, new AbortController().signal);
    const second = await extractBusterPreparation(options, input, new AbortController().signal);
    assert.deepEqual(second, first);
    assert.equal(calls, 2, 'successful first call must release its guard');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
` };
} });
