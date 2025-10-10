abstract class Node<I = any, O = any> {
  abstract compute(...inputs: I[]): O;

  run(...inputs: I[]): O {
    const values = inputs.map((i) => (i instanceof Node ? i.run() : i)) as I[];

    return this.compute(...values);
  }

  abstract subscribe(callback: (output: O) => void): void;
}

class Signal<T> extends Node<never, T> {
  private value: T;
  private subs: ((v: T) => void)[] = [];

  constructor(init: T) {
    super();
    this.value = init;
  } 

  get() {
    return this.value;
  }
  set(v: T) {
    this.value = v;
    this.subs.forEach((fn) => fn(v));
  }

  compute(): T {
    return this.value;
  }

  subscribe(callback: (v: T) => void) {
    this.subs.push(callback);
  }
}

class Memo<T, Inputs extends any[]> extends Node<Inputs, T> {
  private value!: T;
  private subs: ((v: T) => void)[] = [];
  private fn: (...inputs: Inputs) => T;
  private inputNodes: Node[];

  constructor(fn: (...inputs: Inputs) => T, inputs: Node[]) {
    super();
    this.fn = fn;
    this.inputNodes = inputs;
    inputs.forEach((inp) => inp.subscribe(() => this.update()));
    this.update();
  }

  private update() {
    const vals = this.inputNodes.map((n) => n.run());
    this.value = this.fn(...(vals as Inputs));
    this.subs.forEach((fn) => fn(this.value));
  }

  compute(): T {
    return this.value;
  }

  subscribe(cb: (v: T) => void) {
    this.subs.push(cb);
  }
}

class Effect<Inputs extends any[]> extends Node<Inputs, void> {
  constructor(fn: (...inputs: Inputs) => void, inputs: Node[]) {
    super();

    inputs.forEach((inp) =>
      inp.subscribe(() => fn(...(inputs.map((n) => n.run()) as Inputs)))
    );

    fn(...(inputs.map((n) => n.run()) as Inputs));
  }

  compute(): void {}
  subscribe(cb: (v: void) => void) {}
}

class Splitter<T> extends Node<[Node<T>], Node<T>[]> {
  outputs: Node<T>[] = []

  constructor(input: Node<T>, copies: number) {
    super()
    // создаём m выходов
    this.outputs = Array.from({ length: copies }, () => new Signal<T>(undefined as any))
    
    // подписка на вход
    input.subscribe((v: T) => {
      this.outputs.forEach(out => (out as Signal<T>).set(v))
    })

    // начальное значение
    const initial = input.run()
    this.outputs.forEach(out => (out as Signal<T>).set(initial))
  }

  compute(input: Node<T>): Node<T>[] {
    return this.outputs
  }

  subscribe(callback: (v: Node<T>[]) => void) {
    this.outputs.forEach(out => out.subscribe(() => callback(this.outputs)))
  }
}

class Merger<T extends object> extends Node<Node<T>[], T> {
  private value!: T
  private subs: ((v: T) => void)[] = []

  constructor(inputs: Node<T>[]) {
    super()
    inputs.forEach(inp => inp.subscribe(() => this.update(inputs)))
    this.update(inputs)
  }

  private update(inputs: Node<T>[]) {
    const vals = inputs.map(i => i.run())
    this.value = Object.assign({}, ...vals)
    this.subs.forEach(fn => fn(this.value))
  }

  compute(inputs: Node<T>[]): T {
    return this.value
  }

  subscribe(fn: (v: T) => void) {
    this.subs.push(fn)
  }
}

class MapNode<I, O> extends Node<[Node<I>], O> {
  private fn: (val: I) => O
  private value!: O
  private subs: ((v: O) => void)[] = []

  constructor(input: Node<I>, fn: (val: I) => O) {
    super()
    this.fn = fn
    input.subscribe((v: I) => this.update(input))
    this.update(input)
  }

  private update(input: Node<I>) {
    this.value = this.fn(input.run())
    this.subs.forEach(fn => fn(this.value))
  }

  compute(input: Node<I>): O {
    return this.value
  }

  subscribe(fn: (v: O) => void) {
    this.subs.push(fn)
  }
}

class Reducer<S, Inputs extends any[]> extends Node<Node<any>[], S> {
  private state: S
  private fn: (prevState: S, ...inputs: any[]) => S
  private subs: ((v: S) => void)[] = []

  constructor(fn: (prev: S, ...inputs: any[]) => S, init: S, inputs: Node<any>[]) {
    super()
    this.fn = fn
    this.state = init
    inputs.forEach(inp => inp.subscribe(() => this.update(inputs)))
    this.update(inputs)
  } 

  private update(inputs: Node<any>[]) {
    const vals = inputs.map(i => i.run())
    this.state = this.fn(this.state, ...vals)
    this.subs.forEach(fn => fn(this.state))
  }

  compute(inputs: Node<any>[]): S {
    return this.state
  }

  subscribe(fn: (v: S) => void) {
    this.subs.push(fn)
  }
}

class VoidNode extends Node<never, never> {
  compute(): never { return undefined as never }
  subscribe(_fn: (v: never) => void) {}
}

const a = new Signal(1)
const b = new Signal(2)

// Splitter: один сигнал → 3 выхода
const splitter = new Splitter(a, 3)
splitter.outputs.forEach((s, i) => s.subscribe(v => console.log(`Split #${i}:`, v)))

a.set(5) // Split #0: 5, Split #1: 5, Split #2: 5

// Merger: объединяем два объекта
const merged = new Merger([{ x: 1 }, { y: 2 }])
merged.subscribe(v => console.log("Merged:", v))

// Reducer: аккумулируем сумму
const sumReducer = new Reducer((prev, x, y) => prev + x + y, 0, [a, b])
sumReducer.subscribe(v => console.log("SumReducer:", v))

b.set(10) // SumReducer: 15
