import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Módulos "server-only" (fornecedores) testados direto no Node.
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"] },
});
