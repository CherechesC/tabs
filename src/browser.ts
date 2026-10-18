import type { Snapshot, Tab } from './model'

export interface BrowserClient {
  readonly demo: boolean
  load(): Promise<Snapshot>
  close(id: number): Promise<void>
  focus(id: number, windowId: number): Promise<void>
  subscribe(listener: () => void): () => void
}

export function createBrowserClient(): BrowserClient {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.windows) return createDemoClient()

  return {
    demo: false,
    async load() {
      const [windows, groups] = await Promise.all([
        chrome.windows.getAll({ populate: true, windowTypes: ['normal', 'popup'] }),
        chrome.tabGroups ? chrome.tabGroups.query({}) : Promise.resolve([]),
      ])
      const dashboardUrl = chrome.runtime.getURL('index.html')
      return {
        windows: windows.flatMap((window) => window.id === undefined ? [] : [{
          id: window.id,
          focused: window.focused,
          tabs: (window.tabs ?? []).flatMap((tab): Tab[] =>
            tab.id === undefined || tab.url?.split(/[?#]/)[0] === dashboardUrl ? [] : [{
              id: tab.id,
              windowId: tab.windowId,
              index: tab.index,
              title: tab.title || 'Untitled tab',
              url: tab.pendingUrl || tab.url || '',
              groupId: tab.groupId ?? -1,
              pinned: tab.pinned,
              active: tab.active,
              audible: tab.audible ?? false,
            }]),
        }]),
        groups: groups.map((group) => ({
          id: group.id,
          windowId: group.windowId,
          title: group.title || 'Unnamed group',
          color: group.color,
          collapsed: group.collapsed,
        })),
      }
    },
    async close(id) {
      await chrome.tabs.remove(id)
    },
    async focus(id, windowId) {
      const tab = await chrome.tabs.get(id)
      if (tab.groupId !== -1 && chrome.tabGroups) {
        await chrome.tabGroups.update(tab.groupId, { collapsed: false })
      }
      await chrome.tabs.update(id, { active: true })
      await chrome.windows.update(windowId, { focused: true })
    },
    subscribe(listener) {
      const events = [
        chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated,
        chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached,
        chrome.tabs.onActivated, chrome.windows.onCreated, chrome.windows.onRemoved,
        chrome.windows.onFocusChanged,
        ...(chrome.tabGroups ? [
          chrome.tabGroups.onCreated, chrome.tabGroups.onUpdated, chrome.tabGroups.onRemoved,
          chrome.tabGroups.onMoved,
        ] : []),
      ]
      for (const event of events) event.addListener(listener)
      return () => {
        for (const event of events) event.removeListener(listener)
      }
    },
  }
}

function createDemoClient(): BrowserClient {
  const makeTab = (id: number, windowId: number, title: string, url: string, groupId = -1, pinned = false): Tab =>
    ({ id, windowId, title, url, groupId, pinned, index: id, active: false, audible: false })
  const snapshot: Snapshot = {
    windows: [
      { id: 1, focused: true, tabs: [
        makeTab(1, 1, 'Inbox · Your day, organized', 'https://mail.google.com/mail/u/0', -1, true),
        makeTab(2, 1, 'Tab Wrangler · Project overview', 'https://github.com/CherechesC/tabs', 10),
        makeTab(3, 1, 'Designing a calmer digital workspace', 'https://www.figma.com/design/workspace', 10),
        makeTab(4, 1, 'MDN Web Docs · JavaScript', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', 11),
        makeTab(5, 1, 'Chrome Extensions · Getting started', 'https://developer.chrome.com/docs/extensions/get-started', 11),
        makeTab(6, 1, 'MDN Web Docs · JavaScript', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', 11),
      ] },
      { id: 2, focused: false, tabs: [
        makeTab(7, 2, 'A little inspiration for your next adventure', 'https://www.nationalgeographic.com/travel', 12),
        makeTab(8, 2, 'Weekend reading list', 'https://www.notion.so/weekend-reading', 12),
        makeTab(9, 2, 'Tab Wrangler · Project overview', 'https://github.com/CherechesC/tabs'),
        makeTab(10, 2, 'MDN Web Docs · CSS', 'https://developer.mozilla.org/en-US/docs/Web/CSS'),
      ] },
    ],
    groups: [
      { id: 10, windowId: 1, title: 'Making things', color: 'green', collapsed: false },
      { id: 11, windowId: 1, title: 'Research', color: 'blue', collapsed: false },
      { id: 12, windowId: 2, title: 'Off the clock', color: 'orange', collapsed: true },
    ],
  }
  return {
    demo: true,
    load: () => Promise.resolve(structuredClone(snapshot)),
    close(id) {
      for (const window of snapshot.windows) window.tabs = window.tabs.filter((tab) => tab.id !== id)
      return Promise.resolve()
    },
    focus: () => Promise.resolve(),
    subscribe: () => () => {},
  }
}
