// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "vendor/**",
      "drizzle/**",
      "scripts/**",
    ],
  },
  expoConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "import/no-unresolved": "off",
    },
  },
]);

