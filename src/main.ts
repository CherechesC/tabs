import './style.css'
import { createBrowserClient } from './browser'
import { displayUrl, findDuplicates, matchesSearch } from './model'
import type { DuplicateMode, Snapshot, Tab, TabGroup } from './model'

const client = createBrowserClient()
const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="./index.html"><img src="./icons/icon.svg" alt="" /><span>Tab Wrangler<small>A little less tab chaos.</small></span></a>
    <p class="nav-label">YOUR WORKSPACE</p>
    <nav aria-label="Tab views">
      <button class="nav-item selected" id="all-tabs" aria-pressed="true"><span class="nav-icon">▤</span>All tabs<span class="nav-count" id="nav-total">0</span></button>
      <button class="nav-item" id="duplicates" aria-pressed="false"><span class="nav-icon">▱</span>Duplicates<span class="nav-count" id="nav-duplicates">0</span></button>
    </nav>
    <p class="nav-label windows-label">OPEN WINDOWS</p>
    <nav id="window-nav" aria-label="Filter by window"></nav>
    <div class="sidebar-note"><span class="note-spark">✦</span><strong>Room to think.</strong><p>A tidy browser is a fresh start. Keep what matters, close what doesn't.</p></div>
    <div class="sidebar-footer"><span class="privacy-dot"></span> On your device. Always.</div>
  </aside>
  <main>
    <header class="page-header">
      <div><p class="eyebrow">A CLEARER PERSPECTIVE</p><h1>Your tabs, untangled<span>.</span></h1><p class="subtitle">Everything you have open. A little more under control.</p></div>
      <button id="refresh" class="secondary-button" title="Refresh tabs"><span aria-hidden="true">↻</span> Refresh</button>
    </header>
    <div id="demo-notice" class="demo-notice" hidden><strong>You're exploring a preview.</strong> These are sample tabs. Load the extension to manage your real browser.</div>
    <section class="stats" aria-label="Workspace overview">
      <div class="stat"><span class="stat-icon green" aria-hidden="true">▤</span><div><strong id="total-count">0</strong><span>Open tabs</span></div><small>Across your workspace</small></div>
      <div class="stat"><span class="stat-icon blue" aria-hidden="true">▣</span><div><strong id="window-count">0</strong><span>Windows</span></div><small>Every window, one place</small></div>
      <div class="stat"><span class="stat-icon amber" aria-hidden="true">▱</span><div><strong id="duplicate-count">0</strong><span>Duplicate tabs</span></div><small>Matching your URL rule</small></div>
    </section>
    <section class="workspace" aria-label="Tab manager">
      <div class="workspace-heading"><div><h2 id="view-title">All tabs</h2><span id="results-count" role="status" aria-live="polite">Loading your workspace…</span></div><span class="live-badge"><span></span><span id="live-label">Live workspace</span></span></div>
      <div class="toolbar">
        <div class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" aria-label="Search tabs" placeholder="Search by title or URL…" autocomplete="off" /><kbd title="Focus search">/</kbd></div>
        <label class="match-label" for="match-mode">Duplicate rule<select id="match-mode">
          <option value="exact">Same URL</option>
          <option value="path">Same path</option>
          <option value="section">Same site section</option>
        </select></label>
      </div>
      <p id="match-help" class="match-help">Same URL ignores #fragments and keeps query parameters.</p>
      <div id="error" class="error" role="alert" hidden></div>
      <div id="windows" class="windows-grid" aria-label="Browser windows" aria-busy="true"></div>
      <div id="empty" class="empty-state" hidden><span aria-hidden="true">✦</span><h3>No tabs found</h3><p>Try a different search or switch your view.</p><button class="secondary-button" id="reset">Reset filters</button></div>
    </section>
    <footer class="page-footer"><span>Less searching. More doing.</span><span>Made for your many open possibilities.</span></footer>
    <div id="announcement" class="sr-only" role="status" aria-live="polite"></div>
  </main>
