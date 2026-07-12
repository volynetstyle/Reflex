export const RenderEffectPhase = {
  BeforeRender: 1 << 0,
  Render: 1 << 1,
  AfterRender: 1 << 2,
} as const;

export type RenderEffectPhase =
  (typeof RenderEffectPhase)[keyof typeof RenderEffectPhase];

export interface RenderEffectScheduler {
  schedule(task: () => void, phase?: RenderEffectPhase): () => void;
}

type RenderEffectTask = (() => void) | undefined;

interface RenderEffectQueue {
  tasks: RenderEffectTask[];
  version: number;
  flushing: boolean;
}

export interface DOMRenderEffectScheduler extends RenderEffectScheduler {
  flush(phase?: RenderEffectPhase): void;
}

type RenderEffectTaskRunner = (task: () => void) => void;

const renderEffectPhases: readonly RenderEffectPhase[] = [
  RenderEffectPhase.BeforeRender,
  RenderEffectPhase.Render,
  RenderEffectPhase.AfterRender,
];


export function createRenderEffectScheduler(
  runTask: RenderEffectTaskRunner = (task) => {
    task();
  },
): DOMRenderEffectScheduler {
  const pendingTasks: Record<RenderEffectPhase, RenderEffectQueue> = {
    [RenderEffectPhase.BeforeRender]: {
      tasks: [],
      version: 0,
      flushing: false,
    },
    [RenderEffectPhase.Render]: {
      tasks: [],
      version: 0,
      flushing: false,
    },
    [RenderEffectPhase.AfterRender]: {
      tasks: [],
      version: 0,
      flushing: false,
    },
  };

  function flushPhase(phase: RenderEffectPhase): void {
    const queue = pendingTasks[phase]!;

    if (queue.flushing || queue.tasks.length === 0) {
      return;
    }

    queue.flushing = true;

    try {
      while (queue.tasks.length > 0) {
        const tasks = queue.tasks;
        queue.tasks = [];
        queue.version++;

        for (let index = 0; index < tasks.length; index++) {
          const task = tasks[index];

          if (task !== undefined) {
            runTask(task);
          }
        }
      }
    } finally {
      queue.flushing = false;
    }
  }

  return {
    schedule(task, phase = RenderEffectPhase.Render) {
      const queue = pendingTasks[phase]!;

      const version = queue.version;
      const index = queue.tasks.length;

      queue.tasks.push(task);

      return () => {
        if (queue.version === version) {
          queue.tasks[index] = undefined;
        }
      };
    },

    flush(phase) {
      if (phase !== undefined) {
        flushPhase(phase);
        return;
      }

      for (let index = 0; index < renderEffectPhases.length; index++) {
        flushPhase(renderEffectPhases[index]!);
      }
    },
  };
}




