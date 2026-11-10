// @ts-check
// Flat ESLint config for the Node workspaces (backend, packages/shared).
// Type checking stays in `npm run typecheck` (tsc --noEmit); this is lint only.
//
// The mobile app keeps `tsc --noEmit` as its lint for now; extending this
// config to React Native is a separate change.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const TS_FILES = ["**/*.ts"];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "mobile/**",
      "frontend/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: TS_FILES })),
  {
    files: ["backend/**/*.{ts,js,cjs}", "packages/shared/**/*.ts"],
    rules: {
      // README: "Every consumer tests `== null`, never truthiness."
      // `== null` (null or undefined) is the sanctioned absence check; every
      // other comparison must be strict.
      eqeqeq: ["error", "always", { null: "ignore" }]
    }
  },
  {
    files: TS_FILES,
    rules: {
      // Provider payloads are still typed loosely; tightening them is separate
      // work and is not a rule the README states.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ]
    }
  },
  {
    // Type-aware rules for the production sources (tests are not in the
    // workspaces' tsconfig projects, so they get the syntactic rules above).
    files: ["backend/src/**/*.ts", "packages/shared/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      // README: "0 hPa, 0 %, 0 km, 0 °C dew point and UV 0 are all real
      // measurements ... A truthiness guard hides every one of them."
      // Numbers (nullable or not), nullable booleans and `any` (raw provider
      // JSON) may not be used as conditions; test `== null` or compare
      // explicitly. Strings and objects keep ordinary truthiness, since an
      // empty string or a missing object is not a measurement.
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: true,
          allowNullableString: true,
          allowNullableObject: true,
          allowNumber: false,
          allowNullableNumber: false,
          allowNullableBoolean: false,
          allowNullableEnum: false,
          allowAny: false
        }
      ]
    }
  },
  {
    // Plain CommonJS operational scripts (migrations, seed).
    files: ["backend/scripts/**/*.{js,cjs}"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly"
      }
    }
  },
  {
    files: ["backend/tests/**/*.ts", "**/*.test.ts", "**/vitest.config.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
);
