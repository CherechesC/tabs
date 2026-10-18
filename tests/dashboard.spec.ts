import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#total-count')).toHaveText('10')
})

test('shows a clearly labeled preview with windows and native group metadata', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your tabs, untangled.')
  await expect(page.getByText("You're exploring a preview.")).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Making things 2', exact: false })).toBeVisible()
  await expect(page.getByText('Collapsed in browser')).toBeVisible()
  await expect(page.locator('#duplicate-count')).toHaveText('4')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => window.innerWidth))
})

test('searches titles and URLs, highlights matches, and resets empty results', async ({ page }) => {
  const search = page.getByRole('searchbox', { name: 'Search tabs' })
  await search.fill('MDN javascript')
  await expect(page.locator('.tab-row')).toHaveCount(2)
  await expect(page.locator('.tab-title mark')).toHaveCount(4)
  await expect(page.getByRole('status').filter({ hasText: 'matching your search' })).toContainText('2 tabs in 1 window')
  await search.fill('<img src=x onerror=alert(1)>')
  await expect(page.getByRole('heading', { name: 'No tabs found' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(page.locator('.tab-row')).toHaveCount(10)
  await expect(search).toBeFocused()
})

test('filters duplicates and broadens matches to related paths', async ({ page }) => {
  await page.getByRole('button', { name: 'Duplicates', exact: false }).click()
  await expect(page.locator('.tab-row')).toHaveCount(4)
  await expect(page.getByRole('heading', { name: 'Duplicate tabs' })).toBeVisible()
  await page.getByLabel('Duplicate rule').selectOption('section')
  await expect(page.locator('.tab-row')).toHaveCount(5)
  await expect(page.locator('#match-help')).toContainText('not necessarily duplicates')
  await page.getByRole('searchbox').fill('CSS')
  await expect(page.locator('.tab-row')).toHaveCount(1)
})

test('closes just the selected sample tab and recalculates duplicates', async ({ page }) => {
  await page.getByRole('button', { name: 'Close MDN Web Docs · JavaScript', exact: true }).first().click()
  await expect(page.locator('#total-count')).toHaveText('9')
  await expect(page.locator('#duplicate-count')).toHaveText('2')
  await expect(page.getByRole('button', { name: 'Switch to MDN Web Docs · JavaScript', exact: true })).toHaveCount(1)
})

test('protects pinned tabs with confirmation', async ({ page }) => {
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Close Inbox · Your day, organized', exact: true }).click()
  await expect(page.locator('#total-count')).toHaveText('10')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close Inbox · Your day, organized', exact: true }).click()
  await expect(page.locator('#total-count')).toHaveText('9')
})

test('supports collapsing groups and search keyboard shortcuts', async ({ page }) => {
  const group = page.getByRole('button', { name: 'Making things 2', exact: false })
  await group.click()
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Switch to Designing a calmer digital workspace' })).toBeHidden()
  await page.keyboard.press('/')
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.getByRole('searchbox').fill('figma')
  await expect(page.getByRole('button', { name: 'Switch to Designing a calmer digital workspace' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('searchbox')).toHaveValue('')
  await expect(page.locator('.tab-row')).toHaveCount(10)
})

test('filters a specific window on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Window navigation is condensed on small screens.')
  await page.getByRole('navigation', { name: 'Filter by window' }).getByRole('button', { name: 'Window 2' }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).toHaveAccessibleName('Window 2')
  await expect(page.locator('.tab-row')).toHaveCount(4)
  await page.getByRole('button', { name: 'All tabs', exact: false }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
})
