export const storeName = Symbol.for("@volynets/reflex-store/name");
export function getStoreName(resource: object): string | undefined {
  return (resource as Record<symbol, string | undefined>)[storeName];
}
export function setStoreName(resource: object, name?: string): void {
  if (name !== undefined)
    Object.defineProperty(resource, storeName, { value: name });
}
