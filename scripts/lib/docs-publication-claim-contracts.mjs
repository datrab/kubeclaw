import assert from 'node:assert/strict';

const obligationFields = ['prerequisites', 'expectedResults', 'errors', 'effects', 'cleanup', 'limits'];
function substantive(value, label) {
  if (typeof value === 'string') {
    assert(value.trim().length > 0, `${label}: empty authored obligation`);
    return 1;
  }
  if (Array.isArray(value)) {
    assert(value.length > 0, `${label}: missing authored disposition`);
    return value.reduce((count, entry, index) => count + substantive(entry, `${label}[${index}]`), 0);
  }
  assert(value && typeof value === 'object' && Object.keys(value).length > 0,
    `${label}: missing authored obligation`);
  let statements = 0;
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || typeof entry === 'boolean' || typeof entry === 'number') continue;
    statements += substantive(entry, `${label}.${key}`);
  }
  assert(statements > 0, `${label}: no substantive authored statement`);
  return statements;
}

// Exact authored procedure/projection responsibilities are maintenance contracts,
// not a heuristic census or execution of instructions. Source accuracy remains
// an independent content-review responsibility; this gate preserves those exact
// assertions and their source anchors, and joins actual native dispatch owners.
export function validatePublicationClaimContracts(declaration, sources, results = null) {
  assert(Array.isArray(declaration.contracts), 'missing authored publication claim contracts');
  const scopes = new Map([...declaration.pages, ...declaration.assets].map(item => [item.path, item]));
  assert.equal(declaration.contracts.length, scopes.size, 'whole publication contract coverage changed');
  const checks = new Map(declaration.checks.map(check => [check.id, check]));
  const seen = new Set();
  let anchorCount = 0;
  for (const contract of declaration.contracts) {
    assert(scopes.has(contract.sourceRef) && !seen.has(contract.sourceRef),
      `unknown or duplicate publication contract: ${contract.sourceRef}`);
    seen.add(contract.sourceRef);
    substantive(contract.kind, contract.sourceRef);
    substantive(contract.scope, contract.sourceRef);
    substantive(contract.owners, contract.sourceRef);
    for (const field of obligationFields) substantive(contract[field], `${contract.sourceRef}.${field}`);
    assert.equal(contract.execution?.mode, 'source-procedure-contract');
    assert.equal(contract.execution.productionExecution, false);
    assert.equal(contract.execution.historicalExecutionReused, false);
    substantive(contract.execution.statement, `${contract.sourceRef}.execution.statement`);
    // Fresh bounded native assertions are separate dispatcher results, never a
    // claim that a production procedure or old contextual callback was executed.
    assert.equal(contract.execution.nativeAssertions, 'separate-dispatched-results');
    assert(Array.isArray(contract.anchors) && contract.anchors.length > 0,
      `no actual authored source anchors: ${contract.sourceRef}`);
    for (const anchor of contract.anchors) {
      assert(anchor.ref === contract.sourceRef || anchor.ref.startsWith(`${contract.sourceRef}#`),
        `contract anchor belongs to another scope: ${contract.sourceRef}`);
      assert(sources.has(anchor.ref), `missing contract anchor input: ${anchor.ref}`);
      substantive(anchor.exactExcerpt, anchor.ref);
      assert(Number.isSafeInteger(anchor.occurrences) && anchor.occurrences > 0);
      const count = sources.get(anchor.ref).split(anchor.exactExcerpt).length - 1;
      assert.equal(count, anchor.occurrences, `authored contract source statement changed: ${anchor.ref}`);
      anchorCount++;
    }
    assert(Array.isArray(contract.nativeChecks), `missing contract check dispositions: ${contract.sourceRef}`);
    assert.equal(new Set(contract.nativeChecks).size, contract.nativeChecks.length);
    for (const id of contract.nativeChecks) {
      assert(id !== 'claim-contract' && checks.has(id), `unknown contract native owner: ${id}`);
      assert(checks.get(id).inputs.some(ref => ref === contract.sourceRef
        || ref.startsWith(`${contract.sourceRef}#`)),
      `contract native owner does not consume its source: ${contract.sourceRef} ${id}`);
      if (results) assert(results.some(result => result.id === id && result.result
        && typeof result.result === 'object'), `missing actual contract native result: ${id}`);
    }
  }
  return { authoredScopes: seen.size, exactSourceAnchors: anchorCount,
    sourceAccuracyReviewReperformed: false, documentProcedureOrProductionExecution: false,
    actualNativeResultsJoined: results !== null };
}
