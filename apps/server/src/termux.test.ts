// @effect-diagnostics nodeBuiltinImport:off - Tests a patch to node:fs itself.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import { afterEach, expect, it } from "@effect/vitest";

import { installLinkFallback } from "./termux.ts";

const denied = () =>
  Object.assign(new Error("EACCES: permission denied, link"), { code: "EACCES" });

let dir: string | undefined;
afterEach(() => {
  if (dir) NodeFS.rmSync(dir, { recursive: true, force: true });
});

it("publishes by exclusive copy when hard links are denied", async () => {
  // The real fs, with hard links denied the way Android denies them in app storage.
  const fs = {
    ...NodeFS,
    link: ((_existingPath, _newPath, callback) => callback(denied())) as typeof NodeFS.link,
    promises: { ...NodeFS.promises, link: () => Promise.reject(denied()) },
  } as typeof NodeFS;
  installLinkFallback(fs);
  const link = NodeUtil.promisify(fs.link);

  dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-termux-link-"));
  const source = NodePath.join(dir, "source");
  const target = NodePath.join(dir, "target");
  NodeFS.writeFileSync(source, "first", { mode: 0o600 });

  await link(source, target);
  expect(NodeFS.readFileSync(target, "utf8")).toBe("first");
  expect(NodeFS.statSync(target).mode & 0o777).toBe(0o600);

  NodeFS.writeFileSync(source, "second");
  await expect(link(source, target)).rejects.toMatchObject({ code: "EEXIST" });
  await expect(fs.promises.link(source, target)).rejects.toMatchObject({ code: "EEXIST" });
  expect(NodeFS.readFileSync(target, "utf8")).toBe("first");
});
