import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const source = (name: string, subpath = "index.ts") => resolve(workspaceRoot, "packages", name, "src", subpath);
const runtime = source("reflex-runtime", "");
type Alias = { find: string | RegExp; replacement: string };
export type SourceAliasProfile = "runtime" | "scheduler" | "reflex" | "framework" | "dom" | "store" | "async" | "application";

/** Ordered entries preserve the existing subpath precedence and local exceptions. */
export function sourceAliases(profile: SourceAliasProfile): Alias[] {
  const internal = { find: "@volynets/reflex-runtime/internal", replacement: source("reflex-runtime", "internal/index.ts") };
  const publicRuntime = { find: "@volynets/reflex-runtime", replacement: source("reflex-runtime") };
  const shorthand = { find: "@runtime", replacement: runtime };
  const scheduler = { find: "@volynets/reflex-scheduler", replacement: source("reflex-scheduler") };
  switch (profile) {
    case "runtime": return [shorthand];
    case "scheduler": return [shorthand, internal, publicRuntime];
    case "framework": return [shorthand, internal, publicRuntime];
    case "reflex": return [shorthand, internal, scheduler,
      { find: "@volynets/reflex-runtime/debug", replacement: resolve(workspaceRoot, "packages/reflex-runtime/debug/index.ts") },
      // The facade source harness intentionally uses the internal entrypoint.
      { ...publicRuntime, replacement: source("reflex-runtime", "internal/index.ts") },
    ];
    case "async": return [shorthand, internal, scheduler,
      { find: "@volynets/reflex/unstable", replacement: source("reflex", "unstable/index.ts") },
      { find: "@volynets/reflex", replacement: source("reflex") },
    ];
    case "dom": return [shorthand, internal, publicRuntime,
      { find: "@volynets/reflex-framework/jsx-dev-runtime", replacement: source("reflex-framework", "jsx-dev-runtime.ts") },
      { find: "@volynets/reflex-framework/jsx-runtime", replacement: source("reflex-framework", "jsx-runtime.ts") },
      { find: "@volynets/reflex-framework", replacement: source("reflex-framework") },
    ];
    case "application": {
      const aliases = sourceAliases("dom");
      aliases.splice(2, 0, { find: "@volynets/reflex-runtime/debug", replacement: source("reflex-runtime", "debug.ts") });
      return [...aliases, scheduler,
        { find: "@volynets/reflex/unstable", replacement: source("reflex", "unstable/index.ts") },
        { find: "@volynets/reflex/debug", replacement: source("reflex", "debug/index.ts") },
        { find: "@volynets/reflex", replacement: source("reflex") },
      ];
    }
    case "store": return [
      { find: /^@volynets\/reflex-framework$/, replacement: source("reflex-framework") },
      { find: /^@volynets\/reflex$/, replacement: source("reflex") },
      { find: /^@volynets\/reflex-store\/runtime\/internal$/, replacement: source("reflex-store", "runtime/internal.ts") },
      { find: /^@volynets\/reflex-store\/runtime$/, replacement: source("reflex-store", "runtime.ts") },
      { find: /^@volynets\/reflex-store$/, replacement: source("reflex-store") },
      shorthand,
      { find: "@volynets/reflex-runtime/debug", replacement: source("reflex-runtime", "debug.ts") },
      internal, publicRuntime, scheduler,
    ];
  }
}

export function configRoot(configUrl: string): string {
  return fileURLToPath(new URL(".", configUrl));
}
