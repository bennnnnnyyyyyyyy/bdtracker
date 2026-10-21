import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    // Google Apps Script (not part of the Next.js app) and one-off CommonJS helper scripts.
    "apps-script/**",
    "scripts/**/*.js",
    "scripts/test_sheets.ts",
  ]),
]);

export default eslintConfig;
