export const readinessGateCommands = Object.freeze([
  { id: 'extraction', file: 'scripts/docs-parity-extract.mjs', args: ['--check'] },
  { id: 'documentation-tree', file: 'scripts/docs-tree-boundary.mjs', args: ['--check'] },
  { id: 'documentation-tree-mutations', file: 'scripts/tests/docs-tree-boundary.test.mjs',
    nodeArgs: ['--test'], args: [
      'scripts/tests/docs-markdown-anchors.test.mjs',
      'scripts/tests/docs-check-refs.test.mjs',
    ] },
  { id: 'site', file: 'scripts/docs-check.mjs', args: [] },
  { id: 'publication', file: 'scripts/docs-publication.mjs', args: ['check'] },
  { id: 'references', file: 'scripts/docs-check-refs.mjs', args: [] },
  { id: 'reader-boundary', file: 'scripts/check-site-reader-boundary.mjs', args: [] },
]);
