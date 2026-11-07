# t3code-termux

This fork publishes the T3 Code server to npm as `t3code-termux`, built for Termux on arm64 Android. The `termux` branch is upstream T3 Code plus the changes listed below. Keep it close to upstream: every extra change is a future merge conflict.

## Fork changes

Upstream files the fork edits. These are where merge conflicts land:

- `apps/server/src/bin.ts`: calls `installLinkFallback()` on Termux at the top of the entrypoint block, before any dynamic import. It must stay ahead of every module that captures `fs.link`.
- `apps/server/src/binCli.ts`: `makeCli` takes a `termux` flag, and four entries in the subcommand list read `termux ? termuxCommands.<name> : <name>Command`. Keep that shape whatever upstream does to the list.
- `AGENTS.md`: one line under the title that points here.

Fork-only files. These never conflict, but they depend on upstream internals:

- `apps/server/src/termux.ts`: `isTermux`, and `installLinkFallback`, which patches `node:fs` so a hard link denied with EACCES or EPERM becomes a copy with `COPYFILE_EXCL`. Android's SELinux policy denies hard links in app storage, and the server publishes secrets, the environment ID, attachments and database snapshots with `link`. The patch sits below Effect because several layers provide their own `FileSystem` (`NodeHttpServer.layer` exports `NodeServices`), so wrapping one `FileSystem` layer misses the others.
- `apps/server/src/cli/termux.ts`: Android versions of `update` (runs `npm install --global t3code-termux@<version>`), `up`, `service` and `uninstall` (these print what to do in Termux). The upstream versions manage downloaded runtimes and system services that Android lacks.
- `packaging/termux/package.json`: the npm manifest template. Its `version` is the release version, `<upstream version>-termux.<n>`.
- `packaging/termux/stage.ts`: copies the server and web builds and pins the runtime packages. It imports `selectCliRuntimeExternalDependencies` from `scripts/lib/cli-external-packages.ts` and reads `patchedDependencies` from `pnpm-workspace.yaml`.
- `packaging/termux/finalize.sh`, `smoke.sh`, `package.sh`: build and test the tarball inside the `termux/termux-docker` image. They are explained in Packaging.
- `packaging/termux/README.md`: the npm package README.
- `.github/workflows/termux.yml`: builds on x64 with `.github/actions/setup-ci-deps`, stamps the upstream version with `scripts/update-release-package-versions.ts`, and runs `package.sh` on `ubuntu-24.04-arm`. A `termux-v<version>` tag also publishes to npm using the `NPM_TOKEN` secret.

## Merging an upstream release

Merge stable release tags (`vX.Y.Z`), never nightlies or previews. Use a merge, since `termux` is published and must not be rebased.

1. `git fetch upstream tag vX.Y.Z --no-tags`, then `git merge vX.Y.Z` on `termux`. Resolve conflicts so every change in Fork changes survives.
2. Check that upstream did not move what the fork depends on. Done when each of these holds:
   - `update`, `up`, `service` and `uninstall` still exist in `binCli.ts`, and each still has a Termux replacement.
   - `selectCliRuntimeExternalDependencies` and `scripts/update-release-package-versions.ts` still exist with the same signatures.
   - `setup-ci-deps` still takes the inputs `termux.yml` passes.
   - Any new runtime external package in `scripts/lib/cli-external-packages.ts` has an android-arm64 build, or the server still starts without it.
   - Any package `finalize.sh` handles by name (`node-pty`, `@yuuang/ffi-rs-android-arm64`) is still the one npm installs.
3. Set `version` in `packaging/termux/package.json` to `X.Y.Z-termux.1`.
4. Typecheck the server, then push and run the Termux package workflow by hand (`gh workflow run termux.yml --ref termux`). Done when all of its jobs pass, which includes the smoke test on arm64.
5. Disable any upstream workflow the merge added: `gh workflow list --all` should show only `termux.yml` as active. GitHub turns on new workflow files that reach the default branch.

## Releasing

Releases come from `termux` only. Bump `-termux.<n>` for a fork-only fix on the same upstream version. Push the tag `termux-v<version>`, where `<version>` matches `packaging/termux/package.json`. The workflow refuses a tag that does not match. Upstream's release workflow fires on `v*.*.*`, which is why fork tags start with `termux-`.

## Packaging

Users install with `npm install --global t3code-termux` or `npx`, and npm 12 skips dependency install scripts in both cases. So the tarball bundles its whole `node_modules` (`bundleDependencies`) with every native binary ready to load. Anything that only works after an install script is broken for users.

`finalize.sh` runs inside Termux on arm64, because node-pty has no Android build and must be compiled against Termux's Node and Android's libc. The non-obvious parts:

- npm skips install scripts for packages listed in `bundleDependencies`, so `stage.ts` leaves that list out and `finalize.sh` adds it after `npm install` has compiled node-pty.
- npm packs a bundled package using that package's own `files` list. node-pty's list has `prebuilds/` but not `build/`, so `pty.node` moves to `prebuilds/android-arm64/`. The node-pty loader checks that path too.
- The prebuilt `@yuuang/ffi-rs-android-arm64` addon imports `__clear_cache`, which Android's libc does not export, and fff loads ffi-rs at server startup. `finalize.sh` builds `libclear_cache.so` from clang's runtime, links the addon to it with `patchelf`, and adds the library to that package's `files` list. Check whether a newer ffi-rs still needs this before you remove it.
- `os` and `cpu` in the manifest restrict installs to android/arm64. To test on an x86_64 machine with `package.sh <stage> <out> termux/termux-docker:x86_64`, add `x64` to `cpu` in the staged copy. Expect the fff check to fail there, since fff and ffi-rs ship no android-x64 build.
- `package.sh` runs the container with `android-seccomp.json`, which denies `link` and `linkat` with EACCES as Android does. Docker does not enforce Android's SELinux policy, so other Android-only denials still show up only on a real phone. Add them to that profile when you find them.
- Builds have no T3 Connect or account sign-in, because those need public config that upstream bakes in at release time.
