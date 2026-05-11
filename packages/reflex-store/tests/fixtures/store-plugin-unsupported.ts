import { createStore } from "@reflex/store";

const state = createStore({ count: 0 });
const key = "count";

export const value = state[key];
