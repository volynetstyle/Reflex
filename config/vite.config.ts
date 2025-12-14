import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "@reflex/core",
      fileName: (format) => `my-lib.${format}.js`,
      formats: ["es", "cjs"]
    },
    rollupOptions: {
      external: [
        // "react", "lodash" и пр., если они peerDependencies
      ],
      output: {
        globals: {
          // react: "React"
        }
      }
    }
  },
});
