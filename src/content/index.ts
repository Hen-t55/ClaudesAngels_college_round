// Content script entry (P3). Starts engine and overlay.
import { chromeTransport } from '../shared/bus';
import { startEngine } from './engine';
import { mountOverlay } from './overlay';

const transport = chromeTransport('content');
startEngine(transport);
mountOverlay(transport);
