import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

function copyStatic() {
  const outMedia = join(__dirname, "dist", "media");
  mkdirSync(outMedia, { recursive: true });

  const katexCss = join(__dirname, "node_modules", "katex", "dist", "katex.min.css");
  const katexFonts = join(__dirname, "node_modules", "katex", "dist", "fonts");
  const hljsCss = join(
    __dirname,
    "node_modules",
    "highlight.js",
    "styles",
    "github.min.css"
  );
  const hljsDarkCss = join(
    __dirname,
    "node_modules",
    "highlight.js",
    "styles",
    "github-dark.min.css"
  );

  cpSync(katexCss, join(outMedia, "katex.min.css"));
  cpSync(katexFonts, join(outMedia, "fonts"), { recursive: true });
  cpSync(hljsCss, join(outMedia, "hljs-github.min.css"));
  cpSync(hljsDarkCss, join(outMedia, "hljs-github-dark.min.css"));

  const webviewCss = join(__dirname, "media", "webview", "styles.css");
  if (existsSync(webviewCss)) {
    cpSync(webviewCss, join(outMedia, "styles.css"));
  }
}

const common = {
  bundle: true,
  sourcemap: true,
  minify: !watch,
  logLevel: "info",
};

const extensionBuild = {
  ...common,
  entryPoints: [join(__dirname, "src", "extension.ts")],
  outfile: join(__dirname, "dist", "extension.js"),
  platform: "node",
  format: "cjs",
  external: ["vscode"],
  target: "node18",
};

const webviewBuild = {
  ...common,
  entryPoints: [join(__dirname, "media", "webview", "index.ts")],
  outfile: join(__dirname, "dist", "media", "webview.js"),
  platform: "browser",
  format: "iife",
  target: "es2020",
  mainFields: ["browser", "module", "main"],
  conditions: ["browser", "import", "module", "default"],
};

async function run() {
  copyStatic();

  if (watch) {
    const extCtx = await esbuild.context(extensionBuild);
    const webCtx = await esbuild.context(webviewBuild);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log("[watch] building...");
  } else {
    await Promise.all([
      esbuild.build(extensionBuild),
      esbuild.build(webviewBuild),
    ]);
    copyStatic();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
