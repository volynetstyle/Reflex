export type Node = {
  id: number;
  value: number;
  assignment: number | null;
  incoming: Node[];
  outgoing: Node[];
  visited: boolean;
};

export function createGraph(nodeCount: number, avgDegree: number) {
  const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => ({
    id: i,
    value: 0,
    assignment: null,
    incoming: [],
    outgoing: [],
    visited: false,
  }));
  const sources: Node[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const outCount = Math.max(0, Math.round(Math.random() * avgDegree * 2) - 1);
    for (let j = 0; j < outCount; j++) {
      const targetId = Math.floor(Math.random() * nodeCount);
      if (targetId <= i) continue;
      const target = nodes[targetId]!;
      nodes[i]!.outgoing.push(target);
      target.incoming.push(nodes[i]!);
    }
    if (nodes[i]!.incoming.length === 0) sources.push(nodes[i]!);
  }
  return { nodes, sources };
}

export function topologicalPropagate(sources: Node[]) {
  const queue = sources.slice();
  let qi = 0;

  while (qi < queue.length) {
    const node = queue[qi++]!;
    if (node.visited) continue;
    node.visited = true;

    let sum = 0;
    let deg = 0;

    const inc = node.incoming;
    for (let i = 0; i < inc.length; i++) {
      sum += inc[i]!.value;
      deg++;
    }

    if (node.assignment !== null) {
      sum += node.assignment;
      deg++;
    }

    node.value = deg > 0 ? sum / deg : (node.assignment ?? 0);

    const out = node.outgoing;
    for (let i = 0; i < out.length; i++) {
      queue.push(out[i]!);
    }
  }
}

export function sheafDiffusion(
  nodes: Node[],
  iterations = 40,
  eta = 0.01,
  alpha = 0.0,
) {
  const buffer = new Float64Array(nodes.length);

  for (let it = 0; it < iterations; ++it) {
  
    for (let i = 0, len = nodes.length; i < len; ++i) {
      const node = nodes[i]!;
      const x = node.value;

      let sum = 0;
      let deg = 0;

      const inc = node.incoming;
      for (let j = 0; j < inc.length; j++) {
        sum += inc[j]!.value;
        deg++;
      }

      const out = node.outgoing;
      for (let j = 0; j < out.length; j++) {
        sum += out[j]!.value;
        deg++;
      }

      const laplace = deg > 0 ? sum - deg * x : 0;
      const force = node.assignment !== null ? node.assignment - x : 0;

      buffer[i] = x + eta * (laplace + alpha * force);
    }

    for (let i = 0; i < nodes.length; i++) {
      nodes[i]!.value = buffer[i]!;
    }
  }
}

export function deepCopyNodesFast(nodes: Node[]): Node[] {
  const copy = new Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    copy[i] = {
      id: i,
      value: 0,
      assignment: n.assignment,
      incoming: [],
      outgoing: [],
      visited: false,
    };
  }

  for (let i = 0; i < nodes.length; i++) {
    const orig = nodes[i]!;
    const c = copy[i]!;

    for (let j = 0; j < orig.incoming.length; j++) {
      c.incoming.push(copy[orig.incoming[j]!.id]!);
    }

    for (let j = 0; j < orig.outgoing.length; j++) {
      c.outgoing.push(copy[orig.outgoing[j]!.id]!);
    }
  }

  return copy;
}
