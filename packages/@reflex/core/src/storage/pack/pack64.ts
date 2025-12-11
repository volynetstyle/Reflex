import type { TablesSOA } from "../layout/tables";

export function pack64(
  block: Uint32Array,
  out: { hi: number; lo: number },
  t: TablesSOA,
): void {
  let lo = 0;
  let hi = 0;

  for (let i = 0; i < t.count; i++) {
    const v = block[i]! | 0;
    lo |= (v << t.loShift[i]!) & t.loMask[i]!;
    hi |= (v << t.hiShift[i]!) & t.hiMask[i]!;
  }

  out.lo = lo >>> 0;
  out.hi = hi >>> 0;
}

export function pack64Into(
  block: Uint32Array,
  out: Uint32Array,
  index: number,
  t: TablesSOA,
): void {
  let lo = 0;
  let hi = 0;

  for (let i = 0; i < t.count; i++) {
    const v = block[i]! | 0;
    lo |= (v << t.loShift[i]!) & t.loMask[i]!;
    hi |= (v << t.hiShift[i]!) & t.hiMask[i]!;
  }

  const base = index << 1;
  out[base] = hi >>> 0;
  out[base + 1] = lo >>> 0;
}
