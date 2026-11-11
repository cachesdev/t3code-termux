import { useAtomValue } from "@effect/atom-react";
import {
  AuthTerminalOperateScope,
  type EnvironmentId,
  type ServerProvider,
} from "@t3tools/contracts";
import type { TermuxHarness } from "@t3tools/shared/termuxHarnesses";
import { TerminalIcon } from "lucide-react";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { AgentInstallTerminal } from "../onboarding/WelcomePage";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";

/** Installs a missing harness with its Termux recipe in a terminal on the server. */
export function TermuxInstallSection({
  environmentId,
  provider,
  harness,
}: {
  readonly environmentId: EnvironmentId;
  readonly provider: ServerProvider;
  readonly harness: TermuxHarness;
}) {
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const [terminalOpen, setTerminalOpen] = useState(false);

  return (
    <SettingsRow
      title={`Install ${harness.label}`}
      description={<code className="font-mono break-all">{harness.install}</code>}
      control={
        <Button
          size="xs"
          variant="outline"
          disabled={terminalOpen || !canOperateTerminal || serverConfig === null}
          onClick={() => setTerminalOpen(true)}
        >
          <TerminalIcon className="size-3.5" />
          Install
        </Button>
      }
    >
      {terminalOpen && serverConfig !== null ? (
        <AgentInstallTerminal
          session={{
            environmentId,
            driver: provider.driver,
            providerInstanceId: provider.instanceId,
            cwd: serverConfig.cwd,
            command: harness.install,
            keybindings: serverConfig.keybindings,
          }}
          onClose={() => {
            setTerminalOpen(false);
            void refreshProviders({ environmentId, input: {} });
          }}
        />
      ) : null}
    </SettingsRow>
  );
}
