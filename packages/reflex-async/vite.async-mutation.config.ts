import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vite.config";
import { asyncMutations } from "./scripts/async-mutations.mjs";

const name = process.env.REFLEX_ASYNC_MUTANT;
const mutation = asyncMutations.find((candidate) => candidate.id === name);
if (name !== "control" && mutation === undefined) {
  throw new Error(`Unknown async contract mutation: ${name}`);
}

export default mergeConfig(base, defineConfig({
  plugins: mutation === undefined ? [] : [{
    name: "async-contract-mutation",
    enforce: "pre",
    transform(original, id) {
      if (!id.split("?")[0]?.replaceAll("\\", "/").endsWith(mutation.target)) return;
      const code = original.replaceAll("\r\n", "\n");
      const occurrences = code.split(mutation.from).length - 1;
      if (occurrences !== (mutation.occurrences ?? 1)) {
        throw new Error(`ASYNC_MUTATION_ANCHOR_ERROR:${mutation.id}: found ${occurrences} anchors`);
      }
      console.log(`ASYNC_MUTATION_APPLIED:${mutation.id}`);
      return { code: code.replaceAll(mutation.from, mutation.to), map: null };
    },
  }],
  test: { bail: 1, maxWorkers: 1, testTimeout: 2_000 },
}));
