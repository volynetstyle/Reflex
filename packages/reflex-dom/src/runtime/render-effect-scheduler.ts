import type { RenderEffectScheduler } from "@volynets/reflex-framework";

type RenderEffectTask = () => void;

export interface DOMRenderEffectScheduler extends RenderEffectScheduler {
  flush(): void;
}

export function createRenderEffectScheduler(): DOMRenderEffectScheduler {
  const pendingTasks: RenderEffectTask[] = [];

  return {
    schedule(task) {
      let active = true;
      pendingTasks.push(() => {
        if (active) task();
      });

      return () => {
        active = false;
      };
    },

    flush() {
      let task: RenderEffectTask | undefined;

      while ((task = pendingTasks.shift()) !== undefined) {
        task();
      }
    },
  };
}
