import { build } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
export const outputRoot = resolve(packageRoot, ".cache/async-semantics");
const runtimeRoot = resolve(packageRoot, "../reflex-runtime/src");

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2)
    throw new Error(`Experiment transform drift: ${before}`);
  return source.replace(before, after);
}

/** Transform only the disposable C bundle; never write runtime or async sources. */
function kernelExperiment() {
  return {
    name: "isolated-kernel-async-read",
    enforce: "pre",
    transform(source, id) {
      const path = id.replaceAll("\\", "/");
      if (path.endsWith("/reflex-runtime/src/protocol/read.producer.ts")) {
        return replaceOnce(
          source,
          "  const value = node.payload;",
          "  const deferredRead = (node as ProducerNode<T> & { experimentalAsyncRead?: () => T }).experimentalAsyncRead;\n" +
            "  if (deferredRead !== undefined) return deferredRead();\n  const value = node.payload;",
        );
      }
      if (path.endsWith("/reflex-async/lab/async-semantics/baseline.ts")) {
        source = replaceOnce(
          source,
          "  private readonly stateNode = createResourceStateNode();",
          "  private readonly deferredNode = Object.assign(createAccumulator<T>(undefined as T), {\n" +
            "    experimentalAsyncRead: () => this.readInternal(),\n  });\n" +
            "  private readonly stateNode = createResourceStateNode();",
        );
        return replaceOnce(
          source,
          "  readonly read = (): T => {",
          "  readonly read = (): T => readProducer(this.deferredNode);\n\n  private readonly readInternal = (): T => {",
        );
      }
    },
  };
}

function consumerExperiment(variant) {
  return {
    name: "isolated-consumer-async-frontier",
    enforce: "pre",
    transform(source, id) {
      if (
        !id
          .replaceAll("\\", "/")
          .endsWith("/reflex-async/lab/async-semantics/baseline.ts")
      )
        return;
      source =
        `import { recordAsyncRead, recordPublicationValidation, runBeforeDependencyValidation, runBeforePublicationValidation, withAsyncCapture } from "./frontier";\n` +
        source;
      if (variant !== "B1") {
        source = replaceOnce(
          source,
          "  private readonly stateNode = createResourceStateNode();",
          "  private readonly experimentalDependency = {\n" +
            "    ensure: () => this.ensure(),\n    track: () => activeExecution?.add(this),\n" +
            (variant === "B3"
              ? "    validate: () => this.experimentalValidateForPublication(),\n"
              : "") +
            "  };\n  private readonly stateNode = createResourceStateNode();",
        );
        source = replaceOnce(
          source,
          "    activeExecution?.add(this);",
          "    recordAsyncRead(this.experimentalDependency);\n    activeExecution?.add(this);",
        );
      }
      if (variant === "B2" || variant === "B3") {
        source = replaceOnce(
          source,
          "      const result = this.job(execution);",
          "      const result = withAsyncCapture(() => this.job(execution));",
        );
      }
      if (variant === "B3") {
        source = replaceOnce(
          source,
          "  private publish(attempt: Attempt, result: Result<T>): void {",
          `  private experimentalValidateForPublication(): AsyncCommit<T> | undefined {
    recordPublicationValidation();
    if (this.outcome.kind === "disposed") throw new AsyncDisposedError();
    if (this.activeAttempt !== undefined) {
      const active = this.activeAttempt;
      if (!(active.readCache instanceof AsyncBlocker)) {
        active.readCache = new AsyncBlocker(this, this.whenReadChanges());
      }
      throw active.readCache;
    }
    if (this.outcome.kind === "failure") throw this.outcome.error;
    return readProducer(this.commitNode);
  }

  private publish(attempt: Attempt, result: Result<T>): void {`,
        );
        source = replaceOnce(
          source,
          "  private publish(attempt: Attempt, result: Result<T>): void {\n    if (!attempt.alive()) return;",
          `  private publish(attempt: Attempt, result: Result<T>, recheck = false): void {
    if (!attempt.alive()) return;
    runBeforePublicationValidation();
    if (!attempt.alive()) return;
    try {
      let stillCurrent = true;
      untracked(() => {
        for (const dependency of this.dependencies) {
          runBeforeDependencyValidation(dependency as AsyncDependency & { ensure(): void; track(): void });
          if (!attempt.alive()) {
            stillCurrent = false;
            return;
          }
          const validate = (dependency as AsyncDependency & {
            experimentalValidateForPublication?: () => unknown;
          }).experimentalValidateForPublication;
          if (validate !== undefined) validate.call(dependency);
        }
      });
      if (!stillCurrent || !attempt.alive()) return;
      if (recheck) {
        untracked(() => this.ensure());
        if (!attempt.alive()) return;
      }
    } catch (error) {
      if (error instanceof AsyncBlocker) {
        attempt.blocker = error;
        this.notify();
        void error.promise.then(() => this.finish(attempt, result));
        return;
      }
      result = { kind: "error", error };
    }`,
        );
        source = replaceOnce(
          source,
          "      this.publish(attempt, result);",
          "      this.publish(attempt, result, true);",
        );
      }
      return source;
    },
  };
}

