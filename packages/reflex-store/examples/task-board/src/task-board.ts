import { createRuntime, effect, signal } from "@volynets/reflex";
import {
  createProjection,
  createSelector,
  createStore,
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

export const tasks = signal<readonly Task[]>(INITIAL_TASKS);

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

export const isTaskSelected = createSelector(() => ui.selection.taskId);

export const taskById = createProjection<Task, string, Task>(
  () => {
    const selectedTaskId = ui.selection.taskId;
    const allTasks = tasks();

    for (let index = 0; index < allTasks.length; index++) {
      const task = allTasks[index]!;

      if (task.id === selectedTaskId) {
        return task;
      }
    }

    return EMPTY_TASK;
  },
  (task: Task) => task.id,
  (task: Task) => task,
);

export const summary = createProjection<BoardSummary>(
  (draft) => {
    const allTasks = tasks();
    const status = ui.filter.status;
    const normalizedQuery = ui.filter.query.trim().toLocaleLowerCase();
    const selectedTask = taskById(ui.selection.taskId);

    let completed = 0;
    let visible = 0;

    for (let index = 0; index < allTasks.length; index++) {
      const task = allTasks[index]!;

      if (task.status === "done") {
        completed++;
      }

      if (
        (status === "all" || task.status === status) &&
        (normalizedQuery === "" ||
          task.title.toLocaleLowerCase().includes(normalizedQuery))
      ) {
        visible++;
      }
    }

    draft.total = allTasks.length;
    draft.completed = completed;
    draft.visible = visible;
    draft.activeTitle =
      selectedTask === undefined ? EMPTY_TASK.title : selectedTask.title;
    draft.filterLabel =
      normalizedQuery === "" ? status : `${status}:${normalizedQuery}`;
  },
  {
    total: 0,
    visible: 0,
    completed: 0,
    activeTitle: EMPTY_TASK.title,
    filterLabel: "all",
  },
);

export const boardActions = {
  select(taskId: string) {
    if (ui.selection.taskId !== taskId) {
      ui.selection.taskId = taskId;
    }
  },

  setFilter(status: TaskStatus | "all", query = "") {
    if (ui.filter.status !== status) {
      ui.filter.status = status;
    }

    if (ui.filter.query !== query) {
      ui.filter.query = query;
    }
  },

  move(taskId: string, status: TaskStatus) {
    const currentTasks = tasks();

    for (let index = 0; index < currentTasks.length; index++) {
      const task = currentTasks[index]!;

      if (task.id !== taskId) {
        continue;
      }

      if (task.status === status) {
        return;
      }

      const nextTasks = currentTasks.slice();
      nextTasks[index] = { ...task, status };
      tasks.set(nextTasks);
      return;
    }
  },

  reset() {
    tasks.set(INITIAL_TASKS);
    ui.filter.status = "all";
    ui.filter.query = "";
    ui.selection.taskId = "T-101";
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
      `${summary.filterLabel}|${summary.visible}|${summary.completed}|${summary.activeTitle}`,
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
