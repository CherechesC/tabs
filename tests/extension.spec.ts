import { chromium, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('loads the real extension, groups windows, activates and closes tabs, and updates live', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'tab-wrangler-'))
  const extensionPath = path.resolve('dist')
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  try {
    await context.route('https://wrangler.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Wrangler test document</title><h1>Test document</h1>' }))
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
    const extensionId = new URL(worker.url()).host
    const first = await context.newPage()
    await first.goto('https://wrangler.test/docs/one?q=1')
    const second = await context.newPage()
    await second.goto('https://wrangler.test/docs/one?q=2')
    const ids = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://wrangler.test/*' })
      const ids = tabs.map((tab) => tab.id!) as [number, ...number[]]
      const groupId = await chrome.tabs.group({ tabIds: ids })
      await chrome.tabGroups.update(groupId, { title: 'Native test group', color: 'purple', collapsed: true })
      return { tabs: ids, groupId }
    })
    const extra = await worker.evaluate(async () => {
      const window = await chrome.windows.create({ url: 'https://wrangler.test/elsewhere' })
      if (!window?.tabs?.[0]?.id) throw new Error('Expected a new browser window with a tab')
      return { windowId: window.id!, tabId: window.tabs[0].id }
    })
    const dashboard = await context.newPage()
    const errors: string[] = []
    dashboard.on('pageerror', (error) => errors.push(error.message))
    await dashboard.goto(`chrome-extension://${extensionId}/index.html`)
    await expect(dashboard.getByRole('heading', { level: 1 })).toHaveText('Your tabs, untangled.')
    await expect(dashboard.locator('#demo-notice')).toBeHidden()
    await expect(dashboard.getByText('Native test group')).toBeVisible()
    await expect(dashboard.locator('#window-count')).toHaveText('2')
    await expect(dashboard.getByRole('button', { name: 'Switch to Tab Wrangler', exact: true })).toHaveCount(0)
    await dashboard.getByRole('searchbox').fill('wrangler.test')
    await expect(dashboard.locator('.tab-row')).toHaveCount(3)

    await dashboard.getByLabel('Duplicate rule').selectOption('path')
    await dashboard.getByRole('button', { name: 'Duplicates', exact: false }).click()
    await expect(dashboard.locator('.tab-row')).toHaveCount(2)
    await dashboard.getByRole('button', { name: 'Switch to Wrangler test document', exact: true }).first().click()
    await expect.poll(() => worker.evaluate(async (id) => (await chrome.tabs.get(id)).active, ids.tabs[0]!)).toBe(true)
    expect(await worker.evaluate(async (id) => (await chrome.tabGroups.get(id)).collapsed, ids.groupId)).toBe(false)

    await dashboard.bringToFront()
    await dashboard.getByRole('button', { name: 'Close Wrangler test document', exact: true }).first().click()
    await expect(dashboard.locator('.tab-row')).toHaveCount(0)
    expect(await worker.evaluate(async () => (await chrome.tabs.query({ url: 'https://wrangler.test/docs/*' })).length)).toBe(1)
    await dashboard.getByRole('button', { name: 'All tabs', exact: false }).click()
    await expect(dashboard.locator('.tab-row')).toHaveCount(2)

    // A title from a webpage is untrusted text, never dashboard markup.
    await second.evaluate(() => { document.title = '<img src=x onerror="window.pwned=true">' })
    await expect(dashboard.getByRole('button', { name: 'Switch to <img src=x onerror="window.pwned=true">', exact: true })).toBeVisible()
    await expect(dashboard.locator('.tab-row img')).toHaveCount(0)
    await worker.evaluate(async (id) => { await chrome.tabs.remove(id) }, extra.tabId)
    await expect(dashboard.locator('#window-count')).toHaveText('1')
    expect(errors).toEqual([])
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})
