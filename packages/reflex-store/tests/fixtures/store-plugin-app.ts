import { createRuntime, effect } from "@volynets/reflex";
import { createStore } from "@reflex/store";

const runtime = createRuntime({ effectStrategy: "flush" });
const state = createStore({
  user: {
    name: "Alice",
  },
  count: 0,
  meta: {
    status: "idle",
  },
});

export function runStorePluginDemo() {
  const seen: string[] = [];

  const stop = effect(() => {
    seen.push(`${state.user.name}:${state.count}:${state.meta.status}`);
  });

  state.user.name = "Bob";
  state.count += 2;
  runtime.flush();

  const post = state.count++;
  const pre = ++state.count;
  state.meta.status = "ready";
  runtime.flush();
  stop();

  return {
    count: state.count,
    name: state.user.name,
    post,
    pre,
    seen,
    status: state.meta.status,
  };
}
