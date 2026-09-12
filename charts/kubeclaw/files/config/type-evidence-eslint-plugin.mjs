// Audit-only TypeScript evidence rules. Findings are emitted by the
// experimental eslint-type-evidence tool and cannot block the main lint gate.

function annotationType(node) {
  return node?.type === 'TSTypeAnnotation' ? node.typeAnnotation : node;
}

function isIdentifierNamed(node, name) {
  return node?.type === 'Identifier' && node.name === name;
}

function typeReferenceName(node) {
  if (node?.type !== 'TSTypeReference') return null;
  return node.typeName?.type === 'Identifier' ? node.typeName.name : null;
}

function isUnknownType(node) {
  const type = annotationType(node);
  if (type?.type === 'TSUnknownKeyword') return true;
  return typeReferenceName(type) === 'Promise'
    && type.typeArguments?.params?.length === 1
    && isUnknownType(type.typeArguments.params[0]);
}

function isBroadIntermediateType(node) {
  return ['TSAnyKeyword', 'TSObjectKeyword', 'TSUnknownKeyword'].includes(annotationType(node)?.type);
}

function isBroadDictionaryType(node) {
  const type = annotationType(node);
  if (typeReferenceName(type) === 'Readonly' && type.typeArguments?.params?.length === 1) {
    return isBroadDictionaryType(type.typeArguments.params[0]);
  }
  if (typeReferenceName(type) === 'Record' && type.typeArguments?.params?.length === 2) {
    return annotationType(type.typeArguments.params[0])?.type === 'TSStringKeyword';
  }
  return type?.type === 'TSTypeLiteral'
    && type.members?.length > 0
    && type.members.every((member) => member.type === 'TSIndexSignature'
      && member.parameters?.length === 1
      && annotationType(member.parameters[0]?.typeAnnotation)?.type === 'TSStringKeyword');
}

function variableIsExported(variable) {
  const directlyExported = variable.identifiers.some((identifier) => identifier.parent?.type === 'VariableDeclarator'
    && identifier.parent.parent?.type === 'VariableDeclaration'
    && ['ExportDefaultDeclaration', 'ExportNamedDeclaration'].includes(identifier.parent.parent.parent?.type));
  if (directlyExported) return true;
  return variable.references.some((reference) => reference.identifier.parent?.type === 'ExportSpecifier'
    && reference.identifier.parent.local === reference.identifier);
}

function parameterAnnotation(parameter) {
  if (parameter?.type === 'TSParameterProperty') return parameterAnnotation(parameter.parameter);
  if (parameter?.type === 'AssignmentPattern') return parameterAnnotation(parameter.left);
  if (parameter?.type === 'RestElement') return parameterAnnotation(parameter.argument);
  return parameter?.typeAnnotation;
}

function resolveVariable(sourceCode, node, name) {
  for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable) return variable;
  }
  return null;
}

function normalizedTypeText(sourceCode, node) {
  return sourceCode.getText(annotationType(node)).replaceAll(/\s+/gu, '');
}

function isStaticProperty(node) {
  return node?.type === 'Literal'
    || (node?.type === 'TemplateLiteral' && node.expressions.length === 0);
}

function staticPropertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal') return String(node.value);
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const value = node.quasis[0]?.value;
    return value?.cooked === null ? value.raw : (value?.cooked ?? null);
  }
  return null;
}

function initializedObjectKeys(node) {
  const keys = new Set();
  for (const property of node.properties) {
    if (property.type === 'SpreadElement' || property.computed) return null;
    const name = staticPropertyName(property.key);
    if (name === null) return null;
    keys.add(name);
  }
  return keys;
}

function memberIsWritten(member) {
  const operation = member.parent;
  if (operation?.type === 'AssignmentExpression') return operation.left === member;
  if (operation?.type === 'UpdateExpression') return operation.argument === member;
  return operation?.type === 'UnaryExpression'
    && operation.operator === 'delete'
    && operation.argument === member;
}

