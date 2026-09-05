# DSH CodeBuddy CLI Connect

[中文](./README.md) | English

Reuse the CodeBuddy CLI (CodeBuddy Code) sign-in to bring its models (GLM-5.3, GLM-5.2, DeepSeek-V4-Pro, DeepSeek-V4-Flash, Kimi-K3, MiniMax-M3, Hy3, and more) into DeepSeek Harness — zero configuration, ready out of the box.

## Features

- **Zero configuration**: sign in once with the CodeBuddy CLI, install the plugin, and the models appear in DSH.
- **Follows re-login**: the plugin reads the CLI's own auth file (`CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info`); signing in again in the CLI is picked up automatically. Other products' `.info` files in the same directory (e.g. the desktop IDE) rank as fallbacks by the `lastLogin` flag and file recency.
- **Image input**: most models accept images — paste or drag one into the conversation; text-only models (e.g. GLM-5.1) report clearly that they do not support images.
- **Thinking effort**: supported models expose a thinking-level selector (GLM-5.3 offers off / low / high / xhigh, GLM-5.3-Flash offers off / low / high / max). The control appears only for models whose upstream catalog declares an effort list; models without the selector use the upstream default.
- **Credits and badges**: the billing multiplier (e.g. `GLM-5.2 · x0.79`) and promo badges ride the model name, synced from the server on every DSH start. Display only — it never affects the request that is sent.
- **In-chat credit line**: a compact credit figure lives right below the composer box (next to the session stats strip), e.g. `Credits 1.2K`, with the selected CodeBuddy model's billing rate appended when applicable (e.g. `Credits 1.2K · x0.79`). Click it for a details panel: total credit, per-package progress rows, the current model's rate, and a manual refresh. The line hides itself for sessions on non-CodeBuddy models.
- **Status card**: Settings → Plugins → DSH CodeBuddy CLI Connect shows the account, token expiry, remaining credit, and the models currently on a promo.
- **Available models**: the same settings card lets you check which models the model pickers offer (setting `enabledModels`). CodeBuddy ships 15+ models and listing all of them fills the picker; uncheck the ones you do not use and only your own shortlist remains. Unchecking only stops a model from being *offered* — sessions and agent presets already pinned to it keep working — and checking nothing is the same as offering everything.

## Install

Prerequisite: the CodeBuddy CLI is installed and signed in (the plugin reuses that sign-in).

This plugin targets **DSH `0.1.2-rc.1` and above** and is not compatible with older cores (e.g. `0.1.1-rc.2`).

```sh
# Web (recommended, ships prebuilt artifacts)
dsh plugin --profile web add dsh-codebuddy-cli
dsh web

# Or install from GitHub source
dsh plugin --profile web add github:fu827707013/dsh-codebuddy-cli
dsh web

# Desktop
dsh plugin --profile desktop add dsh-codebuddy-cli
dsh --profile desktop
```

After installing, switch to a CodeBuddy model in that interface's model picker. Under Web the settings card shows the account, token expiry, and remaining credit; under TUI the `authFile` path is configurable in `/settings`.

> **TUI users: hold off for now.** The terminal interface plugin is not yet adapted to DSH 0.1.2, and a comparable plugin was measured to crash DSH on startup under TUI (`events is not iterable`). Wait for an adapted release of the terminal interface plugin before installing this one. The plugin is fully verified on the **Web** profile; Desktop and TUI are unverified.

## Auth-file location

The plugin discovers the CodeBuddy CLI sign-in in this order:

1. the plugin's configured `authFile` path (editable in the Web settings card / `/settings`);
2. the `CODEBUDDY_CLI_AUTH_FILE` environment variable;
3. the platform default auth directory (scanning every `*.info` file: the CLI's own `Tencent-Cloud.coding-copilot.info` first, then files whose account carries `lastLogin: true`, then the most recently written):
   - Windows: `%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\` (falls back to `%APPDATA%`)
   - macOS: `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`
   - Linux: `~/.config/CodeBuddyExtension/Data/Public/auth/`
   - WSL: the mounted Windows profile first

Token refreshes are stored in `$DSH_HOME/.codebuddy-cli-auth.json`; the CLI's own auth file is **never written** — whichever side holds the fresher token wins.

## Command line

```sh
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-codebuddy-cli status          # sign-in state and remaining credit
dsh plugin --profile web exec dsh-codebuddy-cli status --json                     # machine-readable output
dsh plugin --profile web exec dsh-codebuddy-cli doctor                            # secret-free environment diagnostics
dsh plugin --profile web exec dsh-codebuddy-cli logout                            # clear the plugin-owned credential copy
```

`doctor` also reports whether the auth file was found and whether the host bundle process is alive (pid), and prints a hint for the next step. `logout` removes only the plugin's own copy; the CodeBuddy CLI keeps its sign-in.

## Known limitations

- Verified on the **Windows** DSH Web profile (`0.1.2-rc.1`+, Node 22+); macOS and Linux follow the same directory-probing logic but are untested. Under WSL the Windows environment variables must be visible, or set `CODEBUDDY_CLI_AUTH_FILE` explicitly.
- Relies on the CodeBuddy CLI's client interface (not an official open API); CLI updates may require plugin adjustments.
- The model list comes from the server and is refreshed on every DSH start; if that fetch fails the plugin falls back to its built-in static list (15 models) so models are selectable from the first launch.

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
