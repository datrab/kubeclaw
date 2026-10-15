export interface BusterLifetimeDescriptor {
  readonly descriptor: number;
  assertCurrent(): void;
  close(): void;
}
export function captureBusterLifetimeDescriptor(base: string, descriptor?: number): BusterLifetimeDescriptor;
export function captureProductiveBusterLifetimeDescriptor(): BusterLifetimeDescriptor;
export function assertBusterLifetimeDescriptor(value: unknown): asserts value is BusterLifetimeDescriptor;
export interface BusterLifetimeWitness {
  readonly descriptor: number;
  assertCurrent(): void;
  close(): void;
}
export function captureBusterLifetimeWitness(base: string, descriptor?: number): BusterLifetimeWitness;
export function captureProductiveBusterLifetimeWitness(): BusterLifetimeWitness;
export function assertBusterLifetimeWitness(value: unknown): asserts value is BusterLifetimeWitness;
