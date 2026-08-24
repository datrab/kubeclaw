import assert from 'node:assert/strict';
import { activate } from '../src/adapter.ts';

assert.equal(typeof activate, 'function');
console.log(JSON.stringify({ ok: true, plugin: 'kubeclaw.remote-test-gate', live: true }));
