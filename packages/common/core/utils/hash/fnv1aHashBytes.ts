const VAL_32_CONST = 0x811c9dc5 >>> 0;
const PRIME_32_CONST = 0x1000193 >>> 0;

export function hash_32_fnv1a_const(str: string): number {
  let value = VAL_32_CONST;
 
  for (let i = 0; i < str.length; i++) {
    value ^= (str.charCodeAt(i) & 0xff);
    value = Math.imul(value,  PRIME_32_CONST) >>> 0;
  }

  return value;
}

const VAL_64_CONST = 0xcbf29ce484222325n;
const PRIME_64_CONST = 0x100000001b3n;

export function hash_64_fnv1a_const(str: string): bigint {
  let value = VAL_64_CONST;

  for (let i = 0; i < str.length; i++) {
    value ^= BigInt(str.charCodeAt(i) & 0xff);
    value *= PRIME_64_CONST;
  }

  return value;
}