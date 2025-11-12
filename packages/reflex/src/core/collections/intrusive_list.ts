export interface IntrusiveListNode<T = unknown> {
  _prev?: IntrusiveListNode<T>;
  _next?: IntrusiveListNode<T>;
  _list?: IntrusiveList<T>;
}

export interface IntrusiveList<T = unknown> {
  _head?: IntrusiveListNode<T>;
  _tail?: IntrusiveListNode<T>;
  _size: number;

  has(node: IntrusiveListNode): boolean;

  push(node: IntrusiveListNode<T>): void;
  remove(node: IntrusiveListNode<T>): void;
  clear(): void;

  forEachNode(cb: (node: IntrusiveListNode<T>) => void): void;
  forEach(cb: (value: T) => void): void;

  size(): number;
  isEmpty(): boolean;
}

export function newIntrusiveList<T>(): IntrusiveList<T> {
  const list: IntrusiveList<T> = {
    _head: undefined,
    _tail: undefined,
    _size: 0,

    has(node) {
      if (list._size === 0) return false;

      if (list._head === node || list._tail === node) return true;

      for (let n = list._head!._next; n; n = n._next) {
        if (n === node) return true;
      }
      return false;
    },

    push(node) {
      if (node._list) return;

      const tail = list._tail;

      node._list = list;
      node._prev = tail;
      node._next = undefined;

      if (tail) tail._next = node;
      else list._head = node;

      list._tail = node;
      list._size++;
    },

    remove(node) {
      if (node._list !== list) return;

      const prev = node._prev;
      const next = node._next;

      if (prev) prev._next = next;
      else list._head = next;

      if (next) next._prev = prev;
      else list._tail = prev;

      node._list = undefined;
      node._prev = undefined;
      node._next = undefined;
      list._size--;
    },

    clear() {
      let n = list._head;
      while (n) {
        const next = n._next!;
        n._list = undefined;
        n._prev = undefined;
        n._next = undefined;
        n = next;
      }
      list._head = undefined;
      list._tail = undefined;
      list._size = 0;
    },

    forEachNode(cb) {
      let n = list._head;

      while (n) {
        const next = n._next;
        cb(n);
        n = next!;
      }
    },


    forEach(cb) {
      let n = list._head;

      while (n) {
        const next = n._next;
        cb(n as unknown as T);
        n = next!;
      }
    },

    size() {
      return list._size;
    },

    isEmpty() {
      return list._size === 0;
    },
  };

  return list;
}
