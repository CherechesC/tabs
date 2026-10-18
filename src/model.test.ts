import { describe, expect, it } from 'vitest'
import { displayUrl, duplicateKey, findDuplicates, matchesSearch } from './model'
import type { Tab } from './model'

const tab = (id: number, url: string, extra: Partial<Tab> = {}): Tab => ({
  id, url, windowId: 1, index: id, title: 'A useful page', groupId: -1,
  pinned: false, active: false, audible: false, ...extra,
})

describe('duplicate URL rules', () => {
  it('normalizes URL hosts and default ports and ignores fragments', () => {
    expect(duplicateKey('https://EXAMPLE.com:443/docs?q=1#intro', 'exact'))
      .toBe('https://example.com/docs?q=1')
  })

  it('keeps query parameters and path case for same-URL comparisons', () => {
    expect(duplicateKey('https://example.com/Docs?q=1', 'exact'))
      .not.toBe(duplicateKey('https://example.com/docs?q=1', 'exact'))
    expect(duplicateKey('https://example.com/docs?q=1', 'exact'))
      .not.toBe(duplicateKey('https://example.com/docs?q=2', 'exact'))
  })

  it('ignores queries and trailing slashes only in path mode', () => {
    expect(duplicateKey('https://example.com/docs/?q=1#intro', 'path'))
      .toBe(duplicateKey('https://example.com/docs?q=2', 'path'))
    expect(duplicateKey('https://example.com/', 'path')).toBe('https://example.com/')
  })

  it('groups related pages by origin and complete first path segment', () => {
    expect(duplicateKey('https://example.com/docs/api', 'section'))
      .toBe(duplicateKey('https://example.com/docs/guide', 'section'))
    expect(duplicateKey('https://example.com/docs/api', 'section'))
      .not.toBe(duplicateKey('https://example.com/docs-other/guide', 'section'))
    expect(duplicateKey('https://example.com/docs', 'section'))
      .not.toBe(duplicateKey('https://other.com/docs', 'section'))
    expect(duplicateKey('https://example.com/', 'section')).toBe('https://example.com/')
  })

  it('does not mix schemes, subdomains, or nondefault ports', () => {
    const keys = [
      'http://example.com/docs', 'https://example.com/docs',
      'https://www.example.com/docs', 'https://example.com:8443/docs',
    ].map((url) => duplicateKey(url, 'path'))
    expect(new Set(keys).size).toBe(4)
  })

  it.each(['', 'not a url', 'chrome://newtab', 'edge://settings', 'about:blank', 'javascript:alert(1)', 'data:text/html,hello'])(
    'excludes invalid or internal URL %s', (url) => {
      expect(duplicateKey(url, 'exact')).toBeUndefined()
    },
  )

  it('supports local files', () => {
    expect(duplicateKey('file:///home/user/document.pdf#page=2', 'exact'))
      .toBe('file:///home/user/document.pdf')
  })

  it('finds all copies across windows without counting unique tabs', () => {
    const tabs = [
      tab(1, 'https://example.com/docs'),
      tab(2, 'https://example.com/docs#intro', { windowId: 2 }),
      tab(3, 'https://example.com/docs?lang=en'),
      tab(4, 'chrome://newtab'),
      tab(5, 'chrome://newtab'),
    ]
    const exact = findDuplicates(tabs, 'exact')
    expect([...exact.keys()]).toEqual([1, 2])
    expect(exact.get(1)).toEqual([1, 2])
    expect([...findDuplicates(tabs, 'path').keys()]).toEqual([1, 2, 3])
    expect(findDuplicates([], 'exact').size).toBe(0)
  })
})

describe('search and display', () => {
  const example = tab(1, 'https://example.com/docs/typescript', { title: 'TypeScript Handbook' })

  it('matches every query token, case insensitively, across title and URL', () => {
    expect(matchesSearch(example, '  HANDBOOK   example.com ')).toBe(true)
    expect(matchesSearch(example, 'typescript docs')).toBe(true)
    expect(matchesSearch(example, 'handbook missing')).toBe(false)
    expect(matchesSearch(example, '   ')).toBe(true)
  })

  it('treats regex characters as literal search text', () => {
    expect(matchesSearch(example, '.*')).toBe(false)
    expect(matchesSearch(tab(1, 'https://example.com/?q=[x]'), '[x]')).toBe(true)
  })

  it('shows readable addresses with paths, queries, and fragments', () => {
    expect(displayUrl('https://example.com/docs?q=1#intro')).toBe('example.com/docs?q=1#intro')
    expect(displayUrl('https://example.com/')).toBe('example.com')
    expect(displayUrl('edge://settings')).toBe('settings')
    expect(displayUrl('file:///home/user/doc.txt')).toBe('/home/user/doc.txt')
    expect(displayUrl('about:blank')).toBe('blank')
    expect(displayUrl('invalid')).toBe('invalid')
    expect(displayUrl('')).toBe('Address unavailable')
  })
})
