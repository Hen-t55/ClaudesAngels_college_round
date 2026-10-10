import { describe, it, expect, beforeEach } from 'vitest';
import { OneEuroFilter } from '../../src/sidepanel/vision/OneEuroFilter';

describe('OneEuroFilter', () => {
  let filter: OneEuroFilter;

  beforeEach(() => {
    filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 });
  });

  it('initializes and returns the first value directly', () => {
    const val = filter.filter(5.0, 1000);
    expect(val).toBe(5.0);
  });

  it('reduces high-frequency jitter at rest', () => {
    const baseValue = 10.0;
    const fps = 60;
    const dtMs = 1000 / fps;
    let t = 1000;

    // Prime the filter
    filter.filter(baseValue, t);

    const rawValues: number[] = [];
    const filteredValues: number[] = [];

    // Simulate resting signal with +/- 0.5 jitter
    for (let i = 0; i < 60; i++) {
      t += dtMs;
      const noise = (i % 2 === 0 ? 1 : -1) * 0.5;
      const raw = baseValue + noise;
      const filtered = filter.filter(raw, t);

      rawValues.push(raw);
      filteredValues.push(filtered);
    }

    // Compute standard deviation of raw vs filtered
    const meanRaw = rawValues.reduce((a, b) => a + b, 0) / rawValues.length;
    const meanFiltered = filteredValues.reduce((a, b) => a + b, 0) / filteredValues.length;

    const stdRaw = Math.sqrt(rawValues.reduce((sq, n) => sq + Math.pow(n - meanRaw, 2), 0) / rawValues.length);
    const stdFiltered = Math.sqrt(filteredValues.reduce((sq, n) => sq + Math.pow(n - meanFiltered, 2), 0) / filteredValues.length);

    // Filtered jitter (std dev) should be dramatically smaller than raw jitter
    expect(stdFiltered).toBeLessThan(stdRaw * 0.3);
  });

  it('has low lag on fast step response due to speed-based cutoff scaling', () => {
    const fps = 60;
    const dtMs = 1000 / fps;
    let t = 1000;

    // Baseline at 0
    filter.filter(0.0, t);

    // Sudden step jump from 0 to 10 over 6 frames
    let filteredVal = 0;
    for (let i = 0; i < 6; i++) {
      t += dtMs;
      filteredVal = filter.filter(10.0, t);
    }

    // By frame 6 after step jump, filtered output should be > 6.0 (tracking target 10.0 closely)
    expect(filteredVal).toBeGreaterThan(6.0);
  });

  it('allows parameter updates via setParams', () => {
    filter.setParams({ minCutoff: 0.1, beta: 0.05 });
    const params = filter.getParams();

    expect(params.minCutoff).toBe(0.1);
    expect(params.beta).toBe(0.05);
    expect(params.dCutoff).toBe(1.0); // unchanged
  });

  it('resets internal state cleanly', () => {
    let t = 1000;
    filter.filter(10.0, t);
    t += 16;
    filter.filter(20.0, t);

    filter.reset();

    // After reset, next input should act as first input
    const val = filter.filter(100.0, 5000);
    expect(val).toBe(100.0);
  });

  it('handles duplicate or out-of-order frame timestamps gracefully', () => {
    let t = 1000;
    filter.filter(10.0, t);

    // Duplicate timestamp
    const duplicateVal = filter.filter(15.0, t);
    expect(duplicateVal).toBe(10.0); // returns previous value without NaN
  });
});
