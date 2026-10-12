import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
 const result = next(url, context);
 if (!url.endsWith('/tests/verification/reliability/effect-lock-configuration.test.mjs')) return result;
 let source = String(result.source);
 const capture = 'return Reflect.apply(acquire, this, [resource, owner, value, ...rest]);';
 assert.equal(source.split(capture).length, 2);
 source = source.replace('observed = [];', 'observed = [], observedLockIds = new Set();');
 source = source.replace(capture, 'const actualLock = Reflect.apply(acquire, this, [resource, owner, value, ...rest]); observedLockIds.add(actualLock.lockId); return actualLock;');
 const anchor = "assert.ok(history.includes('released'), 'actual lock persistence and release remain exercised');";
 assert.equal(source.split(anchor).length, 2);
 return {...result, source:source.replace(anchor, `${anchor}
      const persisted = history.trim().split('\\n').map(line => JSON.parse(line).entry).filter(entry => entry.status === 'active' && observedLockIds.has(entry.lockId));
      assert.ok(persisted.length > 0, 'independent: actual active locks persisted');
      const seen = new Set();
      for (const entry of persisted) {
        if (seen.has(entry.lockId)) continue;
        seen.add(entry.lockId);
        assert.equal(Date.parse(entry.expiresAt) - Date.parse(entry.acquiredAt), ttl, 'independent: initial persisted lock lifetime matches authored profile');
      }
      assert.equal(seen.size, observedLockIds.size, 'every observed acquisition has its initial persisted record');
      console.log('INDEPENDENT_PERSISTED_TTL', ttl, persisted.length);
 `)};
}});
