import type { TablesSOA } from "../layout/tables";

export function unpack64(
  hi: number,
  lo: number,
  out: Uint32Array,
  t: TablesSOA,
): void {
  hi >>>= 0;
  lo >>>= 0;

  for (let i = 0; i < t.count; i++) {
    const vLo = (lo & t.loMask[i]!) >>> t.loShift[i]!;
    const vHi = (hi & t.hiMask[i]!) >>> t.hiShift[i]!;
    out[i] = (vLo | vHi) >>> 0;
  }
}
