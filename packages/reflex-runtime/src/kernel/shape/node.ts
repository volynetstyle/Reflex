import type { ReactiveEdge } from "./edge";
import { isPayload } from "./node.dev";

export type ComputeFn<T> = (() => T) | undefined;

class ReactiveNode<T = unknown> {
  state: number = 0;
  firstOut: ReactiveEdge | null = null;
  lastOut: ReactiveEdge | null = null;
  firstIn: ReactiveEdge | null = null;
  lastIn: ReactiveEdge | null = null;
  tailIn: ReactiveEdge | null = null;
  compute: ComputeFn<T> = undefined;
  payload: T;

  constructor(payload: T, compute: ComputeFn<T>, state: number) {
    if (__DEV__ && !isPayload(payload)) {
      throw new TypeError(
        `[ReactiveNode(constructor)]: payload must be primitive, function, array, or plain object, but not a ${typeof payload}`,
      );
    }

    this.state = state | 0;
    this.compute = compute;
    this.payload = payload;
  }
}

// export class ProducerNode<T = unknown> {
//   state: number = 0;
//   firstOut: ReactiveEdge | null = null;
//   lastOut: ReactiveEdge | null = null;
//   payload: T;
//   pending: T;

//   constructor(payload: T, pending: T, state: number) {
//     if (__DEV__ && !isPayload(payload)) {
//       throw new TypeError(
//         `[ReactiveNode(constructor)]: payload must be primitive, function, array, or plain object, but not a ${typeof payload}`,
//       );
//     }

//     this.state = state | 0;
//     this.payload = payload;
//     this.pending = pending;
//   }
// }

export default ReactiveNode;
