function createScheduler(update) {
  const heap = new MinHeap(node => node.rank);
  let scheduled = false;

  function mark(node) {
    heap.insert(node);
  }

  function flush() {
    while (!heap.isEmpty()) {
      const node = heap.pop();
      const result = update(node);

      if (result.changed && result.invalidated) {
        for (const dep of result.invalidated) {
          heap.insert(dep);
        }
      }
    }
  }

  return { mark, flush, isIdle: () => heap.isEmpty() };
}
