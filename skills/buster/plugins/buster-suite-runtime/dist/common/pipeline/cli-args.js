function parseBooleanFlag(name, inlineValue) {
    if (inlineValue === null || inlineValue === 'true')
        return true;
    if (inlineValue === 'false')
        return false;
    throw new Error(`Flag --${name} expects a boolean value when using --${name}=...`);
}
function readStringFlagValue(argv, index, name, inlineValue) {
    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.startsWith('--'))
        throw new Error(`Missing value for --${name}`);
    return { value, consumedNextArgument: inlineValue === null };
}
function assertRequiredFlags(flags, values) {
    for (const [name, spec] of Object.entries(flags)) {
        const value = values[name];
        if (spec.required && (value === undefined || value === null || value === '')) {
            throw new Error(`Missing required flag: --${name}`);
        }
    }
}
function assertPositionalCount(schema, positionals) {
    if (schema.minPositionals !== undefined && positionals.length < schema.minPositionals) {
        throw new Error(`Expected at least ${schema.minPositionals} positional argument(s), got ${positionals.length}`);
    }
    if (schema.maxPositionals !== undefined && positionals.length > schema.maxPositionals) {
        throw new Error(`Expected at most ${schema.maxPositionals} positional argument(s), got ${positionals.length}`);
    }
}
export function parseCliArgs(argv = [], schema = {}) {
    const flags = schema.flags ?? {};
    const allowPositionals = schema.allowPositionals === true;
    const positionals = [];
    const values = Object.create(null);
    for (const [name, spec] of Object.entries(flags)) {
        if (Object.prototype.hasOwnProperty.call(spec, 'default'))
            values[name] = spec.default;
    }
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];
        if (!String(token).startsWith('--')) {
            if (!allowPositionals)
                throw new Error(`Unexpected positional argument: ${token}`);
            positionals.push(token);
            continue;
        }
        const raw = token.slice(2);
        const eqIndex = raw.indexOf('=');
        const name = eqIndex === -1 ? raw : raw.slice(0, eqIndex);
        const inlineValue = eqIndex === -1 ? null : raw.slice(eqIndex + 1);
        if (!Object.prototype.hasOwnProperty.call(flags, name))
            throw new Error(`Unknown flag: --${name}`);
        const spec = flags[name];
        if (spec.type === 'boolean') {
            values[name] = parseBooleanFlag(name, inlineValue);
            continue;
        }
        const parsed = readStringFlagValue(argv, i, name, inlineValue);
        if (parsed.consumedNextArgument)
            i += 1;
        values[name] = parsed.value;
    }
    assertRequiredFlags(flags, values);
    assertPositionalCount(schema, positionals);
    return { values, positionals };
}
export function parseCliFlagValues(argv = [], schema = {}) {
    return parseCliArgs(argv, schema).values;
}
