import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeadSimulator } from '../../src/sidepanel/vision/HeadSimulator';
import type { HeadEvent } from '../../src/shared/contract';

describe('HeadSimulator', () => {
  let sim: HeadSimulator;
  let emittedEvents: HeadEvent[];

  beforeEach(() => {
    sim = new HeadSimulator();
    emittedEvents = [];
    sim.onEvent((evt) => emittedEvents.push(evt));
    sim.enable();
  });

  afterEach(() => {
    sim.disable();
  });

  it('emits quadrant events for Q, E, Z, C keys', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));

    expect(emittedEvents).toEqual([
      { t: 'head.quadrant', q: 'TL', stable: true },
      { t: 'head.quadrant', q: 'TR', stable: true },
      { t: 'head.quadrant', q: 'BL', stable: true },
      { t: 'head.quadrant', q: 'BR', stable: true },
    ]);
  });

  it('emits flick events for arrow keys', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(emittedEvents).toEqual([
      { t: 'head.flick', dir: 'up' },
      { t: 'head.flick', dir: 'down' },
      { t: 'head.flick', dir: 'left' },
      { t: 'head.flick', dir: 'right' },
    ]);
  });

  it('emits nod and shake events for N and X keys', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));

    expect(emittedEvents).toEqual([
      { t: 'head.nod' },
      { t: 'head.shake' },
    ]);
  });

  it('toggles facing event for L key', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));

    expect(emittedEvents).toEqual([
      { t: 'head.facing', facing: false },
      { t: 'head.facing', facing: true },
    ]);
  });

  it('emits head.pointer event on mouse move', () => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 150 }));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].t).toBe('head.pointer');
  });

  it('stops emitting events when disabled', () => {
    sim.disable();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    expect(emittedEvents.length).toBe(0);
  });
});
