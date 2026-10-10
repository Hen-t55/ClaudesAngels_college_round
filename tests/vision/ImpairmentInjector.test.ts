import { describe, it, expect } from 'vitest';
import { ImpairmentInjector, SeededPRNG } from '../../src/sidepanel/vision/ImpairmentInjector';
import type { ImpairmentConfig } from '../../src/shared/contract';

describe('ImpairmentInjector (Determinism)', () => {
  const cfg: ImpairmentConfig = {
    seed: 12345,
    tremorAmp: 0.08,
    tremorHz: [6, 10],
    brightness: 0.7,
    dropFramePct: 30,
  };

  it('produces 100% identical PRNG sequences for the same seed', () => {
    const rng1 = new SeededPRNG(12345);
    const rng2 = new SeededPRNG(12345);

    const seq1 = Array.from({ length: 50 }, () => rng1.next());
    const seq2 = Array.from({ length: 50 }, () => rng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('produces 100% deterministic tremor and frame-drop decisions for a fixed seed', () => {
    const inj1 = new ImpairmentInjector();
    const inj2 = new ImpairmentInjector();

    inj1.setConfig(cfg);
    inj2.setConfig(cfg);

    const rawPose = { pitch: 0.1, yaw: -0.05, roll: 0.0 };
    let t = 1000;

    const drops1: boolean[] = [];
    const tremors1: { pitch: number; yaw: number }[] = [];

    const drops2: boolean[] = [];
    const tremors2: { pitch: number; yaw: number }[] = [];

    for (let i = 0; i < 40; i++) {
      t += 33;
      drops1.push(inj1.shouldDropFrame());
      tremors1.push(inj1.applyTremor(rawPose, t));

      drops2.push(inj2.shouldDropFrame());
      tremors2.push(inj2.applyTremor(rawPose, t));
    }

    expect(drops1).toEqual(drops2);
    expect(tremors1).toEqual(tremors2);
  });

  it('disables impairments when config is null', () => {
    const inj = new ImpairmentInjector();
    inj.setConfig(null);

    expect(inj.shouldDropFrame()).toBe(false);

    const raw = { pitch: 0.1, yaw: 0.2, roll: 0.0 };
    const res = inj.applyTremor(raw, 1000);
    expect(res).toEqual(raw);
  });
});
