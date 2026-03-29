export interface UnkeyedReconciliationResult<T = unknown> {
  toCreate: Array<{ index: number; value: T }>;
  toRemove: number[];
  toUpdate: Array<{ index: number; value: T }>;
}

export function reconcileUnkeyedList<T>(
  prevItems: readonly T[],
  nextItems: readonly T[],
): UnkeyedReconciliationResult<T> {
  const result: UnkeyedReconciliationResult<T> = {
    toCreate: [],
    toRemove: [],
    toUpdate: [],
  };

  const sharedLength = Math.min(prevItems.length, nextItems.length);

  for (let i = 0; i < sharedLength; i++) {
    if (prevItems[i] !== nextItems[i]) {
      result.toUpdate.push({ index: i, value: nextItems[i]! });
    }
  }

  for (let i = sharedLength; i < nextItems.length; i++) {
    result.toCreate.push({ index: i, value: nextItems[i]! });
  }

  for (let i = sharedLength; i < prevItems.length; i++) {
    result.toRemove.push(i);
  }

  return result;
}
