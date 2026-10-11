import { describe, it, expect, beforeEach } from 'vitest';
import { HeadTracker } from '../../src/sidepanel/vision/HeadTracker';
import type { HeadEvent } from '../../src/shared/contract';

describe('Robustness & Error Recovery (Prompt 6)', () => {
  let tracker: HeadTracker;
  let emittedEvents: HeadEvent[];

  beforeEach(() => {
    tracker = new HeadTracker();
    emittedEvents = [];
    tracker.onEvent((evt) => emittedEvents.push(evt));
  });

  it('emits error setup state on permission_denied error', () => {
    tracker.simulateErrorState('permission_denied');

    const setupEvt = emittedEvents.find((e) => e.t === 'head.setup') as Extract<HeadEvent, { t: 'head.setup' }>;
    expect(setupEvt).toBeDefined();
    expect(setupEvt.ok).toBe(false);
    expect(setupEvt.prompt).toContain('permission');
    expect(tracker.getErrorState()).toBe('permission_denied');
  });

  it('emits error setup state on camera_busy error', () => {
    tracker.simulateErrorState('camera_busy');

    const setupEvt = emittedEvents.find((e) => e.t === 'head.setup') as Extract<HeadEvent, { t: 'head.setup' }>;
    expect(setupEvt).toBeDefined();
    expect(setupEvt.ok).toBe(false);
    expect(setupEvt.prompt).toContain('busy');
    expect(tracker.getErrorState()).toBe('camera_busy');
  });

  it('emits camera disconnected state on disconnected error', () => {
    tracker.simulateErrorState('disconnected');

    const setupEvt = emittedEvents.find((e) => e.t === 'head.setup') as Extract<HeadEvent, { t: 'head.setup' }>;
    expect(setupEvt).toBeDefined();
    expect(setupEvt.ok).toBe(false);
    expect(setupEvt.prompt).toContain('disconnected');
    expect(tracker.getErrorState()).toBe('disconnected');
  });

  it('clears error state when set back to none', () => {
    tracker.simulateErrorState('camera_busy');
    expect(tracker.getErrorState()).toBe('camera_busy');

    tracker.simulateErrorState('none');
    expect(tracker.getErrorState()).toBe('none');
  });
});
