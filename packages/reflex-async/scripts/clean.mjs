import { rmSync } from "node:fs";

// Fixed paths relative to this package; never remove another workspace's output.
for (const path of ["../build", "../dist"]) {
  rmSync(new URL(path, import.meta.url), { recursive: true, force: true });
}
