# DSH CodeBuddy CLI Connect

[中文](./README.md) | English

Reuse the CodeBuddy CLI (CodeBuddy Code) sign-in to bring its models (GLM-5.3, GLM-5.2, DeepSeek-V4-Pro, DeepSeek-V4-Flash, Kimi-K3, MiniMax-M3, Hy3, and more) into DeepSeek Harness — zero configuration, ready out of the box.

## Features

- **Zero configuration**: sign in once with the CodeBuddy CLI, install the plugin, and the models appear in DSH.
- **Follows re-login**: the plugin reads the CLI's own auth file (`CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info`); signing in again in the CLI is picked up automatically. Other products' `.info` files in the same directory (e.g. the desktop IDE) rank as fallbacks by the `lastLogin` flag and file recency.
- **Image input**: most models accept images — paste or drag one into the conversation; text-only models report clearly that they do not support images.
- **Thinking effort**: supported models expose a thinking-level selector (GLM-5.3 offers low / high / xhigh, GLM-5.3-Flash offers low / high / max); models without the selector use the upstream default.
- **Credits and badges**: the billing multiplier (e.g. `GLM-5.2 · x0.79`) and promo badges ride the model name, synced from the server on every DSH start.
- **Status card**: Settings → Plugins → DSH CodeBuddy CLI Connect shows the account, token expiry, and remaining credit.

## Install

Prerequisite: the CodeBuddy CLI is installed and signed in (the plugin reuses that sign-in).

- DSH `0.1.2-rc.1` and above: `dsh plugin --profile web add dsh-codebuddy-cli`
- From source: `dsh plugin --profile web add github:<you>/dsh-codebuddy-cli`

The plugin runs under all three DSH profiles — **Web**, **Desktop**, **TUI**:

```sh
# Web (recommended, ships prebuilt artifacts)
dsh plugin --profile web add dsh-codebuddy-cli
dsh web

# Desktop
dsh plugin --profile desktop add dsh-codebuddy-cli
dsh --profile desktop

# TUI
dsh plugin --profile dsh-tui add dsh-codebuddy-cli
dsh --profile dsh-tui
```

## Auth-file location

The plugin discovers the CodeBuddy CLI sign-in in this order:

1. the plugin's configured `authFile` path (editable in the settings card / `/settings`);
2. the `CODEBUDDY_CLI_AUTH_FILE` environment variable;
3. the platform default auth directory (scanning every `*.info` file: the CLI's own `Tencent-Cloud.coding-copilot.info` first, then files whose account carries `lastLogin: true`, then the most recently written):
   - Windows: `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\` (falls back to `%APPDATA%`)
   - macOS: `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`
   - Linux: `~/.config/CodeBuddyExtension/Data/Public/auth/`
   - WSL: the mounted Windows profile first

Token refreshes are stored in `$DSH_HOME/.codebuddy-cli-auth.json`; the CLI's own auth file is **never written** — whichever side holds the fresher token wins.

## Command line

`dsh plugin --profile <web|desktop|dsh-tui> exec dsh-codebuddy-cli status` — sign-in state and remaining credit (`--json` for machine-readable output; `doctor` diagnostics and `logout` to clear the plugin-owned copy are also available).

## Known limitations

- Verified on the Windows DSH Web profile (`0.1.2-rc.1`+, Node 22+). Under WSL the Windows environment variables must be visible, or set `CODEBUDDY_CLI_AUTH_FILE` explicitly.
- Relies on the CodeBuddy CLI's client interface (not an official open API); CLI updates may require plugin adjustments.

## Disclaimer

- This project is **for personal learning and research only**. It drives the user's own CodeBuddy account on their own machine; do not use it commercially or beyond reasonable personal use.
- Users must comply with CodeBuddy's terms of service; any consequences (account restrictions, quota resets, service interruptions) are the user's own responsibility.
- The author is not liable for any direct or indirect losses caused by using or misusing this project.
- This project is not affiliated with, endorsed by, or connected to Tencent, CodeBuddy, or DeepSeek; names mentioned only describe compatibility and belong to their respective owners.

## Acknowledgments

- [dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect) (MIT) — the reference for the upstream protocol implementation, DSH plugin structure, and provider registration.
- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api) (MIT) — the original reference implementation of the upstream protocol.

## License

[MIT](./LICENSE)
