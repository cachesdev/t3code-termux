# t3code-termux

Unofficial build of the [T3 Code](https://github.com/pingdotgg/t3code) server for [Termux](https://termux.dev) on Android. Pair the T3 Code mobile app or a browser to your phone, and agents work directly on the phone's files with the tools you installed in Termux.

The T3 Code team does not publish or support this package. Report problems at [cachesdev/t3code](https://github.com/cachesdev/t3code/issues).

## Requirements

- An arm64 Android phone with Termux from [F-Droid](https://f-droid.org/packages/com.termux/) or [GitHub](https://github.com/termux/termux-app/releases).
- Node 24 or newer: `pkg install nodejs`.
- An agent CLI in Termux, such as Claude Code.

## Install

```sh
npm install --global t3code-termux
```

To try it without installing, run `npx t3code-termux serve --lan`.

## Run

```sh
termux-wake-lock
t3 serve --lan
```

The server prints a QR code. Scan it with the T3 Code mobile app to pair. `termux-wake-lock` keeps Android from stopping Termux while the screen is off.

`--lan` accepts connections from your local network and your tailnet. To reach the phone from anywhere, install the Tailscale app on the phone and on the other device.

Projects can use any folder Termux can read. Run `termux-setup-storage` once to reach shared storage at `~/storage/shared`.

T3 Code starts agents from your Termux `PATH`, so it uses the same `claude` you run in the terminal.

## Update

```sh
t3 update
```

Then restart `t3 serve`.

## Differences from the official build

- The preview browser, speech-to-text and resource monitor are not available on Android.
- `t3 up` and `t3 service` are not available. Run `t3 serve --lan` in Termux instead.
- T3 account sign-in and T3 Connect are not available. Pair over your local network or Tailscale.
