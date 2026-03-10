import { GraphNode } from "../core";
import { collectEdges } from "../query/collectEdges";
import { tryUnlinkFastPath } from "../unlink/tryUnlinkFastPath";
import { unlinkEdgesReverse } from "./unlinkEdgesReverse";

/**
 * Two-pass version of unlinking outgoing edges with snapshot.
 *
 * OPTIMIZATION: Fast path for count <= 1 (no allocation).
 */
export const unlinkAllObserversChunkedUnsafe = (source: GraphNode): void => {
  const count = source.outCount;

  if (tryUnlinkFastPath(source.firstOut, count)) return;

  const edges = collectEdges(source.firstOut, count, (e) => e.nextOut);
  unlinkEdgesReverse(edges, count);
};

export const unlinkAllObserversBulkUnsafeForDisposal =
  unlinkAllObserversChunkedUnsafe;
