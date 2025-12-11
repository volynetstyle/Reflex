export function compareWrap(a: number, b: number, radius: number): number {
  const diff = (b - a) | 0;
  const over = ((diff + radius) & (2 * radius - 1)) - radius;

  const less = (over >> 31) & 1;
  const greater = (-over >> 31) & 1;

  return greater - less;
}
