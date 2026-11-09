# Harness installation on Termux

Research note for the `t3code-termux` fork. It covers how T3 Code finds and installs agent harnesses (provider CLIs), what a Termux user sees today, and options for an easier install.

Sources checked on 2026-11-09:

- Fork branch `termux`, based on upstream tag `v0.1.7` (`322f6544dfad`). Repo paths below refer to this tree.
- Upstream `pingdotgg/t3code` `main` at `4f0b74e19` (2026-11-09), 462 commits after `v0.1.7`. `v0.1.7` is still the latest stable release (`gh release list -R pingdotgg/t3code`).
- npm registry metadata, vendor install scripts, vendor docs, and vendor issue trackers, linked inline.

Items marked **unverified** were not confirmed against a primary source or on a device.

## Short answer

T3 Code `v0.1.7` has in-app install for two built-in providers only: Codex (managed runtime) and Antigravity. It also installs ACP Registry agents when you add them. All of these are in the web app. None of them works for a Termux server, for these reasons:

- The Codex and Antigravity installers have no `android` release asset, so they refuse to start.
- The ACP Registry hides binary agents on Android and offers only agents distributed through `npx` or `uvx`.
- The mobile app has no install controls. It shows "Not installed" and can update a provider that is already installed.

Upstream `main` adds nothing after `v0.1.7` that changes this.

## Current behavior in v0.1.7

### Supported harnesses

Built-in drivers are Codex, Claude, Cursor, Grok, fx, OpenCode, Antigravity, Kiro, Pi, Muse, and the generic ACP Registry driver (`apps/server/src/provider/builtInDrivers.ts:33-45`). Gemini CLI is not a built-in driver. It is reachable as an ACP Registry agent (`gemini`, distributed as `npx:@google/gemini-cli@0.67.0` in the [registry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json), the URL set at `packages/provider-acp-registry/src/server/AcpRegistrySupport.ts:51`).

Cursor runs in-process through the bundled `@cursor/sdk` package (`packages/provider-cursor/src/server/sdk.ts:9-17`, `scripts/lib/cli-external-packages.ts:5`). It needs no separate CLI install.

### How the server finds a harness

- Each driver resolves its executable from the instance's **Binary path** setting, or a bare command name looked up on `PATH` (`packages/shared/src/shell.ts:609-660`; user doc `docs/user/install.md:174-178`).
- On Linux and macOS the server re-reads `PATH` from the login shell at startup. On Android it skips this, because `fixPath` returns for any platform other than `darwin` and `linux` (`apps/server/src/os-jank.ts:92`). A Termux server therefore uses the `PATH` of the shell that ran `t3 serve`.
- Node in Termux reports `process.platform === "android"`. The fork detects Termux this way (`apps/server/src/termux.ts:6`). Server code reads the same value through `HostProcess.Platform` (`packages/shared/src/HostProcess.ts:7-9`).
- The server reports Android as platform OS `"unknown"` to clients (`apps/server/src/environment/ServerEnvironment.ts:59-70`).

When a CLI is missing, the driver status says so. Examples:

- Claude: "Claude Agent CLI (`claude`) was not found on PATH." (`apps/server/src/provider/ClaudeProvider.ts:514`)
- OpenCode: `packages/provider-opencode/src/server/status.ts:116`
- Pi, with an install command in the message: `packages/provider-pi/src/server/status.ts:374`

Every provider snapshot defaults to `setup: { canAuthenticate: false, canInstall: false }` (`packages/provider-core/src/server/snapshotProbe.ts:263`). Only managed Codex (`apps/server/src/provider/Drivers/CodexManagedProvider.ts:58`) and Antigravity (`apps/server/src/provider/AntigravityProvider.ts:204`) set `canInstall: true`. Neither checks the platform first.

### What the user sees when a harness is missing

