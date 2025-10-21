export function __assert(cond: unknown, message?: string): asserts cond {
  if (!cond) throw new Error(message || "Contract violated");
}