function referenceNeedsBroadDictionary(reference, initializedKeys) {
  if (reference.init === true) return false;
  const parent = reference.identifier.parent;
  if (parent?.type === 'VariableDeclarator' && parent.id === reference.identifier) return false;
  if (parent?.type !== 'MemberExpression' || parent.object !== reference.identifier) return true;
  if (memberIsWritten(parent) || (parent.computed && !isStaticProperty(parent.property))) return true;
  const propertyName = staticPropertyName(parent.property);
  return propertyName === null || !initializedKeys.has(propertyName);
}

function usesBroadDictionaryContract(variable, initializedKeys) {
  return initializedKeys === null
    || variable.references.some((reference) => referenceNeedsBroadDictionary(reference, initializedKeys));
}

function importedTestNamespace(variable) {
  return variable.identifiers.some((identifier) => {
    const specifier = identifier.parent;
    const declaration = specifier?.parent;
    if (declaration?.type !== 'ImportDeclaration') return false;
    if (specifier.type === 'ImportNamespaceSpecifier') {
      return ['@jest/globals', 'vitest'].includes(declaration.source.value);
    }
    if (specifier.type !== 'ImportSpecifier') return false;
    const imported = specifier.imported?.name ?? specifier.imported?.value;
    return (declaration.source.value === 'vitest' && imported === 'vi')
      || (declaration.source.value === '@jest/globals' && imported === 'jest');
  });
}

function isTestMockNamespace(sourceCode, node) {
  if (node?.type !== 'Identifier') return false;
  const variable = resolveVariable(sourceCode, node, node.name);
  if (variable) return importedTestNamespace(variable);
  return ['jest', 'vi'].includes(node.name);
}

function functionParameters(node) {
  if (Array.isArray(node.params)) return node.params;
  if (Array.isArray(node.parameters)) return node.parameters;
  return [];
}

function createNoObjectParameters(context) {
  function inspect(node) {
    for (const parameter of functionParameters(node)) {
      const annotation = parameterAnnotation(parameter);
      if (annotationType(annotation)?.type === 'TSObjectKeyword') {
        context.report({ node: annotationType(annotation), messageId: 'forbidden' });
      }
    }
  }
  return {
    ArrowFunctionExpression: inspect,
    FunctionDeclaration: inspect,
    FunctionExpression: inspect,
    TSCallSignatureDeclaration: inspect,
    TSConstructSignatureDeclaration: inspect,
    TSConstructorType: inspect,
    TSDeclareFunction: inspect,
    TSFunctionType: inspect,
    TSMethodSignature: inspect,
  };
}

function createNoUnknownReturns(context) {
  function inspect(node) {
    if (isUnknownType(node.returnType)) {
      context.report({ node: annotationType(node.returnType), messageId: 'forbidden' });
    }
  }
  return {
    ArrowFunctionExpression: inspect,
    FunctionDeclaration: inspect,
    FunctionExpression: inspect,
    TSCallSignatureDeclaration: inspect,
    TSConstructSignatureDeclaration: inspect,
    TSConstructorType: inspect,
    TSDeclareFunction: inspect,
    TSFunctionType: inspect,
    TSMethodSignature: inspect,
  };
}

function createNoWidenThenAssert(context) {
  const sourceCode = context.sourceCode;
  const declarations = new Map();
  const widened = new Map();
  const assertions = [];
  function recordAssertion(node) {
    if (node.expression?.type !== 'Identifier') return;
    const variable = resolveVariable(sourceCode, node.expression, node.expression.name);
    if (variable) assertions.push({ node, variable });
  }
  return {
    VariableDeclarator(node) {
      if (node.id?.type !== 'Identifier') return;
      const variable = resolveVariable(sourceCode, node, node.id.name);
      if (!variable) return;
      declarations.set(variable, node);
      if (!isBroadIntermediateType(node.id.typeAnnotation) || node.init?.type !== 'Identifier') return;
      const sourceVariable = resolveVariable(sourceCode, node.init, node.init.name);
      if (sourceVariable) widened.set(variable, { node, sourceVariable });
    },
    TSAsExpression: recordAssertion,
    TSTypeAssertion: recordAssertion,
    'Program:exit'() {
      for (const assertion of assertions) {
        const flow = widened.get(assertion.variable);
        const source = flow ? declarations.get(flow.sourceVariable) : null;
        if (!source?.id?.typeAnnotation) continue;
        if (normalizedTypeText(sourceCode, source.id.typeAnnotation)
          !== normalizedTypeText(sourceCode, assertion.node.typeAnnotation)) continue;
        context.report({ node: assertion.node, messageId: 'forbidden' });
      }
    },
  };
}

