export default function fnv1aHashBytes(bytes: Uint8Array): number {
  const FNV_OFFSET = 2166136261 >>> 0;
  const FNV_PRIME = 16777619 >>> 0;

  let hash = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}
