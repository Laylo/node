import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  tsconfig: "tsconfig.build.json",
  define: {
    __SDK_VERSION__: JSON.stringify(version),
  },
  // require("@laylo/node") hands back the class itself; named exports ride
  // along as its properties.
  footer: ({ format }) =>
    format === "cjs"
      ? {
          js: "module.exports = Object.assign(module.exports.default, module.exports);",
        }
      : {},
});
