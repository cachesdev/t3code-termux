// @effect-diagnostics nodeBuiltinImport:off - Patches node:fs before any Effect module loads.
// Runtime differences for the t3code-termux build, which runs the server in Termux on Android.
import * as NodeModule from "node:module";

// oxlint-disable-next-line t3code/no-global-process-runtime -- Read before any Effect runs.
export const isTermux = process.platform === "android";

type NodeFS = typeof import("node:fs");

const isDenied = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "EACCES" || code === "EPERM";
};

/**
 * Android denies hard links in app storage. A denied link copies with COPYFILE_EXCL instead, so an
 * existing target still fails with EEXIST. Call before any module captures `fs.link`.
 */
export function installLinkFallback(fs: NodeFS = process.getBuiltinModule("node:fs")): void {
  const { link, linkSync } = fs;
  const linkPromise = fs.promises.link;
  const { COPYFILE_EXCL } = fs.constants;

  fs.link = ((existingPath, newPath, callback) =>
    link(existingPath, newPath, (error) =>
      isDenied(error)
        ? fs.copyFile(existingPath, newPath, COPYFILE_EXCL, callback)
        : callback(error),
    )) as NodeFS["link"];

  fs.linkSync = (existingPath, newPath) => {
    try {
      linkSync(existingPath, newPath);
    } catch (error) {
      if (!isDenied(error)) throw error;
      fs.copyFileSync(existingPath, newPath, COPYFILE_EXCL);
    }
  };

  fs.promises.link = async (existingPath, newPath) => {
    try {
      await linkPromise(existingPath, newPath);
    } catch (error) {
      if (!isDenied(error)) throw error;
      await fs.promises.copyFile(existingPath, newPath, COPYFILE_EXCL);
    }
  };

  // ESM imports of node:fs keep their own bindings until synced.
  NodeModule.syncBuiltinESMExports();
}
