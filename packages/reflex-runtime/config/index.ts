// The build and test configuration of @volynets/reflex-runtime: one module,
// read by the tool entry points next to it.
//
//   config/vitest.config.ts   vitest/vite: --mode <profile>   (config/vitest.ts)
//   config/rollup.config.ts   rollup: --configTarget <target> (config/rollup.ts)
//   config/rollup/            the published npm build
export {
  PROFILES,
  profileOfMode,
  vitestProfile,
  type ProfileName,
} from "./vitest.ts";
export { rollupTarget, TARGETS } from "./rollup.ts";
