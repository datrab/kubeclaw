export function assertNever(value: never): never {
  throw new Error(`Unexpected contract variant: ${JSON.stringify(value)}`);
}
