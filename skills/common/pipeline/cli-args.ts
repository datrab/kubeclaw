import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
type CliFlagType = 'boolean' | 'string';

type CliFlagSpec = {
  type?: CliFlagType;
  default?: unknown;
  required?: boolean;
};

type CliSchema = {
  flags?: Record<string, CliFlagSpec>;
  allowPositionals?: boolean;
  minPositionals?: number;
  maxPositionals?: number;
};

export function parseCliArgs(argv: string[] = [], schema: CliSchema = {}) {
  const flags = selectDefinedValue(() => (schema.flags), () => ({}));
  const allowPositionals = schema.allowPositionals === true;
  const positionals: string[] = [];
  const values = Object.create(null) as Record<string, unknown>;

  for (const [name, spec] of Object.entries(flags)) {
    if (Object.prototype.hasOwnProperty.call(spec, 'default')) values[name] = spec.default;
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (!String(token).startsWith('--')) {
      if (!allowPositionals) throw new Error(`Unexpected positional argument: ${token}`);
      positionals.push(token);
      continue;
    }

    const raw = token.slice(2);
    const eqIndex = raw.indexOf('=');
    const name = eqIndex === -1 ? raw : raw.slice(0, eqIndex);
    const inlineValue = eqIndex === -1 ? null : raw.slice(eqIndex + 1);
    if (!Object.prototype.hasOwnProperty.call(flags, name)) throw new Error(`Unknown flag: --${name}`);
    const spec = flags[name];

    if (spec.type === 'boolean') {
      if (inlineValue != null) {
        if (inlineValue === 'true') values[name] = true;
        else if (inlineValue === 'false') values[name] = false;
        else throw new Error(`Flag --${name} expects a boolean value when using --${name}=...`);
      } else {
        values[name] = true;
      }
      continue;
    }

    const value = inlineValue != null ? inlineValue : argv[i + 1];
    if (selectTruthyValue(() => (value === undefined), () => (String(value).startsWith('--')))) {
      throw new Error(`Missing value for --${name}`);
    }
    if (inlineValue == null) i += 1;
    values[name] = value;
  }

  for (const [name, spec] of Object.entries(flags)) {
    if (spec.required && (selectTruthyValue(() => (selectTruthyValue(() => (values[name] === undefined), () => (values[name] === null))), () => (values[name] === '')))) {
      throw new Error(`Missing required flag: --${name}`);
    }
  }

  if (schema.minPositionals != null && positionals.length < schema.minPositionals) {
    throw new Error(`Expected at least ${schema.minPositionals} positional argument(s), got ${positionals.length}`);
  }
  if (schema.maxPositionals != null && positionals.length > schema.maxPositionals) {
    throw new Error(`Expected at most ${schema.maxPositionals} positional argument(s), got ${positionals.length}`);
  }

  return { values, positionals };
}

export function parseCliFlagValues(argv: string[] = [], schema: CliSchema = {}) {
  return parseCliArgs(argv, schema).values;
}
