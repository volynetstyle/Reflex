// Vitest setup file of a mutated run (mutation.mjs): records, per test file,
// how often the mutated site executed. The counter is a global of the worker,
// reset before each file; the kernel module itself may be shared between
// files (isolate: false), the counter is not.
import { appendFileSync } from "node:fs";
import { afterAll, beforeAll } from "vitest";

const target = process.env.REFLEX_REACH_FILE;

if (target) {
  beforeAll(() => {
    globalThis.__reflexReach = 0;
  });
  // Vitest passes the file's suite second; the first argument is the fixture
  // context and must be a destructuring pattern.
  // eslint-disable-next-line no-empty-pattern
  afterAll(({}, suite) => {
    const file = suite.filepath ?? suite.file?.filepath;
    appendFileSync(
      target,
      JSON.stringify({ file, hits: globalThis.__reflexReach | 0 }) + "\n",
    );
  });
}
