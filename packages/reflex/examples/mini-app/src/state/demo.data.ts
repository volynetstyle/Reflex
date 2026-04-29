export type DemoTaskStatus = "planned" | "active" | "review" | "done";
export type DemoRiskLevel = "low" | "medium" | "high";

export interface DemoTask {
  id: string;
  title: string;
  owner: string;
  status: DemoTaskStatus;
  points: number;
  summary: string;
  risk: DemoRiskLevel;
  tags: readonly string[];
}

export interface DemoInsight {
  headline: string;
  checklist: readonly string[];
  notes: readonly string[];
  latencyMs: number;
}

export const demoTasks: readonly DemoTask[] = [
  {
    id: "OPS-14",
    title: "Stabilize draft sync handoff",
    owner: "Nora",
    status: "active",
    points: 5,
    summary: "Align client-side draft state with server confirmation and rollback windows.",
    risk: "medium",
    tags: ["optimistic", "editor", "handoff"],
  },
  {
    id: "OPS-18",
    title: "Reduce scheduler surprise in flush mode",
    owner: "Ilya",
    status: "review",
    points: 3,
    summary: "Document and visualize where direct reads stay fresh while effects remain queued.",
    risk: "low",
    tags: ["scheduler", "effects", "docs"],
  },
  {
    id: "OPS-21",
    title: "Ship keyed projections for task spotlight",
    owner: "Mila",
    status: "planned",
    points: 8,
    summary: "Keep row-level reactivity surgical while selection hops across a large board.",
    risk: "high",
    tags: ["selector", "projection", "board"],
  },
  {
    id: "OPS-24",
    title: "Fold async resource states into board chrome",
    owner: "Artem",
    status: "done",
    points: 2,
    summary: "Expose pending, resolved, and rejected insight panels without leaking stale requests.",
    risk: "low",
    tags: ["resource", "async", "ui"],
  },
];

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function createInsight(
  task: DemoTask,
  query: string,
  latencyMs: number,
): DemoInsight {
  const queryLabel =
    query.trim() === "" ? "general watch" : `filtered by "${query}"`;

  return {
    headline: `${task.id} · ${titleCase(task.status)} delivery lane`,
    checklist: [
      `Protect ${task.owner}'s ${task.points}-point slice from hidden invalidations.`,
      `Keep ${task.risk}-risk updates observable without expanding the dependency graph.`,
      `Review ${queryLabel} before the next flush boundary.`,
    ],
    notes: [
      task.summary,
      `${task.tags.join(" · ")}.`,
      "This payload is generated from the current source snapshot and ignores stale completions.",
    ],
    latencyMs,
  };
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
