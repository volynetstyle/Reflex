import type { TablesSOA } from "../layout/tables";

export function pack64x8(
  blocks: readonly Uint32Array[],
  out: Uint32Array,
  t: TablesSOA,
): void {
  for (let lane = 0; lane < 8; lane++) {
    const b = blocks[lane]!;
    let lo = 0;
    let hi = 0;

    for (let i = 0; i < t.count; i++) {
      const v = b[i]! | 0;
      lo |= (v << t.loShift[i]!) & t.loMask[i]!;
      hi |= (v << t.hiShift[i]!) & t.hiMask[i]!;
    }

    const base = lane << 1;
    out[base] = hi >>> 0;
    out[base + 1] = lo >>> 0;
  }
}
