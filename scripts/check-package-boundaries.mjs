#!/usr/bin/env node
// Enforces the runtime integration contract (docs/architecture/runtime-integration.md):
// sibling packages reach the kernel only through named semantic operations,
// never through registers, state flags, edge fields or private constructors.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(
  process.argv[2] ?? path.join(import.meta.dirname, ".."),
);
const RUNTIME_INTERNAL = /^@volynets\/reflex-runtime\/internal$/;
const OWNER = "reflex-runtime";
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage"]);

/** The permitted cross-package surface of `@volynets/reflex-runtime/internal`. */
const INTEGRATION_SURFACE = new Set([
  // Node construction and protocol
  "createProducer",
  "createConsumer",
  "createWatcher",
  "readProducer",
  "writeProducer",
  "readConsumerLazy",
  "readConsumerEager",
  "runWatcher",
  "disposeWatcher",
  "disposeNode",
  "disposeNodeEvent",
  "untracked",
  // Execution observation
  "isTracking",
  "activeTracking",
  "isContextSettled",
  "hasPendingValidation",
  // Graph lifetime
  "hasObservers",
  "disposeNodeIfUnobserved",
  "suspendConsumerIfUnobserved",
  // Watcher scheduling and recovery
  "claimWatcherSchedule",
  "releaseWatcherSchedule",
  "runWatcherWithoutSettledCheckpoint",
  "takeScheduledWatcher",
  "shouldRetryWatcherAfterFailure",
  "invalidateWatcher",
  // Batching, host flush and contexts
  "enterReactiveBatch",
  "leaveReactiveBatch",
  "flushPendingRuntimeIdle",
  "settleRuntimeIdle",
  "requestHostFlush",
  "cancelHostFlushRequest",
  "getActiveRuntimeContext",
  "switchRuntimeContext",
  "runWithRuntimeContext",
  // Execution domains
  "createExecutionDomain",
  "getExecutionDomain",
  "ExecutionDomainState",
  // Types
  "ConsumerNode",
  "ProducerNode",
  "ReactiveNode",
  "WatcherNode",
  "WatcherFn",
  "RuntimeContext",
  "RuntimeHostHooks",
  "ExecutionDomain",
  "ExecutionDomainOptions",
]);

/** Kernel representation: edge fields and RuntimeContext register fields. */
const FORBIDDEN_FIELDS = new Set([
  "firstIn",
  "lastIn",
  "firstOut",
  "lastOut",
  "nextIn",
  "prevIn",
  "nextOut",
  "prevOut",
  "currentConsumer",
  "trackingStamp",
  "propagationScopeDepth",
  "runtimeState",
]);

const TRACKING_TOKEN = "activeTracking";

function isNullComparison(node) {
  const parent = node.parent;
  if (!ts.isBinaryExpression(parent)) return false;
  const op = parent.operatorToken.kind;
  if (
    op !== ts.SyntaxKind.EqualsEqualsEqualsToken &&
    op !== ts.SyntaxKind.ExclamationEqualsEqualsToken
  )
    return false;
  const other = parent.left === node ? parent.right : parent.left;
  return other.kind === ts.SyntaxKind.NullKeyword;
}

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(full);
    } else if (
      /\.(c|m)?tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      yield full;
    }
  }
}

const violations = [];
const report = (file, node, sf, message) => {
  const { line, character } = sf.getLineAndCharacterOfPosition(
    node.getStart(sf),
  );
  violations.push(
    `${path.relative(root, file)}:${line + 1}:${character + 1} ${message}`,
  );
};

function checkFile(file) {
  const sf = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      RUNTIME_INTERNAL.test(node.moduleSpecifier.text)
    ) {
      const bindings = ts.isImportDeclaration(node)
        ? node.importClause?.namedBindings
        : node.exportClause;
      if (
        !bindings ||
        (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings))
      ) {
        report(
          file,
          node,
          sf,
          "wildcard import/re-export of runtime internals",
        );
      } else {
        for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text;
          if (!INTEGRATION_SURFACE.has(name))
            report(
              file,
              element,
              sf,
              `\`${name}\` is not in the runtime integration surface`,
            );
        }
      }
    }

    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /ReactiveNode$/.test(node.expression.text)
    ) {
      report(file, node, sf, "nodes are created through runtime factories");
    }

    // The tracking token is opaque: it may only be compared with null.
    if (
      ts.isIdentifier(node) &&
      node.text === TRACKING_TOKEN &&
      !ts.isImportSpecifier(node.parent) &&
      !isNullComparison(node)
    ) {
      report(file, node, sf, "`activeTracking` may only be compared with null");
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      FORBIDDEN_FIELDS.has(node.name.text)
    ) {
      report(file, node.name, sf, `reads kernel field \`${node.name.text}\``);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const packagesDir = path.join(root, "packages");
for (const pkg of fs.readdirSync(packagesDir)) {
  if (pkg === OWNER) continue;
  const src = path.join(packagesDir, pkg, "src");
  if (!fs.existsSync(src)) continue;
  for (const file of sourceFiles(src)) checkFile(file);
}

if (violations.length > 0) {
  console.error(
    `Package boundary violations (${violations.length}):\n  ` +
      violations.join("\n  "),
  );
  process.exit(1);
}
console.log(
  "Package boundaries hold: no sibling package reads kernel representation.",
);
