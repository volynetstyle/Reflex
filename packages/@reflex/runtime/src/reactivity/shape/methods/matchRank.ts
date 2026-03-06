import { ReactiveNodeKind } from "../ReactiveMeta";
import ReactiveNode from "../ReactiveNode";

export function matchRank(node: ReactiveNode) {
  const type = node.meta;

  if (type & ReactiveNodeKind.Producer) {
    return 0;
  }
   
  
}
