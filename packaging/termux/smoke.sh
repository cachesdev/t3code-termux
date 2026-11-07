#!/data/data/com.termux/files/usr/bin/bash
# Installs a packed t3code-termux tarball globally and checks that it runs.
#
#   bash smoke.sh <tarball>

set -euo pipefail

npm install --global --no-audit --no-fund "$(realpath "$1")"
t3 --version
root="$(npm root --global)/t3code-termux"

echo "Checking the terminal and file search native modules"
node --input-type=module - "$root" <<'EOF'
import { createRequire } from "node:module";

const root = process.argv[2];
const require = createRequire(`${root}/package.json`);

const pty = require("node-pty");
const output = await new Promise((resolve) => {
  let text = "";
  const shell = pty.spawn("sh", ["-c", "echo pty-ok"], { cols: 80, rows: 24 });
  shell.onData((data) => (text += data));
  shell.onExit(() => resolve(text));
});
if (!output.includes("pty-ok")) throw new Error(`node-pty printed: ${output}`);

const { FileFinder } = require("@ff-labs/fff-node");
const created = FileFinder.create({ basePath: root, aiMode: false });
if (!created.ok) throw new Error(`fff: ${created.error}`);
const ready = await created.value.waitForIndexReady(15_000);
if (!ready.ok) throw new Error(`fff: ${ready.error}`);
const found = created.value.fileSearch("bin.mjs", { pageSize: 5 });
if (!found.ok || found.value.items.length === 0) throw new Error("fff found no files");
created.value.destroy();
console.log("node-pty and fff work");
EOF

echo "Starting the server"
work="$(mktemp -d)"
log="$work/serve.log"
(cd "$work" && exec t3 serve --port 3773 > "$log" 2>&1) &
server_pid=$!
trap 'kill "$server_pid" 2> /dev/null || true' EXIT

for _ in $(seq 60); do
  if grep -q "T3 Code server is ready" "$log"; then break; fi
  if ! kill -0 "$server_pid" 2> /dev/null; then cat "$log"; exit 1; fi
  sleep 1
done

status="$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3773/)"
if [[ "$status" != 200 ]]; then
  cat "$log"
  echo "Server returned HTTP $status" >&2
  exit 1
fi
echo "Server is up and serves the web app"
