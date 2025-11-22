import { bench, describe } from "vitest";
import {
  createGraph,
  topologicalPropagate,
  sheafDiffusion,
  Node,
} from "./algorithms";

function setAssignments(nodes: Node[], ratio = 0.1) {
  for (let i = 0; i < nodes.length; i++) {
    if (Math.random() < ratio) {
      nodes[i]!.assignment = Math.random() * 10 - 5;
    }
  }
}

function getSources(nodes: Node[]) {
  return nodes.filter((n) => n.incoming.length === 0);
}

function copy(nodes: Node[]) {
  const res = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    res[i] = {
      id: n.id,
      value: 0,
      assignment: n.assignment,
      incoming: [],
      outgoing: [],
      visited: false,
    };
  }

  for (let i = 0; i < nodes.length; i++) {
    for (const inc of nodes[i]!.incoming) res[i]!.incoming.push(res[inc.id]!);
    for (const out of nodes[i]!.outgoing) res[i]!.outgoing.push(res[out.id]!);
  }

  return res;
}

const sizes = [
  { n: 1_000, d: 3 },
  { n: 10_000, d: 4 },
  { n: 50_000, d: 4 },
];

for (const { n, d } of sizes) {
  describe(`Graph: ${n} nodes, avg ${d}`, () => {
    const { nodes } = createGraph(n, d);
    setAssignments(nodes, 0.08);

    const topoNodes = copy(nodes);
    const sheafNodes = copy(nodes);

    const sources = getSources(topoNodes);

    bench("Topological propagation", () => {
      for (const n of topoNodes) n.visited = false;
      topologicalPropagate(sources);
    });

    bench("Sheaf diffusion (40 iter)", () => {
      sheafDiffusion(sheafNodes, 1, 0.2);
    });
  });
}
