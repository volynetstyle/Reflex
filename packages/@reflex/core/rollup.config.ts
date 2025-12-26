import replace from "@rollup/plugin-replace";
import terser from "@rollup/plugin-terser";

interface BuildConfig {
  outDir: string;
  dev: boolean;
  format: string;
}

function build({ outDir, dev, format }: BuildConfig) {
  return {
    input: "build/esm/index.js",
    output: {
      dir: `dist/${outDir}`,
      format,
      preserveModules: true,
      preserveModulesRoot: "build/esm",
      exports: "named",
    },
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          __DEV__: JSON.stringify(dev),
        },
      }),
      !dev &&
        terser({
          compress: {
            dead_code: true,
            conditionals: true,
          },
          mangle: {
            keep_classnames: true,
            keep_fnames: true,
            properties: { regex: /^_/ },
          },
        }),
    ],
  };
}

export default [
  build({ outDir: "esm", dev: false, format: "esm" }),
  build({ outDir: "dev", dev: true, format: "esm" }),
  build({ outDir: "cjs", dev: false, format: "cjs" }),
];
