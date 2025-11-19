const NULL = 0xffffffff >>> 0;

class GraphArena {
  private capacity = 1 << 10;
  private head = 0;
  private freelist: number[] = [];

  // SoA массивы (mutable for resize)
  nextSource: Uint32Array;
  prevSource: Uint32Array;
  nextObserver: Uint32Array;
  prevObserver: Uint32Array;
  firstSource: Uint32Array;
  lastSource: Uint32Array;
  firstObserver: Uint32Array;
  lastObserver: Uint32Array;
  sourceCount: Uint16Array;
  observerCount: Uint16Array;
  flags: Uint32Array;
  version: Uint32Array;
  epoch: Uint32Array;
  valueRaw: Array<unknown>;
  observerFn: Array<(() => void) | null>;
  kind: Uint8Array;

  constructor() {
    this.nextSource = new Uint32Array(this.capacity);
    this.prevSource = new Uint32Array(this.capacity);
    this.nextObserver = new Uint32Array(this.capacity);
    this.prevObserver = new Uint32Array(this.capacity);
    this.firstSource = new Uint32Array(this.capacity);
    this.lastSource = new Uint32Array(this.capacity);
    this.firstObserver = new Uint32Array(this.capacity);
    this.lastObserver = new Uint32Array(this.capacity);
    this.sourceCount = new Uint16Array(this.capacity);
    this.observerCount = new Uint16Array(this.capacity);
    this.flags = new Uint32Array(this.capacity);
    this.version = new Uint32Array(this.capacity);
    this.epoch = new Uint32Array(this.capacity);
    this.valueRaw = new Array(this.capacity);
    this.observerFn = new Array(this.capacity);
    this.kind = new Uint8Array(this.capacity);
    
    // Инициализируем все поля NULL
    this.nextSource.fill(NULL);
    this.prevSource.fill(NULL);
    this.nextObserver.fill(NULL);
    this.prevObserver.fill(NULL);
    this.firstSource.fill(NULL);
    this.lastSource.fill(NULL);
    this.firstObserver.fill(NULL);
    this.lastObserver.fill(NULL);
  }

  alloc(): number {
    if (this.freelist.length) return this.freelist.pop()!;
    if (this.head >= this.capacity) this.grow();
    return this.head++;
  }

  free(id: number): void {
    // Очищаем все связи
    this.nextObserver[id] = NULL;
    this.prevObserver[id] = NULL;
    this.nextSource[id] = NULL;
    this.prevSource[id] = NULL;
    this.firstObserver[id] = NULL;
    this.lastObserver[id] = NULL;
    this.firstSource[id] = NULL;
    this.lastSource[id] = NULL;
    this.observerFn[id] = null;
    this.valueRaw[id] = undefined;
    this.freelist.push(id);
  }

  private grow(): void {
    const newCap = this.capacity << 1;
    
    // Копируем все Uint32Array с использованием встроенных методов
    this.nextSource = this.resizeTypedArray(this.nextSource, Uint32Array, newCap);
    this.prevSource = this.resizeTypedArray(this.prevSource, Uint32Array, newCap);
    this.nextObserver = this.resizeTypedArray(this.nextObserver, Uint32Array, newCap);
    this.prevObserver = this.resizeTypedArray(this.prevObserver, Uint32Array, newCap);
    this.firstSource = this.resizeTypedArray(this.firstSource, Uint32Array, newCap);
    this.lastSource = this.resizeTypedArray(this.lastSource, Uint32Array, newCap);
    this.firstObserver = this.resizeTypedArray(this.firstObserver, Uint32Array, newCap);
    this.lastObserver = this.resizeTypedArray(this.lastObserver, Uint32Array, newCap);
    
    // Uint16Array
    this.sourceCount = this.resizeTypedArray(this.sourceCount, Uint16Array, newCap);
    this.observerCount = this.resizeTypedArray(this.observerCount, Uint16Array, newCap);
    
    // Остальные Uint32Array
    this.flags = this.resizeTypedArray(this.flags, Uint32Array, newCap);
    this.version = this.resizeTypedArray(this.version, Uint32Array, newCap);
    this.epoch = this.resizeTypedArray(this.epoch, Uint32Array, newCap);
    
    // Uint8Array
    this.kind = this.resizeTypedArray(this.kind, Uint8Array, newCap);
    
    // Обычные массивы
    this.valueRaw = this.valueRaw.concat(new Array(newCap - this.capacity));
    this.observerFn = this.observerFn.concat(new Array(newCap - this.capacity));
    
    // Инициализируем новые элементы NULL
    this.nextSource.fill(NULL, this.capacity);
    this.prevSource.fill(NULL, this.capacity);
    this.nextObserver.fill(NULL, this.capacity);
    this.prevObserver.fill(NULL, this.capacity);
    this.firstSource.fill(NULL, this.capacity);
    this.lastSource.fill(NULL, this.capacity);
    this.firstObserver.fill(NULL, this.capacity);
    this.lastObserver.fill(NULL, this.capacity);
    
    this.capacity = newCap;
  }
  
  private resizeTypedArray<T extends Uint32Array | Uint16Array | Uint8Array>(
    arr: T,
    ctor: typeof Uint32Array | typeof Uint16Array | typeof Uint8Array,
    newCap: number
  ): T {
    const newArr = new ctor(newCap) as T;
    newArr.set(arr);
    return newArr;
  }
}

export const arena = new GraphArena();
export { NULL };
