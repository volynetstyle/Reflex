type GenericToVoidFunction<T> = (v: T) => void;

class WeakObserversList<T> {
  private observers: GenericToVoidFunction<T>[] = [];

  add(fn: GenericToVoidFunction<T>) {
    if (!this.observers.includes(fn)) {
      this.observers.push(fn);
    }
  }

  remove(fn: GenericToVoidFunction<T>) {
    const index = this.observers.indexOf(fn);

    if (index !== -1) {
      this.observers.splice(index, 1);
    }

    return this.observers.length === 0;
  }

  notify(value: T) {
    for (let i = 0; i < this.observers.length; i++) {
      this.observers[i](value);
    }
  }

  dispose() {
    this.observers.length = 0;
  }
}

export default WeakObserversList;