| Surface                                    | Missing CLI                                                                                                                                                                          | Install control                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web, Settings → Providers                  | "Not found", with the driver message or "CLI not detected on PATH." (`apps/web/src/components/settings/providerStatus.ts:61-66`)                                                     | Codex and Antigravity only. Others: set **Binary path**                                                                                                                                           |
| Web, Antigravity runtime row               | "Automatic installation unavailable. Set a binary path or use another environment." when `canInstall` is false (`apps/web/src/components/settings/ProviderSetupSection.tsx:206-210`) | **Install Antigravity** button (`ProviderSetupSection.tsx:258-277`)                                                                                                                               |
| Web, chat banner                           | "Open provider setup to install … on this environment." for providers with setup (`apps/web/src/components/chat/ProviderStatusBanner.tsx:78-80`)                                     | Link to provider setup                                                                                                                                                                            |
| Web, onboarding wizard                     | Claude and Codex cards open a terminal with the vendor installer (`apps/web/src/components/onboarding/WelcomeWizard.tsx:803-812`, `836-845`)                                         | `curl -fsSL https://claude.ai/install.sh \| bash` and `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` for any non-Windows OS (`apps/web/src/onboarding/providerReadiness.logic.ts:75-93`) |
| Mobile, Settings → environment → Providers | "Not installed" plus the driver message, for enabled providers only (`apps/mobile/src/features/settings/SettingsEnvironmentDetailRouteScreen.tsx:331`, `346-348`, `373`)             | None. **Update** appears only for installed providers (`SettingsEnvironmentDetailRouteScreen.tsx:383-392`)                                                                                        |
| Mobile, Settings → Providers (accounts)    | "Not installed" (`apps/mobile/src/features/settings/SettingsProviderAccountsRouteScreen.tsx:232-233`)                                                                                | None. The screen manages sign-in only (`SettingsProviderAccountsRouteScreen.tsx:106-110`)                                                                                                         |

The mobile app never calls the install or ACP Registry RPCs. `startProviderInstall`, `providerInstallState`, `searchAcpRegistry` and `prepareAcpRegistryAgent` exist in `packages/client-runtime/src/state/server.ts:1272-1293`, `1366`, `1453`, and only web code uses them. Mobile also has no Binary path field and no way to enable or add a provider instance (no `binaryPath` or provider-add usage under `apps/mobile/src/features/settings`).

### Existing install and update actions

**Managed install (`provider.install.*`).** The RPCs are `provider.install.start`, `.cancel`, `.subscribe` and `.remove` (`packages/contracts/src/rpc.ts:447-450`, `731-755`). They take `{ instanceId }` and stream `ProviderInstallState` (`packages/contracts/src/providerSetup.ts:12-15`, `141-168`), and need the `AuthProvidersManageScope` grant (`apps/server/src/auth/RpcAuthorization.ts:78`). The server handlers are in `apps/server/src/ws.ts:2597-2600`.

`ProviderInstallation` accepts only Codex and Antigravity instances, and Codex only in `setupMode: "managed"` (`apps/server/src/provider/providerInstallation.ts:52-97`).

- Codex downloads `codex-package-<target>.tar.gz` 0.166.0 from GitHub releases for six `platform-arch` keys. The Linux keys use the musl targets (`apps/server/src/provider/CodexInstallation.ts:60-105`). On `android-arm64` there is no asset, and `start` fails with "OpenAI does not publish a Codex runtime for android-arm64…" (`CodexInstallation.ts:651-656`).
- Antigravity downloads `agy-acp-server-1.4.5` zips for macOS, Linux and Windows (`apps/server/src/provider/antigravityRelease.ts:20-89`). On Android it fails with "Google does not publish an Antigravity runtime for android-arm64…" (`apps/server/src/provider/AntigravityInstallation.ts:712-716`).

