import { hash_32_fnv1a_const } from "./core/utils/hash/fnv1aHashBytes";

type HasSet = {
  has: (str: string) => boolean;
};

function nextClosestPow2(n: number): number {
  if (n <= 1) { 
    return 1;
  }

  let v = --n;

  for (let i = 1; i < 32; i <<= 1) {
    v |= v >> i;
  }

  return v + 1;
}

export default function makeStringSet(strings: string[]): HasSet {
  const size = strings.length;
  const cap = nextClosestPow2(size * 2);
  const mask = cap - 1;

  const table: (string | null)[] = new Array(cap).fill(null);

  for (const s of strings) {
    const hash = hash_32_fnv1a_const(s);
    let idx = hash & mask;

    while (true) {
      const cur = table[idx];

      if (cur === null) {
        table[idx] = s;
        break;
      }

      if (cur === s) {
        break;
      }

      idx = (idx + 1) & mask;
    }
  }

  const has = (str: string): boolean => {
    const hash = hash_32_fnv1a_const(str);
    let idx = hash & mask;

    while (true) {
      const cur = table[idx];
      
      if (cur === null) {
        return false;
      }

      if (cur === str) {
        return true;
      }

      idx = (idx + 1) & mask;
    }
  }

  return { has };
}