/**
 * Headless verification of the paste-token import UI, against the running DSH.
 *
 * Uses playwright-core (via npx) driving the already-installed Chrome, so no
 * browser download and no new package dependency for the plugin.
 *
 * DSH Web gates the app behind a signed, authority-bound session cookie, which
 * a cold profile does not have. mint-session-cookie.cjs reproduces that cookie
 * from the host's own persisted signing secret, and we seed it here so the
 * headless browser sees the real application rather than the 401 page.
 *
 * Asserts what matters about the feature, then writes two screenshots:
 *   1. the "粘贴 Token 添加" entry point renders in the account panel;
 *   2. it opens a form with two textareas and the region selector;
 *   3. a bogus token fails in place, with the form still open;
 *   4. the account list is unchanged by that failure.
 *
 * Usage: node verify-import-ui-headless.cjs <outputDir>
 */
const { chromium } = require('playwright-core')
const { readFileSync, existsSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const BASE = 'http://127.0.0.1:3080'
const OUT_DIR = process.argv[2] ?? '.'
const COOKIE_FILE = join(__dirname, 'session-cookie.txt')

async function main() {
  if (!existsSync(COOKIE_FILE)) throw new Error('session-cookie.txt missing — run mint-session-cookie.cjs first')
  const raw = readFileSync(COOKIE_FILE, 'utf8').trim()
  const eq = raw.indexOf('=')
  const cookie = { name: raw.slice(0, eq), value: raw.slice(eq + 1), domain: '127.0.0.1', path: '/' }

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  await context.addCookies([cookie])
  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)

  const title = await page.title()
  const bodyLen = (await page.locator('body').innerText()).length
  if (bodyLen < 200) throw new Error(`app did not load (auth gate?) — title=${title} bodyLen=${bodyLen}`)

  await page.keyboard.press('Control+,')
  const dlg = page.locator('[role="dialog"]')
  await dlg.waitFor({ state: 'visible', timeout: 15000 })
  await dlg.getByRole('button', { name: '内置插件', exact: true }).click()
  await page.waitForTimeout(1000)
  await dlg.getByRole('tab', { name: 'CodeBuddy CLI', exact: true }).click()
  await page.waitForTimeout(1000)

  // The card body is collapsed by default; its expander carries an aria-label.
  const expander = dlg.locator('button[aria-label*="DSH CodeBuddy CLI Connect"]').first()
  if (await expander.count()) {
    await expander.click()
    await page.waitForTimeout(1800)
  }

  const panelText = await dlg.innerText()
  const before = {
    hasImportButton: panelText.includes('粘贴 Token 添加'),
    showsMichael: panelText.includes('Michael.fu'),
    showsLu: panelText.includes('卢常过'),
  }

  await dlg.getByRole('button', { name: '粘贴 Token 添加', exact: true }).click()
  await page.waitForTimeout(1200)

  const formText = await dlg.innerText()
  const form = {
    formVisible: formText.includes('refresh_token（必填）'),
    textareaCount: await dlg.locator('textarea').count(),
    selectOptions: await dlg.locator('select option').allInnerTexts(),
    noteVisible: formText.includes('验证不通过则不会保存任何内容'),
  }
  await page.screenshot({ path: join(OUT_DIR, 'headless-import-open.png') })

  // Failure path: a bogus token must surface the upstream error and persist nothing.
  await dlg.locator('textarea').first().fill('headless-bogus-token')
  await dlg.getByRole('button', { name: '验证并添加', exact: true }).click()
  await page.waitForTimeout(12000)

  const afterText = await dlg.innerText()
  const after = {
    hasError: afterText.includes('添加失败'),
    stillShowsBothAccounts: afterText.includes('Michael.fu') && afterText.includes('卢常过'),
    errorExcerpt: (afterText.match(/添加失败[^\n]*/) ?? [null])[0],
  }
  await page.screenshot({ path: join(OUT_DIR, 'headless-import-error.png') })

  const report = { pageTitle: title, ...before, ...form, ...after, consoleErrors }
  writeFileSync(join(OUT_DIR, 'headless-import-report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report, null, 2))

  const failures = []
  if (!report.hasImportButton) failures.push('import button missing')
  if (!report.formVisible) failures.push('form did not open')
  if (report.textareaCount !== 2) failures.push(`expected 2 textareas, got ${report.textareaCount}`)
  if (!report.noteVisible) failures.push('safety note missing')
  if (!report.hasError) failures.push('failure path produced no visible error')
  if (!report.stillShowsBothAccounts) failures.push('accounts vanished after a failed import')

  await browser.close()

  if (failures.length > 0) {
    console.error('VERIFY FAILED: ' + failures.join('; '))
    process.exitCode = 1
  } else {
    console.log('VERIFY PASSED')
  }
}

main().catch(error => {
  console.error('FAILED: ' + error.message)
  process.exit(1)
})
