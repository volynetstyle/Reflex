import { hash_32_fnv1a_const } from "./core/utils/hash/fnv1aHashBytes";

type HasSet = {
  has: (str: string) => boolean;
};

const has = (
  str: string,
  size: number,
  mask: number,
  cap: number,
  table: (string | null)[]
): boolean => {
  if (typeof str !== "string") {
    return false;
  }

  if (str.length === 0 && size === 0) {
    return false;
  }

  const hash = hash_32_fnv1a_const(str);
  let idx = hash & mask;
  let probeCount = 0;
  const maxProbes = cap;

  while (probeCount < maxProbes) {
    const cur = table[idx];

    if (cur === null) {
      return false;
    }

    if (cur === str) {
      return true;
    }

    idx = (idx + 1) & mask;
    probeCount++;
  }

  return false;
};

function nextClosestPow2(n: number): number {
  if (n <= 1) return 1;

  if ((n & (n - 1)) === 0) return n;

  --n;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;

  return n + 1;
}

export default function makeStringSet(strings: string[]): HasSet {
  if (!Array.isArray(strings)) {
    throw new TypeError("Input must be an array of strings");
  }

  const size = strings.length;

  if (size > 0x7fffffff) {
    throw new RangeError("String set size exceeds maximum allowed");
  }

  const cap = nextClosestPow2(Math.max(size * 2, 4));
  const mask = cap - 1;

  const table: (string | null)[] = new Array(cap);
  for (let i = 0; i < cap; i++) {
    table[i] = null;
  }

  let duplicates = 0;

  for (let i = 0; i < size; i++) {
    const s = strings[i];

    if (typeof s !== "string") {
      throw new TypeError(`Element at index ${i} is not a string`);
    }

    const hash = hash_32_fnv1a_const(s);
    let idx = hash & mask;
    let probeCount = 0;
    const maxProbes = cap;

    while (probeCount < maxProbes) {
      const cur = table[idx];

      if (cur === null) {
        table[idx] = s;
        break;
      }

      if (cur === s) {
        duplicates++;
        break;
      }

      idx = (idx + 1) & mask;
      probeCount++;
    }

    if (probeCount === maxProbes) {
      throw new Error("Hash table overflow: maximum probe count exceeded");
    }
  }

  return { has: (str: string) => has(str, size, mask, cap, table) };
}
