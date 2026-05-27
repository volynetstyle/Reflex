import {
  RenderEffectPhase,
  type RenderEffectScheduler,
} from "@volynets/reflex-framework";

type RenderEffectTask = (() => void) | undefined;

interface RenderEffectQueue {
  tasks: RenderEffectTask[];
  version: number;
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
    [RenderEffectPhase.BeforeRender]: { tasks: [], version: 0 },
    [RenderEffectPhase.Render]: { tasks: [], version: 0 },
    [RenderEffectPhase.AfterRender]: { tasks: [], version: 0 },
  };

  function flushPhase(phase: RenderEffectPhase): void {
    const queue = pendingTasks[phase];
    const tasks = queue.tasks;

    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];

      if (task !== undefined) {
        runTask(task);
      }
    }

    tasks.length = 0;
    queue.version++;
  }

  return {
    schedule(task, phase = RenderEffectPhase.Render) {
      const queue = pendingTasks[phase];
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
