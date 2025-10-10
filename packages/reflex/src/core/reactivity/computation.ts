// Базовый интерфейс для всех вычислительных узлов
interface IComputation<I extends any[] = any[], O = any> {
  run(): O;
  subscribe(callback: (output: O) => void): () => void;
  getInputs(): IComputation[];
}

// Типы вычислений
type ComputationType = 'source' | 'derived' | 'effect';

// Унифицированный класс вычисления
abstract class Computation<I extends any[] = any[], O = any> implements IComputation<I, O> {
  protected cached: O | undefined;
  protected subscribers: Set<(output: O) => void> = new Set();
  protected inputs: IComputation[] = [];
  protected type: ComputationType;
  
  constructor(type: ComputationType, inputs: IComputation[] = []) {
    this.type = type;
    this.inputs = inputs;
    
    // Подписываемся на входы
    inputs.forEach(input => {
      input.subscribe(() => this.invalidate());
    });
  }

  // Итеративный run без рекурсии
  run(): O {
    if (this.cached !== undefined && this.type !== 'source') {
      return this.cached;
    }

    // Топологическая сортировка и вычисление
    const sorted = this.topologicalSort();
    
    for (const node of sorted) {
      if (node === this) {
        const inputValues = this.inputs.map(inp => inp.run()) as I;
        this.cached = this.compute(...inputValues);
      }
    }
    
    return this.cached!;
  }

  // Топологическая сортировка для итеративного вычисления
  private topologicalSort(): Computation[] {
    const visited = new Set<Computation>();
    const result: Computation[] = [];
    
    const visit = (node: Computation) => {
      if (visited.has(node)) return;
      visited.add(node);
      
      node.inputs.forEach(input => {
        if (input instanceof Computation) {
          visit(input);
        }
      });
      
      result.push(node);
    };
    
    visit(this);
    return result;
  }

  protected abstract compute(...inputs: I): O;

  protected invalidate(): void {
    if (this.cached === undefined) return;
    
    const oldValue = this.cached;
    this.cached = undefined;
    
    // Только для derived и effect пересчитываем
    if (this.type !== 'source') {
      const newValue = this.run();
      if (newValue !== oldValue) {
        this.notify(newValue);
      }
    }
  }

  protected notify(value: O): void {
    this.subscribers.forEach(fn => fn(value));
  }

  subscribe(callback: (output: O) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getInputs(): IComputation[] {
    return this.inputs;
  }
}

// Source: 0→1 (источник данных)
class Source<T> extends Computation<[], T> {
  constructor(initial: T) {
    super('source', []);
    this.cached = initial;
  }

  compute(): T {
    return this.cached!;
  }

  set(value: T): void {
    if (this.cached !== value) {
      this.cached = value;
      this.notify(value);
    }
  }

  get(): T {
    return this.cached!;
  }
}

// Derived: n→1 (вычисляемое значение)
class Derived<I extends any[], O> extends Computation<I, O> {
  private fn: (...inputs: I) => O;

  constructor(fn: (...inputs: I) => O, inputs: IComputation[]) {
    super('derived', inputs);
    this.fn = fn;
    this.cached = this.run(); // Инициализация
  }

  compute(...inputs: I): O {
    return this.fn(...inputs);
  }
}

// Effect: n→0 (побочный эффект)
class SideEffect<I extends any[]> extends Computation<I, void> {
  private fn: (...inputs: I) => void;

  constructor(fn: (...inputs: I) => void, inputs: IComputation[]) {
    super('effect', inputs);
    this.fn = fn;
    this.run(); // Запуск при создании
  }

  compute(...inputs: I): void {
    this.fn(...inputs);
  }
}

// Splitter: 1→m (раздвоение сигнала)
class Splitter<T> extends Computation<[T], Source<T>[]> {
  private outputs: Source<T>[] = [];

  constructor(input: IComputation<[], T>, count: number) {
    super('derived', [input]);
    
    this.outputs = Array.from({ length: count }, () => new Source<T>(undefined as any));
    
    input.subscribe((value: T) => {
      this.outputs.forEach(out => out.set(value));
    });

    // Инициализация
    const initial = input.run();
    this.outputs.forEach(out => out.set(initial));
  }

  compute(value: T): Source<T>[] {
    return this.outputs;
  }

  getOutputs(): Source<T>[] {
    return this.outputs;
  }
}

// Merger: n→1 (слияние объектов)
class Merger<T extends object> extends Computation<T[], T> {
  constructor(inputs: IComputation<[], T>[]) {
    super('derived', inputs);
    this.cached = this.run();
  }

  compute(...inputs: T[]): T {
    return Object.assign({}, ...inputs);
  }
}

// Map: 1→1 (трансформация)
class Map<I, O> extends Computation<[I], O> {
  private fn: (value: I) => O;

  constructor(input: IComputation<[], I>, fn: (value: I) => O) {
    super('derived', [input]);
    this.fn = fn;
    this.cached = this.run();
  }

  compute(value: I): O {
    return this.fn(value);
  }
}

// Reducer: n→1 (аккумулятор с состоянием)
class Reducer<S, I extends any[]> extends Computation<I, S> {
  private fn: (state: S, ...inputs: I) => S;
  private state: S;

  constructor(fn: (state: S, ...inputs: I) => S, initial: S, inputs: IComputation[]) {
    super('derived', inputs);
    this.fn = fn;
    this.state = initial;
    this.cached = this.run();
  }

  compute(...inputs: I): S {
    this.state = this.fn(this.state, ...inputs);
    return this.state;
  }

  getState(): S {
    return this.state;
  }
}

// ============= ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ =============

console.log('=== Source (0→1) ===');
const a = new Source(10);
const b = new Source(20);
a.subscribe(v => console.log('a changed:', v));

console.log('\n=== Derived (2→1) ===');
const sum = new Derived((x: number, y: number) => x + y, [a, b]);
sum.subscribe(v => console.log('sum:', v));

a.set(15); // sum: 35

console.log('\n=== Map (1→1) ===');
const doubled = new Map(a, x => x * 2);
doubled.subscribe(v => console.log('doubled:', v));

a.set(20); // doubled: 40, sum: 40

console.log('\n=== Splitter (1→3) ===');
const splitter = new Splitter(a, 3);
splitter.getOutputs().forEach((out, i) => {
  out.subscribe(v => console.log(`split[${i}]:`, v));
});

a.set(100); // split[0]: 100, split[1]: 100, split[2]: 100

console.log('\n=== Merger (2→1) ===');
const obj1 = new Source({ x: 1 });
const obj2 = new Source({ y: 2 });
const merged = new Merger([obj1, obj2]);
merged.subscribe(v => console.log('merged:', v));

obj1.set({ x: 10 }); // merged: { x: 10, y: 2 }

console.log('\n=== Reducer (2→1 с состоянием) ===');
const counter = new Reducer(
  (state, x: number, y: number) => state + x + y,
  0,
  [a, b]
);
counter.subscribe(v => console.log('counter:', v));

b.set(5); // counter: 105

console.log('\n=== Effect (2→0) ===');
new SideEffect(
  (x: number, y: number) => console.log(`Effect: ${x} + ${y} = ${x + y}`),
  [a, b]
);

a.set(50); // Effect: 50 + 5 = 55