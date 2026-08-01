import { selectTruthyValue } from '../optional-absence.js';
import { suiteObjectOrEmpty as objectRecordOrEmpty } from './support.js';
export function interpolate(value, vars) {
    if (typeof value !== 'string')
        return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] === undefined ? `{{${key}}}` : vars[key]);
}
export function interpolateObject(value, vars) {
    if (!value || Object.keys(vars).length === 0)
        return value;
    if (typeof value === 'string')
        return interpolate(value, vars);
    if (Array.isArray(value))
        return value.map((item) => interpolateObject(item, vars));
    if (typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateObject(item, vars)]));
}
export function getByPath(value, dotPath) {
    if (!dotPath)
        return value;
    let current = value;
    for (const part of String(dotPath).split('.')) {
        if (current == null)
            return undefined;
        current = current[part];
    }
    return current;
}
function collectTemplateVars(value, out) {
    if (typeof value === 'string') {
        for (const match of value.matchAll(/\{\{(\w+)\}\}/g))
            if (match[1])
                out.add(match[1]);
        return;
    }
    if (Array.isArray(value))
        value.forEach((item) => collectTemplateVars(item, out));
    else if (value && typeof value === 'object')
        Object.values(value).forEach((item) => collectTemplateVars(item, out));
}
export function missingTemplateVarsForTest(test, vars, defaults) {
    const headers = { ...objectRecordOrEmpty(defaults.headers), ...objectRecordOrEmpty(test.headers) };
    const required = new Set();
    collectTemplateVars({ path: test.path, headers, body: test.body, ws_messages: test.ws_messages }, required);
    return [...required].filter((key) => selectTruthyValue(() => vars[key] == null, () => vars[key] === ''));
}
