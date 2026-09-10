import assert from 'node:assert/strict';
import test from 'node:test';
import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {reportArtifactEncoding} from '../src/review-report-encoding.ts';

test('own finite report mode has an exact legacy absence and rejects non-JSON before getters',()=>{
 assert.equal(reportArtifactEncoding({agent:'echo'}),undefined);
 assert.equal(reportArtifactEncoding({agent:'echo',reportArtifactEncoding:PORTABLE_JSON_ENCODING}),PORTABLE_JSON_ENCODING);
 for(const value of [undefined,null,false,1,'future',{},[]])assert.throws(()=>reportArtifactEncoding({agent:'echo',reportArtifactEncoding:value}));
 let reads=0;
 assert.throws(()=>reportArtifactEncoding({agent:'echo',get reportArtifactEncoding(){reads++;return PORTABLE_JSON_ENCODING;}}));
 assert.equal(reads,0);
 assert.throws(()=>reportArtifactEncoding({agent:'echo',reportArtifactEncoding:PORTABLE_JSON_ENCODING,other:NaN}));
});
