// Commands for the t3code-termux npm package, which runs the server in Termux on Android.
// The desktop versions manage downloaded runtimes and system services that Android does not have.
import { resolveCommandPath } from "@t3tools/shared/shell";
import { TERMUX_HARNESSES } from "@t3tools/shared/termuxHarnesses";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/cli";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

const PACKAGE_NAME = "t3code-termux";

const KEEP_RUNNING_HINT =
  "Background services are not available in Termux. Run `t3 serve --lan` and keep Termux awake with `termux-wake-lock`.";

export class TermuxUpdateError extends Schema.TaggedError<TermuxUpdateError>()(
  "TermuxUpdateError",
  { detail: Schema.String },
) {
  override get message(): string {
    return `Could not update ${PACKAGE_NAME}: ${this.detail}`;
  }
}

export class TermuxAgentInstallError extends Schema.TaggedError<TermuxAgentInstallError>()(
  "TermuxAgentInstallError",
  { agent: Schema.String, detail: Schema.String },
) {
  override get message(): string {
    return `Could not install ${this.agent}: ${this.detail}`;
  }
}

/** Runs a command attached to this terminal, so the user sees its output and answers its prompts. */
const runAttached = Effect.fn("termux.runAttached")(function* (
  command: string,
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* spawner.exitCode(
    ChildProcess.make(command, args, { stdin: "inherit", stdout: "inherit", stderr: "inherit" }),
  );
});

const updateCommand = Command.make("update", {
  version: Argument.String("version").pipe(
    Argument.withDescription("Exact version to install. Defaults to the latest release."),
    Argument.optional,
  ),
}).pipe(
  Command.withDescription(`Install a newer ${PACKAGE_NAME} with npm.`),
  Command.withHandler(({ version }) =>
    Effect.gen(function* () {
      const spec = `${PACKAGE_NAME}@${Option.getOrElse(version, () => "latest")}`;
      const exitCode = yield* runAttached("npm", ["install", "--global", spec]).pipe(
        Effect.mapError((cause) => new TermuxUpdateError({ detail: String(cause) })),
      );
      if (exitCode !== 0) {
        return yield* new TermuxUpdateError({ detail: `npm exited with ${exitCode}` });
      }
      yield* Console.log("Updated. Restart `t3 serve` to use the new version.");
    }),
  ),
);

const agentsInstallCommand = Command.make("install", {
  harness: Argument.ChoiceWithValue(
    "name",
    TERMUX_HARNESSES.map((harness) => [harness.name, harness] as const),
  ),
}).pipe(
  Command.withDescription("Install an agent harness that works in Termux."),
  Command.withHandler(({ harness }) =>
    Effect.gen(function* () {
      const exitCode = yield* runAttached("sh", ["-c", harness.install]).pipe(
        Effect.mapError(
          (cause) => new TermuxAgentInstallError({ agent: harness.label, detail: String(cause) }),
        ),
      );
      if (exitCode !== 0) {
        return yield* new TermuxAgentInstallError({
          agent: harness.label,
          detail: `the installer exited with ${exitCode}`,
        });
      }
      yield* Console.log(
        `Installed ${harness.label}. Refresh providers in T3 Code settings to use it.`,
      );
    }),
  ),
);

const agentsListCommand = Command.make("list").pipe(
  Command.withDescription("List the agent harnesses you can install, and where each one is."),
  Command.withHandler(() =>
    Effect.forEach(
      TERMUX_HARNESSES,
      (harness) =>
        resolveCommandPath(harness.command).pipe(
          Effect.flatMap((path) =>
            Console.log(`${harness.name.padEnd(8)}${path ?? "not installed"}`),
          ),
        ),
      { discard: true },
    ),
  ),
);

const agentsCommand = Command.make("agents").pipe(
  Command.withDescription("Install agent harnesses in Termux."),
  Command.withSubcommands([agentsInstallCommand, agentsListCommand]),
);

/** Accepts any arguments and prints how to do the same thing in Termux. */
const noticeCommand = (name: string, notice: string) =>
  Command.make(name, { args: Argument.String("args").pipe(Argument.variadic) }).pipe(
    Command.withDescription(notice),
    Command.withHandler(() => Console.log(notice)),
  );

export const termuxCommands = {
  update: updateCommand,
  agents: agentsCommand,
  up: noticeCommand("up", KEEP_RUNNING_HINT),
  service: noticeCommand("service", KEEP_RUNNING_HINT),
  install: noticeCommand(
    "install",
    `npm already installed the \`t3\` command. Update it with \`t3 update\`.`,
  ),
  uninstall: noticeCommand(
    "uninstall",
    `Remove T3 Code with \`npm uninstall --global ${PACKAGE_NAME}\`. Your projects and threads stay in ~/.t3.`,
  ),
};
