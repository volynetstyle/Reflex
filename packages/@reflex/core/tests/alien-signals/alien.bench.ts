import { bench, describe } from "vitest";
import {
  createReactiveSystem,
  ReactiveFlags,
  ReactiveNode,
} from "./alien"; // шлях виправ під себе

const NODE_COUNT = 1000;

function createNodes(): ReactiveNode[] {
  const nodes: ReactiveNode[] = new Array(NODE_COUNT);
  for (let i = 0; i < NODE_COUNT; i++) {
    nodes[i] = {
      flags: ReactiveFlags.Mutable,
      deps: undefined,
      depsTail: undefined,
      subs: undefined,
      subsTail: undefined,
    };
  }
  return nodes;
}

function createSystem() {
  return createReactiveSystem({
    update(node) {
      node.flags |= ReactiveFlags.Dirty;
      return true;
    },
    notify() {},
    unwatched() {},
  });
}
    const sys = createSystem();

describe("Reactive intrusive graph – 1000 nodes", () => {
  bench("link 1000 linear edges", () => {
    const nodes = createNodes();

    for (let i = 1; i < NODE_COUNT; i++) {
      sys.link(nodes[i - 1]!, nodes[i]!, 1);
    }
  });

  bench("propagate full chain", () => {
    const sys = createSystem();
    const nodes = createNodes();

    for (let i = 1; i < NODE_COUNT; i++) {
      sys.link(nodes[i - 1]!, nodes[i]!, 1);
    }

    const firstLink = nodes[0]!.subs!;
    sys.propagate(firstLink);
  });

  bench("checkDirty deep chain", () => {
    const sys = createSystem();
    const nodes = createNodes();

    for (let i = 1; i < NODE_COUNT; i++) {
      sys.link(nodes[i - 1]!, nodes[i]!, 1);
    }

    const firstLink = nodes[0]!.subs!;
    sys.checkDirty(firstLink, nodes[0]!);
  });

  bench("shallowPropagate fan-out", () => {
    const sys = createSystem();
    const nodes = createNodes();

    const root = nodes[0];

    for (let i = 1; i < NODE_COUNT; i++) {
      sys.link(root!, nodes[i]!, 1);
    }

    const firstSub = root!.subs!;
    sys.shallowPropagate(firstSub);
  });
});
