export interface Tab {
  id: number
  windowId: number
  index: number
  title: string
  url: string
  groupId: number
  pinned: boolean
  active: boolean
  audible: boolean
}

export interface TabWindow {
  id: number
  focused: boolean
  tabs: Tab[]
}

export interface TabGroup {
  id: number
  windowId: number
  title: string
  color: string
  collapsed: boolean
}

export interface Snapshot {
  windows: TabWindow[]
  groups: TabGroup[]
}

export type DuplicateMode = 'exact' | 'path' | 'section'

export function duplicateKey(rawUrl: string, mode: DuplicateMode): string | undefined {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:', 'file:'].includes(url.protocol)) return undefined
    url.hash = ''
    if (mode !== 'exact') {
      url.search = ''
      url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    }
    if (mode === 'section') {
      url.pathname = `/${url.pathname.split('/').filter(Boolean)[0] ?? ''}`
    }
    return url.href
  } catch {
    return undefined
  }
}

export function findDuplicates(tabs: Tab[], mode: DuplicateMode): Map<number, number[]> {
  const byUrl = new Map<string, number[]>()
  for (const tab of tabs) {
    const key = duplicateKey(tab.url, mode)
    if (key) byUrl.set(key, [...(byUrl.get(key) ?? []), tab.id])
  }
  const duplicates = new Map<number, number[]>()
  for (const ids of byUrl.values()) {
    if (ids.length > 1) {
      for (const id of ids) duplicates.set(id, ids)
    }
  }
  return duplicates
}

export function matchesSearch(tab: Tab, query: string): boolean {
  const text = `${tab.title} ${tab.url}`.toLocaleLowerCase()
  return query.trim().toLocaleLowerCase().split(/\s+/).every((word) => text.includes(word))
}

export function displayUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}${url.hash}` || rawUrl
  } catch {
    return rawUrl || 'Address unavailable'
  }
}
