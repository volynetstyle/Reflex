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

  if (typeof value !== "object" || value === null) {
    return false;
  }

  // Avoid stack overflow, because JavaScript and deep trees are, of course, "made for each other".
  const stack: unknown[] = [value];
  const visited = new WeakSet<object>();

  while (stack.length !== 0) {
    const current = stack.pop();

    if (isPrimitive(current)) continue;
    if (typeof current === "function") continue;

    if (typeof current !== "object" || current === null) {
      return false;
    }

    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        stack.push(current[i]);
      }
      continue;
    }

    const proto = Object.getPrototypeOf(current);

    // Only allow plain objects.
    // Date, Map, Set, class instances, DOM nodes, and other miracles of the JavaScript runtime are excluded.
    if (proto !== Object.prototype && proto !== null) {
      return false;
    }

    const record = current as Record<string, unknown>;

    for (const key in record) {
      stack.push(record[key]);
    }
  }

  return true;
}
