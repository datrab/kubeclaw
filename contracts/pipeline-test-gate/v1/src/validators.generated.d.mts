export type Validator = ((value: unknown) => boolean) & { errors?: unknown[] | null };
export const schemaValidators: Readonly<Record<string, Validator>>;
export const validateE2e: Validator;
export const e2eSchemaDigest: string;
