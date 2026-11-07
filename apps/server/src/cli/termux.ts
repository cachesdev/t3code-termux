// Commands for the t3code-termux npm package, which runs the server in Termux on Android.
// The desktop versions manage downloaded runtimes and system services that Android does not have.
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
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const exitCode = yield* spawner
        .exitCode(
          ChildProcess.make("npm", ["install", "--global", spec], {
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
          }),
        )
        .pipe(Effect.mapError((cause) => new TermuxUpdateError({ detail: String(cause) })));
      if (exitCode !== 0) {
        return yield* new TermuxUpdateError({ detail: `npm exited with ${exitCode}` });
      }
      yield* Console.log("Updated. Restart `t3 serve` to use the new version.");
    }),
  ),
);

/** Accepts any arguments and prints how to do the same thing in Termux. */
const noticeCommand = (name: string, notice: string) =>
  Command.make(name, { args: Argument.String("args").pipe(Argument.variadic) }).pipe(
    Command.withDescription(notice),
    Command.withHandler(() => Console.log(notice)),
  );

export const termuxCommands = {
  update: updateCommand,
  up: noticeCommand("up", KEEP_RUNNING_HINT),
  service: noticeCommand("service", KEEP_RUNNING_HINT),
  uninstall: noticeCommand(
    "uninstall",
    `Remove T3 Code with \`npm uninstall --global ${PACKAGE_NAME}\`. Your projects and threads stay in ~/.t3.`,
  ),
};