**ACP Registry install.** Adding a registry agent installs it under T3 home (`docs/user/providers-acp.md:47-52`). Platform targets exist only for `darwin`, `linux` and `windows` (`packages/provider-acp-registry/src/server/AcpRegistrySupport.ts:226-248`). On Android the target is `undefined`, so binary distributions are skipped. Search still lists agents with an `npx` or `uvx` distribution when `npm` or `uv` is on `PATH` (`AcpRegistrySupport.ts:423-461`, `1629-1650`). `npx` agents install with `npm install --global <pkg>@<version>` and a T3-owned `npm_config_prefix` (`AcpRegistrySupport.ts:1254`, `1283`). Registry agents that T3 supports as built-in providers do not appear in search (`docs/user/providers-acp.md:8-10`).

**Provider update (`server.updateProvider`).** This RPC (`packages/contracts/src/rpc.ts:502`, `663-667`) runs the installer that owns an existing CLI, or the CLI's own updater (`docs/internals/providers.md:81-105`). For a global npm install it runs `npm install -g --prefix <prefix> --allow-scripts=<pkg> <pkg>@latest` (`packages/provider-core/src/server/maintenanceResolver.ts:615-632`). With no resolved executable it is manual-only (`maintenanceResolver.ts:466-477`), so it cannot install a missing CLI. Mobile exposes this action (`apps/mobile/src/features/settings/environment-maintenance.ts:34-47`).

### Reachability from the mobile app

The fork publishes only the server and the web build it serves (`TERMUX.md`, "Fork changes"). Users pair the store mobile app (`packaging/termux/README.md`, "Run"). A mobile user can do the following today:

- read provider status text, including the driver `message`
- refresh providers
- run **Update** on an installed provider
- sign in to providers that advertise in-app sign-in
- open a terminal on the server

Mobile terminals are scoped to a thread (`apps/mobile/src/features/terminal/terminalLaunchContext.ts:9-13`), so the user needs a project and thread first. Commands typed there run in Termux on the phone.

The web UI that the Termux server serves has all the web install controls listed above. A browser pointed at the phone's server can use them.

## Upstream after v0.1.7

`git log v0.1.7..upstream/main` over the install, onboarding, ACP Registry, maintenance and mobile settings paths shows no Android support and no new installers. Relevant commits:

