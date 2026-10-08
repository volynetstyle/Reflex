// Compatibility entrypoint. The workspace graph owns ordering; builds are uncached.
import { runWorkspaceTask } from "../tooling/build/run.mjs";

await runWorkspaceTask(process.argv.slice(2).filter((arg) => arg !== "--force"));
