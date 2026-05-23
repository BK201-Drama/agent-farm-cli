import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: ["dist/**", "node_modules/**", "extensions/**", "**/*.js", "**/*.mjs"],
  },
  {
    rules: {
      // ---- TypeScript 补充规则 ----
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-function": "warn",

      // ---- 防御性规则 ----
      // 空 catch 块不允许，必须有注释或日志
      "no-empty": ["warn", { allowEmptyCatch: false }],
      // 禁止 console.log 残留，允许 warn/error 用于日志
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-var": "error",
    },
  },
  // 测试文件放宽一些规则
  {
    files: ["test/**/*.ts", "test/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "no-console": "off",
    },
  },
);
