import fs from 'node:fs';
import { Pool } from 'pg';
import { reserveNativePrismOperation } from '../../skills/prism/control/native-operation-store.ts';

const [file, key] = process.argv.slice(2);
if (!file || !key || !process.env.PRISM_NATIVE_OPERATION_TEST_DATABASE_URL) throw new Error('Native writer test inputs required');
const database = new Pool({ connectionString: process.env.PRISM_NATIVE_OPERATION_TEST_DATABASE_URL, connectionTimeoutMillis: 10000 });
await reserveNativePrismOperation(database, key, JSON.parse(fs.readFileSync(file, 'utf8')));
process.stdout.write('durable\n');
setInterval(() => {}, 1000);