`

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

let snapshot: Snapshot = { windows: [], groups: [] }
let query = ''
let duplicatesOnly = false
let windowFilter: number | undefined
let mode: DuplicateMode = 'exact'
let request = 0
const collapsed = new Set<string>()
const pending = new Set<number>()
const search = element<HTMLInputElement>('search')
const windowsElement = element('windows')

element('demo-notice').hidden = !client.demo
element('live-label').textContent = client.demo ? 'Preview workspace' : 'Live workspace'

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag)
  result.className = className
  if (text !== undefined) result.textContent = text
  return result
}

function highlight(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const terms = query.trim().split(/\s+/).filter(Boolean).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) {
    fragment.append(text)
    return fragment
  }
  const pattern = new RegExp(`(${terms.join('|')})`, 'gi')
  let last = 0
  for (const match of text.matchAll(pattern)) {
    fragment.append(text.slice(last, match.index))
    fragment.append(node('mark', '', match[0]))
    last = match.index + match[0].length
  }
  fragment.append(text.slice(last))
  return fragment
}

function showError(message: string): void {
  element('error').textContent = message
  element('error').hidden = false
}

async function refresh(): Promise<void> {
  const current = ++request
  element<HTMLButtonElement>('refresh').disabled = true
  windowsElement.setAttribute('aria-busy', 'true')
  try {
    const next = await client.load()
    if (current !== request) return
    snapshot = next
    if (windowFilter !== undefined && !next.windows.some((window) => window.id === windowFilter)) {
      windowFilter = undefined
    }
    element('error').hidden = true
    render()
  } catch {
    if (current === request) {
      showError('Could not read your tabs. Click Refresh to try again.')
      element('results-count').textContent = 'Workspace unavailable'
    }
  } finally {
    if (current === request) {
      element<HTMLButtonElement>('refresh').disabled = false
      windowsElement.setAttribute('aria-busy', 'false')
    }
  }
}

async function act(tab: Tab, button: HTMLButtonElement, action: 'close' | 'focus'): Promise<void> {
  if (pending.has(tab.id)) return
  if (action === 'close' && tab.pinned && !window.confirm(`Close pinned tab “${tab.title}”?`)) return
  pending.add(tab.id)
  button.disabled = true
  try {
    if (action === 'close') {
      await client.close(tab.id)
      element('announcement').textContent = `Closed ${tab.title}`
    } else {
      await client.focus(tab.id, tab.windowId)
      element('announcement').textContent = client.demo ? 'Preview only: no real tab was activated.' : `Switched to ${tab.title}`
    }
    await refresh()
  } catch {
    showError(`Could not ${action === 'close' ? 'close' : 'activate'} this tab. It may have moved or closed. Refresh and try again.`)
  } finally {
    pending.delete(tab.id)
    button.disabled = false
  }
}

function tabRow(tab: Tab, duplicates: Map<number, number[]>): HTMLElement {
  const row = node('li', `tab-row${duplicates.has(tab.id) ? ' has-duplicate' : ''}`)
  row.dataset.tabId = String(tab.id)
  const open = node('button', 'tab-open')
  open.type = 'button'
  open.setAttribute('aria-label', `Switch to ${tab.title}`)
  open.title = tab.url
  const initial = node('span', 'site-icon', displayUrl(tab.url).replace(/^www\./, '').charAt(0).toUpperCase() || '·')
  initial.setAttribute('aria-hidden', 'true')
  const copy = node('span', 'tab-copy')
  const title = node('span', 'tab-title')
  title.append(highlight(tab.title))
  const address = node('span', 'tab-url')
  address.append(highlight(displayUrl(tab.url)))
  copy.append(title, address)
  open.append(initial, copy)
  open.addEventListener('click', () => { void act(tab, open, 'focus') })
  row.append(open)
  const badges = node('span', 'tab-badges')
  if (tab.pinned) badges.append(node('span', 'tiny-badge', 'Pinned'))
  if (tab.audible) badges.append(node('span', 'tiny-badge', 'Audio'))
  if (tab.active) badges.append(node('span', 'active-dot', 'Active'))
  const ids = duplicates.get(tab.id)
  if (ids) {
    const badge = node('span', 'duplicate-badge', `×${ids.length}`)
    badge.title = `${ids.length} tabs share this ${mode === 'exact' ? 'URL' : mode === 'path' ? 'path' : 'site section'}`
    badge.setAttribute('aria-label', badge.title)
    badges.append(badge)
  }
  const close = node('button', 'close-tab', '×')
  close.type = 'button'
  close.title = `Close ${tab.title}`
  close.setAttribute('aria-label', `Close ${tab.title}`)
  close.disabled = pending.has(tab.id)
  close.addEventListener('click', () => { void act(tab, close, 'close') })
  row.append(badges, close)
  return row
}

function appendGroup(card: HTMLElement, windowId: number, tabs: Tab[], duplicates: Map<number, number[]>, group?: TabGroup): void {
  const key = `${windowId}:${group?.id ?? 'ungrouped'}`
  const section = node('section', `tab-group color-${group?.color ?? 'grey'}`)
  const heading = node('button', 'group-heading')
  const isCollapsed = collapsed.has(key) && !query.trim()
  heading.setAttribute('aria-expanded', String(!isCollapsed))
  heading.append(node('span', 'group-dot'), node('span', '', group?.title ?? 'Ungrouped'), node('span', 'group-count', String(tabs.length)))
  if (group?.collapsed) heading.append(node('span', 'browser-collapsed', 'Collapsed in browser'))
  heading.append(node('span', 'chevron', isCollapsed ? '›' : '⌄'))
  heading.addEventListener('click', () => {
    if (collapsed.has(key)) collapsed.delete(key)
    else collapsed.add(key)
    render()
  })
  const list = node('ul', 'tab-list')
  list.hidden = isCollapsed
  for (const tab of tabs) list.append(tabRow(tab, duplicates))
  section.append(heading, list)
  card.append(section)
}

function render(): void {
  const allTabs = snapshot.windows.flatMap((window) => window.tabs)
  const duplicates = findDuplicates(allTabs, mode)
  const openWindows = snapshot.windows.filter((window) => window.tabs.length)
  element('total-count').textContent = String(allTabs.length)
  element('nav-total').textContent = String(allTabs.length)
  element('window-count').textContent = String(openWindows.length)
  element('duplicate-count').textContent = String(duplicates.size)
  element('nav-duplicates').textContent = String(duplicates.size)
  element('view-title').textContent = duplicatesOnly ? 'Duplicate tabs' : 'All tabs'
  element('all-tabs').classList.toggle('selected', !duplicatesOnly)
  element('all-tabs').setAttribute('aria-pressed', String(!duplicatesOnly))
  element('duplicates').classList.toggle('selected', duplicatesOnly)
  element('duplicates').setAttribute('aria-pressed', String(duplicatesOnly))
  const nav = element('window-nav')
  nav.replaceChildren()
  windowsElement.replaceChildren()
  let visibleTabs = 0
  let visibleWindows = 0

  openWindows.forEach((window, index) => {
    const name = `Window ${index + 1}`
    const filter = node('button', `nav-item window-item${windowFilter === window.id ? ' selected' : ''}`)
    filter.append(node('span', 'nav-icon', '▣'), node('span', '', name), node('span', 'nav-count', String(window.tabs.length)))
    filter.setAttribute('aria-pressed', String(windowFilter === window.id))
    filter.addEventListener('click', () => {
      windowFilter = windowFilter === window.id ? undefined : window.id
      render()
    })
    nav.append(filter)
    if (windowFilter !== undefined && windowFilter !== window.id) return
    const tabs = window.tabs.filter((tab) => matchesSearch(tab, query) && (!duplicatesOnly || duplicates.has(tab.id)))
    if (!tabs.length) return
    visibleTabs += tabs.length
    visibleWindows++
    const card = node('article', 'window-card')
    card.setAttribute('aria-label', name)
    const header = node('div', 'window-header')
    const title = node('h3', '', name)
    header.append(node('span', 'window-icon', '▣'), title)
    if (window.focused) header.append(node('span', 'current-badge', 'Current'))
    header.append(node('span', 'window-tab-count', `${tabs.length} tab${tabs.length === 1 ? '' : 's'}`))
    card.append(header)
    const groupIds = [...new Set(tabs.sort((a, b) => a.index - b.index).map((tab) => tab.groupId))]
    for (const groupId of groupIds) {
      const group = snapshot.groups.find((item) => item.id === groupId && item.windowId === window.id)
      appendGroup(card, window.id, tabs.filter((tab) => tab.groupId === groupId), duplicates, group)
    }
    windowsElement.append(card)
  })
  element('results-count').textContent = `${visibleTabs} tab${visibleTabs === 1 ? '' : 's'} in ${visibleWindows} window${visibleWindows === 1 ? '' : 's'}${query.trim() ? ' matching your search' : ''}`
  element('empty').hidden = visibleTabs > 0
}

element('all-tabs').addEventListener('click', () => {
  duplicatesOnly = false
  windowFilter = undefined
  render()
})
element('duplicates').addEventListener('click', () => {
  duplicatesOnly = true
  windowFilter = undefined
  render()
})
search.addEventListener('input', () => {
  query = search.value
  render()
})
element<HTMLSelectElement>('match-mode').addEventListener('change', (event) => {
  mode = (event.target as HTMLSelectElement).value as DuplicateMode
  element('match-help').textContent = {
    exact: 'Same URL ignores #fragments and keeps query parameters.',
    path: 'Same path ignores query parameters, #fragments, and trailing slashes.',
    section: 'Same site section matches the origin and first path segment. Related pages are not necessarily duplicates.',
  }[mode]
  render()
})
element('refresh').addEventListener('click', () => { void refresh() })
element('reset').addEventListener('click', () => {
  search.value = ''
  query = ''
  duplicatesOnly = false
  windowFilter = undefined
  render()
  search.focus()
})
document.addEventListener('keydown', (event) => {
  const target = event.target
  if (event.key === '/' && !(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    search.focus()
  }
  if (event.key === 'Escape' && target === search) {
    search.value = ''
    query = ''
    render()
  }
})
let timer: ReturnType<typeof setTimeout> | undefined
const unsubscribe = client.subscribe(() => {
  clearTimeout(timer)
  timer = setTimeout(() => { void refresh() }, 100)
})
window.addEventListener('pagehide', () => {
  clearTimeout(timer)
  unsubscribe()
}, { once: true })
void refresh()
