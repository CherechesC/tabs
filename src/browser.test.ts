import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserClient } from './browser'

function mockChrome() {
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() })
  return {
    runtime: { getURL: () => 'chrome-extension://wrangler/index.html' },
    windows: {
      getAll: vi.fn().mockResolvedValue([{
        id: 8, focused: true, tabs: [
          { id: 1, windowId: 8, index: 0, title: 'Tab Wrangler', url: 'chrome-extension://wrangler/index.html?x=1' },
          { id: 2, windowId: 8, index: 1, title: 'Docs', url: 'https://example.com/', groupId: 4, active: true, pinned: true, audible: true },
          { id: 3, windowId: 8, index: 2, pendingUrl: 'https://example.com/loading' },
          { windowId: 8 },
        ],
      }, { focused: false }]),
      update: vi.fn().mockResolvedValue({}),
      onCreated: event(), onRemoved: event(), onFocusChanged: event(),
    },
    tabs: {
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({ id: 2, groupId: 4 }),
      onCreated: event(), onRemoved: event(), onUpdated: event(), onMoved: event(),
      onAttached: event(), onDetached: event(), onActivated: event(),
    },
    tabGroups: {
      query: vi.fn().mockResolvedValue([{ id: 4, windowId: 8, title: '', color: 'blue', collapsed: true }]),
      update: vi.fn().mockResolvedValue({}),
      onCreated: event(), onRemoved: event(), onUpdated: event(), onMoved: event(),
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Chromium browser adapter', () => {
  it('loads windows/groups, normalizes missing fields, and excludes the dashboard', async () => {
    const chrome = mockChrome()
    vi.stubGlobal('chrome', chrome)
    const client = createBrowserClient()
    expect(client.demo).toBe(false)
    const result = await client.load()
    expect(chrome.windows.getAll).toHaveBeenCalledWith({ populate: true, windowTypes: ['normal', 'popup'] })
    expect(result.windows).toHaveLength(1)
    expect(result.windows[0]?.tabs).toHaveLength(2)
    expect(result.windows[0]?.tabs[0]).toMatchObject({ id: 2, groupId: 4, pinned: true, active: true, audible: true })
    expect(result.windows[0]?.tabs[1]).toMatchObject({ title: 'Untitled tab', url: 'https://example.com/loading', groupId: -1 })
    expect(result.groups[0]).toMatchObject({ title: 'Unnamed group', collapsed: true, color: 'blue' })
  })

  it('supports browsers where the tabGroups API is unavailable', async () => {
    const chrome = { ...mockChrome(), tabGroups: undefined }
    vi.stubGlobal('chrome', chrome)
    const client = createBrowserClient()
    expect((await client.load()).groups).toEqual([])
    const listener = vi.fn()
    const unsubscribe = client.subscribe(listener)
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(listener)
    unsubscribe()
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledWith(listener)
    await client.focus(2, 8)
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, { active: true })
  })

  it('expands a browser group before activating and focusing its tab', async () => {
    const chrome = mockChrome()
    vi.stubGlobal('chrome', chrome)
    await createBrowserClient().focus(2, 8)
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(4, { collapsed: false })
    expect(chrome.tabs.update).toHaveBeenCalledWith(2, { active: true })
    expect(chrome.windows.update).toHaveBeenCalledWith(8, { focused: true })
    expect(chrome.tabGroups.update.mock.invocationCallOrder[0])
      .toBeLessThan(chrome.tabs.update.mock.invocationCallOrder[0]!)
  })

  it('does not try to expand ungrouped tabs', async () => {
    const chrome = mockChrome()
    chrome.tabs.get.mockResolvedValue({ id: 2, groupId: -1 })
    vi.stubGlobal('chrome', chrome)
    await createBrowserClient().focus(2, 8)
    expect(chrome.tabGroups.update).not.toHaveBeenCalled()
  })

  it('closes a specific tab and propagates browser errors', async () => {
    const chrome = mockChrome()
    vi.stubGlobal('chrome', chrome)
    const client = createBrowserClient()
    await client.close(2)
    expect(chrome.tabs.remove).toHaveBeenCalledWith(2)
    chrome.tabs.remove.mockRejectedValue(new Error('Tab already closed'))
    await expect(client.close(2)).rejects.toThrow('Tab already closed')
    chrome.windows.getAll.mockRejectedValue(new Error('Unavailable'))
    await expect(client.load()).rejects.toThrow('Unavailable')
  })

  it('subscribes to live changes and removes every listener on cleanup', () => {
    const chrome = mockChrome()
    vi.stubGlobal('chrome', chrome)
    const listener = vi.fn()
    const unsubscribe = createBrowserClient().subscribe(listener)
    for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onAttached, chrome.tabs.onDetached, chrome.tabGroups.onUpdated, chrome.windows.onFocusChanged]) {
      expect(event.addListener).toHaveBeenCalledWith(listener)
    }
    unsubscribe()
    for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabGroups.onUpdated, chrome.windows.onRemoved]) {
      expect(event.removeListener).toHaveBeenCalledWith(listener)
    }
  })
})

describe('safe standalone preview', () => {
  it('uses sample data without extension APIs and never mutates returned snapshots', async () => {
    vi.stubGlobal('chrome', undefined)
    const client = createBrowserClient()
    expect(client.demo).toBe(true)
    const original = await client.load()
    const originalCount = original.windows.flatMap((window) => window.tabs).length
    original.windows.splice(0)
    expect((await client.load()).windows).toHaveLength(2)
    await client.close(1)
    expect((await client.load()).windows.flatMap((window) => window.tabs)).toHaveLength(originalCount - 1)
    await expect(client.focus(2, 1)).resolves.toBeUndefined()
  })
})
