# DSH CodeBuddy CLI Connect

[English](./README.en.md) | 中文

复用 CodeBuddy CLI（CodeBuddy Code）的登录态，把 CodeBuddy 包含的各种模型（GLM-5.3、GLM-5.2、DeepSeek-V4-Pro、DeepSeek-V4-Flash、Kimi-K3、MiniMax-M3、Hy3 等）自动接入 DeepSeek Harness，实现在 DSH 对话窗口里零配置使用。

## 功能

- **开箱即用**：只要在本机用 CodeBuddy CLI 登录过一次，安装并启用插件后即可在 DSH 中直接使用，无需额外配置。
- **登录跟随**：插件读取 CodeBuddy CLI 自己的认证文件（`CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info`），在 CLI 里重新登录后自动跟随；同一目录里其他产品的 `.info` 文件（如桌面 IDE）会按 `lastLogin` 标记与文件新旧排序兜底。
- **图片输入**：大部分模型支持发图，在对话里直接粘贴或拖入图片即可；少数只支持文字的模型（如 GLM-5.1）会明确提示不支持。
- **思考强度**：模型选择器里可为支持的模型切换思考强度，例如 GLM-5.3 可选 off / low / high / xhigh，GLM-5.3-Flash 可选 off / low / high / max。只有上游明确声明了档位清单的模型才会出现选项；没有出现选项的模型使用上游默认档位。
- **积分倍率与徽章**：模型名后直接显示积分倍率（如 `GLM-5.2 · x0.79`）与促销徽章（限时免费、夜间折扣），以服务端数据为准，每次启动 DSH 时同步。倍率只是显示，不影响实际请求。
- **对话内积分条**：输入框正下方（统计条旁）始终常驻一行，显示当前选择的 provider 与模型；使用 CodeBuddy 模型时前置剩余积分、并在目录已知倍率时附带倍率（如 `积分 1,642 · Provider CodeBuddy · Model GLM-5.3 · x0.79`），点击弹出明细面板，可查看合计积分、各套餐剩余进度与当前模型倍率，支持手动刷新。切换到其它 provider（如 llm-pi-ai）时该行不会消失，改为显示 `Provider llm-pi-ai · Model gpt-4o`——DSH 通用模型目录没有倍率字段，因此不臆造倍率，也不再请求积分。加载中 / 未登录 / 积分查询失败各有独立文案，整行不会塌陷。
- **信息查看**：设置 → 插件 → DSH CodeBuddy CLI Connect 卡片，可查看账号信息、令牌有效期、剩余积分，以及当前有优惠的模型。卡片正文分为「可选模型」「剩余积分」「模型优惠」三个可折叠分区，默认收起，只留账号常开；分区标题旁常显摘要（已启用模型数、积分合计、优惠数量），积分合计不展开也能直接看到。
- **可选模型**：同一张设置卡片里可勾选要在模型选择器中出现的模型（配置项 `enabledModels`）。CodeBuddy 的模型有 15 个以上，默认全部列出会把选择器塞满；勾掉不常用的即可让选择器只留下自己要用的几个。未勾选的模型只是不再被"推荐"，已经选定它的会话、agent 预设仍可继续使用，不会中断；不勾任何模型等同于提供全部模型。

## 安装

前置：已安装 CodeBuddy CLI 并登录（插件复用 CLI 的登录状态，重新登录自动跟随）。

本插件面向 **DSH `0.1.2-rc.1` 及以上**，与旧版核心（如 `0.1.1-rc.2`）不兼容。

```sh
# Web（推荐，自带预构建产物）
dsh plugin --profile web add dsh-codebuddy-cli
dsh web

# 或从 GitHub 源码安装
dsh plugin --profile web add github:fu827707013/dsh-codebuddy-cli
dsh web

# Desktop（DSH Desktop 桌面版）
dsh plugin --profile desktop add dsh-codebuddy-cli
dsh --profile desktop
```

安装后，在对应界面的模型选择器里切换到 CodeBuddy 模型即可使用；Web 下设置卡片可查看账号信息、令牌有效期与剩余积分，TUI 下可在 `/settings` 里配置 `authFile`。

> **TUI 用户暂缓安装**：终端界面插件在 DSH 0.1.2 上的适配尚未完成，同类插件实测在 TUI 下安装会导致 DSH 启动崩溃（报 `events is not iterable`）。建议 TUI 用户等终端界面插件发布适配版本后再安装本插件。本插件已在 **Web** profile 下完整验证；Desktop 与 TUI 未做验证。

## 认证文件位置

插件按以下顺序发现 CodeBuddy CLI 的登录态：

1. 插件设置里配置的 `authFile` 路径（Web 设置卡片、`/settings` 可改）；
2. 环境变量 `CODEBUDDY_CLI_AUTH_FILE`；
3. 平台默认认证目录（扫描目录内所有 `*.info`，优先 `Tencent-Cloud.coding-copilot.info`，其次 `lastLogin` 账号，再次最新写入的文件）：
   - Windows：`%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\`（旧版回退 `%APPDATA%`）
   - macOS：`~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`
   - Linux：`~/.config/CodeBuddyExtension/Data/Public/auth/`
   - WSL：优先从挂载的 Windows 用户目录读取

插件的令牌刷新结果保存在 `$DSH_HOME/.codebuddy-cli-auth.json`，**从不改写** CLI 自己的认证文件；两边哪边令牌更新就用哪边。

## 命令行

```sh
dsh plugin --profile <web|desktop|dsh-tui> exec dsh-codebuddy-cli status          # 登录状态与剩余积分
dsh plugin --profile web exec dsh-codebuddy-cli status --json                     # 机器可读输出
dsh plugin --profile web exec dsh-codebuddy-cli doctor                            # 无密钥的环境诊断
dsh plugin --profile web exec dsh-codebuddy-cli logout                            # 清除插件侧凭据副本
```

`doctor` 会一并报告认证文件是否存在、宿主 bundle 进程是否存活（pid），并给出下一步提示；`logout` 只删除插件自己的凭据副本，CodeBuddy CLI 的登录态不受影响。

## 已知限制

- 在 **Windows** 的 DSH Web profile（`0.1.2-rc.1`+、Node 22+）下验证通过；macOS / Linux 走同样的目录探测逻辑但未做实测。WSL 需保证 Windows 环境变量可见，否则请用 `CODEBUDDY_CLI_AUTH_FILE` 指定实际位置。
- 依赖 CodeBuddy CLI 的客户端接口（非官方开放 API），CLI 更新后插件可能需要随之调整。
- 模型清单以每次启动 DSH 时拉取的服务端数据为准；拉取失败时回退到内置的静态清单（15 个模型），保证首次进入即可选模型。

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
