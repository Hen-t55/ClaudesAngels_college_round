// Background service worker (P3) — handles tab commands from the side panel.
// The side panel sends a { __hf: true, ch: 'tab.command', data: TabCommand }
// envelope over chrome.runtime.sendMessage; this SW executes the action in the
// active tab and replies. close_tab goes through the confirmation flow in the
// orchestrator before it ever reaches here.

import type { TabCommand } from '../shared/contract';

const ENVELOPE_KEY = '__hf';

interface Envelope { [key: string]: unknown; ch: string; data: unknown }
function isEnvelope(x: unknown): x is Envelope {
  return (
    typeof x === 'object' && x !== null &&
    (x as Record<string, unknown>)[ENVELOPE_KEY] === true
  );
}

// ---- Panel open on toolbar click ----
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ---- Open permissions page on first install ----
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') });
  }
});

// ---- Default home URL (configurable via settings) ----
let HOME_URL = 'chrome://newtab';
chrome.storage.sync.get(['homeUrl'], (r) => {
  if (r.homeUrl && typeof r.homeUrl === 'string') HOME_URL = r.homeUrl as string;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes['homeUrl']?.newValue) {
    HOME_URL = changes['homeUrl'].newValue as string;
  }
});

// ---- Default search engine (configurable via settings) ----
let SEARCH_ENGINE = 'https://www.google.com/search?q=';
chrome.storage.sync.get(['searchEngine'], (r) => {
  if (r.searchEngine && typeof r.searchEngine === 'string') SEARCH_ENGINE = r.searchEngine as string;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes['searchEngine']?.newValue) {
    SEARCH_ENGINE = changes['searchEngine'].newValue as string;
  }
});

// ---- Message listener for tab commands ----
chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (!isEnvelope(msg) || msg.ch !== 'tab.command') return;
  const cmd = msg.data as TabCommand;
  handleTabCommand(cmd).then(() => sendResponse({ ok: true })).catch((err) => {
    console.error('[BG] tab command failed:', err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true; // async response
});

async function handleTabCommand(cmd: TabCommand): Promise<void> {
  switch (cmd.name) {
    case 'back':
      await execInActiveTab('window.history.back()');
      break;

    case 'forward':
      await execInActiveTab('window.history.forward()');
      break;

    case 'reload': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await chrome.tabs.reload(tab.id);
      break;
    }

    case 'home': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url: HOME_URL });
      break;
    }

    case 'new_tab':
      await chrome.tabs.create({});
      break;

    case 'close_tab': {
      // IMPORTANT: orchestrator must have already obtained confirmation before
      // sending this command — close_tab is marked "important" in the intent.
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
      break;
    }

    case 'next_tab': {
      await cycleTab(+1);
      break;
    }

    case 'prev_tab': {
      await cycleTab(-1);
      break;
    }

    case 'tab_n': {
      if (cmd.n === undefined) break;
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const targetIdx = cmd.n - 1; // 1-based → 0-based
      if (targetIdx >= 0 && targetIdx < allTabs.length) {
        const target = allTabs[targetIdx];
        if (target.id !== undefined) {
          await chrome.tabs.update(target.id, { active: true });
        }
      }
      break;
    }

    case 'go_to': {
      const url = cmd.url ? normalizeUrl(cmd.url) : HOME_URL;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url });
      break;
    }

    case 'default_search': {
      const query = cmd.query ?? '';
      const url = SEARCH_ENGINE + encodeURIComponent(query);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { url });
      break;
    }
  }
}

/** Execute a JS snippet in the active tab via scripting API. */
async function execInActiveTab(js: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: new Function(js) as () => void });
}

/** Move to the next (+1) or previous (-1) tab in the current window. */
async function cycleTab(direction: 1 | -1): Promise<void> {
  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const activeTab = allTabs.find((t) => t.active);
  if (!activeTab || activeTab.index === undefined) return;
  const newIndex = (activeTab.index + direction + allTabs.length) % allTabs.length;
  const target = allTabs[newIndex];
  if (target?.id !== undefined) await chrome.tabs.update(target.id, { active: true });
}

/** Ensure a URL has a scheme; add https:// if missing. */
function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(url)) return url; // other scheme (ftp:, chrome:, etc.)
  return 'https://' + url;
}
