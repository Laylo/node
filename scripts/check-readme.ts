import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const tscBin = createRequire(import.meta.url).resolve("typescript/bin/tsc");

const TS_FENCE = "```ts";
const CLOSING_FENCE = "```";

interface Snippet {
  /** 1-based position among the README's `ts` blocks. */
  index: number;
  /** 1-based line in README.md where the fence opens. */
  line: number;
  code: string;
}

const extractTsBlocks = (
  markdown: string,
  fail: (reason: string) => never,
): Snippet[] => {
  const lines = markdown.split("\n");
  const snippets: Snippet[] = [];
  let open: { line: number; code: string[] } | undefined;

  lines.forEach((line, lineIndex) => {
    if (open === undefined) {
      if (line.trim() === TS_FENCE) {
        open = { line: lineIndex + 1, code: [] };
      }
      return;
    }
    if (line.trim() === CLOSING_FENCE) {
      snippets.push({
        index: snippets.length + 1,
        line: open.line,
        code: open.code.join("\n"),
      });
      open = undefined;
      return;
    }
    open.code.push(line);
  });

  if (open !== undefined) {
    fail(
      `README.md has an unterminated \`ts\` code block starting at line ${String(open.line)}`,
    );
  }

  return snippets;
};

const nodeConfig = {
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022"],
    module: "Node16",
    moduleResolution: "node16",
    strict: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["node"],
  },
  include: ["snippet-*.ts"],
};

const bundlerConfig = {
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022"],
    module: "ESNext",
    moduleResolution: "bundler",
    strict: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    skipLibCheck: false,
    noEmit: true,
    types: ["node"],
  },
  include: ["snippet-*.ts"],
};

/**
 * Extracts every fenced `ts` code block from README.md, writes each as a
 * standalone program under `examples/readme/`, and typechecks them against
 * the packed tarball under both node16 and bundler module resolution — the
 * same two resolutions `examples/ts/consumer.ts` is checked under.
 * @param rootDir Repository root, containing README.md.
 * @param examplesDir The `examples/` directory the tarball was installed
 * into; snippets are typechecked from here so they resolve `@laylo.com/node`
 * from `examples/node_modules`.
 * @param fail Reports a failure and exits the process; matches `verify-pack.ts`'s helper.
 */
export const checkReadmeSnippets = (
  rootDir: string,
  examplesDir: string,
  fail: (reason: string) => never,
): void => {
  const readmePath = join(rootDir, "README.md");
  const snippetsDir = join(examplesDir, "readme");

  const markdown = readFileSync(readmePath, "utf8");
  const snippets = extractTsBlocks(markdown, fail);
  if (snippets.length === 0) {
    fail("README.md has no ```ts code blocks to typecheck");
  }

  rmSync(snippetsDir, { recursive: true, force: true });
  mkdirSync(snippetsDir, { recursive: true });

  // Node16 module resolution treats a directory as CommonJS unless its
  // package.json says otherwise; without this, top-level await (allowed in
  // README snippets) fails to compile.
  writeFileSync(
    join(snippetsDir, "package.json"),
    `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  );

  for (const snippet of snippets) {
    writeFileSync(
      join(snippetsDir, `snippet-${String(snippet.index)}.ts`),
      `${snippet.code}\n`,
    );
  }

  const configs: Record<string, unknown> = {
    node16: nodeConfig,
    bundler: bundlerConfig,
  };
  for (const [resolution, config] of Object.entries(configs)) {
    writeFileSync(
      join(snippetsDir, `tsconfig.${resolution}.json`),
      `${JSON.stringify(config, null, 2)}\n`,
    );
  }

  for (const resolution of Object.keys(configs)) {
    const configPath = join(snippetsDir, `tsconfig.${resolution}.json`);
    console.log(`\n$ tsc -p ${configPath} (README snippets, ${resolution})`);
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [tscBin, "-p", configPath],
      { cwd: examplesDir, encoding: "utf8" },
    );
    const output = `${stdout}${stderr}`;
    if (output.trim().length > 0) {
      console.log(output.trim());
    }

    if (status !== 0) {
      const failed = /snippet-(\d+)\.ts/.exec(output);
      if (failed?.[1] !== undefined) {
        const index = Number(failed[1]);
        const snippet = snippets.find((candidate) => candidate.index === index);
        fail(
          `README.md \`ts\` block #${String(index)}${
            snippet === undefined ? "" : ` (line ${String(snippet.line)})`
          } failed to typecheck under ${resolution} resolution`,
        );
      }
      fail(
        `a README \`ts\` block failed to typecheck under ${resolution} resolution`,
      );
    }
  }

  console.log(
    `\nREADME snippets passed — ${String(snippets.length)} \`ts\` block(s) typecheck under node16 and bundler resolution.`,
  );
};
