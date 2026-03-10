import { bench, describe } from "vitest";
import { readConsumer, readProducer, writeProducer } from "../../dist/esm";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";
import { ReactiveNodeKind } from "../../src/reactivity/shape";

class Signal<T> {
  node: ReactiveNode<T>;

  constructor(initialValue: T) {
    this.node = new ReactiveNode(ReactiveNodeKind.Producer, initialValue);
  }

  get = () => readProducer(this.node as ReactiveNode<unknown>) as T;
  set = (value: T) => writeProducer(this.node as ReactiveNode<unknown>, value);
}

const signal = <T>(initialValue: T) => {
  const s = new Signal(initialValue);
  return [s.get, s.set] as const;
};

const computed = <T>(fn: () => T) => {
  const node = new ReactiveNode(ReactiveNodeKind.Consumer, undefined as T, fn);
  return () => readConsumer(node as ReactiveNode<unknown>) as T;
};

describe("reactive benchmarks", () => {
  /*
   deep chain
  */

  const [a, setA] = signal(1);

  const b = computed(() => a());
  const c = computed(() => a());
  const d = computed(() => b() + c());

  bench("diamond", () => {
    for (let i = 0; i < 100_000; i++) {
      setA(i);
      d();
    }
  });

  const [deepA, deepSetA] = signal(1);

  let prev = deepA;

  for (let i = 0; i < 2000; i++) {
    const p = prev;
    prev = computed(() => p());
  }

  bench("deep graph update", () => {
    for (let i = 0; i < 1000; i++) {
      deepSetA(i);
    }
  });

  /*
   wide graph
  */

  const [wideA, wideSetA] = signal(1);
  const wideNodes = [];

  for (let i = 0; i < 2000; i++) {
    wideNodes.push(computed(() => wideA()));
  }

  bench("wide graph update", () => {
    for (let i = 0; i < 1000; i++) {
      wideSetA(i);
    }
  });

  /*
   fanin
  */

  const faninSignals: any[] = [];

  for (let i = 0; i < 2000; i++) {
    faninSignals.push(signal(i));
  }

  const sum = computed(() => {
    let s = 0;
    for (let i = 0; i < faninSignals.length; i++) {
      s += faninSignals[i][0]();
    }
    return s;
  });

  bench("fanin update + read", () => {
    for (let i = 0; i < 1000; i++) {
      faninSignals[0][1](i);
      sum();
    }
  });

  /*
   dynamic dependencies
  */

  const [dynA, dynSetA] = signal(1);
  const [dynB] = signal(2);

  const dynNodes = [];

  for (let i = 0; i < 100; i++) {
    dynNodes.push(
      computed(() => {
        if (dynA() % 2 === 0) {
          return dynA();
        } else {
          return dynB();
        }
      }),
    );
  }

  bench("dynamic graph", () => {
    for (let i = 0; i < 1000; i++) {
      dynSetA(i);
    }
  });
});
