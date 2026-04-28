class HydrationMismatch extends Error {}

export function failHydration(): never {
  throw new HydrationMismatch();
}
