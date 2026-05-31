import type { NodeTopologySnapshot } from "./snapshots";
import type { TopologyGuard } from "./types";

export class StaticTopologyGuard implements TopologyGuard {
  constructor(
    private readonly nodes: NodeTopologySnapshot[],
    private readonly sinks: NodeTopologySnapshot[],
  ) {}

  validate(): boolean {
    return this.validateRange(0, this.nodes.length, 0, this.sinks.length);
  }

  validateRange(
    nodeStart: number,
    nodeEnd: number,
    sinkStart: number,
    sinkEnd: number,
  ): boolean {
    for (let i = nodeStart; i < nodeEnd; i++) {
      const snapshot = this.nodes[i]!;
      if (snapshot.node.s !== snapshot.s) {
        return false;
      }
    }

    for (let i = sinkStart; i < sinkEnd; i++) {
      const snapshot = this.sinks[i]!;
      if (snapshot.node.s !== snapshot.s) {
        return false;
      }
    }

    return true;
  }
}
