import fnv1aHashBytes from "./core/utils/hash/fnv1aHashBytes";

type HasSet = {
  has: (str: string) => boolean;
};

export default function makeStringSet(strings: string[]): HasSet {
  const textEncoder = new TextEncoder();

  const size = strings.length;
  const cap = 1 << Math.ceil(Math.log2(size * 2));
  const mask = cap - 1;

  const stringTable: (string | null)[] = new Array(cap).fill(null);
  const hashTable: Uint32Array = new Uint32Array(cap);

  for (const s of strings) {
    const bytes = textEncoder.encode(s);
    const hash = fnv1aHashBytes(bytes);
    let idx = hash & mask;

    while (stringTable[idx] !== null) {
      idx = (idx + 1) & mask;
    }

    stringTable[idx] = s;
    hashTable[idx] = hash;
  }

  function has(str: string): boolean {
    const bytes = textEncoder.encode(str);
    const hash = fnv1aHashBytes(bytes);
    let idx = hash & mask;

    while (true) {
      if (stringTable[idx] === null) {
        return false;
      }

      if (hashTable[idx] === hash && stringTable[idx] === str) {
        return true;
      }

      idx = (idx + 1) & mask;
    }
  }

  return { has };
}
