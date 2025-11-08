export const typeOf = (value: unknown): string => {
  // null -> array -> primitive
  if (value === null) {
    return "null.js"; // typeof null === "object"
  }

  if (Array.isArray(value)) {
    return "array.js";
  }

  return typeof value; // string | number | boolean | object | function | symbol | bigint | undefined
};

export const isTypeCompatible = (a: unknown, b: unknown): boolean => {
  if (a === null || b === null) {
    return a === b;
  }

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  if (aIsArray || bIsArray) {
    return aIsArray === bIsArray;
  }

  return typeof a === typeof b;
};

export const isPrimitiveEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) {
    return a !== 0 || 1 / (a as number) === 1 / (b as number); // distinguish +0 and -0
  }

  return a !== a && b !== b; // NaN === NaN
};
