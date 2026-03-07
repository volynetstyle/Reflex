import { QuaternaryHeap, RankedQueue } from "@reflex/core";
import { ReactiveNode, ReactiveNodeKind } from "./reactivity/shape";
import { AppendQueue } from "./scheduler/AppendQueue";

const PROPAGATION_STACK_CAPACITY = 256;
const PULL_STACK_CAPACITY = 64;

class ReactiveRuntime {
  readonly id: string;

  // Computation context: stack for nested tracking support
  currentComputation: ReactiveNode | null;

  // Propagation stack: pre-allocated, manual top pointer
  private readonly _propagationStack: ReactiveNode[];
  private _propagationTop: number;

  // Pull stack: same pattern
  private readonly _pullStack: ReactiveNode[];
  private _pullTop: number;

  // Queues
  readonly computationQueue: QuaternaryHeap<ReactiveNode>;
  readonly effectQueue: AppendQueue<ReactiveNode>;

  constructor(id: string) {
    this.id = id;
    this.currentComputation = null;
    this._propagationStack = new Array(PROPAGATION_STACK_CAPACITY);
    this._propagationTop = 0;
    this._pullStack = new Array(PULL_STACK_CAPACITY);
    this._pullTop = 0;
    this.computationQueue = new QuaternaryHeap<ReactiveNode>(2048);
    this.effectQueue = new AppendQueue();
  }

  beginComputation(node: ReactiveNode): ReactiveNode | null {
    const prev = this.currentComputation;
    this.currentComputation = node;
    return prev;
  }

  endComputation(prev: ReactiveNode | null): void {
    this.currentComputation = prev;
  }

  propagatePush(node: ReactiveNode): void {
    this._propagationStack[this._propagationTop++] = node;
  }

  propagatePop(): ReactiveNode {
    return this._propagationStack[--this._propagationTop]!;
  }

  get propagating(): boolean {
    return 0 < this._propagationTop;
  }

  pullPush(node: ReactiveNode): void {
    this._pullStack[this._pullTop++] = node;
  }

  pullPop(): ReactiveNode {
    return this._pullStack[--this._pullTop]!;
  }

  get pulling(): boolean {
    return this._pullTop > 0;
  }

  enqueue(node: ReactiveNode): boolean {
    const kind =
      node.meta & (ReactiveNodeKind.Consumer | ReactiveNodeKind.Recycler);

    switch (kind) {
      case ReactiveNodeKind.Consumer:
        this.computationQueue.insert(node, node.rank);
        return true;

      case ReactiveNodeKind.Recycler:
        this.effectQueue.push(node);
        return true;

      default:
        return false;
    }
  }
}

const runtime = new ReactiveRuntime("main");

export default runtime;
export { ReactiveRuntime };
