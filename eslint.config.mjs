import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // NFR-03: no raw SQL built from strings. The build runs `eslint .` first, so it fails on these.
      "no-restricted-properties": [
        "error",
        { property: "$queryRawUnsafe", message: "NFR-03: use Prisma's query API with bound parameters." },
        { property: "$executeRawUnsafe", message: "NFR-03: use Prisma's query API with bound parameters." },
      ],
      // NFR-04: user text is rendered only through React's escaping.
      "react/no-danger": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "evidence/**"]),
]);

export default eslintConfig;
