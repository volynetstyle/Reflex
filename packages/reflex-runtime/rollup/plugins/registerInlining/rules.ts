export const REGISTER_SOURCE_SUFFIX = "/kernel/state.js";

export const REGISTER_MODULE_SUFFIXES = [
  "/kernel/batch.js",
  "/kernel/context.scope.js",
] as const;

export const STATE_IMPORT =
  'import { currentConsumer as __kernelCurrentConsumer, pendingReactiveSettled as __kernelPendingReactiveSettled, propagationScopeDepth as __kernelPropagationScopeDepth, reactiveBatchDepth as __kernelReactiveBatchDepth } from "./state";\n';

export function inlineRegisterReads(code: string): string {
  return code
    .replaceAll("isReactiveBatchActive()", "(__kernelReactiveBatchDepth !== 0)")
    .replaceAll("hasPendingReactiveSettled()", "__kernelPendingReactiveSettled")
    .replaceAll(
      "isRuntimeExecutionIdle()",
      "(__kernelPropagationScopeDepth === 0 && __kernelCurrentConsumer === null)",
    );
}

function findRegister(
  code: string,
  setter: string,
  parameter: string,
): string | null {
  const namedMatch = code.match(
    new RegExp(
      `function\\s+${setter}(?:\\$[\\w$]+)?\\(${parameter}\\)\\s*\\{\\s*([\\w$]+)\\s*=`,
    ),
  );
  if (namedMatch?.[1] !== undefined) return namedMatch[1];

  // CJS output may fully deconflict the local helper name. Its validated
  // single-parameter assignment shape remains the stable semantic boundary.
  const structuralMatch = code.match(
    new RegExp(
      `function\\s+[\\w$]+\\(${parameter}\\)\\s*\\{\\s*([\\w$]+)\\s*=\\s*${parameter}\\s*;`,
    ),
  );
  return structuralMatch?.[1] ?? null;
}

function replaceUnaryCalls(
  code: string,
  name: string,
  replacement: (argument: string) => string,
): string {
  return code.replace(
    new RegExp(`(?<!function\\s)\\b${name}\\(([^(),]*)\\)`, "g"),
    (_call, argument: string) => replacement(argument.trim()),
  );
}

export function inlineRegisterWrites(code: string): string {
  const currentConsumer = findRegister(code, "setCurrentConsumer", "consumer");
  const trackingEpoch = findRegister(code, "setTrackingEpoch", "epoch");
  const propagationDepth = findRegister(
    code,
    "setPropagationScopeDepth",
    "depth",
  );

  const batchState = code.match(
    /function\s+setReactiveBatchState(?:\$[\w$]+)?\(batchDepth,\s*pendingSettled\)\s*\{\s*([\w$]+)\s*=\s*batchDepth[^;]+;\s*([\w$]+)\s*=\s*pendingSettled;/,
  );
  const batchDepth = batchState?.[1] ?? null;
  const pendingSettled = batchState?.[2] ?? null;

  let transformed = code;

  if (currentConsumer !== null) {
    transformed = replaceUnaryCalls(
      transformed,
      "setCurrentConsumer",
      (argument) => `(${currentConsumer} = ${argument})`,
    );
    transformed = replaceUnaryCalls(
      transformed,
      "restoreConsumerTracking",
      (argument) => `(${currentConsumer} = ${argument})`,
    );

    if (trackingEpoch !== null) {
      transformed = transformed.replace(
        /\b(const|let)\s+([\w$]+)\s*=\s*enterConsumerTracking\(([^(),]*)\);/g,
        `$1 $2 = ${currentConsumer}; ${currentConsumer} = $3; ${trackingEpoch} = (${trackingEpoch} + 1) >>> 0 || 1;`,
      );
    }
  }

  if (trackingEpoch !== null) {
    transformed = replaceUnaryCalls(
      transformed,
      "setTrackingEpoch",
      (argument) => `(${trackingEpoch} = (${argument}) >>> 0)`,
    );
    transformed = transformed.replace(
      /(?<!function\s)\badvanceTrackingEpoch\(\)/g,
      `(${trackingEpoch} = (${trackingEpoch} + 1) >>> 0 || 1)`,
    );
    transformed = replaceUnaryCalls(
      transformed,
      "keepNewestTrackingEpoch",
      (argument) =>
        `(((${argument}) - ${trackingEpoch}) | 0) > 0 && (${trackingEpoch} = ${argument})`,
    );
    transformed = transformed.replace(
      /(?<!function\s)\bisNewerEpoch\(([^(),]*),\s*([^(),]*)\)/g,
      "((($1) - ($2)) | 0) > 0",
    );
  }

  if (propagationDepth !== null && currentConsumer !== null) {
    transformed = replaceUnaryCalls(
      transformed,
      "setPropagationScopeDepth",
      (argument) =>
        `(${propagationDepth} = (${argument}) < 0 ? 0 : ${argument})`,
    );
    transformed = transformed.replace(
      /(?<!function\s)\benterPropagationScopeRegister\(\)/g,
      `${propagationDepth}++`,
    );
    transformed = transformed.replace(
      /(?<!function\s)\bleavePropagationScopeRegister\(\)/g,
      `(${propagationDepth} > 0 && ${propagationDepth}--, ${propagationDepth} === 0 && ${currentConsumer} === null)`,
    );
  }

  if (batchDepth !== null && pendingSettled !== null) {
    transformed = transformed
      .replace(
        /(?<!function\s)\benterReactiveBatchRegister\(\)/g,
        `${batchDepth}++`,
      )
      .replace(
        /(?<!function\s)\bleaveReactiveBatchRegister\(\)/g,
        `(${batchDepth} > 0 && ${batchDepth}--, ${batchDepth} === 0)`,
      )
      .replace(
        /(?<!function\s)\bmarkReactiveSettledPending\(\)/g,
        `(${pendingSettled} = true)`,
      )
      .replace(
        /(?<!function\s)\bclearReactiveSettledPending\(\)/g,
        `(${pendingSettled} = false)`,
      )
      .replace(
        /(?<!function\s)\bsetReactiveBatchState\(([^(),]*),\s*([^(),]*)\)/g,
        `((${batchDepth} = ($1) < 0 ? 0 : $1), (${pendingSettled} = $2))`,
      );
  }

  return transformed;
}

export const REGISTER_HELPERS = [
  ["setCurrentConsumer", 1],
  ["enterConsumerTracking", 1],
  ["restoreConsumerTracking", 1],
  ["setTrackingEpoch", 1],
  ["advanceTrackingEpoch", 0],
  ["keepNewestTrackingEpoch", 1],
  ["isNewerEpoch", 2],
  ["setPropagationScopeDepth", 1],
  ["enterPropagationScopeRegister", 0],
  ["leavePropagationScopeRegister", 0],
  ["isRuntimeExecutionIdle", 0],
  ["enterReactiveBatchRegister", 0],
  ["leaveReactiveBatchRegister", 0],
  ["markReactiveSettledPending", 0],
  ["clearReactiveSettledPending", 0],
  ["setReactiveBatchState", 2],
  ["hasPendingReactiveSettled", 0],
  ["isReactiveBatchActive", 0],
] as const;
