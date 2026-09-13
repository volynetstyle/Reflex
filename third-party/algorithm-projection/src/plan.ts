import type {
  AlgorithmProjection,
  InstrumentationPlan,
  ObservationPoint,
  ObservationPointKind,
  SourceEvidence,
  SourceLocation,
} from "./model.js";

export function createInstrumentationPlan(
  projection: AlgorithmProjection,
): InstrumentationPlan {
  const points: ObservationPoint[] = [];
  const occurrences = new Map<string, number>();
  const normalize = (value: string): string =>
    value.replace(/\s+/gu, "").replace(/;$/u, "");
  const hash = (value: string): string => {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
  };
  const add = (
    kind: ObservationPointKind,
    location: SourceLocation,
    suffix: string,
    evidence: SourceEvidence,
    metadata?: Readonly<Record<string, string | number | boolean>>,
  ): void => {
    const expression = normalize(evidence.expression ?? evidence.kind);
    const target = metadata?.target ?? "";
    const base = [projection.function, kind, suffix, expression, target].join(
      "|",
    );
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    const fingerprint = hash(`${base}|occurrence:${occurrence}`);
    points.push({
      id: `projection.raw.${projection.function}.${kind}.${fingerprint}`,
      space: "raw",
      fingerprint,
      function: projection.function,
      kind,
      evidence: [evidence],
      ...(metadata ? { metadata } : {}),
    });
  };

  add("function-entry", projection.source, "enter", {
    kind: "function",
    location: projection.source,
  });

  for (const loop of projection.loops) {
    const expression = loop.condition ?? loop.iterator ?? loop.kind;
    const evidence = {
      kind: "loop" as const,
      location: loop.location,
      expression,
    };
    add("loop-enter", loop.location, "enter", evidence, {
      loopKind: loop.kind,
    });
    add("loop-exit", loop.location, "exit", evidence, { loopKind: loop.kind });
  }

  for (const branch of projection.branches) {
    const evidence = {
      kind: "branch" as const,
      location: branch.location,
      expression: branch.condition,
    };
    add("branch-outcome", branch.location, "true", evidence, { outcome: true });
    add("branch-outcome", branch.location, "false", evidence, {
      outcome: false,
    });
  }

  for (const transition of projection.stateTransitions) {
    add(
      "state-transition",
      transition.location,
      "write",
      {
        kind: "transition",
        location: transition.location,
        expression: `${transition.target} = ${transition.to}`,
      },
      { target: transition.target },
    );
  }

  for (const stack of projection.structures.stackCandidates) {
    const evidence = {
      kind: "resource" as const,
      location: stack.location,
      expression: `${stack.storage}[${stack.index}]`,
    };
    add("stack-push", stack.location, "push", evidence, {
      sites: stack.pushes,
    });
    add("stack-pop", stack.location, "pop", evidence, { sites: stack.pops });
  }

  projection.cfg.exits.forEach((segment, index) => {
    const node = projection.cfg.nodes.find(
      (candidate) => candidate.id === segment,
    );
    const location = node?.location ?? projection.source;
    add(
      "function-exit",
      location,
      String(index),
      { kind: "cfg-exit", location, cfgNode: segment },
      { reachable: node?.reachable ?? true },
    );
  });

  return { function: projection.function, points };
}
