// Один u32 = флаги в старших битах + версия в младших
//
// [31..28] flags  | [27..0] version
//  F Q V E         268_435_455 max version
//
//  F = Failed
//  Q = Queued
//  V = Visited (нужен только если нет verifiedAt)
//  E = reserved

const VERSION_SHIFT = 2;
const VERSION_MASK  = ~0 >>> VERSION_SHIFT; // 0x3FFFFFFF — 1 073 741 823 версий
const FLAG_QUEUED_PACKED = 1 << 0;
const FLAG_FAILED_PACKED = 1 << 1;


export const PackedClock = {
  /** Извлечь версию из упакованного changedAt */
  version(packed: number): number {
    return (packed >>> VERSION_SHIFT) >>> 0;
  },

  /** Упаковать версию + флаги */
  pack(version: number, queued: boolean, failed: boolean): number {
    return (
      ((version & VERSION_MASK) << VERSION_SHIFT) |
      (queued ? FLAG_QUEUED_PACKED : 0) |
      (failed ? FLAG_FAILED_PACKED : 0)
    );
  },

  isQueued(packed: number): boolean {
    return (packed & FLAG_QUEUED_PACKED) !== 0;
  },

  isFailed(packed: number): boolean {
    return (packed & FLAG_FAILED_PACKED) !== 0;
  },

  setQueued(packed: number, on: boolean): number {
    return on
      ? packed | FLAG_QUEUED_PACKED
      : packed & ~FLAG_QUEUED_PACKED;
  },

  setFailed(packed: number, on: boolean): number {
    return on
      ? packed | FLAG_FAILED_PACKED
      : packed & ~FLAG_FAILED_PACKED;
  },
} as const;