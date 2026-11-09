// Install and update commands for agent harnesses in Termux on Android.
// The vendor installers download Linux builds that do not run there.

export interface TermuxHarness {
  /** The name used by `t3 agents install <name>`. */
  readonly name: string;
  readonly driver: string;
  readonly label: string;
  /** The command the harness puts on PATH. */
  readonly command: string;
  /** A shell command for an interactive terminal, because some installers ask questions. */
  readonly install: string;
  /** Updates an existing install without prompts. The first item is the executable. */
  readonly update: readonly [string, ...string[]];
  /** The Termux package that ships the harness, if any. */
  readonly termuxPackage?: string;
}

// Anthropic has no Android build. This community launcher patches the official linux-arm64
// binary to run on Termux's glibc. Pinned to v2.9.5 of ferrumclaudepilgrim/claude-code-android.
const CLAUDE_INSTALLER =
  "https://raw.githubusercontent.com/ferrumclaudepilgrim/claude-code-android/a0477923457be0bd2d09580d46c697b0fb9d5c32/install.sh";

export const TERMUX_HARNESSES: ReadonlyArray<TermuxHarness> = [
  {
    name: "claude",
    driver: "claudeAgent",
    label: "Claude Code",
    command: "claude",
    install: `curl -fsSL ${CLAUDE_INSTALLER} -o "$TMPDIR/claude-code-android.sh" && bash "$TMPDIR/claude-code-android.sh"`,
    // The launcher runs its update check, then execs `claude --version`, which exits.
    update: ["claude", "--update-now", "--version"],
  },
  {
    name: "codex",
    driver: "codex",
    label: "Codex",
    command: "codex",
    install: "pkg install codex",
    update: ["pkg", "install", "-y", "codex"],
    termuxPackage: "codex",
  },
  {
    name: "pi",
    driver: "pi",
    label: "Pi",
    command: "pi",
    // Pi's Termux guide skips install scripts.
    install: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
    update: ["npm", "install", "-g", "--ignore-scripts", "@earendil-works/pi-coding-agent@latest"],
  },
];

export function findTermuxHarness(driver: string): TermuxHarness | undefined {
  return TERMUX_HARNESSES.find((harness) => harness.driver === driver);
}
