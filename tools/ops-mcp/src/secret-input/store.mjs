import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
/** Only hashes, metadata and ciphertext enter this store. Single-writer CAS is SQLite-owned. */
export function openStore(file) {
 if(!isAbsolute(file))throw Error('ABSOLUTE_STORE_REQUIRED');mkdirSync(dirname(file),{recursive:true,mode:0o700});
 const db=new DatabaseSync(file);chmodSync(file,0o600);db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS inputs(id TEXT PRIMARY KEY, owner TEXT NOT NULL, tokenHash TEXT NOT NULL, metadata TEXT NOT NULL, state TEXT NOT NULL, sealed TEXT, envelopeHash TEXT, receipt TEXT);');
 return {
  insert(row){db.prepare('INSERT INTO inputs VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.owner,row.tokenHash,JSON.stringify(row.metadata),'pending',null,null,null);},
  get(id){const r=db.prepare('SELECT * FROM inputs WHERE id=?').get(id);return r?{...r,metadata:JSON.parse(r.metadata),sealed:r.sealed?JSON.parse(r.sealed):null}:undefined;},
  accept(id,hash,sealed,envelopeHash){return db.prepare("UPDATE inputs SET state='sealed',sealed=?,envelopeHash=? WHERE id=? AND tokenHash=? AND state='pending'").run(JSON.stringify(sealed),envelopeHash,id,hash).changes===1;},
  finish(id,envelopeHash,receipt){return db.prepare("UPDATE inputs SET state='stored',receipt=? WHERE id=? AND envelopeHash=? AND state='sealed'").run(receipt,id,envelopeHash).changes===1;},
  revoke(id,owner){return db.prepare("UPDATE inputs SET state='revoked',tokenHash='' WHERE id=? AND owner=? AND state='pending'").run(id,owner).changes===1;},
  countPending(owner,now){return db.prepare("SELECT count(*) AS n FROM inputs WHERE owner=? AND state='pending' AND json_extract(metadata,'$.expiresAt')>?").get(owner,now).n;},
  receive(row,sealed,envelopeHash,receipt){db.prepare('INSERT INTO inputs VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(row.id,row.owner,'',JSON.stringify(row.metadata),'stored',JSON.stringify(sealed),envelopeHash,receipt);},
  beginRevoke(id){return db.prepare("UPDATE inputs SET state='revoking' WHERE id=? AND state IN ('stored','sealed')").run(id).changes===1;},
  revoked(id,hash,receipt){return db.prepare("UPDATE inputs SET state='revoked',receipt=? WHERE id=? AND envelopeHash=? AND state IN ('stored','revoking','revoked')").run(receipt,id,hash).changes===1;},
  tombstone(row,hash,receipt){db.prepare("INSERT INTO inputs VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(row.id,row.owner,'',JSON.stringify(row.metadata),'revoked',null,hash,receipt);},
  prune(now){return db.prepare("DELETE FROM inputs WHERE state IN ('pending','revoked') AND json_extract(metadata,'$.expiresAt')<?").run(now-86400000).changes;},
  count(){return db.prepare('SELECT count(*) AS n FROM inputs').get().n;},
  close(){db.close();}
 };
}
