/**
 * Rendered-UI check: after adding an identity via pasted tokens, the account
 * card must show its balance immediately rather than an empty credit panel.
 *
 * Seeds the DSH session cookie (see mint-session-cookie.cjs), opens
 * Settings -> 内置插件 -> CodeBuddy CLI, expands the card, and reads the
 * account grid as the user sees it.
 *
 * Usage: node check-panel-credits.cjs <outputDir>
 */
const { chromium } = require('playwright-core')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const OUT_DIR = process.argv[2] ?? '.'

async function main() {
  const raw = readFileSync(join(__dirname, 'session-cookie.txt'), 'utf8').trim()
  const eq = raw.indexOf('=')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } })
  await context.addCookies([{ name: raw.slice(0, eq), value: raw.slice(eq + 1), domain: '127.0.0.1', path: '/' }])
  const page = await context.newPage()

  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)

  await page.keyboard.press('Control+,')
  const dlg = page.locator('[role="dialog"]')
  await dlg.waitFor({ state: 'visible', timeout: 15000 })
  await dlg.getByRole('button', { name: '内置插件', exact: true }).click()
  await page.waitForTimeout(1500)

  // The plugin tab is rendered as a tab in current builds and as a plain
  // button in others; accept either rather than pinning one role.
  const tab = dlg.getByRole('tab', { name: 'CodeBuddy CLI', exact: true })
  if (await tab.count() > 0) {
    await tab.click()
  } else {
    await dlg.getByRole('button', { name: 'CodeBuddy CLI', exact: true }).first().click()
  }
  await page.waitForTimeout(1500)

  const expander = dlg.locator('button[aria-label*="DSH CodeBuddy CLI Connect"]').first()
  if (await expander.count()) {
    await expander.click()
    await page.waitForTimeout(2500)
  }

  const text = await dlg.innerText()
  const report = {
    hasImportButton: text.includes('粘贴 Token 添加'),
    showsLuChangguo: text.includes('卢常过'),
    showsPhoneAccount: text.includes('16291003863'),
    showsMichael: text.includes('Michael.fu'),
    // The reported account's ledger, as the card must render it.
    shows2100: text.includes('2,100') || text.includes('2100'),
    shows1500Pack: text.includes('1,500'),
    shows500Pack: text.includes('500'),
    hasCreditError: /积分.*失败|获取积分失败/.test(text),
    consoleErrors: errors,
  }
  await page.screenshot({ path: join(OUT_DIR, 'panel-with-credits.png') })
  console.log(JSON.stringify(report, null, 2))
  await browser.close()

  const failures = []
  if (!report.hasImportButton) failures.push('import button missing')
  if (!report.showsPhoneAccount) failures.push('the reported account is not listed')
  if (!report.shows2100) failures.push('the account balance is not rendered')
  if (report.hasCreditError) failures.push('a credit error is shown')
  if (failures.length > 0) {
    console.error('CHECK FAILED: ' + failures.join('; '))
    process.exitCode = 1
  } else {
    console.log('CHECK PASSED')
  }
}

main().catch(error => { console.error('FAILED: ' + error.message); process.exit(1) })
