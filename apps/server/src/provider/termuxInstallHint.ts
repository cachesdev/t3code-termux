import type { ServerProvider } from "@t3tools/contracts";
import { findTermuxHarness } from "@t3tools/shared/termuxHarnesses";

import { isTermux } from "../termux.ts";

/**
 * Adds the Termux install command to a missing harness's status message.
 * The mobile app shows this message but has no install controls.
 */
export function applyTermuxInstallHint(
  snapshot: ServerProvider,
  termux: boolean = isTermux,
): ServerProvider {
  const harness = termux && !snapshot.installed ? findTermuxHarness(snapshot.driver) : undefined;
  if (!harness) return snapshot;

  const hint = `Install it in Termux with \`t3 agents install ${harness.name}\`.`;
  // Snapshots are classified again on every refresh, so add the hint once.
  if (snapshot.message?.includes(hint)) return snapshot;
  return { ...snapshot, message: snapshot.message ? `${snapshot.message} ${hint}` : hint };
}
