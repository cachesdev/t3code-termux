# t3code-termux

This fork publishes the T3 Code server to npm as `t3code-termux`, built for Termux on arm64 Android. The `termux` branch is upstream T3 Code plus the changes listed below. Keep it close to upstream: every extra change is a future merge conflict.

## Fork changes

Upstream files the fork edits. These are where merge conflicts land:

- `apps/server/src/bin.ts`: calls `installLinkFallback()` on Termux at the top of the entrypoint block, before the service launcher or `binMain.ts` loads. It must stay ahead of every module that captures `fs.link`.
- `apps/server/src/binCli.ts`: `makeCli` takes a `termux` flag, and five entries in the subcommand list read `termux ? termuxCommands.<name> : <name>Command` (`up`, `service`, `update`, `install`, `uninstall`). Another entry adds `termuxCommands.agents` on Termux only. Keep that shape whatever upstream does to the list.
- `packages/provider-core/src/server/maintenanceResolver.ts`: on Android, `resolvePackageManagedProviderMaintenance` returns early for any driver in `termuxHarnesses.ts`, so **Update now** runs the recipe's update command. A recipe with a Termux package reads the latest version from `apt-cache policy`.
- `apps/server/src/provider/ProviderRegistry.ts`: `classifyCompatibility` also runs `applyTermuxInstallHint`, which adds the `t3 agents install` command to a missing agent's status message. The mobile app shows that message.
- `packages/contracts/src/environment.ts` and `apps/server/src/environment/ServerEnvironment.ts`: the environment platform gets an optional `termux` key. The OS stays `unknown`, because store builds of the mobile app reject OS values they do not know.
- `packages/shared/package.json`: exports `./termuxHarnesses`.
- `apps/web/src/onboarding/providerReadiness.logic.ts`: `resolveOnboardingProviderInstallCommand` takes the whole platform and returns the Termux recipe when `termux` is set.
- `apps/web/src/components/onboarding/WelcomePage.tsx`: the install command call passes the whole platform. On Termux, Codex skips the managed setup card and installs in the terminal, since the managed Codex runtime has no Android build. `AgentInstallTerminal` and `AgentTerminalSession` are exported, and the session's `driver` is a plain string, so Settings can reuse the terminal.
- `apps/web/src/components/settings/ProviderSettingsPanel.tsx`: on Termux, a missing agent with a recipe shows `TermuxInstallSection` in the card's `setup` slot.
- `AGENTS.md`: one line under the title that points here.

Fork-only files. These never conflict, but they depend on upstream internals:

