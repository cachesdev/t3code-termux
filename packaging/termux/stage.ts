// @effect-diagnostics nodeBuiltinImport:off - Packaging script; runs before any Effect runtime exists.
// Stages the t3code-termux npm package from a built server and web app.
//
//   node packaging/termux/stage.ts <output-dir>
//
// Build first: `vp run --filter @t3tools/web build` and `node --run build:bundle` in apps/server.
// finalize.sh then installs the native dependencies inside Termux and packs the result.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

import { selectCliRuntimeExternalDependencies } from "../../scripts/lib/cli-external-packages.ts";

const REPO_ROOT = NodePath.resolve(import.meta.dirname, "../..");
const SERVER_DIR = NodePath.join(REPO_ROOT, "apps/server");
const WEB_DIST = NodePath.join(REPO_ROOT, "apps/web/dist");

const outDir = process.argv[2];
if (!outDir) {
  console.error("Usage: node packaging/termux/stage.ts <output-dir>");
  process.exit(1);
}

NodeFS.rmSync(outDir, { recursive: true, force: true });
NodeFS.mkdirSync(outDir, { recursive: true });

// The server serves the web app from dist/client.
const withoutSourceMaps = (file: string) => !file.endsWith(".map");
NodeFS.cpSync(NodePath.join(SERVER_DIR, "dist"), NodePath.join(outDir, "dist"), {
  recursive: true,
  filter: withoutSourceMaps,
});
NodeFS.cpSync(WEB_DIST, NodePath.join(outDir, "dist/client"), {
  recursive: true,
  filter: withoutSourceMaps,
});

const dependencies = runtimeDependencies();
writeJson(NodePath.join(outDir, "package.json"), {
  ...readJson(NodePath.join(import.meta.dirname, "package.json")),
  dependencies,
  // npm compiles node-pty during finalize.sh, since nobody publishes an Android build of it.
  allowScripts: { "node-pty": true },
});
copyPatches(dependencies, NodePath.join(outDir, "patches"));
NodeFS.copyFileSync(
  NodePath.join(import.meta.dirname, "README.md"),
  NodePath.join(outDir, "README.md"),
);
NodeFS.copyFileSync(NodePath.join(REPO_ROOT, "LICENSE"), NodePath.join(outDir, "LICENSE"));

console.log(`Staged ${NodePath.relative(process.cwd(), outDir) || outDir}`);

/** Packages the server bundle loads from node_modules, at the exact versions the build used. */
function runtimeDependencies(): Record<string, string> {
  const { dependencies } = readJson(NodePath.join(SERVER_DIR, "package.json"));
  const names = Object.keys(selectCliRuntimeExternalDependencies(dependencies)).sort();
  return Object.fromEntries(
    names.map((name) => {
      const manifest = NodePath.join(SERVER_DIR, "node_modules", name, "package.json");
      return [name, readJson(manifest).version];
    }),
  );
}

/** Copies the workspace patches for staged packages, named <package>.patch with "/" as "__". */
function copyPatches(dependencies: Record<string, string>, patchDir: string) {
  const yaml = NodeModule.createRequire(NodePath.join(SERVER_DIR, "package.json"))("yaml");
  const workspace = yaml.parse(
    NodeFS.readFileSync(NodePath.join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8"),
  );

  NodeFS.mkdirSync(patchDir, { recursive: true });
  for (const [key, file] of Object.entries<string>(workspace.patchedDependencies ?? {})) {
    const at = key.lastIndexOf("@");
    const name = key.slice(0, at);
    if (dependencies[name] !== key.slice(at + 1)) continue;

    const target = NodePath.join(patchDir, `${name.replace("/", "__")}.patch`);
    NodeFS.copyFileSync(NodePath.join(REPO_ROOT, file), target);
  }
}

function readJson(file: string) {
  return JSON.parse(NodeFS.readFileSync(file, "utf8"));
}

function writeJson(file: string, value: unknown) {
  NodeFS.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}
