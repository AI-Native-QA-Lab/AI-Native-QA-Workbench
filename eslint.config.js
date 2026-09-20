import eslint from "@eslint/js";
import typescript from "typescript-eslint";

export default typescript.config(
  {
    ignores: [".superpowers/**", ".turbo/**", "coverage/**", "dist/**", "node_modules/**", ".ai-qa/**"],
  },
  eslint.configs.recommended,
  ...typescript.configs.recommended,
);
