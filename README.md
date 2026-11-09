# DSH CodeBuddy CLI Connect

[English](./README.en.md) | 中文

复用 CodeBuddy CLI（CodeBuddy Code）的登录态，把 CodeBuddy 包含的各种模型（GLM-5.3、GLM-5.2、DeepSeek-V4-Pro、DeepSeek-V4-Flash、Kimi-K3、MiniMax-M3、Hy3 等）自动接入 DeepSeek Harness，实现在 DSH 对话窗口里零配置使用。

## 功能

- **开箱即用**：只要在本机用 CodeBuddy CLI 登录过一次，安装并启用插件后即可在 DSH 中直接使用，无需额外配置。
- **登录跟随**：插件读取 CodeBuddy CLI 自己的认证文件（`CodeBuddyExtension/Data/Public/auth/Tencent-Cloud.coding-copilot.info`），在 CLI 里重新登录后自动跟随；同一目录里其他产品的 `.info` 文件（如桌面 IDE）会按 `lastLogin` 标记与文件新旧排序兜底。
- **多账号管理**：设置 → 插件 → DSH CodeBuddy CLI Connect 卡片的「账号管理」分区支持通过 **OAuth 扫码/链接登录**添加多个 CodeBuddy 账号。每个通过 OAuth 添加的账号凭证保存在 `$DSH_HOME/.codebuddy-cli-accounts.json`（可从卡片自由切换、删除）；无主动添加的账号时保持原行为（跟随 CLI 登录态）。
- **粘贴 Token 添加账号**：同一分区还提供「粘贴 Token 添加」入口，直接贴 `refresh_token` 即可加入一个身份，无需扫码。**`refresh_token` 是必填项**——它是长期凭证且能换出新的访问令牌，而 `access_token` 只有固定寿命、无法反向续期，因此填它是可选的（填了能省一次刷新）。卡片会自动从 Token 里解析出 `uid` 与昵称，并在「登录区域」选择国内 / 国际站点。提交后插件**先向上游验证再落库**：验证不通过不会写入任何内容，失败原因就地显示，已粘贴的内容保留以便修改。验证成功时插件会把上游**轮换后的新令牌对**写入存储（而不是存回粘贴的旧值），避免在服务端留下一个本插件无法跟踪的长期有效凭证。验证通过后插件会**顺带读取一次积分**并随结果返回，同时写入按账号的积分缓存，因此新卡片**立刻显示余额与积分包**，不需要等下一轮轮询；积分读取失败不会影响导入本身（账号已确认可用，余额稍后补齐）。
- **账号切换**：设置卡片「账号管理」分区列出全部已存账号，当前生效的标「当前」；点击「启用」即切换，切换后插件立即用新账号出模型、拉积分、签到。
- **图片输入**：大部分模型支持发图，在对话里直接粘贴或拖入图片即可；少数只支持文字的模型（如 GLM-5.1）会明确提示不支持。
- **思考强度**：模型选择器里可为支持的模型切换思考强度，选项严格等于该模型声明的档位清单，例如 GLM-5.3 可选 low / high / xhigh，GLM-5.3-Flash 可选 low / high / max。选择器里**不会出现 `off`**：CodeBuddy 的档位只有 low…max，没有 "关闭思考" 这个线上取值；不选（即 Default）时插件不发送该字段，由模型使用自己的默认档位。没有声明档位清单的旧式模型按上游接受的完整档位提供。
- **三个配置入口**：插件装好后可从三处进入配置，任一处都可用——①侧边栏「CodeBuddy CLI」行（点开在主区域渲染完整配置页）；②「插件」页里本插件卡片下的配置区；③设置 → 插件 → CodeBuddy CLI。第三处依赖宿主声明 `settings.plugins.tab`，而该槽的声明方 `ui-settings-plugins` 可以被第三方 bundle 关闭（部分合集包确实这么做了）；一旦被关，前两处仍在，因为侧栏行与主面板分别由宿主的 `ui-sidebar` / `ui-layout` 声明，不受影响。
- **积分倍率与徽章**：模型名后直接显示积分倍率（如 `GLM-5.2 · x0.79`）与促销徽章（限时免费、夜间折扣），以服务端数据为准，每次启动 DSH 时同步。倍率只是显示，不影响实际请求。
- **对话内积分条**：输入框正下方（统计条旁）显示一行，默认由「剩余积分 + Provider 名」组成（如 `积分 1,642 · Provider CodeBuddy`），点击弹出明细面板，可查看合计积分、各套餐剩余进度与当前模型倍率，支持手动刷新。显示哪些段落可在「可选模型」页顶部「输入框积分条」里逐项勾选：**剩余积分**、**Provider 名**（默认都开）、**模型名**、**每次调用积分倍率**（默认都关）。默认勾选 Provider 名，是因为模型选择器只显示模型、不显示它来自哪个 Provider。模型名与倍率默认关闭，是因为它们在选择器里已经显示，再重复一遍会把同一行的会话统计（轮次、token）挤成省略号。勾选只是「允许显示」：通用模型目录没有倍率字段时不会臆造倍率，选到别的 Provider 时也不会显示 CodeBuddy 的积分。加载中 / 未登录 / 积分查询失败各有独立文案，整行不会塌陷。切到其它 provider（如 llm-pi-ai）时默认显示 `Provider llm-pi-ai`，可用「切换到其它 provider 时也显示这一行」开关整体关闭（**默认开启**，即保持显示）（[#6](https://github.com/fu827707013/dsh-codebuddy-cli/issues/6)、[#14](https://github.com/fu827707013/dsh-codebuddy-cli/issues/14)）。
- **每日签到**：设置 → 插件 → DSH CodeBuddy CLI Connect 卡片的「账号」行提供「签到」按钮，点击即调用 CodeBuddy 每日签到接口领取积分，结果显示在按钮旁：签到成功 / 今天已签到 / 失败原因。仅中国大陆 CodeBuddy 账号支持（workbuddy.ai 全球账号返回不支持）；签到复用插件本地登录态，浏览器端不接触令牌。
- **信息查看**：设置 → 插件 → DSH CodeBuddy CLI Connect 卡片，可查看账号信息、令牌有效期、剩余积分，以及当前有优惠的模型。卡片正文分为「账号管理」「可选模型」「积分统计」「剩余积分」四个分区，账号信息常驻顶部，其余分区按需展开。
- **可选模型**：同一张设置卡片里可勾选要在模型选择器中出现的模型（配置项 `enabledModels`）。CodeBuddy 的模型有 15 个以上，默认全部列出会把选择器塞满；勾掉不常用的即可让选择器只留下自己要用的几个。未勾选的模型只是不再被"推荐"，已经选定它的会话、agent 预设仍可继续使用，不会中断；不勾任何模型等同于提供全部模型。

## 安装

前置：已安装 CodeBuddy CLI 并登录（插件复用 CLI 的登录状态，重新登录自动跟随）。

本插件面向 **DSH `0.2.1-rc.2` 及以上**（`<0.3.0`）。

`0.4.0` 起只支持这一代宿主：DSH `0.2.1` 移除了两代设置安装器（`installSettingsSection` / `settings.installSection`），改为依据插件 Loader 入口的 Config schema 推导托管表单，并把 `settings.plugins.tab` 插槽的类型声明挪到了 settings shell；`SettingsForms` 服务也新增了 `configEditor` / `profileContext` 两个必需注入。插件已按这套约定重写，并通过 `engines.dsh` 声明适用的宿主范围。

**仍在使用 DSH `0.1.x` 的用户请安装 `0.3.0`**（`npm i dsh-codebuddy-cli@0.3.0`）：那一版内置三代宿主兼容层，可在 `0.1.2`、`0.1.5`、`0.1.7+` 上运行。新版本不再向下兼容旧宿主，反之亦然。

`0.4.7` 起移除了最后两处对旧宿主的死兼容：pre-0.1.7 的 `settings.plugin.item` 插槽别名注册，以及其配套的 `as never` 类型豁免。这两个名字在 `0.2.1-rc.2` 以上的宿主里既没有声明也没有渲染点，保留它们只会让注册表多一条永远不会被调用的条目。若你的 DSH 版本低于该范围，请按上一段安装 `0.3.0`。

`0.4.9` 新增侧边栏入口，解决"设置卡片在某些部署里彻底不渲染"（[#17](https://github.com/fu827707013/dsh-codebuddy-cli/issues/17)）：点侧栏的「CodeBuddy CLI」行，配置页直接在主区域打开。这条入口特意选了宿主自己声明的两个槽（`sidebar.panellist` 由 `ui-sidebar` 声明、`main` 由 `ui-layout` 声明），不使用可被第三方 bundle 关闭的 `ui-settings-plugins`——在那类部署上，原有的设置卡片与插件页配置区会一起消失且不报错。三个入口并列保留，互不冲突。

`0.4.8` 修掉了一个会让请求直接失败的思考强度缺陷：`off` 曾被映射成字符串 `'off'`，而 pi-ai 会把映射表里的字符串原样发送，于是**不选思考强度（Default）时**实际发出了 `reasoning_effort: "off"`。CodeBuddy 的档位只有 `low/medium/high/xhigh/max`，收到 `"off"` 就返回 `code 11150`，整轮对话失败。现在 `off` 恒为 `null`（即不发送该字段，由模型使用自己的默认档位），选择器里也不再出现 `off`。同一版还增加了转发前的兜底：任何不在上游词表内的 `reasoning_effort` 都会被丢弃，避免将来退化成一整轮报错。

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

**手动更新**到最新版（`update` 会把 `package.json` 里的版本范围刷新到最新并重装）：

```sh
# Web
dsh plugin --profile web update dsh-codebuddy-cli
dsh web

# Desktop
dsh plugin --profile desktop update dsh-codebuddy-cli
dsh --profile desktop
```

更新后需要重启对应入口（`dsh web` / DSH Desktop）让新模块生效；设置卡片显示的版本号变化即代表更新成功。

安装后，在对应界面的模型选择器里切换到 CodeBuddy 模型即可使用；Web 下设置卡片可查看账号信息、令牌有效期与剩余积分，TUI 下可在 `/settings` 里配置 `authFile`。

> **TUI 用户暂缓安装**：终端界面插件在 DSH 0.1.2 上的适配尚未完成，同类插件实测在 TUI 下安装会导致 DSH 启动崩溃（报 `events is not iterable`）。建议 TUI 用户等终端界面插件发布适配版本后再安装本插件。本插件已在 **Web** 与 **Desktop** profile 下验证；TUI 未做验证。
>
> 从 **0.4.5** 起，Desktop 桌面版的写操作（添加/切换/删除账号、保存模型选择、签到、读取积分统计）已可用。此前版本在桌面版保存配置会报 `403 {"error":"origin-required"}`，原因是桌面版转发请求时会移除 `Origin` 头。

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

- 在 **Windows** 的 DSH Web profile（`0.2.1-rc.2`、Node 22+）下验证通过；macOS / Linux 走同样的目录探测逻辑但未做实测。WSL 需保证 Windows 环境变量可见，否则请用 `CODEBUDDY_CLI_AUTH_FILE` 指定实际位置。
- 依赖 CodeBuddy CLI 的客户端接口（非官方开放 API），CLI 更新后插件可能需要随之调整。
- 模型清单以每次启动 DSH 时拉取的服务端数据为准；拉取失败时回退到内置的静态清单（15 个模型），保证首次进入即可选模型。
- 粘贴 Token 添加账号**不适用于**密码登录与企业 SSO：这两种方式都必须走浏览器交互，Token 无法替代。同时，若服务端已把该会话标记为失效（返回 `12153 Offline user session not found`），则 `access_token` 与 `refresh_token` 会一起失效，只能重新登录后再粘贴。
- 粘贴的 Token 以明文保存在本机 `$DSH_HOME/.codebuddy-cli-accounts.json`（权限 `600`），请勿把该文件提交到版本库或分享给他人；使用他人的 Token 会消耗对方账号的额度。
- 上游在每次刷新时**轮换 `refresh_token`，且旧值在服务端仍保持有效**。因此若同一个 `refresh_token` 被多个客户端（例如另一个脚本或另一台机器）同时使用，各方各自轮换出的新值互不知情，会持续互相作废。请确保一个账号的 Token 只被一处使用。


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
