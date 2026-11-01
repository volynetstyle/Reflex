import { defineConfig } from "@tsslint/config";

import { jitContracts } from "./config/tsslint/jit-contracts.ts";

export default defineConfig({
  rules: { "jit/contracts": jitContracts },
});
