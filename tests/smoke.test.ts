import { describe, it, expect } from 'vitest';
import type { Phase, Gear } from '../src/shared/contract';
import { memoryTransport } from '../src/shared/bus';

describe('contract', () => {
  it('Phase and Gear types compile', () => {
    const p: Phase = 'IDLE';
    const g: Gear = 'hop';
    expect(p).toBe('IDLE');
    expect(g).toBe('hop');
  });
});

describe('memoryTransport', () => {
  it('delivers messages between sides', async () => {
    const [a, b] = memoryTransport();
    const received: string[] = [];
    b.on('engine.event', (data) => {
      received.push(data.t);
    });
    a.send('engine.event', { t: 'engine.ready', url: 'https://example.com' });
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(['engine.ready']);
  });

  it('unsubscribes correctly', async () => {
    const [a, b] = memoryTransport();
    const received: string[] = [];
    const off = b.on('speech', (data) => {
      received.push(data.t);
    });
    a.send('speech', { t: 'speech.onset' });
    await new Promise((r) => setTimeout(r, 10));
    off();
    a.send('speech', { t: 'speech.onset' });
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(['speech.onset']);
  });
});
