// Settings module (P3). Persists to chrome.storage.sync when in extension context,
// falls back to an in-memory map for tests and dev harnesses.

import type { Gear } from './contract';

export interface HandsfreeSettings {
  /** Preferred starting gear: 'hop' | 'voice'. Auto-suggest can override unless pinned. */
  preferredGear: Gear;
  /** BCP-47 language tag for Web Speech API, e.g. 'en-IN', 'en-US'. */
  language: string;
  /**
   * Extra keywords that mark an action as "important" (confirmation required).
   * Added on top of the built-in list (close tab, purchase, delete, etc.)
   */
  importantKeywords: string[];
  /** Jitter threshold above which auto-suggest switches to voice gear (0..1). */
  jitterThresholdHigh: number;
  /** SNR dB threshold below which auto-suggest switches to hop gear. */
  snrThresholdLow: number;
  /** Speech confidence threshold below which auto-suggest switches to hop gear (0..1). */
  confidenceThresholdLow: number;
  /** Whether the keyboard head simulator is enabled. */
  simulatorEnabled: boolean;
}

export const DEFAULT_SETTINGS: HandsfreeSettings = {
  preferredGear: 'hop',
  language: 'en-IN',
  importantKeywords: [],
  jitterThresholdHigh: 0.08,
  snrThresholdLow: 10,
  confidenceThresholdLow: 0.55,
  simulatorEnabled: false,
};

// ---------- Storage back-end abstraction ----------

/** In-memory fallback for tests / non-extension contexts */
const memoryStore: Partial<HandsfreeSettings> = {};

function isChromeStorageAvailable(): boolean {
  try {
    return (
      typeof chrome !== 'undefined' &&
      typeof chrome.storage !== 'undefined' &&
      typeof chrome.storage.sync !== 'undefined'
    );
  } catch {
    return false;
  }
}

/** Load the full settings object, merging stored values over defaults. */
export async function loadSettings(): Promise<HandsfreeSettings> {
  if (!isChromeStorageAvailable()) {
    return { ...DEFAULT_SETTINGS, ...memoryStore };
  }
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (stored) => {
      resolve({ ...DEFAULT_SETTINGS, ...(stored as Partial<HandsfreeSettings>) });
    });
  });
}

/** Persist a partial settings update. */
export async function saveSettings(patch: Partial<HandsfreeSettings>): Promise<void> {
  if (!isChromeStorageAvailable()) {
    Object.assign(memoryStore, patch);
    return;
  }
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(patch as Record<string, unknown>, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

/** Reset a single key to its default value. */
export async function resetSetting<K extends keyof HandsfreeSettings>(key: K): Promise<void> {
  const patch: Partial<HandsfreeSettings> = { [key]: DEFAULT_SETTINGS[key] };
  await saveSettings(patch);
}

/** Subscribe to external settings changes (e.g. written by P4's settings UI from another context). */
export function onSettingsChanged(
  cb: (changes: Partial<HandsfreeSettings>) => void
): () => void {
  if (!isChromeStorageAvailable()) {
    // No-op in test environment
    return () => {};
  }
  const listener = (
    rawChanges: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) => {
    if (areaName !== 'sync') return;
    const patch: Partial<HandsfreeSettings> = {};
    for (const key of Object.keys(rawChanges) as Array<keyof HandsfreeSettings>) {
      (patch as Record<string, unknown>)[key] = rawChanges[key].newValue;
    }
    if (Object.keys(patch).length > 0) cb(patch);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
