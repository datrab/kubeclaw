/** Image-owned identities, never selected by a service request or environment override. */
export const preparationSlots = Object.freeze([1003, 1004] as const);
export type PreparationSlot = typeof preparationSlots[number];

export function assertPreparationSlot(value: unknown): asserts value is PreparationSlot {
  if (value !== 1003 && value !== 1004) throw new Error('BUSTER_PREPARATION_SLOT_INVALID');
}
