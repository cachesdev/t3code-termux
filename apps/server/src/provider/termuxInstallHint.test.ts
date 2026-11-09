import { describe, expect, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";

import { applyTermuxInstallHint } from "./termuxInstallHint.ts";

const missingClaude: ServerProvider = {
  driver: ProviderDriverKind.make("claudeAgent"),
  instanceId: ProviderInstanceId.make("claudeAgent"),
  enabled: true,
  installed: false,
  version: null,
  status: "error",
  message: "Claude Agent CLI (`claude`) was not found on PATH.",
  checkedAt: "2026-11-09T00:00:00Z",
  auth: { status: "unknown" },
  models: [],
  skills: [],
  slashCommands: [],
};

describe("applyTermuxInstallHint", () => {
  it("adds the install command once, however often the snapshot is classified", () => {
    const once = applyTermuxInstallHint(missingClaude, true);
    const twice = applyTermuxInstallHint(once, true);

    expect(twice.message).toBe(
      "Claude Agent CLI (`claude`) was not found on PATH. Install it in Termux with `t3 agents install claude`.",
    );
  });

  it("leaves snapshots alone outside Termux", () => {
    expect(applyTermuxInstallHint(missingClaude, false)).toBe(missingClaude);
  });
});
