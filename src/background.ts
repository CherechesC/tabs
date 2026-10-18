chrome.action.onClicked.addListener(() => {
  void openDashboard().catch((error: unknown) => console.error('Unable to open Tab Wrangler', error))
})

async function openDashboard(): Promise<void> {
  const url = chrome.runtime.getURL('index.html')
  const existing = await chrome.tabs.query({ url })
  const tab = existing[0]
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true })
    await chrome.windows.update(tab.windowId, { focused: true })
  } else {
    await chrome.tabs.create({ url })
  }
}
