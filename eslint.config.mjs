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
    /**
     * The AI boundary, guarded from the other side.
     *
     * The rule above stops `src/server/` reaching into UI. This stops UI
     * reaching into `src/server/ai/`, which is a different and far more
     * expensive mistake: `ai-config.ts` reads ANTHROPIC_API_KEY, and a client
     * component importing it would bundle that key into browser JavaScript.
     *
     * Every other server module is reachable from a component only through a
     * `"use server"` action, which is a network boundary. `src/server/ai/` has
     * no action and needs none — suggestions are proposed from `after()` and
     * accepted through `suggestion-actions.ts`, so nothing in the browser has
     * any reason to name this directory at all.
     *
     * `server-only` would enforce this at build time instead, and was tried:
     * Next resolves it internally but Vitest does not, so it is a dependency
     * that only looks free. A lint rule costs nothing, runs in `pnpm check`,
     * and sits beside the boundaries it belongs with. See ADR 026.
     */
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/ai", "@/server/ai/*"],
              message:
                "UI must never import the AI boundary — it holds the API key. Go through a server action. See docs/DECISIONS.md ADR 026.",
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
    ".next-mobile-e2e/**",
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
