class AppendQueue<T> {
  items: T[] = [];
  index = 0;

  push(v: T) {
    this.items.push(v);
  }

  drain(fn: (v: T) => void) {
    const items = this.items,
      len = items.length;

    for (let i = this.index; i < len; ++i) {
      fn(<T>items[i]);
    }

    this.index = len;
  }

  clear() {
    this.items.length = this.index = 0;
  }
}

export { AppendQueue };
