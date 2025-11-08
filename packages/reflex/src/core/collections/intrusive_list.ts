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

// Optimized: Factory function for nodes with consistent shape
// This ensures V8 can optimize all nodes to the same hidden class
function newIntrusiveNode<T>(): IntrusiveListNode<T> {
  return {
    _prev: undefined,
    _next: undefined,
    _list: undefined,
  };
}

function newIntrusiveList<T>(): IntrusiveList<T> {
  const list = {
    _head: undefined as IntrusiveListNode<T> | undefined,
    _tail: undefined as IntrusiveListNode<T> | undefined,
    _size: 0,

    push(node: IntrusiveListNode<T>): void {
      if (node._list) return;

      const tail = list._tail;

      // Batch property assignments - better for CPU cache
      node._list = list;
      node._prev = tail;
      node._next = undefined;

      // Optimized: Simplified branching - fewer instructions
      if (tail) {
        tail._next = node;
      } else {
        list._head = node;
      }

      list._tail = node;
      list._size++;
    },

    // Optimized: Monomorphic function signature
    remove(node: IntrusiveListNode<T>): void {
      // Early exit with guard
      if (node._list !== list) return;

      // Local variables - reduces repeated property access
      const prev = node._prev;
      const next = node._next;

      // Update links - predictable branches
      if (prev) {
        prev._next = next;
      } else {
        list._head = next;
      }

      if (next) {
        next._prev = prev;
      } else {
        list._tail = prev;
      }

      // Batch cleanup - better for cache
      node._prev = undefined;
      node._next = undefined;
      node._list = undefined;
      list._size--;
    },

    clear(): void {
      // Optimized: Simple forward iteration with minimal branching
      let node = list._head;
      while (node) {
        const next = node._next;
        // Batch property cleanup
        node._prev = undefined;
        node._next = undefined;
        node._list = undefined;
        node = next;
      }

      list._head = undefined;
      list._tail = undefined;
      list._size = 0;
    },

    // Optimized: Generator for nodes - allocation efficient
    *nodes(): Generator<IntrusiveListNode<T>, void> {
      let node = list._head;
      while (node) {
        const next = node._next; // Cache next before yield (allows safe removal during iteration)
        yield node;
        node = next;
      }
    },

    // Optimized: Generator for values - type-safe access
    *values(): Generator<T, void> {
      let node = list._head;
      while (node) {
        const next = node._next;
        yield node as T;
        node = next;
      }
    },
  };

  return list;
}

export { newIntrusiveList, newIntrusiveNode };
export type { IntrusiveList, IntrusiveListNode };