/** An isolated alternative source read for the H2 timing comparison. */
function taggedReadExperiment(production = false) {
  return {
    name: "isolated-tagged-source-read",
    enforce: "pre",
    transform(source, id) {
      if (
        !id
          .replaceAll("\\", "/")
          .endsWith(
            production
              ? "/reflex-async/src/async/source.ts"
              : "/reflex-async/lab/async-semantics/baseline.ts",
          )
      )
        return;
      return replaceOnce(
        source,
        "  refresh(): void {",
        `  experimentalReadResult() {
    try {
      const commit = this.readFreshCommit();
      if (commit !== undefined) return { kind: "value", value: commit.value };
      const attempt = this.activeAttempt;
      if (attempt !== undefined) {
        if (!(attempt.readCache instanceof AsyncBlocker)) {
          attempt.readCache = new AsyncBlocker(this, this.whenReadChanges());
        }
        return { kind: "blocked", blocker: attempt.readCache };
      }
      return { kind: "blocked", blocker: new AsyncBlocker(this, this.whenChanged()) };
    } catch (error) {
      return error instanceof AsyncBlocker ? { kind: "blocked", blocker: error }
        : { kind: "error", error };
    }
  }

  refresh(): void {`,
      );
    },
  };
}

function mutationExperiment(mutation) {
  const changes = mutation.changes ?? [mutation];
  const applied = new Map(changes.map((change) => [change.target, 0]));
  return {
    name: `isolated-b3-mutation-${mutation.id}`,
    enforce: "pre",
    transform(source, id) {
      const path = id.replaceAll("\\", "/");
      const change = changes.find((item) => path.endsWith(item.target));
      if (change === undefined) return;
      applied.set(change.target, applied.get(change.target) + 1);
      for (const edit of change.edits) {
        const occurrences = source.split(edit.from).length - 1;
        if (occurrences !== (edit.occurrences ?? 1))
          throw new Error(
            `B3 mutation ${mutation.id} anchor count: expected ${edit.occurrences ?? 1}, got ${occurrences}`,
          );
        source = source.replaceAll(edit.from, edit.to);
      }
      return source;
    },
    buildEnd() {
      for (const [target, count] of applied)
        if (count !== 1)
          throw new Error(
            `B3 mutation ${mutation.id} applied ${count} times to ${target}`,
          );
    },
  };
}

function productionInstrumentation() {
  return {
    name: "production-async-validation-observer",
    enforce: "pre",
    transform(source, id) {
      if (
        !id
          .replaceAll("\\", "/")
          .endsWith("/reflex-async/src/async/source.ts")
      )
        return;
      source =
        'import { recordPublicationValidation, runBeforeDependencyValidation, runBeforePublicationValidation } from "../../lab/async-semantics/frontier";\n' +
        source;
      source = replaceOnce(
        source,
        "    const validation = this.validateAttempt(attempt, recheck);",
        "    runBeforePublicationValidation();\n    const validation = this.validateAttempt(attempt, recheck);",
      );
      source = replaceOnce(
        source,
        "        for (const dependency of publicationFrontier) {",
        "        for (const dependency of publicationFrontier) {\n          runBeforeDependencyValidation(dependency as never);",
      );
      return replaceOnce(
        source,
        "  validate(): void {",
        "  validate(): void {\n    recordPublicationValidation();",
      );
    },
  };
}

async function buildVariant(variant, mutation) {
  await build({
    configFile: false,
    root: packageRoot,
    logLevel: "error",
    plugins: [
      ...(variant === "P"
        ? [productionInstrumentation()]
        : variant === "C"
          ? [kernelExperiment()]
          : variant.startsWith("B")
            ? [consumerExperiment(variant)]
            : []),
      ...(mutation === undefined ? [] : [mutationExperiment(mutation)]),
      taggedReadExperiment(variant === "P"),
    ],
    resolve: {
      alias: [
        ...(variant === "P"
          ? []
          : [
              {
                find: /^.*\/src\/index$/,
                replacement: resolve(
                  packageRoot,
                  "lab/async-semantics/baseline.ts",
                ),
              },
            ]),
        { find: "@runtime", replacement: runtimeRoot },
        {
          find: "@volynets/reflex-runtime/internal",
          replacement: resolve(runtimeRoot, "internal/index.ts"),
        },
        {
          find: "@volynets/reflex-scheduler",
          replacement: resolve(packageRoot, "../reflex-scheduler/src/index.ts"),
        },
        {
          find: "@volynets/reflex",
          replacement: resolve(packageRoot, "../reflex/src/index.ts"),
        },
      ],
    },
    define: {
      __ASYNC_LAB_VARIANT__: JSON.stringify(variant === "P" ? "B3" : variant),
      __ASYNC_LAB_PRODUCTION__: JSON.stringify(variant === "P"),
      __DEV__: "false",
      __PROFILE__: "false",
      __TRACKING_ONE_HOP__: "true",
      __TRACKING_TWO_HOP__: "true",
      __TRACKING_LAST_EDGE__: "true",
      __TEST__: "false",
      __PROD__: "true",
    },
    esbuild: { platform: "node" },
    build: {
      target: "esnext",
      minify: false,
      emptyOutDir: false,
      outDir: outputRoot,
      lib: {
        entry: resolve(packageRoot, "lab/async-semantics/entry.ts"),
        formats: ["es"],
        fileName: () =>
          mutation === undefined
            ? `${variant}.mjs`
            : `${variant}-mutant-${mutation.id}.mjs`,
      },
      rollupOptions: { external: [/^node:/] },
    },
  });
  console.log(
    mutation === undefined
      ? `Built isolated variant ${variant}`
      : `Built isolated variant ${variant} mutant ${mutation.id}`,
  );
}

export async function buildB3Mutant(mutation) {
  await buildVariant("B3", mutation);
}

export async function buildB3Control() {
  await buildVariant("B3");
}

export async function buildVariants() {
  for (const variant of ["A", "B1", "B2", "B", "B3", "C"])
    await buildVariant(variant);
}

export async function buildProduction(mutation) {
  await buildVariant("P", mutation);
}
