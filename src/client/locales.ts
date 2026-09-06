/** Plugin-card copy registered under the settings.codebuddy-cli locale namespace. */

export const en = {
  title: 'DSH CodeBuddy CLI Connect',
  intro: 'Use the models included in the CodeBuddy CLI directly in DSH — zero configuration, ready out of the box.',
  expand: 'Expand',
  collapse: 'Collapse',
  loading: 'Loading account…',
  signedOut: 'Not signed in',
  signedOutHint: 'Run the CodeBuddy CLI once and sign in; this plugin follows that sign-in automatically.',
  signedInAs: 'Signed in as {nickname}',
  accessTokenExpires: 'Access token expires {time} (refresh is automatic)',
  creditsHeading: 'Remaining credit',
  creditsTotal: 'Total: {total}',
  percentRemaining: '{percent}% remaining',
  exactRemaining: '{remain} / {size} remaining',
  creditPackageUnknownSize: '{remain} remaining',
  creditsError: 'Credit unavailable: {message}',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  requestFailed: 'Request failed',
  accountHeading: 'Account',
  modelsHeading: 'Model offers',
  modelsOnPromo: '{count} on promo',
  freeModel: 'Free',
  badgeLimitedFree: 'Limited-time free',
  badgeNightDiscount: 'Night discount',
  rate: '{rate} credits per message',
  creditTotalCompact: 'Credits {total}',
  creditRate: '· {rate}',
  creditLoading: 'Credits …',
  creditSignedOut: 'Credits — not signed in',
  creditUnavailable: 'Credits unavailable',
  dockProvider: 'Provider {provider}',
  dockModel: 'Model {model}',
  dockNoModel: 'No model selected',
  creditPanelAria: 'CodeBuddy credit details',
  creditPackageRemain: '{remain} / {size}',
  creditModelFallback: 'Current model',
  creditEmpty: 'No remaining credit.',
  optionalModelsHeading: 'Available models',
  optionalModelsHint: 'Check the models to offer in the model pickers. Unchecked models stay usable in sessions already set to them.',
  optionalModelsAllHint: 'Every model is offered. Uncheck the ones you do not want in the picker.',
  optionalModelsCount: '{enabled} of {total} offered',
  optionalModelsSelectAll: 'Select all',
  optionalModelsClear: 'Clear',
  optionalModelsSave: 'Save',
  optionalModelsSaving: 'Saving…',
  optionalModelsSaved: 'Saved',
  optionalModelsReadOnly: 'This profile stores no settings, so the selection cannot be saved.',
  optionalModelsEmptyWarning: 'No model checked — saving this keeps every model offered.',
  optionalModelsSaveFailed: 'Could not save the selection: {message}',
} as const

/**
 * Keys of the composer credit dock (a strict subset of the card namespace).
 *
 * The dock renders for every provider, so this covers the provider/model
 * pieces too — not only the CodeBuddy credit wording.
 */
export type CodeBuddyCreditKey = Extract<
  keyof typeof en,
  | 'creditsHeading'
  | 'creditsError'
  | 'refresh'
  | 'requestFailed'
  | 'creditTotalCompact'
  | 'creditRate'
  | 'creditLoading'
  | 'creditSignedOut'
  | 'creditUnavailable'
  | 'dockProvider'
  | 'dockModel'
  | 'dockNoModel'
  | 'creditPanelAria'
  | 'creditPackageRemain'
  | 'creditModelFallback'
  | 'creditEmpty'
>

export type CodeBuddySettingsKey = keyof typeof en

export const zh: Record<CodeBuddySettingsKey, string> = {
  title: 'DSH CodeBuddy CLI Connect',
  intro: '在 DSH 中直接使用 CodeBuddy CLI 包含的模型，开箱即用，无需额外配置。',
  expand: '展开',
  collapse: '收起',
  loading: '正在读取账号…',
  signedOut: '未登录',
  signedOutHint: '在 CodeBuddy CLI 里登录一次即可，插件会自动跟随当前登录的账号。',
  signedInAs: '已登录：{nickname}',
  accessTokenExpires: '访问令牌 {time} 过期（自动续期）',
  creditsHeading: '剩余积分',
  creditsTotal: '合计：{total}',
  percentRemaining: '剩余 {percent}%',
  exactRemaining: '剩余 {remain} / {size}',
  creditPackageUnknownSize: '剩余 {remain}',
  creditsError: '积分查询失败：{message}',
  refresh: '刷新',
  refreshing: '正在刷新…',
  requestFailed: '请求失败',
  accountHeading: '账号',
  modelsHeading: '模型优惠',
  modelsOnPromo: '{count} 个在优惠',
  freeModel: '免费',
  badgeLimitedFree: '限时免费',
  badgeNightDiscount: '夜间折扣',
  rate: '{rate} 积分/次',
  creditTotalCompact: '积分 {total}',
  creditRate: '· {rate}',
  creditLoading: '积分 …',
  creditSignedOut: '积分 — 未登录',
  creditUnavailable: '积分不可用',
  dockProvider: 'Provider {provider}',
  dockModel: 'Model {model}',
  dockNoModel: '未选择模型',
  creditPanelAria: 'CodeBuddy 积分明细',
  creditPackageRemain: '{remain} / {size}',
  creditModelFallback: '当前模型',
  creditEmpty: '暂无剩余积分。',
  optionalModelsHeading: '可选模型',
  optionalModelsHint: '勾选要在模型选择器里出现的模型。未勾选的模型不会消失，已经选定它的会话仍可继续使用。',
  optionalModelsAllHint: '当前提供全部模型。取消勾选即可把不需要的模型从选择器里收起来。',
  optionalModelsCount: '已启用 {enabled} / {total}',
  optionalModelsSelectAll: '全选',
  optionalModelsClear: '清空',
  optionalModelsSave: '保存',
  optionalModelsSaving: '正在保存…',
  optionalModelsSaved: '已保存',
  optionalModelsReadOnly: '当前 profile 不存储配置，无法保存该选择。',
  optionalModelsEmptyWarning: '未勾选任何模型——这样保存等同于提供全部模型。',
  optionalModelsSaveFailed: '保存失败：{message}',
}
