import { finalizeModules } from "../../../tooling/build/finalize-modules.mjs";
import { fileURLToPath } from "node:url";

// Packaged ESM uses production profiling semantics; source/profile tests retain their preset.
await finalizeModules(fileURLToPath(new URL("../dist/", import.meta.url)), { __PROFILE__: "false" });
