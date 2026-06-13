export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

export function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  );
}

export function isPayload(value: unknown): boolean {
  if (isPrimitive(value)) return true;
  if (typeof value === "function") return true;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!isPayload(value[i])) return false;
    }
    return true;
  }

  if (typeof value !== "object") return false;

  const proto = Object.getPrototypeOf(value);

  // Разрешаем только plain object.
  // Date, Map, Set, class instances, DOM nodes и прочая радость цивилизации идут лесом.
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }

  for (const key in value as Record<string, unknown>) {
    if (!isPayload((value as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}
