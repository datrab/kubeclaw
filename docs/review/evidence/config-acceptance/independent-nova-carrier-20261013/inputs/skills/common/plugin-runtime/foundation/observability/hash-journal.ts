import {createHash} from 'node:crypto';

export interface HashJournalRecord<T> {
  readonly sequence: number;
  readonly previousHash: string | null;
  readonly hash: string;
  readonly entry: T;
}

/** The original append-journal wire hash. Parsing does not repair or write. */
export function hashJournalRecord(sequence:number, previousHash:string|null, entry:unknown):string {
  return `sha256:${createHash('sha256').update(JSON.stringify({sequence,previousHash,entry})).digest('hex')}`;
}

export function parseHashJournal<T>(buffer:Buffer, file:string, precedingSequence=0, precedingHash:string|null=null):HashJournalRecord<T>[] {
  if (!buffer.length) return [];
  const text=buffer.toString('utf8');
  if(!text.endsWith('\n'))throw new Error(`JOURNAL_RECORD_INCOMPLETE:${file}`);
  const records:HashJournalRecord<T>[]=[];
  for(const line of text.slice(0,-1).split('\n')) {
    const sequence=precedingSequence+records.length+1;
    if(!line.length)throw new Error(`JOURNAL_RECORD_EMPTY:${file}:${sequence}`);
    const record=JSON.parse(line) as HashJournalRecord<T>;
    const previousHash=records.at(-1)?.hash??precedingHash;
    if(record.sequence!==sequence || record.previousHash!==previousHash)throw new Error(`JOURNAL_CHAIN_INVALID:${file}:${sequence}`);
    if(record.hash!==hashJournalRecord(sequence,previousHash,record.entry))throw new Error(`JOURNAL_HASH_INVALID:${file}:${sequence}`);
    records.push(record);
  }
  return records;
}
