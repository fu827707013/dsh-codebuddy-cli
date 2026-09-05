# DSH CodeBuddy CLI Connect

[English](./README.en.md) | 中文

复用 CodeBuddy CLI（CodeBuddy Code）的登录态，把 CodeBuddy 包含的各种模型（GLM-5.3、GLM-5.2、DeepSeek-V4-Pro、DeepSeek-V4-Flash、Kimi-K3、MiniMax-M3、Hy3 等）自动接入 DeepSeek Harness，实现在 DSH 对话窗口里零配置使用。

## 功能

- **开箱即用**：只要在本机用 CodeBuddy CLI 登录过一次，安装并启用插件后即可在 DSH 中直接使用，无需额外配置。
- **登录跟随**：插件读取 CodeBuddy CLI 自己的认证文件（`CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info`），在 CLI 里重新登录后自动跟随；同一目录里其他产品的 `.info` 文件（如桌面 IDE）会按 `lastLogin` 标记与文件新旧排序兜底。
- **图片输入**：大部分模型支持发图，在对话里直接粘贴或拖入图片即可；少数只支持文字的模型会明确提示不支持。
- **思考强度**：模型选择器里可为支持的模型切换思考强度，例如 GLM-5.3 可选 low / high / xhigh，GLM-5.3-Flash 可选 low / high / max；没有出现选项的模型使用上游默认档位。
- **积分倍率与徽章**：模型名后直接显示积分倍率（如 `GLM-5.2 · x0.79`）与促销徽章（限时免费、夜间折扣），以服务端数据为准，每次启动 DSH 时同步。
- **信息查看**：设置 → 插件 → DSH CodeBuddy CLI Connect 卡片，可查看账号信息、令牌有效期与剩余积分。

## 安装

前置：已安装 CodeBuddy CLI 并登录（插件复用 CLI 的登录状态，重新登录自动跟随）。

- DSH `0.1.2-rc.1` 及以上：`dsh plugin --profile web add dsh-codebuddy-cli`
- 从源码安装：`dsh plugin --profile web add github:<you>/dsh-codebuddy-cli`

插件在三种 DSH 界面下均可运行：**Web**、**Desktop**、**TUI**，按 profile 选对应命令安装：

```sh
# Web（推荐，自带预构建产物）
dsh plugin --profile web add dsh-codebuddy-cli
dsh web

# Desktop（DSH Desktop 桌面版）
dsh plugin --profile desktop add dsh-codebuddy-cli
dsh --profile desktop

# TUI（终端界面）
dsh plugin --profile dsh-tui add dsh-codebuddy-cli
dsh --profile dsh-tui
```

安装后，在对应界面的模型选择器里切换到 CodeBuddy 模型即可使用；Web 下设置卡片可查看账号信息、令牌有效期与剩余积分，TUI 下可在 `/settings` 里配置 `authFile`。

## 认证文件位置

插件按以下顺序发现 CodeBuddy CLI 的登录态：

1. 插件设置里配置的 `authFile` 路径（TUI/Web 设置卡片可改）；
2. 环境变量 `CODEBUDDY_CLI_AUTH_FILE`；
3. 平台默认认证目录（扫描目录内所有 `*.info`，优先 `Tencent-Cloud.coding-copilot.info`，其次 `lastLogin` 账号，再次最新写入的文件）：
   - Windows：`%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\`（旧版回退 `%APPDATA%`）
   - macOS：`~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`
   - Linux：`~/.config/CodeBuddyExtension/Data/Public/auth/`
   - WSL：优先从挂载的 Windows 用户目录读取

插件的令牌刷新结果保存在 `$DSH_HOME/.codebuddy-cli-auth.json`，**从不改写** CLI 自己的认证文件；两边哪边令牌更新就用哪边。

## 命令行

`dsh plugin --profile <web|desktop|dsh-tui> exec dsh-codebuddy-cli status`：登录状态与剩余积分（`--json` 输出机器可读格式；另有 `doctor` 诊断、`logout` 清理插件侧凭据副本）。

## 已知限制

- 在 Windows 的 DSH Web profile（`0.1.2-rc.1`+、Node 22+）下验证通过；WSL 需保证 Windows 环境变量可见，否则请用 `CODEBUDDY_CLI_AUTH_FILE` 指定实际位置。
- 依赖 CodeBuddy CLI 的客户端接口（非官方开放 API），CLI 更新后插件可能需要随之调整。

## 免责声明

- 本项目**仅供个人学习和研究使用**，仅驱动使用者自己的 CodeBuddy 账号在本机调用，请勿用于商业用途或超出个人合理使用的场景。
- 使用者需遵守 CodeBuddy 的服务条款；因使用本项目产生的任何后果（包括但不限于账号被限制、额度被清空、服务中断），由使用者自行承担。
- 本项目作者不对任何因使用或滥用本项目产生的直接或间接损失负责。
- 本项目与腾讯、CodeBuddy、DeepSeek 均无关联，未获其授权或认可；文中出现的名称仅用于描述兼容关系，其商标权利归各自所有。

## 致谢

- [dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)（MIT）— 本插件的上游协议实现、DSH 插件结构与 provider 注册均以其为参照。
- [Sliverkiss/workbuddy2api](https://github.com/Sliverkiss/workbuddy2api)（MIT）— 上游协议的原始参照实现。

## 许可证

[MIT](./LICENSE)
