import { GROUP_MASK } from "./bucket.constants";

const { clz32 } = Math;

/**
 * Быстрый поиск LSB (Least Significant Bit)
 * @__INLINE__
 */
export function getLSB32(x: number): number {
  return x & -x;
}

/**
 * Позиция первого установленного бита (без проверки на 0)
 * Предполагается, что x !== 0
 * @__INLINE__
 */
export function bitscanForward(x: number): number {
  return GROUP_MASK - clz32(x & -x);
}

/**
 * Найти индекс наименьшего установленного бита
 * Возвращает -1 если бит не проходит маску
 * @__INLINE__
 */
export function findLowestSetBit(value: number, mask: number): number {
  const lsb = value & -value;
  return (lsb & mask) !== 0 ? GROUP_MASK - clz32(lsb) : -1;
}
