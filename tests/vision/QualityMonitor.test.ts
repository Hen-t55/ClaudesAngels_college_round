import { describe, it, expect, beforeEach } from 'vitest';
import { QualityMonitor } from '../../src/sidepanel/vision/QualityMonitor';

describe('QualityMonitor', () => {
  let monitor: QualityMonitor;

  beforeEach(() => {
    monitor = new QualityMonitor(500); // 500ms interval
  });

  it('throttles head.quality emission to ~500ms intervals', () => {
    let t = 1000;
    const res1 = monitor.process(0.01, 0.02, true, 0.95, null, t);
    expect(res1).not.toBeNull();
    expect(res1?.t).toBe('head.quality');

    // 200ms later (should return null due to throttling)
    t += 200;
    const res2 = monitor.process(0.01, 0.02, true, 0.95, null, t);
    expect(res2).toBeNull();

    // 550ms later (should emit quality metrics)
    t += 350;
    const res3 = monitor.process(0.01, 0.02, true, 0.95, null, t);
    expect(res3).not.toBeNull();
  });

  it('calculates jitter standard deviation over nose history', () => {
    let t = 1000;
    monitor.process(0.0, 0.0, true, 0.95, null, t);

    // Feed variable nose positions
    monitor.process(0.05, 0.05, true, 0.95, null, t + 100);
    monitor.process(0.01, 0.01, true, 0.95, null, t + 200);

    const jitter = monitor.calculateJitter();
    expect(jitter).toBeGreaterThan(0);
  });
});
