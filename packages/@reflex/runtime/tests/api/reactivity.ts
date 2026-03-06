import { OwnershipNode } from "@reflex/core";
import {
  readConsumer,
  readProducer,
  recycling,
  writeProducer,
} from "../../src/api";
import ReactiveNode from "../../src/reactivity/shape/ReactiveNode";
import { ReactiveNodeKind } from "../../src/reactivity/shape";

type Signal<T> = [get: () => T, set: (value: T) => void];

export const signal = <T>(initialValue: T): Signal<T> => {
  const reactiveNode = new ReactiveNode<T>(
    ReactiveNodeKind.Producer,
    initialValue,
  );

  const get = () => readProducer(<ReactiveNode<unknown>>reactiveNode) as T;
  const set = (value: T) =>
    writeProducer(<ReactiveNode<unknown>>reactiveNode, value);

  return [get, set];
};

export const computed = <T>(fn: () => T): (() => T) => {
  const reactiveNode = new ReactiveNode(
    ReactiveNodeKind.Consumer,
    undefined as T,
    fn,
  );

  const get = () => readConsumer(<ReactiveNode<unknown>>reactiveNode) as T;
  return get;
};

export const memo = () => {};

export const accumulate = <T>(acc: (previous: T) => T) => {};

type Destructor = () => void;

type EffectFn = () => void | Destructor;

export const effect = (fn: EffectFn): void => {
  const reactiveNode = new ReactiveNode(
    ReactiveNodeKind.Recycler,
    undefined,
    fn,
    new OwnershipNode(),
  );

  recycling(reactiveNode);
};
