import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrate, ContentAddressedArtifactStore } from '../../../skills/prism/storage/index.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const db=new PGlite({extensions:{vector}});
try {
 await migrate(db);
 try {await db.query("SELECT $1::uuid",['event-0123456789abcdef01234567']); console.log('unexpected UUID acceptance');}
 catch(e){console.log('Control generated event ID rejected by actual PGlite UUID type:', e.message);}
} finally {await db.close();}
const root=await mkdtemp(join(tmpdir(),'prism-review-'));
try {
 const store=new ContentAddressedArtifactStore(root); const a=await store.put(Buffer.from('original')); const hex=a.digest.slice(7);
 await writeFile(join(root,hex.slice(0,2),hex),'corrupt');
 console.log('put existing corrupt object still acknowledges:',await store.put(Buffer.from('original')));
 try {await store.get(a.artifactId);}catch(e){console.log('subsequent get:',e.message);}
} finally {await rm(root,{recursive:true,force:true});}
