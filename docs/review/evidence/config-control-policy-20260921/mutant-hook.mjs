import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';

const replacements = {
  subject: ['settings.pipelinePreferenceSubject ?? undefined', 'undefined'],
  root: ['artifactRoot: control.artifactRoot,', "artifactRoot: `${control.artifactRoot}-mutant`,"],
  studio: ['studioPublicUrl: control.studioPublicUrl,', "studioPublicUrl: 'https://wrong.example.invalid',"],
};
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/skills/prism/server/control-config.ts')) return result;
    const [before, after] = replacements[process.env.CONTROL_POLICY_MUTANT];
    const source = String(result.source);
    assert.equal(source.split(before).length, 2, 'exactly one production mutation target');
    return {...result, source:source.replace(before, after)};
  },
});
