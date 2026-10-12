import ts from 'typescript';

const environmentRoots = new Set(['process.env', 'environment', 'env']);
const environmentName = /^[A-Z][A-Z0-9_]+$/u;
function literalName(node) {
  return node && ts.isStringLiteralLike(node) && environmentName.test(node.text) ? node.text : undefined;
}

// Candidate discovery only: never evaluate a source expression or environment.
export function additionalEnvironmentReads(source) {
  const helpers = new Map();
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    const parameters = statement.parameters.map(parameter => ts.isIdentifier(parameter.name) ? parameter.name.text : undefined);
    const bindings = [];
    function find(node) {
      // Nested functions have their own parameters and are not this helper's body.
      if (node !== statement.body && ts.isFunctionLike(node)) return;
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
        && node.argumentExpression && ts.isIdentifier(node.argumentExpression)) {
        const environment = parameters.indexOf(node.expression.text);
        const name = parameters.indexOf(node.argumentExpression.text);
        if (environment >= 0 && name >= 0) bindings.push({environment, name});
      }
      ts.forEachChild(node, find);
    }
    find(statement.body);
    if (bindings.length) helpers.set(statement.name.text, bindings);
  }
  const reads = [];
  function visit(node) {
    if (ts.isElementAccessExpression(node) && environmentRoots.has(node.expression.getText(source))) {
      const name = literalName(node.argumentExpression);
      if (name) reads.push({name, node, mechanism: 'computed environment read'});
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      for (const binding of helpers.get(node.expression.text) ?? []) {
        const argument = node.arguments[binding.environment];
        const name = literalName(node.arguments[binding.name]);
        if (!argument || !name) continue;
        // Quoted first-name arguments already belong to the original helper scanner.
        const coveredByOriginal = binding.name === 0 && ts.isStringLiteral(node.arguments[0]);
        if (!coveredByOriginal && environmentRoots.has(argument.getText(source))) {
          reads.push({name, node, mechanism: `local helper ${node.expression.text}; candidate binding requires semantic review`});
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return reads;
}
