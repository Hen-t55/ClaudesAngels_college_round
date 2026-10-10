import type { Transport } from '../../shared/bus';
import type { OverlayState } from '../../shared/contract';
import { createOverlayRenderer, type OverlayHandle } from './renderer';

let activeRenderer: OverlayHandle | null = null;
let unsubscribe: (() => void) | null = null;

/**
 * Mounts the Handsfree Shadow DOM overlay, listening to OverlayState broadcasts.
 */
export function mountOverlay(transport: Transport): () => void {
  // Clean up any existing instance
  unmountOverlay();

  activeRenderer = createOverlayRenderer(document);

  unsubscribe = transport.on('overlay', (state: OverlayState) => {
    activeRenderer?.update(state);
  });

  return unmountOverlay;
}

/**
 * Removes the overlay from the DOM and cancels event listeners.
 */
export function unmountOverlay(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (activeRenderer) {
    activeRenderer.destroy();
    activeRenderer = null;
  }
}
