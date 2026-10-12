import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Inventory, stableStat} from '../../../../scripts/observability-retirement/files.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-review-'));
const file = path.join(root, 'state.json');
let matches = 0, missed = 0;
try {
  for (let iteration = 0; iteration < 1000; iteration++) {
    fs.writeFileSync(file, '{"version":1}');
    const inventory = new Inventory(); inventory.root(root, 'review');
    const original = inventory.files.get(file);
    fs.writeFileSync(file, '{"version":2}');
    if (original.stamp !== stableStat(fs.statSync(file))) continue;
    matches++;
    inventory.verifyUnchanged();
    if (!inventory.blockers.some(item => item.code === 'SNAPSHOT_CHANGED')) missed++;
  }
  console.log(JSON.stringify({ iterations: 1000, sameMetadataActualWrites: matches, missedChanges: missed,
    method: Inventory.prototype.verifyUnchanged.toString() }, null, 2));
} finally { fs.rmSync(root, { recursive: true, force: true }); }
