import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileJournal} from '../../../skills/nova/core/state/journal.ts';
import {verifiedArchitectureValue} from '../../../skills/nova/plugins/prism-design/src/architecture.ts';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';

const [effectsFile,runDirectory,key]=process.argv.slice(2);
const originalBytes=fs.readFileSync(effectsFile);
const journal=new FileEffectJournal(effectsFile),receipt=await journal.receipt(key);
assert(receipt);
const events=new FileJournal(path.join(runDirectory,'events.jsonl'));
const completed=events.records().find(({entry})=>entry.type==='attempt.completed'&&entry.identity.stageId==='source');
assert(completed);
const expected=completed.entry.payload.result.artifacts[0];
let error;
try{assert.deepEqual(verifiedArchitectureValue(receipt.result,expected),receipt.result.value);}catch(caught){error=caught.message;}
assert.deepEqual(fs.readFileSync(effectsFile),originalBytes);
console.log(JSON.stringify({locale:new Intl.Collator().resolvedOptions().locale,accepted:error===undefined,error:error??null,
  portable:expected.encoding==='kubeclaw-json.utf16.v1',originalLegacyVerifierMatches:sha256Text(canonicalJson(receipt.result.value))===expected.digest,
  originalJournalDigest:sha256Text(originalBytes),originalJournalUnchanged:true,expectedRefFromActualLifecycle:true}));
