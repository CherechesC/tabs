import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function background(existing: chrome.tabs.Tab[] = []) {
  vi.resetModules()
  const chrome = {
    action: { onClicked: { addListener: vi.fn() } },
    runtime: { getURL: vi.fn().mockReturnValue('chrome-extension://wrangler/index.html') },
    tabs: {
      query: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    windows: { update: vi.fn().mockResolvedValue({}) },
  }
  vi.stubGlobal('chrome', chrome)
  await import('./background')
  const click = chrome.action.onClicked.addListener.mock.calls[0]![0] as () => void
  return { chrome, click }
}

it('opens a dashboard in a new tab when the toolbar action is clicked', async () => {
  const { chrome, click } = await background()
  click()
  await vi.waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://wrangler/index.html' }))
})

it('reuses and focuses the existing dashboard instead of creating another', async () => {
  const tab = { id: 3, windowId: 7 } as chrome.tabs.Tab
  const { chrome, click } = await background([tab])
  click()
  await vi.waitFor(() => expect(chrome.windows.update).toHaveBeenCalledWith(7, { focused: true }))
  expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true })
  expect(chrome.tabs.create).not.toHaveBeenCalled()
})

it('handles action errors without an unhandled rejection', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const { chrome, click } = await background()
  chrome.tabs.query.mockRejectedValue(new Error('Browser unavailable'))
  click()
  await vi.waitFor(() => expect(log).toHaveBeenCalledWith('Unable to open Tab Wrangler', expect.any(Error)))
})
