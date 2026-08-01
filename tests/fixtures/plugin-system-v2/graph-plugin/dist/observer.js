import fs from 'node:fs';
import path from 'node:path';

export async function observe(delivery, context) {
  const journalPath = context.contract.config.journalPath;
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  fs.appendFileSync(journalPath, `${JSON.stringify({
    type: delivery.event.type,
    identity: delivery.event.identity,
  })}\n`);
}
