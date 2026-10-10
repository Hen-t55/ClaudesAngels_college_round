// STUB — P2 replaces this.
import type { Transport } from '../../shared/bus';

export function startEngine(transport: Transport): void {
  console.log('[engine] stub loaded');
  transport.send('engine.event', { t: 'engine.ready', url: location.href });
}
