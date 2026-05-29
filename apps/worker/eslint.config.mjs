// Flat config for the worker — a pure Node + TypeScript package (no Next).
// Type-aware linting via typescript-eslint's recommended preset.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // The flat config itself and build output aren't part of the TS project.
  { ignores: ["dist/**", "node_modules/**", "*.config.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
