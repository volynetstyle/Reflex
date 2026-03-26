import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "**/build/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/.pnpm-store/**",
      "**/drafts/**",
      "**/bench/**",
      "**/*.bench.ts",
      "**/*.d.ts",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        global: "readonly",
        globalThis: "readonly",
        module: "readonly",
        process: "readonly",
        queueMicrotask: "readonly",
        require: "readonly",
        setTimeout: "readonly",
      },
    },
  },
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: ["**/*.{ts,tsx,mts,cts}"],
  })),
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ],
    },
  },
  {
    files: [
      "**/*.test.{ts,tsx,js,mjs,cjs}",
      "**/tests/**/*.{ts,tsx,js,mjs,cjs}",
      "**/*.config.{ts,js,mjs,cjs}",
      "**/rollup.config.ts",
      "**/vite.config.ts"
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
    },
  },
];
