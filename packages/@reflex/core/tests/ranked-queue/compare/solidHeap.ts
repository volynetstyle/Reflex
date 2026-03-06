export interface SimpleComputed {
  _height: number;

  _prevHeap: SimpleComputed;
  _nextHeap?: SimpleComputed;

  _deps: DepLink | null;
  _subs: SubLink | null;
}

interface DepLink {
  _dep: SimpleComputed;
  _nextDep: DepLink | null;
}

interface SubLink {
  _sub: SimpleComputed;
  _nextSub: SubLink | null;
}

export interface SimpleHeap {
  _heap: (SimpleComputed | undefined)[];
  _min: number;
  _max: number;
}

// =====================================================
// INSERT
// =====================================================

export function insertIntoHeap(n: SimpleComputed, heap: SimpleHeap) {
  const height = n._height;

  const head = heap._heap[height];

  if (head === undefined) {
    heap._heap[height] = n;
    n._prevHeap = n;
  } else {
    const tail = head._prevHeap;
    tail._nextHeap = n;
    n._prevHeap = tail;
    head._prevHeap = n;
  }

  if (height > heap._max) heap._max = height;
}

// =====================================================
// DELETE
// =====================================================

export function deleteFromHeap(n: SimpleComputed, heap: SimpleHeap) {
  const height = n._height;
  const head = heap._heap[height];

  if (n._prevHeap === n) {
    heap._heap[height] = undefined;
  } else {
    const next = n._nextHeap;
    const end = next ?? head!;

    if (n === head) heap._heap[height] = next;
    else n._prevHeap._nextHeap = next;

    end._prevHeap = n._prevHeap;
  }

  n._prevHeap = n;
  n._nextHeap = undefined;
}

// =====================================================
// HEIGHT RECALCULATION
// =====================================================

export function adjustHeight(el: SimpleComputed, heap: SimpleHeap) {
  deleteFromHeap(el, heap);

  let newHeight = 0;

  for (let d = el._deps; d; d = d._nextDep) {
    const dep = d._dep;
    if (dep._height >= newHeight) {
      newHeight = dep._height + 1;
    }
  }

  if (newHeight !== el._height) {
    el._height = newHeight;

    for (let s = el._subs; s; s = s._nextSub) {
      insertIntoHeap(s._sub, heap);
    }
  }
}

// =====================================================
// RUN
// =====================================================

export function runHeap(
  heap: SimpleHeap,
  recompute: (el: SimpleComputed) => void,
) {
  for (heap._min = 0; heap._min <= heap._max; heap._min++) {
    let el = heap._heap[heap._min];

    while (el !== undefined) {
      recompute(el);
      adjustHeight(el, heap);
      el = heap._heap[heap._min];
    }
  }

  heap._max = 0;
}
