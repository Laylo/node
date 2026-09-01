import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    __SDK_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["src/**/__tests__/**/*.test-d.ts"],
    },
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/__tests__/**", "src/generated/**", "src/types.ts"],
    },
  },
});
