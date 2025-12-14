import noInternalImports from "./rules/no-internal-imports";
import layerBoundaries from "./rules/layer-boundaries";

export const rules = {
  "no-internal-imports": noInternalImports,
  "layer-boundaries": layerBoundaries,
};

export const configs = {
  recommended: {
    plugins: ["@reflex"],
    rules: {
      "@reflex/no-internal-imports": "error",
      "@reflex/layer-boundaries": "error",
    },
  },
};