const typeEvidence = {
  rules: {
    'no-chained-type-assertions': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Do not fabricate type evidence with chained assertions.' } },
      create(context) {
        return {
          TSAsExpression(node) {
            if (node.expression?.type === 'TSAsExpression' || node.expression?.type === 'TSTypeAssertion') {
              context.report({ node, messageId: 'forbidden' });
            }
          },
          TSTypeAssertion(node) {
            if (node.expression?.type === 'TSAsExpression' || node.expression?.type === 'TSTypeAssertion') {
              context.report({ node, messageId: 'forbidden' });
            }
          },
        };
      },
    },
    'no-known-value-widening': {
      meta: { type: 'suggestion', schema: [], messages: { forbidden: 'Preserve known object keys with inference or satisfies instead of a broad dictionary annotation.' } },
      create(context) {
        const candidates = [];
        return {
          VariableDeclarator(node) {
            if (node.id?.type !== 'Identifier' || node.init?.type !== 'ObjectExpression') return;
            if (node.init.properties.length === 0 || !isBroadDictionaryType(node.id.typeAnnotation)) return;
            const variable = resolveVariable(context.sourceCode, node, node.id.name);
            if (variable && !variableIsExported(variable)) {
              candidates.push({ initializedKeys: initializedObjectKeys(node.init), node, variable });
            }
          },
          'Program:exit'() {
            for (const candidate of candidates) {
              if (!usesBroadDictionaryContract(candidate.variable, candidate.initializedKeys)) {
                context.report({ node: candidate.node.id.typeAnnotation, messageId: 'forbidden' });
              }
            }
          },
        };
      },
    },
    'no-module-mocking': {
      meta: { type: 'suggestion', schema: [], messages: { forbidden: 'Test through a real dependency seam instead of mocking an entire module.' } },
      create(context) {
        return {
          CallExpression(node) {
            const callee = node.callee;
            if (callee?.type !== 'MemberExpression' || callee.computed) return;
            if (!isTestMockNamespace(context.sourceCode, callee.object)) return;
            if (!['doMock', 'mock', 'unstable_mockModule'].some((name) => isIdentifierNamed(callee.property, name))) return;
            context.report({ node, messageId: 'forbidden' });
          },
        };
      },
    },
    'no-object-parameters': {
      meta: { type: 'suggestion', schema: [], messages: { forbidden: 'Replace the broad object parameter with the contract the function actually requires.' } },
      create: createNoObjectParameters,
    },
    'no-unknown-returns': {
      meta: { type: 'suggestion', schema: [], messages: { forbidden: 'Return a parsed contract; reserve unknown for an explicitly declared external boundary.' } },
      create: createNoUnknownReturns,
    },
    'no-unknown-type-aliases': {
      meta: { type: 'suggestion', schema: [], messages: { forbidden: 'Do not conceal unknown behind a reassuring alias.' } },
      create(context) {
        return {
          TSTypeAliasDeclaration(node) {
            if (node.typeAnnotation?.type === 'TSUnknownKeyword') context.report({ node, messageId: 'forbidden' });
          },
        };
      },
    },
    'no-widen-then-assert': {
      meta: { type: 'problem', schema: [], messages: { forbidden: 'Do not widen a typed value and later assert the original type back.' } },
      create: createNoWidenThenAssert,
    },
  },
};

export default typeEvidence;
