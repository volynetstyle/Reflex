import { pathToFileURL } from "node:url";
import path from "node:path";

const args = process.argv.slice(2);

function readArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] ?? fallback;
}

const distArg = readArg("--dist", "../dist/esm/index.js");
const label = readArg("--label", path.basename(path.dirname(distArg)));
const mode = readArg("--mode", "dynamic");
const rounds = Number(readArg("--rounds", "18"));
const distPath = path.resolve(import.meta.dirname, distArg);

const { createRuntime } = await import(pathToFileURL(distPath).href);

let sink = 0;

function blackhole(value) {
  sink = (sink * 65537 + (value | 0)) | 0;
}

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function makeDynamicHarness(memoCount = 12000, depCount = 12, sourceCount = 24) {
  const runtime = createRuntime();
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    runtime.signal(index),
  );
  const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
    runtime.memo(() => {
      let sum = 0;
      const flip = sources[0].read() & 3;
      for (let depIndex = 0; depIndex < depCount; depIndex++) {
        const sourceIndex =
          (memoIndex * 5 + depIndex + flip * 7) % sourceCount;
        sum += sources[sourceIndex].read();
      }
      return sum;
    }),
  );

  return {
    step(iteration) {
      sources[0].write(iteration);
      for (let i = 0; i < memos.length; ++i) {
        blackhole(memos[i]());
      }
    },
  };
}

function makeWideHarness(memoCount = 50000, depCount = 5, sourceCount = 32) {
  const runtime = createRuntime();
  const sources = Array.from({ length: sourceCount }, (_, index) =>
    runtime.signal(index),
  );
  const memos = Array.from({ length: memoCount }, (_, memoIndex) =>
    runtime.memo(() => {
      let sum = 0;
      for (let depIndex = 0; depIndex < depCount; depIndex++) {
        sum += sources[(memoIndex + depIndex * 7) % sourceCount].read();
      }
      return sum;
    }),
  );

  return {
    step(iteration) {
      sources[iteration % sourceCount].write(iteration);
      for (let i = 0; i < memos.length; i += 10) {
        blackhole(memos[i]());
      }
    },
  };
}

const harness =
  mode === "wide" ? makeWideHarness() : makeDynamicHarness();

console.log(`young-gen churn [${label}]`);
console.log(`dist ${distPath}`);
console.log(`mode ${mode}, rounds ${rounds}`);
console.log(`heap before ${formatMB(process.memoryUsage().heapUsed)}`);

for (let round = 0; round < rounds; ++round) {
  harness.step(round + 1);
  if ((round + 1) % 3 === 0) {
    console.log(
      `round ${round + 1}: heap ${formatMB(process.memoryUsage().heapUsed)}`,
    );
  }
}

console.log(`heap after ${formatMB(process.memoryUsage().heapUsed)}`);
if (sink === 42) {
  console.log(sink);
}
