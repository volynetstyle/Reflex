/**
 * Describe the value in a human-readable format.
 *
 * @param value The value to describe.
 * @returns A string describing the value.
 */
export function describeValue<T>(value: T): string {
  if (value == null) {
    return value === null ? "`null`" : "`undefined`";
  }

  const type = typeof value;

  if (type === "string") {
    const str = value as string;

    if (str.length === 0) {
      return "`an empty string`";
    }
    if (str.length < 50) {
      return `"${str}"`;
    }
    return `"${str.slice(0, 47)}..."`;
  }

  if (type === "number") {
    if (Number.isNaN(value)) {
      return "`NaN`";
    }
    if (!Number.isFinite(value)) {
      return `\`${String(value)}\``;
    }
    return `${value}`;
  }

  if (type === "boolean") {
    return `\`${value}\``;
  }

  if (type === "object") {
    if (Array.isArray(value)) {
      return `an array of length ${value.length}`;
    }
    if (value instanceof Date) {
      return `a Date object (${value.toISOString()})`;
    }
    return "an object";
  }

  if (type === "function") {
    return `a function named "${
      (value as unknown as Function).name || "anonymous"
    }"`;
  }

  if (type === "symbol") {
    return `a symbol (${String(value)})`;
  }

  return `something with type "${type}"`;
}
