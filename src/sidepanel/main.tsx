import '../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { chromeTransport } from '../shared/bus';
import { createHeadModule } from './vision';
import { SpeechModule } from './voice';
import { startOrchestrator } from './orchestrator';
import { loadSettings, onSettingsChanged, saveSettings } from '../shared/settings';

const transport = chromeTransport('sidepanel');

// Load persisted settings first, then start all modules
loadSettings().then((settings) => {
  // Start vision module (tracker + keyboard simulator fallback)
  const visionHandle = createHeadModule(transport);

  visionHandle.tracker.start().catch((err) => {
    console.warn('[Handsfree Sidepanel] Webcam unavailable, enabling keyboard simulator:', err);
    visionHandle.setSimulatorActive(true);
  });

  // Apply simulator setting
  if (settings.simulatorEnabled) visionHandle.setSimulatorActive(true);

  // Start speech module with persisted language
  const speechModule = new SpeechModule(transport, {
    enableAudioLevel: true,
    lang: settings.language,
  });
  speechModule.start();

  // Start orchestrator with loaded settings
  const orchestrator = startOrchestrator({ transport, settings });

  // Listen for live settings changes from chrome.storage (e.g. written by P4 UI)
  onSettingsChanged((patch) => {
    transport.send('settings', { t: 'settings.set', patch: patch as Record<string, unknown> });
    if (patch.language) speechModule.setLanguage(patch.language);
    if (patch.simulatorEnabled !== undefined) visionHandle.setSimulatorActive(patch.simulatorEnabled);
  });

  // Handle settings.get / settings.set requests that come in from the UI or content
  // (the orchestrator handles get/set internally; here we also persist writes back to storage)
  transport.on('settings', (msg) => {
    if (msg.t === 'settings.set') {
      saveSettings(msg.patch as Partial<typeof settings>).catch(console.error);
    }
  });

  // Mount sidepanel App
  const root = createRoot(document.getElementById('root')!);
  root.render(
    <React.StrictMode>
      <App transport={transport} />
    </React.StrictMode>
  );

  // Expose for manual console testing
  if (typeof window !== 'undefined') {
    (window as any).__handsfree = { transport, visionHandle, speechModule, orchestrator };
  }
});
