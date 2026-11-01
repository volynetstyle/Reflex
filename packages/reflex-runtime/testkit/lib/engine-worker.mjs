// One shard of a sharded comparison (engine.mjs runSharded). Each worker
// imports both bundles itself, so the shards share no runtime state.
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

import { runShard } from "./engine.mjs";

const { referenceFile, candidateFile, task } = workerData;
const reference = await import(pathToFileURL(referenceFile).href);
const candidate =
  candidateFile === referenceFile
    ? await import(`${pathToFileURL(candidateFile).href}?side=candidate`)
    : await import(pathToFileURL(candidateFile).href);
parentPort.postMessage(await runShard(reference, candidate, task));
