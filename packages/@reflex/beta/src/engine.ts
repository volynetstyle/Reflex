import {
  ReactiveNode,
  ReactiveNodeState,
  EngineContext,
  hasState,
  isDirtyState,
} from "./core.js";
//import { OrderList } from "./order.js";
import { markInvalid } from "./walkers.js";



export function invokeCompute(
  ctx: EngineContext,
  node: ReactiveNode,
  compute: () => unknown,
): unknown {
  const prevActive = ctx.activeComputed;

  ctx.activeComputed = node;
  try {
    return compute();
  } finally {
    ctx.activeComputed = prevActive;
  }
}

// export function run(ctx: EngineContext, list: OrderList): number {
//   let node = ctx.firstDirty;
//   let count = 0;
//   while (node) {
//     if (node.isDirty) {
//       if (needsUpdate(node)) {
//         const changed = recompute(ctx, node, list);
//         count++;
//         if (changed) {
//           for (let e = node.firstOut; e; e = e.nextOut) {
//             if (!(e.to.state & ReactiveNodeState.Invalid))
//               e.to.state |= ReactiveNodeState.Invalid;
//           }
//         }
//       } else node.state &= CLEANUP_STATE;
//     }
//     node = node.next;
//   }
//   ctx.firstDirty = null;
//   return count;
// }

export function writeSignal(
  ctx: EngineContext,
  node: ReactiveNode,
  value: unknown,
): void {
  if (Object.is(node.value, value)) return;
  node.value = value;
  node.t = ctx.bumpEpoch();
  for (let e = node.firstOut; e; e = e.nextOut) markInvalid(ctx, e.to);
}

export function batchWrite(
  ctx: EngineContext,
  writes: Array<[ReactiveNode, unknown]>,
): void {
  ctx.bumpEpoch();
  for (const [node, value] of writes) {
    if (Object.is(node.value, value)) continue;
    node.value = value;
    node.t = ctx.getEpoch();
    for (let e = node.firstOut; e; e = e.nextOut) markInvalid(ctx, e.to);
  }
}
