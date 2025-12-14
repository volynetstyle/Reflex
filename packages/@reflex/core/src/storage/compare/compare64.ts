export function compare64(
  ahi: number,
  alo: number,
  bhi: number,
  blo: number,
): number {
  ahi >>>= 0;
  bhi >>>= 0;

  if (ahi < bhi) return -1;
  if (ahi > bhi) return 1;

  alo >>>= 0;
  blo >>>= 0;

  if (alo < blo) return -1;
  if (alo > blo) return 1;

  return 0;
}
