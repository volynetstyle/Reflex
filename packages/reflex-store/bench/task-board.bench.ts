import { beforeEach, bench, describe } from "vitest";
import {
  boardActions,
  setTasks,
  summary,
  taskById,
  tasks,
  type Task,
} from "../examples/task-board/src/task-board";

describe("task board operation costs", () => {
  beforeEach(() => boardActions.reset());

  let selected = "T-101";
  bench("selector: change selected id", () => {
    selected = selected === "T-101" ? "T-102" : "T-101";
    boardActions.select(selected);
    boardActions.flush();
  });

  bench("summary: no-op filter write", () => {
    boardActions.setFilter("all");
    boardActions.flush();
  });

  let status: "active" | "backlog" = "active";
  bench("summary: one changed property", () => {
    status = status === "active" ? "backlog" : "active";
    boardActions.move("T-102", status);
    boardActions.flush();
  });

  bench("summary: property read", () => {
    void summary.visible;
  });

  bench("projection: materialized key lookup", () => {
    void taskById(selected);
  });
});

for (const size of [10, 100, 1_000, 10_000]) {
  describe(`task board collection scaling: ${size}`, () => {
    const scaledTasks: Task[] = Array.from({ length: size }, (_, index) => ({
      id: `T-${index}`,
      title: `Task ${index}`,
      assignee: `Owner ${index % 10}`,
      status: index % 3 === 0 ? "done" : "backlog",
    }));

    const ensureCollection = () => {
      if (tasks().length === size) return;
      setTasks(scaledTasks);
      boardActions.select(`T-${size - 1}`);
      boardActions.flush();
    };

    let selectedIndex = size - 1;

    bench("selection + projection flush", () => {
      ensureCollection();
      selectedIndex = selectedIndex === size - 1 ? size - 2 : size - 1;
      boardActions.select(`T-${selectedIndex}`);
      boardActions.flush();
    });

    let filter: "done" | "backlog" = "done";
    bench("filter + summary flush", () => {
      ensureCollection();
      filter = filter === "done" ? "backlog" : "done";
      boardActions.setFilter(filter);
      boardActions.flush();
      void summary.visible;
    });

    bench("task move + summary flush", () => {
      ensureCollection();
      const current = tasks().at(-1)!;
      const nextStatus = current.status === "active" ? "backlog" : "active";
      boardActions.move(current.id, nextStatus);
      boardActions.flush();
      void summary.completed;
    });
  });
}
