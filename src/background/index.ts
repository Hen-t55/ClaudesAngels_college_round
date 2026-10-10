// Background service worker (P3)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') });
  }
});

// Relay: content scripts → side panel already works via chrome.runtime messaging.
// Side panel → content uses chrome.tabs.sendMessage (handled in bus.ts).
