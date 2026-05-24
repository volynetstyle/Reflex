export function normalizeHook<T extends Function | undefined>(
  value: unknown,
): T | undefined {
  return typeof value === "function" ? (value as T) : undefined;
}
