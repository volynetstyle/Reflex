import { GraphNode } from "../graph.node";
import { collectEdges } from "../query/collectEdges";
import { tryUnlinkFastPath } from "./tryUnlinkFastPath";
import { unlinkEdgesReverse } from "./unlinkEdgesReverse";

/**
 * Chunked reverse-unlinking for incoming edges.
 *
 * OPTIMIZATION: Reuses generic helpers to avoid code duplication.
 */
export const unlinkAllSourcesChunkedUnsafe = (observer: GraphNode): void => {
  const count = observer.inCount;

  if (tryUnlinkFastPath(observer.firstIn, count)) return;

  const edges = collectEdges(observer.firstIn, count, (e) => e.nextIn);
  unlinkEdgesReverse(edges, count);
};