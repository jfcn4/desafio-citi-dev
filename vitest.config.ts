import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Os mesmos atalhos de import do tsconfig.json (@controllers, @repositories, @database)
    alias: {
      "@controllers": path.resolve("src/controllers"),
      "@repositories": path.resolve("src/repositories"),
      "@database": path.resolve("src/database"),
    },
  },
  test: {
    globalSetup: "./tests/setup-global.ts",
    // Os testes compartilham o mesmo banco, então rodam um arquivo de cada vez
    fileParallelism: false,
  },
});
