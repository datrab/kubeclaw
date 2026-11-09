import assert from 'node:assert/strict';

const SIMPLE_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/u;

export function yamlFieldPath(tokens, { root = true, arrayWildcard = false } = {}) {
  let result = root ? '$' : '';
  for (const token of tokens) {
    if (typeof token === 'number' || token === '[]') {
      result += token === '[]' || arrayWildcard ? '[]' : `[${token}]`;
    } else if (SIMPLE_KEY.test(token)) {
      result += `${result && result !== '$' ? '.' : result === '$' ? '.' : ''}${token}`;
    } else {
      result += `[${JSON.stringify(token)}]`;
    }
  }
  return result;
}

export function yamlFieldPathTokens(fieldPath) {
  assert(typeof fieldPath === 'string', 'YAML field path must be a string');
  let index = fieldPath.startsWith('$') ? 1 : 0;
  const tokens = [];
  while (index < fieldPath.length) {
    if (fieldPath[index] === '.') {
      index += 1;
      const start = index;
      while (index < fieldPath.length && fieldPath[index] !== '.' && fieldPath[index] !== '[') index += 1;
      assert(index > start, `invalid empty YAML path segment in ${fieldPath}`);
      tokens.push(fieldPath.slice(start, index));
      continue;
    }
    if (fieldPath[index] === '[') {
      const close = fieldPath.indexOf(']', index);
      assert(close > index, `unterminated YAML path bracket in ${fieldPath}`);
      const body = fieldPath.slice(index + 1, close);
      if (body === '') tokens.push('[]');
      else if (/^[0-9]+$/u.test(body)) tokens.push(Number(body));
      else {
        assert(body.startsWith('"') && body.endsWith('"'), `YAML map keys must use double-quoted bracket notation in ${fieldPath}`);
        tokens.push(JSON.parse(body));
      }
      index = close + 1;
      continue;
    }
    const start = index;
    while (index < fieldPath.length && fieldPath[index] !== '.' && fieldPath[index] !== '[') index += 1;
    assert(index > start, `invalid YAML path segment in ${fieldPath}`);
    tokens.push(fieldPath.slice(start, index));
  }
  return tokens;
}

export function yamlFieldChildPath(parent, key) {
  return yamlFieldPath([...yamlFieldPathTokens(parent), key]);
}

export function yamlFieldPathWithoutRoot(fieldPath, options = {}) {
  return yamlFieldPath(yamlFieldPathTokens(fieldPath), { root: false, ...options });
}

// This form is only for maintained regex matchers. It must never be used as a
// public identity or as a lookup key because literal dotted keys lose their
// segment boundary here.
export function yamlFieldMatcherPath(fieldPath) {
  return yamlFieldPathTokens(fieldPath).map((token) => typeof token === 'number' || token === '[]' ? '[]' : token).join('.').replaceAll('.[]', '[]');
}
