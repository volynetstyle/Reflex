import { createRuntime, effect } from "@volynets/reflex-store/runtime";
import {
  action,
  createStore,
  derive,
  reactiveMap,
  selector,
} from "@volynets/reflex-store";

export type TaskStatus = "backlog" | "active" | "done";

export interface Task {
  id: string;
  title: string;
  assignee: string;
  status: TaskStatus;
}

export interface BoardSummary {
  total: number;
  visible: number;
  completed: number;
  activeTitle: string;
  filterLabel: string;
}

export const taskBoardRuntime = createRuntime({ effectStrategy: "flush" });

const INITIAL_TASKS: readonly Task[] = [
  { id: "T-101", title: "Design checkout", assignee: "Ada", status: "active" },
  { id: "T-102", title: "Add audit log", assignee: "Lin", status: "backlog" },
  { id: "T-103", title: "Ship billing", assignee: "Ada", status: "done" },
];

export const tasks = reactiveMap<string, Task>(
  INITIAL_TASKS.map((task) => [task.id, task] as const),
);

const ui = createStore({
  filter: {
    status: "all" as TaskStatus | "all",
    query: "",
  },
  selection: {
    taskId: "T-101",
  },
});

const EMPTY_TASK: Readonly<Task> = Object.freeze({
  id: "",
  title: "No task selected",
  assignee: "",
  status: "backlog",
});

export const isTaskSelected = selector(() => ui.selection.taskId);

export const taskById = (taskId: string): Task | undefined => tasks.get(taskId);

export const summary = derive<BoardSummary>(() => {
  const allTasks = [...tasks.values()];
  const status = ui.filter.status;
  const normalizedQuery = ui.filter.query.trim().toLocaleLowerCase();
  const selectedTask = tasks.get(ui.selection.taskId) ?? EMPTY_TASK;

  let completed = 0;
  let visible = 0;

  for (const task of allTasks) {
    if (task.status === "done") completed++;

    if (
      (status === "all" || task.status === status) &&
      (normalizedQuery === "" ||
        task.title.toLocaleLowerCase().includes(normalizedQuery))
    ) {
      visible++;
    }
  }

  return {
    total: allTasks.length,
    completed,
    visible,
    activeTitle: selectedTask.title,
    filterLabel:
      normalizedQuery === "" ? status : status + ":" + normalizedQuery,
  };
});

const resetBoard = action(() => {
  tasks.clear();
  for (const task of INITIAL_TASKS) tasks.set(task.id, task);
  ui.filter.status = "all";
  ui.filter.query = "";
  ui.selection.taskId = "T-101";
});

export const boardActions = {
  select: action((taskId: string) => {
    if (ui.selection.taskId !== taskId) ui.selection.taskId = taskId;
  }),

  setFilter: action((status: TaskStatus | "all", query = "") => {
    if (ui.filter.status !== status) ui.filter.status = status;
    if (ui.filter.query !== query) ui.filter.query = query;
  }),

  move: action((taskId: string, status: TaskStatus) => {
    const task = tasks.get(taskId);
    if (!task || task.status === status) return;
    tasks.set(taskId, { ...task, status });
  }),

  reset() {
    resetBoard();
    taskBoardRuntime.flush();
  },

  flush() {
    taskBoardRuntime.flush();
  },
};

export function runTaskBoardScenario() {
  const renders: string[] = [];

  const stop = effect(() => {
    renders.push(
      summary.filterLabel +
        "|" +
        summary.visible +
        "|" +
        summary.completed +
        "|" +
        summary.activeTitle,
    );
  });

  boardActions.setFilter("active");
  boardActions.select("T-102");
  taskBoardRuntime.flush();

  boardActions.move("T-102", "active");
  taskBoardRuntime.flush();

  stop();

  const activeTask = taskById("T-102");

  return {
    activeTask: activeTask === undefined ? undefined : activeTask.title,
    completed: summary.completed,
    isSelected: isTaskSelected("T-102"),
    renders,
    total: summary.total,
    visible: summary.visible,
  };
}
