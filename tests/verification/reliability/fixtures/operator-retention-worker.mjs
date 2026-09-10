import { once } from 'node:events';
import { FileDurableRecordStore } from '../../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import { withRunMutationLock } from '../../../../skills/nova/core/execution/run-mutation.ts';
import { completeDelivery, failDelivery } from '../../../../skills/common/plugins/operator-messaging/src/delivery-records.ts';

const [mode, raw] = process.argv.slice(2), data = JSON.parse(raw);
const hold = async () => { process.send('held'); await once(process, 'message'); };
const store = root => new FileDurableRecordStore(root, { maximumRecords: 100, maximumBytes: 1048576, maximumRecordBytes: 2 * 1048576 + 65536 });
if (mode === 'hold-run') await withRunMutationLock(data.scope.intent.runRoot, hold);
else if (mode === 'hold-wait') await store(data.scope.intent.waitRoot).withRecords('waits/all', hold);
else if (mode === 'hold-delivery') await store(data.scope.intent.deliveryRoot).withRecords('notifications/operators', hold);
else {
  process.send('started');
  const records = store(data.scope.intent.deliveryRoot);
  const receipt = mode === 'complete'
    ? await completeDelivery(records, data.request, data.reservation, { accepted: true, target: 'operators', status: 201 })
    : await failDelivery(records, data.request, data.reservation, true, new Error('late original sender failure'));
  process.send({ receipt });
}
process.disconnect();
