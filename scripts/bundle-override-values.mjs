// Emit a fixed configuration mapping, not interpolated YAML string fragments.
// JSON flow mappings are valid YAML; JSON.stringify preserves quotes, escapes
// and embedded newlines in all selected bundle/auth values.
const [archiveUrl, expectedCommit, contractVersion, existingSecret = '', existingSecretKey = 'token'] = process.argv.slice(2);
if ([archiveUrl, expectedCommit, contractVersion].some(value => typeof value !== 'string')) {
  throw new Error('Bundle archive URL, expected commit and contract version required');
}
const codeBundle = {enabled: true, archiveUrl, expectedCommit, contractVersion};
if (existingSecret) codeBundle.auth = {existingSecret, existingSecretKey};
process.stdout.write(`codeBundle: ${JSON.stringify(codeBundle)}\n`);
