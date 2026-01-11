/**
 * latticeNumberArb
 *
 * Generator for random numbers (for number lattice testing).
 */
export function latticeNumberArb(minValue = -100, maxValue = 100): () => number {
  return () => Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue
}

/**
 * latticeSetArb
 *
 * Generator for random Set<T> values.
 */
export function latticeSetArb<T>(
  genT: () => T,
  minSize = 0,
  maxSize = 10,
): () => Set<T> {
  return () => {
    const size = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize
    const set = new Set<T>()
    for (let i = 0; i < size; i++) {
      set.add(genT())
    }
    return set
  }
}

/**
 * latticeArrayArb
 *
 * Generator for random array/tuple values.
 */
export function latticeArrayArb<T>(
  genT: () => T,
  minSize = 0,
  maxSize = 10,
): () => readonly T[] {
  return () => {
    const size = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize
    const arr: T[] = []
    for (let i = 0; i < size; i++) {
      arr.push(genT())
    }
    return arr
  }
}
