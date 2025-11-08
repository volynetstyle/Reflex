interface IntrusiveListNode<T = unknown> {
  _prev?: IntrusiveListNode<T>;
  _next?: IntrusiveListNode<T>;
  _list?: IntrusiveList<T>;
}

interface IntrusiveList<T = unknown> {
  _head?: IntrusiveListNode<T>;
  _tail?: IntrusiveListNode<T>;
  _size: number;
  push(node: IntrusiveListNode<T>): void;
  remove(node: IntrusiveListNode<T>): void;
  clear(): void;
  nodes(): Generator<IntrusiveListNode<T>, void>;
  values(): Generator<T, void>;
}

const IntrusiveListPrototype: IntrusiveList<any> = {
  _head: undefined,
  _tail: undefined,
  _size: 0,

  push(node) {
    if (node._list) return;

    const tail = this._tail;
    node._list = this;
    node._prev = tail;
    node._next = undefined;

    if (tail) {
      tail._next = node;
      this._tail = node;
    } else {
      this._head = this._tail = node;
    }
    this._size++;
  },

  remove(node) {
    if (node._list !== this) return;

    const { _prev, _next } = node;

    if (_prev) _prev._next = _next;
    else this._head = _next;

    if (_next) _next._prev = _prev;
    else this._tail = _prev;

    node._prev = node._next = node._list = undefined;
    this._size--;
  },

  clear() {
    let node = this._head;
    while (node) {
      const next = node._next;
      node._prev = node._next = node._list = undefined;
      node = next;
    }
    this._head = this._tail = undefined;
    this._size = 0;
  },

  // Итерация по узлам (IntrusiveListNode)
  *nodes(): Generator<any> {
    for (let node = this._head; node; node = node._next) {
      yield node;
    }
  },

  // Итерация по значениям (T)
  // В вашем случае T extends IntrusiveListNode<T>
  // поэтому node и есть значение
  *values(): Generator<any> {
    for (let node = this._head; node; node = node._next) {
      yield node;
    }
  },
};

function newIntrusiveList<T>(): IntrusiveList<T> {
  return Object.assign(Object.create(IntrusiveListPrototype), {
    _head: undefined,
    _tail: undefined,
    _size: 0,
  });
}

export { newIntrusiveList };
export type { IntrusiveList, IntrusiveListNode };