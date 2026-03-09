import { OwnershipNode } from "@reflex/core";
import {
  readConsumer,
  readProducer,
  recycling,
  writeProducer,
} from "../../src";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";
import { ReactiveNodeKind } from "../../src/reactivity/shape";
import { PackedClock } from "../../src/reactivity/shape/methods/pack";
import { GlobalClock } from "../../src/runtime";

class Signal<T> {
  node: ReactiveNode<T>;

  constructor(initialValue: T) {
    this.node = new ReactiveNode(ReactiveNodeKind.Producer, initialValue);
  }

  get = () => readProducer(this.node);
  set = (value: T) => writeProducer(this.node, value);
}

export const signal = <T>(initialValue: T) => {
  const s = new Signal(initialValue);
  return [s.get, s.set] as const;
};

class Computed<T> {
  node: ReactiveNode<T>;

  constructor(fn: () => T) {
    this.node = new ReactiveNode(ReactiveNodeKind.Consumer, <T>undefined, fn);
  }

  get = () => readConsumer(this.node);
}

export const computed = <T>(fn: () => T) => {
  const c = new Computed<T>(fn);
  return c.get;
};

type CleanupReturn = () => void;
type EffectFn = () => void | CleanupReturn;
class Effect<T> {
  node: ReactiveNode<T>;

  constructor(fn: () => T) {
    this.node = new ReactiveNode(
      ReactiveNodeKind.Recycler,
      <T>undefined,
      fn,
      new OwnershipNode(),
    );
  }

  get = () => recycling(this.node);
}

export const effect = (fn: EffectFn): void => {
  const e = new Effect(fn);
  e.get();
};

export const memo = () => {};

export const accumulate = <T>(acc: (previous: T) => T) => {};
