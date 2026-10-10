import { describe, it, expect, beforeEach } from 'vitest';
import { SetupManager } from '../../src/sidepanel/vision/SetupManager';

describe('SetupManager', () => {
  let setup: SetupManager;

  beforeEach(() => {
    setup = new SetupManager();
  });

  it('starts setup in neutral step with 0.1 progress', () => {
    const res = setup.startSetup(1000);
    expect(res.step).toBe('neutral');
    expect(res.progress).toBe(0.1);
    expect(res.ok).toBe(true);
    expect(setup.isRunning()).toBe(true);
  });

  it('progresses neutral step over 3s and advances to corners step', () => {
    let t = 1000;
    setup.startSetup(t);

    // Process 1.5s in neutral step
    t += 1500;
    const res1 = setup.processSample(0.01, -0.01, true, t);
    expect(res1?.step).toBe('neutral');
    expect(res1?.progress).toBeGreaterThan(0.2);

    // Complete 3.0s neutral step -> transitions to corners step
    t += 1600;
    const res2 = setup.processSample(0.02, 0.01, true, t);
    expect(res2?.step).toBe('corners');
    expect(res2?.progress).toBe(0.5);
    expect(res2?.baselinePitch).toBeDefined();
    expect(res2?.baselineYaw).toBeDefined();
  });

  it('completes corners step after 4s and derives dynamic gain', () => {
    let t = 1000;
    setup.startSetup(t);
    t += 3100;
    setup.processSample(0.0, 0.0, true, t); // Advance to corners

    // Process corner extremes
    t += 2000;
    setup.processSample(-0.3, -0.4, true, t); // Top left extreme
    t += 2100;
    const resDone = setup.processSample(0.3, 0.4, true, t); // Bottom right extreme

    expect(resDone?.step).toBe('done');
    expect(resDone?.progress).toBe(1.0);
    expect(resDone?.derivedGain).toBeGreaterThan(1.0);
    expect(setup.isRunning()).toBe(false);
  });

  it('handles face loss gracefully during setup with ok: false', () => {
    let t = 1000;
    setup.startSetup(t);

    t += 500;
    const res = setup.processSample(0, 0, false, t);
    expect(res?.ok).toBe(false);
    expect(res?.prompt).toContain('Face lost');
  });
});
