import ReactiveNode from "../shape/ReactiveNode";

function isCausallyReady(n: ReactiveNode): boolean {
  for (let e = n.firstIn; e !== null; e = e.nextIn) {
    if ((e.from as ReactiveNode).v > n.v) return false;
  }

  return true;
}

function recompute<T>(n: ReactiveNode<T>): void {
  if (n.meta === 0) return;

  const next = n.compute!();
  if (Object.is(n.payload, next)) return;

  n.payload = next;
  n.v++;
}