- `apps/server/src/termux.ts`: `isTermux`, and `installLinkFallback`, which patches `node:fs` so a hard link denied with EACCES or EPERM becomes a copy with `COPYFILE_EXCL`. Android's SELinux policy denies hard links in app storage, and the server publishes secrets, the environment ID, attachments and database snapshots with `link`. The patch sits below Effect because several layers provide their own `FileSystem` (`NodeHttpServer.layer` exports `NodeServices`), so wrapping one `FileSystem` layer misses the others.
- `apps/server/src/cli/termux.ts`: Android versions of `update` (runs `npm install --global t3code-termux@<version>`), `up`, `service` and `uninstall` (these print what to do in Termux). The upstream versions manage downloaded runtimes and system services that Android lacks. It also adds `agents install <name>` and `agents list`.
- `packages/shared/src/termuxHarnesses.ts`: the install and update command for each agent on Termux. The CLI, the web install buttons and the update resolver all read it. Claude installs through [claude-code-android](https://github.com/ferrumclaudepilgrim/claude-code-android), pinned to the commit of a release tag; bump the pin to take a newer release.
- `apps/server/src/provider/termuxInstallHint.ts`, `apps/web/src/components/settings/TermuxInstallSection.tsx`: the install hint and the Settings install row.
- `packaging/termux/package.json`: the npm manifest template. Its `version` is the release version, `<upstream version>-termux.<n>`.
- `packaging/termux/stage.ts`: copies the server and web builds and pins the runtime packages. It imports `selectCliRuntimeExternalDependencies` from `scripts/lib/cli-external-packages.ts` and reads `patchedDependencies` from `pnpm-workspace.yaml`.
- `packaging/termux/finalize.sh`, `smoke.sh`, `package.sh`: build and test the tarball inside the `termux/termux-docker` image. They are explained in Packaging.
- `packaging/termux/README.md`: the npm package README.
- `.github/workflows/termux.yml`: builds on x64 with `.github/actions/setup-ci-deps`, stamps the upstream version with `scripts/update-release-package-versions.ts`, and runs `package.sh` on `ubuntu-24.04-arm`. A `termux-v<version>` tag also publishes to npm using the `NPM_TOKEN` secret.

## Merging an upstream release

Merge stable release tags (`vX.Y.Z`), never nightlies or previews. Use a merge, since `termux` is published and must not be rebased.

1. `git fetch upstream tag vX.Y.Z --no-tags`, then `git merge vX.Y.Z` on `termux`. Resolve conflicts so every change in Fork changes survives. A blobless clone of the fork cannot download upstream files from `origin`, so mark upstream as a promisor first: `git config remote.upstream.promisor true` and `git config remote.upstream.partialclonefilter blob:none`.
2. Check that upstream did not move what the fork depends on. Done when each of these holds:
   - Every lifecycle command in `binCli.ts` (`update`, `up`, `service`, `install`, `uninstall`, and any new one) has a Termux replacement.
   - `selectCliRuntimeExternalDependencies` and `scripts/update-release-package-versions.ts` still exist with the same signatures.
   - `setup-ci-deps` still takes the inputs `termux.yml` passes.
   - Any new runtime external package in `scripts/lib/cli-external-packages.ts` has an android-arm64 build, or the server still starts without it.
   - Any package `finalize.sh` handles by name (`node-pty`, `@yuuang/ffi-rs-android-arm64`) is still the one npm installs.
   - Every driver in `termuxHarnesses.ts` still builds its maintenance through `makePackageManagedProviderMaintenanceResolver`, and the Welcome page and provider settings still open `AgentInstallTerminal` from `WelcomePage.tsx` for installs.
3. Set `version` in `packaging/termux/package.json` to `X.Y.Z-termux.1`.
4. Typecheck the server, then push and run the Termux package workflow by hand (`gh workflow run termux.yml --ref termux`). Done when all of its jobs pass, which includes the smoke test on arm64.
5. Disable any upstream workflow the merge added: `gh workflow list --all` should show only `termux.yml` as active. GitHub turns on new workflow files that reach the default branch.

## Releasing

Releases come from `termux` only. Bump `-termux.<n>` for a fork-only fix on the same upstream version. Push the tag `termux-v<version>`, where `<version>` matches `packaging/termux/package.json`. The workflow refuses a tag that does not match. Upstream's release workflow fires on `v*.*.*`, which is why fork tags start with `termux-`.

A tag publishes twice. The workflow attaches the tarball to a GitHub release, and that release's notes give the commands to install it: download with `curl -LO`, then `npm install -g ./<file>`. npm 12 refuses to install from a URL (`EALLOWREMOTE`). It also publishes to npm. npm's automated review can hold a new version for an hour or more, so test fixes on a phone from the GitHub release.

## Packaging

Users install with `npm install --global t3code-termux` or `npx`, and npm 12 skips dependency install scripts in both cases. So the tarball bundles its whole `node_modules` (`bundleDependencies`) with every native binary ready to load. Anything that only works after an install script is broken for users.

`finalize.sh` runs inside Termux on arm64, because node-pty has no Android build and must be compiled against Termux's Node and Android's libc. The non-obvious parts:

- npm skips install scripts for packages listed in `bundleDependencies`, so `stage.ts` leaves that list out and `finalize.sh` adds it after `npm install` has compiled node-pty.
- npm packs a bundled package using that package's own `files` list. node-pty's list has `prebuilds/` but not `build/`, so `pty.node` moves to `prebuilds/android-arm64/`. The node-pty loader checks that path too.
- The prebuilt `@yuuang/ffi-rs-android-arm64` addon imports `__clear_cache`, which Android's libc does not export, and fff loads ffi-rs at server startup. `finalize.sh` builds `libclear_cache.so` from clang's runtime, links the addon to it with `patchelf`, and adds the library to that package's `files` list. Check whether a newer ffi-rs still needs this before you remove it.
- `os` and `cpu` in the manifest restrict installs to android/arm64. To test on an x86_64 machine with `package.sh <stage> <out> termux/termux-docker:x86_64`, add `x64` to `cpu` in the staged copy. Expect the fff check to fail there, since fff and ffi-rs ship no android-x64 build.
- `package.sh` runs the container with `android-seccomp.json`, which denies `link` and `linkat` with EACCES as Android does. Docker does not enforce Android's SELinux policy, so other Android-only denials still show up only on a real phone. Add them to that profile when you find them.
- Builds have no T3 Connect or account sign-in, because those need public config that upstream bakes in at release time.
