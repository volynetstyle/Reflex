import { finalizeModules } from "../../../tooling/build/finalize-modules.mjs";
import { fileURLToPath } from "node:url";

await finalizeModules(fileURLToPath(new URL("../dist/", import.meta.url)), { __DEV__: "false" });
