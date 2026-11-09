import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The intentionally vulnerable version uses raw SQL and dangerouslySetInnerHTML on purpose.
      "no-restricted-properties": "off",
      "react/no-danger": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "evidence/**"]),
]);

export default eslintConfig;
