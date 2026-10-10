import '../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { chromeTransport } from '../shared/bus';
import { createHeadModule } from './vision';
import { SpeechModule } from './voice';
import { startOrchestrator } from './orchestrator';

const transport = chromeTransport('sidepanel');

// Start vision module (tracker + keyboard simulator)
const visionHandle = createHeadModule(transport);

// Attempt to start real webcam tracker; automatically activate keyboard simulator if camera fails
visionHandle.tracker.start().catch((err) => {
  console.warn('[Handsfree Sidepanel] Webcam tracking unavailable, enabling keyboard simulator (Q/E/Z/C, arrows, N/X):', err);
  visionHandle.setSimulatorActive(true);
});

// Start speech module
const speechModule = new SpeechModule(transport, { enableAudioLevel: true });
speechModule.start();

// Start state machine orchestrator
const orchestrator = startOrchestrator({ transport });

// Mount sidepanel App with transport
const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App transport={transport} />
  </React.StrictMode>
);

// Expose on window for manual console testing/simulation
if (typeof window !== 'undefined') {
  (window as any).__handsfree = {
    transport,
    visionHandle,
    speechModule,
    orchestrator,
  };
}
