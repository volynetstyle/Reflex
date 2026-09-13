import { describe, expect, it } from "vitest";
import { analyzeSource, createInstrumentationPlan } from "../src/index.js";
const source = `interface ReactiveEdge { nextOut: ReactiveEdge | null; to: ReactiveNode }
interface ReactiveNode { state: number }
declare const Visited: number; declare const Changed: number; declare const FAST_BLOCK_MASK: number;
function pushIteratorCore(firstOut: ReactiveEdge | null): void {
 const stack: ReactiveEdge[]=[]; let top=0;
 for(let edge:ReactiveEdge|null=firstOut;edge!==null;edge=edge.nextOut){
  const sub=edge.to; const state=sub.state; let next=0;
  if((state & FAST_BLOCK_MASK)===0){next=(state & ~Visited)|Changed;sub.state=next;}
  stack[top++]=edge; const popped=stack[--top]; void popped;
 }
}`;
describe("algorithm projection", () => {
  it("projects linked traversal, transition, effects and stack", () => {
    const result = analyzeSource(source, "pushIteratorCore", {
      fileName: "push.ts",
    });
    expect(result.cfg.nodes.length).toBeGreaterThan(1);
    const plan = createInstrumentationPlan(result);
    expect(new Set(plan.points.map((point) => point.id)).size).toBe(
      plan.points.length,
    );
    expect(
      plan.points.filter((point) => point.kind === "branch-outcome"),
    ).toHaveLength(2);
    expect(
      plan.points.filter((point) => point.kind === "state-transition"),
    ).toHaveLength(1);
    expect(
      plan.points.filter((point) => point.kind === "stack-push"),
    ).toHaveLength(1);
    expect(
      plan.points.filter((point) => point.kind === "stack-pop"),
    ).toHaveLength(1);
    expect(result.structures.linkedTraversals).toEqual([
      expect.objectContaining({
        variable: "edge",
        type: "ReactiveEdge",
        start: "firstOut",
        continuation: "edge.nextOut",
        termination: "edge === null",
      }),
    ]);
    expect(result.stateTransitions).toEqual([
      expect.objectContaining({
        target: "ReactiveNode.state",
        from: "state",
        to: "(state & ~Visited)|Changed",
        guard: "(state & FAST_BLOCK_MASK)===0",
      }),
    ]);
    expect(result.effects.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "sub.state", value: "next" }),
      ]),
    );
    expect(result.structures.stackCandidates).toEqual([
      expect.objectContaining({
        storage: "stack",
        index: "top",
        pushes: 1,
        pops: 1,
      }),
    ]);
  });
  it("keeps raw IDs stable when only source coordinates move", () => {
    const original = createInstrumentationPlan(
      analyzeSource(source, "pushIteratorCore"),
    );
    const shifted = createInstrumentationPlan(
      analyzeSource(`\n\n${source}`, "pushIteratorCore"),
    );
    expect(shifted.points.map((point) => point.id)).toEqual(
      original.points.map((point) => point.id),
    );
    expect(
      shifted.points.map((point) => point.evidence[0]?.location.line),
    ).not.toEqual(
      original.points.map((point) => point.evidence[0]?.location.line),
    );
  });
  it("reports a missing function", () =>
    expect(() => analyzeSource(source, "missing")).toThrow(/was not found/u));
  it("isolates CFG nodes to the selected function", () => {
    const input = `function small() { return 1; }
function branching(value: boolean) { if (value) return 1; return 0; }`;
    const small = analyzeSource(input, "small");
    const branching = analyzeSource(input, "branching");
    expect(small.cfg.nodes.length).toBeLessThan(branching.cfg.nodes.length);
    expect(
      small.cfg.nodes.every((node) => !node.text?.includes("branching")),
    ).toBe(true);
  });

  it("preserves compound state writes and sentinel traversals", () => {
    const input = `interface Edge { next: Edge | null }
interface Node { state: number }
function walk(first: Edge, stop: Edge, node: Node) {
  for (let edge: Edge | null = first; edge !== stop; edge = edge.next) {
    node.state &= ~1;
  }
}`;
    const result = analyzeSource(input, "walk");
    expect(result.structures.linkedTraversals).toEqual([
      expect.objectContaining({
        continuation: "edge.next",
        termination: "edge === stop",
      }),
    ]);
    expect(result.stateTransitions).toEqual([
      expect.objectContaining({ from: "node.state", to: "node.state & ~1" }),
    ]);
  });
});
