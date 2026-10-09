import type { ReactiveEdge, ReactiveNode } from "@runtime/kernel/shape";
import { observeRuntimePullPath } from "@runtime/kernel/projection";
import { isRuntimeProfilingEnabled } from "@runtime/profiling";

export function countIn(edge: ReactiveEdge | null): number {
  let count = 0;

  for (let current = edge; current !== null; current = current.nextIn) {
    count += 1;
  }

  return count;
}

export function countOut(edge: ReactiveEdge | null): number {
  let count = 0;

  for (let current = edge; current !== null; current = current.nextOut) {
    count += 1;
  }

  return count;
}

export function profilePullNode(
  branch: string,
  node: ReactiveNode<unknown>,
  depth: number,
  stackDepth: number,
): void {
  if (__PROFILE__ && isRuntimeProfilingEnabled()) {
    observeRuntimePullPath?.(
      branch,
      depth,
      countIn(node.firstIn),
      countOut(node.firstOut),
      stackDepth,
    );
  }
}
