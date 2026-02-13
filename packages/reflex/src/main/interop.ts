function fromEvent<T extends Event>(
  target: EventTarget,
  type: string,
  map?: (e: Event) => T
): Stream<T>;

function fromPromise<T>(p: Promise<T>): Resource<T>;
