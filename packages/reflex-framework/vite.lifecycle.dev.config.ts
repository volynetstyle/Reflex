import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vite.config";

const config = mergeConfig(
  baseConfig,
  defineConfig({
    define: { __DEV__: true },
  }),
);

config.test = { ...config.test, name: "framework/dev", include: ["test/lifecycle.dev.ts"] };
export default config;
