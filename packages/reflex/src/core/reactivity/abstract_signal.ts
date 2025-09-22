import { Disposable, SignalInterface } from "./abstract_types";

abstract class AbstractSignal<T> implements SignalInterface<T> {
  abstract readonly _value: T;

  get(): T {
    return this._value;
  }

  subscribe(observer: (value: T) => void): Disposable {}

  unsubscribe(observer: (value: T) => void): void {}

  dispose(): void {
    // Implementation here
  }
}

export default AbstractSignal;
