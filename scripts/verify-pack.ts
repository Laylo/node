import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkReadmeSnippets } from "./check-readme.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = join(rootDir, "examples");
const tscBin = createRequire(import.meta.url).resolve("typescript/bin/tsc");

const fail: (reason: string) => never = (reason) => {
  console.error(`verify:pack failed — ${reason}`);
  process.exit(1);
};

const run = (label: string, command: string, args: string[], cwd: string) => {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const { status, error } = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (error !== undefined) {
    fail(`${label} could not start: ${error.message}`);
  }
  if (status !== 0) {
    fail(`${label} exited with ${String(status)}`);
  }
};

interface PackedTarball {
  filename: string;
}

const pack = (destination: string): string => {
  const args = ["pack", "--json", "--pack-destination", destination];
  console.log(`\n$ npm ${args.join(" ")}`);
  const { status, stdout, stderr } = spawnSync("npm", args, {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (status !== 0) {
    fail(`npm pack exited with ${String(status)}: ${stderr.trim()}`);
  }

  let packed: PackedTarball[];
  try {
    packed = JSON.parse(stdout) as PackedTarball[];
  } catch {
    fail(`npm pack printed something other than JSON: ${stdout.trim()}`);
  }
  const [tarball] = packed;
  if (tarball === undefined) {
    fail("npm pack reported no tarball");
  }
  console.log(`packed ${tarball.filename}`);
  return join(destination, tarball.filename);
};

const stagingDir = mkdtempSync(join(tmpdir(), "laylo-node-pack-"));
try {
  const tarball = pack(stagingDir);

  run(
    "installing the tarball",
    "npm",
    [
      "install",
      "--no-save",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      tarball,
    ],
    examplesDir,
  );

  run("the esm example", "node", ["esm/index.mjs"], examplesDir);
  run(
    "the esm example (--dry-run)",
    "node",
    ["esm/index.mjs", "--dry-run"],
    examplesDir,
  );
  run("the cjs example", "node", ["cjs/index.cjs"], examplesDir);
  run(
    "the cjs example (--dry-run)",
    "node",
    ["cjs/index.cjs", "--dry-run"],
    examplesDir,
  );

  for (const resolution of ["node16", "bundler"]) {
    run(
      `the ${resolution} typecheck`,
      process.execPath,
      [tscBin, "-p", join(examplesDir, "ts", `tsconfig.${resolution}.json`)],
      examplesDir,
    );
  }

  checkReadmeSnippets(rootDir, examplesDir, fail);

  console.log("\nverify:pack passed — the packed tarball runs and typechecks.");
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
