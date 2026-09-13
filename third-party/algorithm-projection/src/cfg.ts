import { Linter } from "eslint";
import { parser } from "typescript-eslint";
import type { CfgNode, ControlFlowGraph, SourceLocation } from "./model.js";
interface Segment {
  id: string;
  reachable: boolean;
  nextSegments: Segment[];
  prevSegments: Segment[];
}
interface CodePath {
  initialSegment: Segment;
  finalSegments: Segment[];
}
interface Node {
  type: string;
  range?: [number, number];
  loc?: { start: { line: number; column: number } };
  id?: { name?: string };
  key?: { name?: string };
  parent?: Node;
}
export function buildCfg(
  code: string,
  file: string,
  functionName: string,
): ControlFlowGraph {
  const nodes = new Map<string, CfgNode>();
  let selected: CodePath | undefined;
  const activePaths: CodePath[] = [];
  const save = (segment: Segment, node?: Node): void => {
    const old = nodes.get(segment.id);
    const location: SourceLocation | undefined = node?.loc
      ? { file, line: node.loc.start.line, column: node.loc.start.column + 1 }
      : old?.location;
    nodes.set(segment.id, {
      id: segment.id,
      reachable: segment.reachable,
      kind: node?.type ?? old?.kind ?? "CodePathSegment",
      ...(node?.range
        ? { text: code.slice(...node.range) }
        : old?.text
          ? { text: old.text }
          : {}),
      ...(location ? { location } : {}),
      next: segment.nextSegments.map((x) => x.id),
      previous: segment.prevSegments.map((x) => x.id),
    });
  };
  const nameOf = (node: Node): string | undefined =>
    node.id?.name ?? node.key?.name;
  const rule = {
    meta: { type: "problem" as const, schema: [] },
    create: () => ({
      onCodePathStart(path: CodePath, node: Node) {
        activePaths.push(path);
        if (!selected && nameOf(node) === functionName) {
          selected = path;
          save(path.initialSegment, node);
        }
      },
      onCodePathEnd(path: CodePath) {
        if (activePaths.at(-1) === path) activePaths.pop();
      },
      onCodePathSegmentStart(segment: Segment, node: Node) {
        if (activePaths.at(-1) === selected) save(segment, node);
      },
      onCodePathSegmentEnd(segment: Segment, node: Node) {
        if (activePaths.at(-1) === selected) save(segment, node);
      },
    }),
  };
  const messages = new Linter().verify(
    code,
    [
      {
        files: ["**/*.ts", "**/*.tsx"],
        languageOptions: {
          parser,
          parserOptions: { range: true, loc: true, ecmaVersion: "latest" },
        },
        plugins: { projection: { rules: { capture: rule } } },
        rules: { "projection/capture": "error" },
      },
    ],
    { filename: "projection-input.ts" },
  );
  const fatal = messages.find((message) => message.fatal);
  if (fatal) throw new Error(`Unable to build CFG: ${fatal.message}`);
  if (!selected)
    throw new Error(`ESLint did not emit a code path for ${functionName}`);
  const path: CodePath = selected;
  const queue = [path.initialSegment, ...path.finalSegments];
  const seen = new Set<string>();
  while (queue.length) {
    const segment = queue.pop()!;
    if (seen.has(segment.id)) continue;
    seen.add(segment.id);
    save(segment);
    queue.push(...segment.nextSegments, ...segment.prevSegments);
  }
  return {
    entry: path.initialSegment.id,
    exits: path.finalSegments.map((x) => x.id),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
