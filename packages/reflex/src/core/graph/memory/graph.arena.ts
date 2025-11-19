/**
 * AoS (Array of Structures) Arena за єдиним ArrayBuffer
 * 
 * Node Layout (56 байт):
 * - nextSource: u32 @ 0
 * - prevSource: u32 @ 4
 * - nextObserver: u32 @ 8
 * - prevObserver: u32 @ 12
 * - firstSource: u32 @ 16
 * - lastSource: u32 @ 20
 * - firstObserver: u32 @ 24
 * - lastObserver: u32 @ 28
 * - flags: u32 @ 32
 * - epoch: u32 @ 36
 * - version: u32 @ 40
 * - sourceCount: u16 @ 44
 * - observerCount: u16 @ 46
 * - kind: u8 @ 48
 * - padding: 7 байт @ 49-55
 */

const NULL = 0xffffffff >>> 0;
const NODE_SIZE = 56; // байт
const INITIAL_CAPACITY = 1 << 10; // 1024 nodes

class GraphArenaAoS {
  buffer: ArrayBuffer;
  view32: Uint32Array;
  view16: Uint16Array;
  view8: Uint8Array;

  private capacity: number;
  private head: number = 0;
  private freelist: number[] = [];

  //외부 storage для non-typed значень (valueRaw, observerFn)
  // Ключ = id, Значення = { valueRaw, observerFn }
  private externalStore: Map<number, { valueRaw?: unknown; observerFn?: (() => void) | null }> = new Map();

  constructor() {
    this.capacity = INITIAL_CAPACITY;
    this.buffer = new ArrayBuffer(this.capacity * NODE_SIZE);

    this.view32 = new Uint32Array(this.buffer);
    this.view16 = new Uint16Array(this.buffer);
    this.view8 = new Uint8Array(this.buffer);

    // Ініціалізуємо весь буфер
    this.view8.fill(0xff); // NULL-маркер
  }

  /**
   * Обчислює byte offset для node за його id
   */
  private nodeOffset(id: number): number {
    return id * NODE_SIZE;
  }

  /**
   * Обчислює offset у view32
   */
  private nodeOffsetU32(id: number): number {
    return (id * NODE_SIZE) >>> 2;
  }

  /**
   * Обчислює offset у view16
   */
  private nodeOffsetU16(id: number): number {
    return (id * NODE_SIZE) >>> 1;
  }

  // ========== GETTERS/SETTERS для всіх полів ==========

  getNextSource(id: number): number {
    return this.view32[((this.nodeOffset(id) + 0) >>> 2) as any] ?? 0;
  }
  setNextSource(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 0) >>> 2) as any] = value >>> 0;
  }

  getPrevSource(id: number): number {
    return this.view32[((this.nodeOffset(id) + 4) >>> 2) as any] ?? 0;
  }
  setPrevSource(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 4) >>> 2) as any] = value >>> 0;
  }

  getNextObserver(id: number): number {
    return this.view32[((this.nodeOffset(id) + 8) >>> 2) as any] ?? 0;
  }
  setNextObserver(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 8) >>> 2) as any] = value >>> 0;
  }

  getPrevObserver(id: number): number {
    return this.view32[((this.nodeOffset(id) + 12) >>> 2) as any] ?? 0;
  }
  setPrevObserver(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 12) >>> 2) as any] = value >>> 0;
  }

  getFirstSource(id: number): number {
    return this.view32[((this.nodeOffset(id) + 16) >>> 2) as any] ?? 0;
  }
  setFirstSource(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 16) >>> 2) as any] = value >>> 0;
  }

  getLastSource(id: number): number {
    return this.view32[((this.nodeOffset(id) + 20) >>> 2) as any] ?? 0;
  }
  setLastSource(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 20) >>> 2) as any] = value >>> 0;
  }

  getFirstObserver(id: number): number {
    return this.view32[((this.nodeOffset(id) + 24) >>> 2) as any] ?? 0;
  }
  setFirstObserver(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 24) >>> 2) as any] = value >>> 0;
  }

  getLastObserver(id: number): number {
    return this.view32[((this.nodeOffset(id) + 28) >>> 2) as any] ?? 0;
  }
  setLastObserver(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 28) >>> 2) as any] = value >>> 0;
  }

  getFlags(id: number): number {
    return this.view32[((this.nodeOffset(id) + 32) >>> 2) as any] ?? 0;
  }
  setFlags(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 32) >>> 2) as any] = value >>> 0;
  }

  getEpoch(id: number): number {
    return this.view32[((this.nodeOffset(id) + 36) >>> 2) as any] ?? 0;
  }
  setEpoch(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 36) >>> 2) as any] = value >>> 0;
  }

  getVersion(id: number): number {
    return this.view32[((this.nodeOffset(id) + 40) >>> 2) as any] ?? 0;
  }
  setVersion(id: number, value: number): void {
    this.view32[((this.nodeOffset(id) + 40) >>> 2) as any] = value >>> 0;
  }

  getSourceCount(id: number): number {
    return this.view16[((this.nodeOffset(id) + 44) >>> 1) as any] ?? 0;
  }
  setSourceCount(id: number, value: number): void {
    this.view16[((this.nodeOffset(id) + 44) >>> 1) as any] = value >>> 0;
  }

  getObserverCount(id: number): number {
    return this.view16[((this.nodeOffset(id) + 46) >>> 1) as any] ?? 0;
  }
  setObserverCount(id: number, value: number): void {
    this.view16[((this.nodeOffset(id) + 46) >>> 1) as any] = value >>> 0;
  }

  getKind(id: number): number {
    return this.view8[(this.nodeOffset(id) + 48) as any] ?? 0;
  }
  setKind(id: number, value: number): void {
    this.view8[(this.nodeOffset(id) + 48) as any] = value >>> 0;
  }

  // ========== External storage для valueRaw та observerFn ==========

  getValueRaw(id: number): unknown {
    const entry = this.externalStore.get(id);
    return entry?.valueRaw;
  }
  setValueRaw(id: number, value: unknown): void {
    const entry = this.externalStore.get(id) || {};
    entry.valueRaw = value;
    this.externalStore.set(id, entry);
  }

  getObserverFn(id: number): (() => void) | null {
    const entry = this.externalStore.get(id);
    return entry?.observerFn ?? null;
  }
  setObserverFn(id: number, fn: (() => void) | null): void {
    const entry = this.externalStore.get(id) || {};
    entry.observerFn = fn;
    this.externalStore.set(id, entry);
  }

  // ========== Управління арено ==========

  alloc(): number {
    if (this.freelist.length) {
      return this.freelist.pop()!;
    }

    if (this.head >= this.capacity) {
      this.grow();
    }

    const id = this.head++;
    this.clearNode(id);
    return id;
  }

  free(id: number): void {
    this.clearNode(id);
    this.externalStore.delete(id);
    this.freelist.push(id);
  }

  private clearNode(id: number): void {
    const base = this.nodeOffset(id);
    this.view8.fill(0xff, base, base + NODE_SIZE);
  }

  private grow(): void {
    const newCap = this.capacity << 1;
    const newBuffer = new ArrayBuffer(newCap * NODE_SIZE);

    // Копіюємо стару пам'ять
    new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));

    // Оновлюємо вʼюхи
    this.buffer = newBuffer;
    this.view32 = new Uint32Array(this.buffer);
    this.view16 = new Uint16Array(this.buffer);
    this.view8 = new Uint8Array(this.buffer);

    this.capacity = newCap;
  }
}

export const arena = new GraphArenaAoS();
export { NULL, NODE_SIZE };
