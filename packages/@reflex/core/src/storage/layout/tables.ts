import type { Layout64 } from "./layout";

export interface TablesSOA {
  readonly count: number;
  readonly loMask: Uint32Array;
  readonly hiMask: Uint32Array;
  readonly loShift: Uint8Array;
  readonly hiShift: Uint8Array;
}

export function prepareTables<TSchema extends Record<string, any>>(
  layout: Layout64<TSchema>,
): TablesSOA {
  const n = layout.fieldNames.length;

  const loMask = new Uint32Array(n);
  const hiMask = new Uint32Array(n);
  const loShift = new Uint8Array(n);
  const hiShift = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const name = layout.fieldNames[i]!;
    const f = layout.fields[name];

    const start = f.shift;
    const end = f.shift + f.bits;

    if (start < 32) {
      if (end <= 32) {
        loMask[i] = (f.mask32 << start) >>> 0;
        hiMask[i] = 0;
        loShift[i] = start;
        hiShift[i] = 0;
      } else {
        const loPart = 32 - start;
        const hiPart = f.bits - loPart;

        loMask[i] = (((1 << loPart) - 1) << start) >>> 0;
        hiMask[i] = (1 << hiPart) - 1;
        loShift[i] = start;
        hiShift[i] = 0;
      }
    } else {
      const hShift = start - 32;
      loMask[i] = 0;
      hiMask[i] = (f.mask32 << hShift) >>> 0;
      loShift[i] = 0;
      hiShift[i] = hShift;
    }
  }

  return { count: n, loMask, hiMask, loShift, hiShift };
}
