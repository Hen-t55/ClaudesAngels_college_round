import '../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { chromeTransport } from '../shared/bus';
import { createHeadModule } from './vision';
import { startOrchestrator } from './orchestrator';

const transport = chromeTransport('sidepanel');

// Start modules
createHeadModule(transport);
startOrchestrator({ transport });

const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