- `4f0b74e19` (#33209, 2026-11-09): the web Welcome page replaces the wizard. It still offers **Install** only for Claude Code and Codex, through the same vendor commands (`docs/user/welcome-page.md` on `upstream/main`; `apps/web/src/onboarding/providerReadiness.logic.ts:48-63` on `upstream/main`). Other agents open their Settings → Providers page, and **Browse** opens the ACP Registry.
- `e4e365734` (#28928): mobile can configure another Claude account from Providers. This is sign-in only.
- `7b680b616` (#32503): Antigravity accepts the `agy` CLI as a custom binary path.
- `ade473018` (#21524): mise-installed providers update through mise.
- `6dad2adc7` (#33150), `3dc54f43d` (#33153): install the `t3` command itself. These do not install providers.
- `upstream/main` has no `android` handling in `CodexInstallation.ts`, `antigravityRelease.ts`, `AcpRegistrySupport.ts` or `HostProcess.ts` (`git grep android upstream/main -- <those files>` returns nothing).

Open upstream PRs that touch this area (none merged):

- [#31486](https://github.com/pingdotgg/t3code/pull/31486) adds a policy to block provider installs and updates.
- [#17585](https://github.com/pingdotgg/t3code/pull/17585) installs provider updates in the background.
- [#23610](https://github.com/pingdotgg/t3code/pull/23610) re-reads the login-shell `PATH` on rescan.

## Harness support on Termux (Android arm64)

### Platform facts that decide the outcome

- npm compares a package's `os` field against `process.platform`. `npm-install-checks` 9.0.0 reads `os` from `process.platform` (`lib/current-env.js:9-11`) and throws `EBADPLATFORM` on a mismatch (`lib/index.js:24-56`). On Termux that value is `android`. So:
  - A top-level package with `os: ["darwin","linux","win32"]` fails to install.
  - An optional dependency with `os: ["linux"]` is skipped.
- Android's libc is bionic. Binaries linked against glibc expect `/lib/ld-linux-aarch64.so.1`, which Termux lacks ([gemini-cli#21836](https://github.com/google-gemini/gemini-cli/issues/21836) shows this failure for a bundled `rg`).
- Static musl binaries can start on Android. musl reads DNS servers from `/etc/resolv.conf` and falls back to `127.0.0.1` when the file is missing ([musl `resolvconf.c`](https://git.musl-libc.org/cgit/musl/plain/src/network/resolvconf.c), lines 21-26 and 85-88). Android has no `/etc/resolv.conf`. Whether this breaks a given harness depends on its DNS resolver (**unverified** per harness).
- Vendor `curl | sh` installers detect the OS with `uname -s`. Android reports `Linux`, so they pick a Linux build.

### Per-harness findings

| Harness                   | Official install                                                                                                                                             | Package type                                 | Termux status                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Codex                     | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh`, npm `@openai/codex`, Homebrew ([docs](https://developers.openai.com/codex/cli))                     | Rust native                                  | **Works through Termux's own package**: `pkg install codex` (0.167.0). Vendor routes do not work       |
| Claude Code               | Native installer `curl -fsSL https://claude.ai/install.sh \| bash`, or npm `@anthropic-ai/claude-code` ([setup docs](https://code.claude.com/docs/en/setup)) | Native binary since 2.1.113                  | **No Android build.** The last pure-JS npm release is 2.1.112                                          |
| OpenCode                  | `curl -fsSL https://opencode.ai/install \| bash`, npm `opencode-ai` (1.x) or `@opencode/cli` (2.x)                                                           | Native binary                                | **Not installable with plain npm.** A community report has v2 working with `--force` and a musl loader |
| Pi                        | npm `@earendil-works/pi-coding-agent`, with an [official Termux guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/termux.md)  | Node.js                                      | **Supported** by the vendor                                                                            |
| Gemini CLI (ACP Registry) | `npm install -g @google/gemini-cli` ([installation doc](https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/installation.mdx))            | Node.js bundle                               | **Runs**, per issues that Google fixed for Termux. No official Android support statement               |
| Grok                      | npm `@xai-official/grok` ([x.ai/cli](https://x.ai/cli))                                                                                                      | Native binary through npm                    | **Not installable with plain npm**                                                                     |
| Kiro                      | `curl -fsSL https://cli.kiro.dev/install \| bash` ([docs](https://kiro.dev/docs/cli/))                                                                       | Native binary                                | **Unverified**                                                                                         |
| fx                        | `curl -fsSL https://fx.sh/setup.sh \| bash`                                                                                                                  | Native binary                                | **Unverified**                                                                                         |
| Muse Code                 | [dev.meta.ai/docs/muse-code](https://dev.meta.ai/docs/muse-code)                                                                                             | Not checked                                  | **Unverified**                                                                                         |
| Cursor                    | Bundled `@cursor/sdk`                                                                                                                                        | In-process SDK with platform helper packages | **Unverified**                                                                                         |
| Antigravity               | T3 managed runtime                                                                                                                                           | Native binary                                | **Not available**: no Android asset                                                                    |

Details and evidence:

**Codex.**

- Termux ships `codex` built from source for Android, and installs `codex` and `codex-code-mode-host` into `$PREFIX/bin` ([`packages/codex/build.sh`](https://github.com/termux/termux-packages/blob/master/packages/codex/build.sh), `TERMUX_PKG_VERSION="0.167.0"`, last changed in `a71a34452eab`, 2026-11-06). T3 `v0.1.7` rates Codex `>=0.156.0` as supported (`apps/server/src/provider/model-manifest.json:6-14`).
- The npm wrapper maps `android` to `aarch64-unknown-linux-musl` (`@openai/codex@0.167.0`, `bin/codex.js:29-38`). Its platform package `@openai/codex@0.167.0-linux-arm64` declares `os: ["linux"]`, so npm skips it on Android, and the wrapper throws "Missing optional dependency" (`bin/codex.js:75-110`).
- The standalone installer picks `aarch64-unknown-linux-musl` on any Linux arm64 (`install.sh` lines 1257-1306). One report says that build prints `--version` on native Termux but the interactive CLI exits with "Bad system call" ([openai/codex#55986](https://github.com/openai/codex/issues/55986), open).
- **Unverified:** that T3's Codex driver (app-server mode) works with the Termux `codex` package.

**Claude Code.**

- The npm package became a native-binary wrapper in 2.1.113 (2026-04-17). 2.1.112 (2026-04-16) is the last release with `bin: cli.js` (npm registry metadata).
- The current wrapper's postinstall maps Android to `linux-arm64-android` (`@anthropic-ai/claude-code@2.1.319`, `install.cjs:68-71`, `101-105`). `optionalDependencies` has no such package, and `@anthropic-ai/claude-code-linux-arm64-android` does not exist on npm. The postinstall prints "Native binaries for linux-arm64-android are not available on this release channel" and leaves a stub `claude` that exits 1 (`install.cjs:312-320`, `bin/claude.exe`).
- The native installer selects `linux-arm64` (glibc) on Termux, because Termux has no `/lib/libc.musl-*` and no `/bin/ls` for its musl check (`install.sh:115-145`). The release manifest for 2.1.319 lists no Android platform (`https://downloads.claude.ai/claude-code-releases/2.1.319/manifest.json`). The vendor's supported OS list does not include Android ([setup](https://code.claude.com/docs/en/setup), "System requirements").
- One user reports running the "linux-arm64 native binary" 2.1.302 on Termux ([anthropics/claude-code#106886](https://github.com/anthropics/claude-code/issues/106886)). How it was made to run (for example a glibc compatibility layer) is not stated (**unverified**).
- T3 `v0.1.7` rates Claude `>=2.1.111 <2.1.280` as "graceful", which the server describes as "limited compatibility" (`apps/server/src/provider/model-manifest.json:26-33`, `apps/server/src/provider/providerCompatibility.ts:82-88`). A pinned 2.1.112 install falls in that range.
- **Risk.** For a global npm install, **Update now** (web or mobile) runs `npm install -g … @anthropic-ai/claude-code@latest` (`maintenanceResolver.ts:615-632`). On Termux this would replace a working 2.1.112 `cli.js` with the stub. This is inferred from code and not tested on a device.

**Claude Code community launchers.** Several community projects run the current official `linux-arm64` binary on Termux. Each downloads the binary from Anthropic and runs it through Termux's glibc packages ([termux-pacman/glibc-packages](https://github.com/termux-pacman/glibc-packages)). The method comes from [a comment on claude-code#50270](https://github.com/anthropics/claude-code/issues/50270#issuecomment-4467292215).

| Project                                                                                                           | Install                                                 | Launcher                                                                            | How it runs the binary                                                           | Updates                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [ferrumclaudepilgrim/claude-code-android](https://github.com/ferrumclaudepilgrim/claude-code-android) (325 stars) | `install.sh`                                            | `$PREFIX/bin/claude`, symlinked from `~/.local/bin/claude` (`install.sh:59`, `624`) | `patchelf` to Termux's glibc loader, checksum check, rollback to a saved version | Launcher checks once a day. `claude --update-now` forces a check (`install.sh:453`). Sets `autoUpdates: false` (`install.sh:347-371`) |
| [gtbuchanan/claude-code-termux](https://github.com/gtbuchanan/claude-code-termux) (29 stars)                      | apt `.deb` through `install.sh`                         | Compiled launcher, symlinked from `~/.local/bin/claude`                             | `patchelf` plus `LD_PRELOAD` shims for `uname`, DNS and exec path                | `claude-code-termux-update`. Sets `autoUpdates: false`, and the launcher sets `DISABLE_AUTOUPDATER=1` (`src/claude-wrapper.c:70-78`)  |
| [bd-loser/claude-code-termux](https://github.com/bd-loser/claude-code-termux) (6 stars)                           | `install.sh`                                            | `~/.local/bin/claude`                                                               | `glibc-runner` plus a DNS shim                                                   | `claude-code-termux update`. The launcher reinstalls the binary if an npm update reverts it to the stub                               |
| [DamnSit/claude-code-termux](https://github.com/DamnSit/claude-code-termux) (13 stars)                            | npm `@xurxuo/claude-code-termux` or `install-secure.sh` | `$PREFIX/bin/claude`                                                                | `grun`                                                                           | Checks once a day. The launcher handles `claude update` itself                                                                        |

These READMEs warn that some Android kernels refuse to exec the glibc binary even after patching, and that the Google Play build of Termux does not work.

**T3's Update now with a community launcher.** The update method depends on where `claude` resolves (`packages/provider-core/src/server/maintenanceResolver.ts:519-655`):

- A path under `~/.local/bin/claude` or `~/.local/share/claude/` counts as a native install, so **Update now** runs `claude update` (`apps/server/src/provider/Drivers/ClaudeMaintenance.ts:27-40`).
- A launcher in `$PREFIX/bin` also falls through to `claude update`, because it is outside `node_modules` and matches no package manager (`maintenanceResolver.ts:541-545`, `654`).
- For a native install, T3 compares the version with `https://downloads.claude.ai/claude-code-releases/latest` (`ClaudeMaintenance.ts:73-90`). The button therefore appears every time Anthropic releases a new version.
- **Unverified:** what `claude update` does through each launcher. gtbuchanan's README says Anthropic's native installer writes a stock binary under `~/.local/share/claude/versions/` and repoints `~/.local/bin/claude`. That breaks the launcher until `claude-code-termux-update` runs. Only DamnSit's launcher is documented to handle `claude update`.

**OpenCode.**

- T3 `v0.1.7` supports OpenCode `>=2.0.18`, with 1.x rated "graceful" (`apps/server/src/provider/model-manifest.json:65-74`). The 2.x npm package for maintenance is `@opencode/cli` (`packages/provider-opencode/src/server/driver.ts:85`).
- `opencode-ai@1.19.5` and `@opencode/cli@2.2.6` both declare `os: ["darwin","linux","win32"]`, so npm on Termux fails with `EBADPLATFORM`.
- The install script selects a glibc or musl Linux build (`opencode.ai/install` lines 91-180).
- A community report says the v2 `linux-arm64-musl` binary runs on Termux after `npm install --force` and a wrapper fix, and asks upstream to add `android` to `os` ([anomalyco/opencode#47612](https://github.com/anomalyco/opencode/issues/47612), open). [#58503](https://github.com/anomalyco/opencode/issues/58503) shows 2.0.22 running natively on Termux with a watcher limitation.
- **Unverified:** that this setup works with T3's OpenCode driver.

**Pi.**

- The vendor documents `pkg install nodejs git`, then `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` ([termux.md](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/termux.md)).
- The package is pure JS with no `os` restriction (`@earendil-works/pi-coding-agent@1.5.0` metadata, `engines.node >=22.19.0`). The fork already requires Node 24 (`packaging/termux/README.md`, "Requirements").
- The T3 status message already gives this command (`packages/provider-pi/src/server/status.ts:374`). Pi is off by default in T3 (`docs/internals/adding-a-provider.md:115`), and mobile cannot turn it on.

**Gemini CLI.**

- The package has no `os` restriction. Its `node-pty` dependencies are optional (`@google/gemini-cli@0.67.0` metadata).
- Termux-specific bugs were filed and closed: [#21836](https://github.com/google-gemini/gemini-cli/issues/21836) (bundled `rg`) and [#26331](https://github.com/google-gemini/gemini-cli/issues/26331) ("Unsupported platform: android" during account verification). The changelog lists "allow trusted system paths on Android (Termux) for ripgrep" (`docs/changelogs/latest.md:97`).
- In T3 it installs through the ACP Registry `npx` path, which requires the web UI.

**Grok.** `@xai-official/grok@1.0.77` declares `os: ["darwin","linux","win32"]` and pulls native platform packages (npm metadata). npm refuses it on Android. Whether `--force` and a Linux build run on Termux is **unverified**.

**Kiro.** When the installer cannot detect glibc, it falls back to the musl archive (`cli.kiro.dev/install` lines 330-393). That is the Termux case. Whether that archive runs on Android is **unverified**.

**fx.** The installer maps `Linux`/`aarch64` to `linux-aarch64` and downloads `fx-linux-aarch64.tar.gz` (`fx.sh/setup.sh` lines 50-66, 117). The libc of that build is not stated (**unverified**).

**Cursor.**

- `@cursor/sdk@1.2.0` lists platform helpers as optional dependencies. `@cursor/sdk-linux-x64` declares `os: ["linux"]` and ships `cursorsandbox` and `rg` (pnpm store copy in this repo).
- On Android npm skips the matching helper. That includes the fork's `finalize.sh`, which runs `npm install` inside Termux (`TERMUX.md`, "Packaging").
- Whether the SDK works without the helper is **unverified**.

## Options for easy install in the fork

The fork ships the server and its web build. It does not ship the mobile app. So any option that needs new mobile UI cannot reach mobile users. Mobile users can reach these:

- **Status text.** Provider `message` and `unavailableReason` show on the mobile environment screen (`SettingsEnvironmentDetailRouteScreen.tsx:373`).
- **Terminal.** Commands typed in a thread terminal run in Termux.
- **Update.** The existing update action works for installed providers.

### Option 1: documentation only

Add a Termux harness section to `packaging/termux/README.md` (the npm README users read) and keep this note for maintainers. Give one tested command per harness, for example:

```sh
pkg install codex
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

For Claude, document the 2.1.112 pin and its limits.

- **Upstream code touched:** none.
- **Mobile reach:** users run commands in Termux or in a T3 thread terminal.
- **Cost:** commands drift as vendors change packaging. Claude's npm switch in 2.1.113 is an example. Each recipe needs a device test.

### Option 2: a Termux CLI command

Add a fork-only subcommand to `apps/server/src/cli/termux.ts`, for example `t3 agents` to list what is found and `t3 agents install <name>` to run the Termux recipe. Recipes would be `pkg install codex`, the Pi npm command, and others once verified on a device. The pattern already exists: `t3 update` spawns `npm install --global` (`apps/server/src/cli/termux.ts:25-51`).

- **Upstream code touched:** one more entry in the `makeCli` subcommand list in `apps/server/src/binCli.ts`, next to the four Termux entries already there (`binCli.ts:89-93`). That file is already a listed conflict point (`TERMUX.md`, "Fork changes"). Everything else is in fork-only files.
- **Mobile reach:** through a thread terminal. With Option 4, the server status message can name the command.
- **Cost:** the fork owns the recipe list. A recipe that pins a version must also stop T3's **Update now** from replacing it. See the Claude risk above.

### Option 3: server-side install through the existing RPC

Extend `ProviderInstallation` so `provider.install.start` runs a Termux recipe for more drivers, and report `setup.canInstall: true` for them on Android.

- **Upstream code touched:** `apps/server/src/provider/providerInstallation.ts`, which hard-codes Codex and Antigravity (lines 58-96). Each driver that should report `canInstall` also changes (`CodexManagedProvider.ts:58`, `AntigravityProvider.ts:204`, `snapshotProbe.ts:263`, and the per-package drivers). Because `ProviderInstallState` describes download, extract and verify phases (`providerSetup.ts:141-162`), a package-manager install would reuse it loosely.
- **Mobile reach:** none. The store mobile app never calls `provider.install.*`. Only the fork-served web UI would see the button, and only for drivers whose settings panel renders the install row. Today that row is Antigravity's `ProviderSetupSection` and the Codex setup section.
- **Cost:** the most upstream edits of any option, in files upstream changes often. Since `v0.1.7`, upstream changed `providerInstallation.ts` in `e3441535a` and `AntigravityInstallation.ts` in `7b680b616` and `c55db3e9c`.

### Option 4: Termux-aware status messages

Add a fork-only step that rewrites the `message` of a not-installed provider on Android, for example "Run `t3 agents install codex` in Termux". Mobile already shows this text (`SettingsEnvironmentDetailRouteScreen.tsx:373`), and web shows it as the status detail (`providerStatus.ts:61-66`).

- **Upstream code touched:** a hook where snapshots are built or published, for example `apps/server/src/provider/ProviderRegistry.ts` or `providerStatusCache.ts`. Where exactly is **unverified**. It is probably one call site, but it sits in a central upstream file.
- **Mobile reach:** read-only guidance on the screen the user already sees.
- **Cost:** low, if one stable hook point exists. Pairs well with Option 2.

### Option 5: upstream Android awareness

Propose upstream changes that treat `android` as a known platform. Examples:

- Codex managed install points to a Termux-compatible runtime, or declines with a clear message.
- The ACP Registry maps Android to the registry's `linux-aarch64-musl` targets. The registry already publishes those for `claude-acp`, `opencode`, `kiro`, `goose` and others. `v0.1.7` does not know the `-musl` key (`AcpRegistrySupport.ts:226-232`).
- Onboarding stops offering the vendor `curl` installers when the server OS is `"unknown"`.

- **Upstream code touched in the fork:** none, after the next merge.
- **Mobile reach:** same as upstream.
- **Cost:** upstream may not accept Android-specific behavior. The musl targets also need a device test, because of the DNS concern above.

### Comparison

| Option                 | Fork edits to upstream files               | Reaches mobile users | Main risk                       |
| ---------------------- | ------------------------------------------ | -------------------- | ------------------------------- |
| 1. Docs                | None                                       | Through the terminal | Recipes go stale                |
| 2. `t3 agents` CLI     | One line in `binCli.ts`                    | Through the terminal | Fork maintains recipes          |
| 3. Server install RPC  | `providerInstallation.ts`, several drivers | No (web only)        | Merge conflicts in active files |
| 4. Status message hint | One hook in provider status code           | Yes, read-only       | Finding a stable hook           |
| 5. Upstream PR         | None after merge                           | Same as upstream     | Acceptance                      |

Option 2 with Option 1, plus Option 4 if a clean hook exists, gives mobile users a path with the fewest upstream edits. Option 3 adds no mobile reach for the store app.

## Open questions

1. Does T3's Codex driver (app-server, sandbox, ChatGPT sign-in) work with Termux's `pkg install codex` 0.167.0 on a real phone?
2. Which Claude Code route should the fork support: a community launcher for the current glibc binary, or the 2.1.112 `cli.js` pin (rated "graceful" by `v0.1.7`)? What does T3's **Update now** (`claude update`) do through each launcher, and how should the fork stop it from breaking an install?
3. Does OpenCode 2.x work under T3 on Termux with `--force` and the musl build, and what musl loader does it need?
4. Does Cursor's in-process SDK work on Android without `@cursor/sdk-linux-arm64` (`cursorsandbox`, `rg`)?
5. Do ACP Registry `npx` agents (Gemini CLI, Qwen Code, GitHub Copilot CLI) install and run through T3 on Termux? This covers npm 12 skipping dependency install scripts (`TERMUX.md`, "Packaging") and agents that spawn bundled glibc binaries.
6. Is there one stable place in `ProviderRegistry` or `providerStatusCache` for a fork-only message rewrite (Option 4)?
7. Do Kiro's musl archive and fx's `linux-aarch64` build run on Android, including DNS?
8. Would upstream accept treating `process.platform === "android"` as a known platform in the installers and the ACP Registry (Option 5)?
