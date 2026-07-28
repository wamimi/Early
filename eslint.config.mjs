import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".agents/**",
      ".codex/**",
      ".next/**",
      "archive/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "contracts/**",
      "contracts/**/artifacts/**",
      "contracts/**/cache/**",
      "contracts/**/typechain-types/**"
    ]
  }
];

export default eslintConfig;
