import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/**
 * TylerOS lint rules.
 *
 * Beyond the Next.js defaults, this config enforces the architectural layering
 * described in docs/ARCHITECTURE.md. The dependency direction is one-way:
 *
 *   app/ -> server/ -> domain/
 *
 * Those boundaries are what keep the domain testable without a database or a
 * browser, and what will keep future AI code out of the core domain model.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
    },
  },

  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react-dom",
                "server-only",
                "drizzle-orm",
                "drizzle-orm/*",
                "postgres",
                "@/server/*",
                "@/app/*",
                "@/components/*",
                "@/lib/*",
              ],
              message:
                "The domain layer must stay pure: no framework, no database, no UI. See docs/ARCHITECTURE.md.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/*", "@/app/*"],
              message: "The server layer must not depend on UI. See docs/ARCHITECTURE.md.",
            },
          ],
        },
      ],
    },
  },

  {
    // CLI tooling and browser tests: printing to the terminal is the point, and
    // the layering restrictions above do not apply outside src/.
    files: ["scripts/**/*.mts", "e2e/**/*.ts", "playwright.config.ts", "vitest.config.mts"],
    rules: { "no-console": "off" },
  },

  prettier,

  // Generated output, none of it authored here. The Playwright directories
  // matter more than they look: a trace bundle contains multi-megabyte vendor
  // bundles, and linting one crashes the stylish formatter outright
  // ("RangeError: Invalid string length"). That turned `pnpm check` — the
  // gate — into a command that failed for anybody who had run `pnpm test:e2e`
  // first, with an error naming neither the cause nor the fix.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "drizzle/**",
    "playwright-report/**",
    "test-results/**",
    ".playwright/**",
  ]),
]);

export default eslintConfig;
