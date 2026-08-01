import terser from "@rollup/plugin-terser";
import type { Plugin } from "rollup";
import { VERIFIED_PURE_FUNCS } from "../optimization.ts";
import { isProd } from "../targets.ts";
import type { BuildTarget } from "../types.ts";

export function createTerserPlugin(target: BuildTarget): Plugin | null {
  if (!isProd(target)) return null;

  const isModule = target.format === "esm";

  return terser({
    ecma: 2022,
    module: isModule,
    compress: {
      defaults: false,

      // Safe, local rewrites.
      booleans: true,
      comparisons: true,
      conditionals: true,
      dead_code: true,
      directives: true,
      drop_debugger: true,
      evaluate: true,
      if_return: true,
      join_vars: true,
      keep_fargs: true,
      keep_fnames: false,
      loops: true,
      module: isModule,
      negate_iife: false,
      passes: 3,
      pure_funcs: [...VERIFIED_PURE_FUNCS],
      reduce_funcs: false,
      reduce_vars: false,
      sequences: true,
      side_effects: true,
      switches: true,
      toplevel: true,
      typeofs: false,
      unused: true,

      // Keep named helpers instead of synthesizing inline IIFEs. The runtime's
      // hot paths are already expressed as direct functions.
      collapse_vars: false,
      drop_console: false,
      hoist_funs: false,
      hoist_props: false,
      hoist_vars: false,
      inline: false,
      keep_infinity: true,
      pure_getters: false,
      unsafe: false,
      unsafe_arrows: false,
      unsafe_comps: false,
      unsafe_Function: false,
      unsafe_math: false,
      unsafe_symbols: false,
      unsafe_methods: false,
      unsafe_proto: false,
      unsafe_regexp: false,
      unsafe_undefined: false,
    },
    mangle: {
      module: isModule,
      toplevel: true,
      keep_classnames: true,
      // Hot release build: private helper function .name is not preserved.
      // Public object/class property names are still preserved: property mangling is off.
      keep_fnames: false,
      safari10: true,

      // Property mangling is off by default. Even regex-limited property mangle
      // can break devtools, protocol objects, symbol-like string contracts, or
      // consumer code using bracket access. Enable it only as a separate measured
      // profile, not as the default runtime build.
      properties: false,
    },
    format: {
      comments: false,
      preserve_annotations: false,
    },
  });
}
