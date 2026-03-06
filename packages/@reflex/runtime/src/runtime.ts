import { RankedQueue } from "@reflex/core";
import { ReactiveNode, ReactiveNodeKind } from "./reactivity/shape";
import { AppendQueue } from "./scheduler/AppendQueue";
import { REACTIVE_BUDGET } from "./setup";

class ReactiveRuntime {
  id: string;
  currentComputation: ReactiveNode | null;
  computationQueue: RankedQueue<ReactiveNode>;
  effectQueue: AppendQueue<ReactiveNode>;

  constructor(id: string) {
    this.id = id;
    this.currentComputation = null;
    this.computationQueue = new RankedQueue<ReactiveNode>();
    this.effectQueue = new AppendQueue();
  }

  computation() {
    return this.currentComputation;
  }

  beginComputation(node: ReactiveNode) {
    this.currentComputation = node;
  }

  endComputation() {
    this.currentComputation = null;
  }

  enqueue(node: ReactiveNode, rank: number) {
    const type = node.meta;

    if (type & ReactiveNodeKind.Consumer) {
      this.computationQueue.insert(node, rank);
      return;
    }

    if (type & ReactiveNodeKind.Recycler) {
      this.effectQueue.push(node);
      return;
    }
  }
}

const runtime = new ReactiveRuntime("main");

export default runtime;
export { ReactiveRuntime };
