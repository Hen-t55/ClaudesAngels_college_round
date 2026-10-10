import { describe, it, expect, beforeEach } from 'vitest';
import { GestureAnalyzer } from '../../src/sidepanel/vision/GestureAnalyzer';

describe('GestureAnalyzer', () => {
  let analyzer: GestureAnalyzer;

  beforeEach(() => {
    analyzer = new GestureAnalyzer({
      flickVelocityThreshold: 2.2,
      nodDeltaThreshold: 0.08,
      shakeDeltaThreshold: 0.10,
      refractoryMs: 400,
    });
  });

  it('detects flicks in four directions on high velocity impulses', () => {
    let t = 1000;
    analyzer.process(0, 0, t);

    // Rapid upward flick (pitch decreases quickly)
    t += 20; // 50 FPS (0.02s)
    const flickUp = analyzer.process(-0.15, 0, t); // pitchVel = -7.5 rad/s
    expect(flickUp).toEqual([{ type: 'flick', dir: 'up' }]);

    // Wait refractory period (450ms)
    t += 450;
    analyzer.process(0, 0, t);

    // Rapid right flick (yaw increases quickly)
    t += 20;
    const flickRight = analyzer.process(0, 0.15, t); // yawVel = +7.5 rad/s
    expect(flickRight).toEqual([{ type: 'flick', dir: 'right' }]);
  });

  it('does NOT trigger flicks on slow aiming or reading movements (false-positive immunity)', () => {
    let t = 1000;
    let pitch = 0;
    let yaw = 0;

    analyzer.process(pitch, yaw, t);

    // Simulate slow smooth reading movement across 10 frames (velocity ~ 0.5 rad/s)
    const detected: string[] = [];
    for (let i = 0; i < 10; i++) {
      t += 33; // ~30 FPS
      pitch += 0.015; // slow pitch change
      yaw += 0.015;   // slow yaw change
      const g = analyzer.process(pitch, yaw, t);
      if (g.length > 0) detected.push(g[0].type);
    }

    expect(detected.length).toBe(0);
  });

  it('does NOT trigger gestures on high-frequency tremor jitter', () => {
    let t = 1000;
    analyzer.process(0, 0, t);

    const detected: string[] = [];
    // Simulate 10Hz tremor jitter (+/- 0.02 rad)
    for (let i = 0; i < 20; i++) {
      t += 20;
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.02;
      const g = analyzer.process(jitter, jitter, t);
      if (g.length > 0) detected.push(g[0].type);
    }

    expect(detected.length).toBe(0);
  });

  it('detects Nod gesture on pitch down then up reversal', () => {
    let t = 1000;
    analyzer.process(0, 0, t);

    t += 50;
    analyzer.process(0.04, 0, t);
    t += 50;
    analyzer.process(0.12, 0, t); // downward stroke

    t += 50;
    const res = analyzer.process(0.02, 0, t); // upward recovery
    const hasNod = res.some((g) => g.type === 'nod');
    expect(hasNod).toBe(true);
  });

  it('detects Shake gesture on yaw left-right oscillation', () => {
    let t = 1000;
    analyzer.process(0, 0, t);

    // Moderate oscillation (~1.8 rad/s velocity below 2.2 flick threshold)
    t += 50;
    analyzer.process(0, -0.06, t);
    t += 50;
    analyzer.process(0, 0.06, t);
    t += 50;
    const res = analyzer.process(0, -0.04, t);

    const hasShake = res.some((g) => g.type === 'shake');
    expect(hasShake).toBe(true);
  });
});
