import assert from 'node:assert/strict';
import { validateReferencedSchema } from '../../../skills/common/plugin-runtime/foundation/registry/schema.ts';
const source = JSON.stringify({$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://review.invalid/config',type:'object'});
validateReferencedSchema(source, '/review/config.schema.json');
assert.throws(() => validateReferencedSchema(source, '/review/config.schema.json'), e => {
  assert.equal(e.code, 'REGISTRY_MANIFEST_INVALID');
  assert.match(e.details.cause, /already exists/);
  console.log(JSON.stringify({observed:e.code,cause:e.details.cause}));
  return true;
});
