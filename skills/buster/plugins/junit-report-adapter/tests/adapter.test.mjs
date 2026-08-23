import assert from 'node:assert/strict';
import { adapt } from '../src/adapter.js';

const limits = Object.freeze({ maximumCases: 100, maximumFindings: 100, maximumCaseFindings: 10 });
const input = (xml, custom = limits) => ({
  schemaVersion: 'report-adapter-input.v1',
  mediaType: 'application/junit+xml',
  bytes: Buffer.from(xml),
  limits: custom,
});

const mixed = adapt(input(`<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="all">
  <testsuite name="root">
    <testsuite name="child">
      <testcase name="passes" classname="Example" time="0.1"/>
      <testcase name="fails" classname="Example" file="src/example.test.ts" line="12" time="0.2">
        <failure message="expected &lt;true&gt;"><![CDATA[received false]]></failure>
      </testcase>
      <testcase name="errors" time="0.3"><error type="crash">process exited</error></testcase>
      <testcase name="skips" time="0.4"><skipped message="not supported"/></testcase>
    </testsuite>
  </testsuite>
</testsuites>`));
assert.deepEqual(mixed.counts, { total: 4, passed: 1, failed: 1, errored: 1, skipped: 1 });
assert.equal(mixed.durationMs, 1000);
assert.deepEqual(mixed.cases[1].suitePath, ['root', 'child']);
assert.equal(mixed.cases[1].findings[0].message, 'expected <true>: received false');
assert.equal(mixed.cases[1].findings[0].file, 'src/example.test.ts');
assert.equal(mixed.cases[1].findings[0].line, 12);
assert.equal(mixed.cases[2].outcome, 'errored');
assert.equal(mixed.cases[3].outcome, 'skipped');
const nodeTest = adapt(input(`<testsuites>
  <testcase name="passes" classname="test" time="0.001"/>
  <testcase name="skips" classname="test" time="0.001"><skipped type="skipped" message="true"/></testcase>
</testsuites>`));
assert.deepEqual(nodeTest.counts, { total: 2, passed: 1, failed: 0, errored: 0, skipped: 1 });
assert.deepEqual(nodeTest.cases[0].suitePath, ['testsuites']);
const escapedEntityText = adapt(input('<testsuite><testcase name="entity"><failure>&amp;unknown;</failure></testcase></testsuite>'));
assert.equal(escapedEntityText.cases[0].findings[0].message, '&unknown;');
const declarationText = adapt(input('<testsuite><testcase name="html"><failure><![CDATA[received <!DOCTYPE html>]]></failure></testcase></testsuite>'));
assert.equal(declarationText.cases[0].findings[0].message, 'received <!DOCTYPE html>');

const truncated = adapt(input(`<testsuite name="many">
  <testcase name="one"><failure message="first"/><failure message="second"/></testcase>
  <testcase name="two"/>
  <testcase name="three"/>
</testsuite>`, { maximumCases: 2, maximumFindings: 1, maximumCaseFindings: 1 }));
assert.deepEqual(truncated.counts, { total: 3, passed: 2, failed: 1, errored: 0, skipped: 0 });
assert.equal(truncated.cases.length, 2);
assert.equal(truncated.casesTruncated, true);
assert.equal(truncated.omittedCaseCount, 1);
assert.equal(truncated.cases[0].findings.length, 1);
assert.equal(truncated.cases[0].findingsTruncated, true);
assert.equal(truncated.cases[0].omittedFindingCount, 1);

const namespaced = adapt(input('\ufeff<j:testsuite xmlns:j="urn:junit" name="pytest"><j:testcase name="ok"/></j:testsuite>'));
assert.deepEqual(namespaced.counts, { total: 1, passed: 1, failed: 0, errored: 0, skipped: 0 });

assert.throws(() => adapt(input('<!DOCTYPE testsuite [<!ENTITY x SYSTEM "file:///etc/passwd">]><testsuite/>')),
  /JUNIT_XML_DECLARATION_FORBIDDEN/u);
assert.throws(() => adapt(input('<testsuite><testcase name="bad">&unknown;</testcase></testsuite>')),
  /JUNIT_XML_ENTITY_UNKNOWN/u);
assert.throws(() => adapt(input('<testsuite name="bad & value"/>')), /JUNIT_XML_ENTITY_INVALID/u);
assert.throws(() => adapt(input('<?xml-stylesheet href="report.css"?><testsuite/>')),
  /JUNIT_XML_PROCESSING_INSTRUCTION_INVALID/u);
assert.throws(() => adapt(input('<?XML VERSION="1.0" ENCODING="UTF-8"?><testsuite/>')),
  /JUNIT_XML_PROCESSING_INSTRUCTION_INVALID/u);
assert.throws(() => adapt(input('<?xml version="1.0" encoding="UT8"?><testsuite/>')),
  /JUNIT_XML_PROCESSING_INSTRUCTION_INVALID/u);
assert.throws(() => adapt(input('<!-- preface --><?xml version="1.0"?><testsuite/>')),
  /JUNIT_XML_PROCESSING_INSTRUCTION_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase></testsuite>')), /JUNIT_XML_TAG_MISMATCH/u);
assert.throws(() => adapt(input('<testsuite><testcase name="bad"><failure>bad ]]></failure></testcase></testsuite>')),
  /JUNIT_XML_TEXT_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase name="bad\u0001"/></testsuite>')),
  /JUNIT_XML_CHARACTER_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase name="bad &#x1F;"/></testsuite>')),
  /JUNIT_XML_CHARACTER_INVALID/u);
assert.throws(() => adapt(input('<testsuite><!-- one -- two --><testcase name="ok"/></testsuite>')),
  /JUNIT_XML_COMMENT_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase time="never"/></testsuite>')), /JUNIT_DURATION_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase time="1e300"/></testsuite>')), /JUNIT_DURATION_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase time="2592001"/></testsuite>')), /JUNIT_DURATION_INVALID/u);
assert.throws(() => adapt(input('<testsuite><testcase time="2592000.0000000000000001"/></testsuite>')),
  /JUNIT_DURATION_INVALID/u);
assert.throws(() => adapt({ ...input('<testsuite/>'), mediaType: 'application/json' }), /JUNIT_MEDIA_TYPE_UNSUPPORTED/u);
assert.throws(() => adapt({ ...input(''), bytes: Uint8Array.from([0xc3, 0x28]) }), /JUNIT_UTF8_INVALID/u);
assert.throws(() => adapt({ ...input(''), bytes: Buffer.concat([
  Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<testsuite/>'),
]) }), /JUNIT_BOM_INVALID/u);
assert.throws(() => adapt({ ...input(''), bytes: Buffer.concat([
  Buffer.from([0xef, 0xbb, 0xbf, 0x20]), Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<testsuite/>'),
]) }), /JUNIT_BOM_INVALID/u);

console.log(JSON.stringify({ ok: true, dialects: ['junit', 'pytest'], bounded: true, safeXml: true }));
