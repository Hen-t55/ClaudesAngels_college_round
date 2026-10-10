import { describe, it, expect, beforeEach } from 'vitest';
import { QuadrantClassifier } from '../../src/sidepanel/vision/QuadrantClassifier';

describe('QuadrantClassifier', () => {
  let classifier: QuadrantClassifier;

  beforeEach(() => {
    classifier = new QuadrantClassifier(300, 0.05); // 300ms dwell, 0.05 hysteresis
  });

  it('classifies 2x2 quadrants correctly based on pointer coordinates', () => {
    let t = 1000;
    // Top Left (0.2, 0.2)
    classifier.update(0.2, 0.2, t);
    t += 350;
    const tl = classifier.update(0.2, 0.2, t);
    expect(tl?.q).toBe('TL');
    expect(tl?.stable).toBe(true);
  });

  it('requires 300ms continuous dwell before emitting stable: true', () => {
    let t = 1000;
    // Initial entry into TR
    const res1 = classifier.update(0.8, 0.2, t);
    expect(res1?.q).toBe('TR');
    expect(res1?.stable).toBe(false);

    // Dwell for 150ms (still unstable)
    t += 150;
    const res2 = classifier.update(0.8, 0.2, t);
    expect(res2?.q).toBe('TR');
    expect(res2?.stable).toBe(false);

    // Dwell reaches 320ms (now stable)
    t += 170;
    const res3 = classifier.update(0.8, 0.2, t);
    expect(res3?.q).toBe('TR');
    expect(res3?.stable).toBe(true);
  });

  it('applies boundary hysteresis buffer to prevent boundary jitter', () => {
    let t = 1000;
    // Establish stable TL (0.2, 0.2)
    classifier.update(0.2, 0.2, t);
    t += 350;
    classifier.update(0.2, 0.2, t);

    // Move pointer to 0.52 (within 0.05 hysteresis band around 0.5)
    t += 50;
    const res = classifier.update(0.52, 0.2, t);
    // Should remain TL because 0.52 < 0.5 + 0.05 hysteresis boundary
    expect(res?.q).toBe('TL');
  });

  it('freezes active quadrant when set to locked mode', () => {
    let t = 1000;
    classifier.update(0.2, 0.2, t);
    t += 350;
    classifier.update(0.2, 0.2, t); // Stable TL

    classifier.setMode('locked');

    t += 100;
    // Move pointer to bottom right (0.9, 0.9) while locked
    const res = classifier.update(0.9, 0.9, t);
    expect(res?.q).toBe('TL'); // stays locked to TL
    expect(res?.stable).toBe(true);
  });

  it('suppresses events when set to off mode', () => {
    classifier.setMode('off');
    const res = classifier.update(0.2, 0.2, 1000);
    expect(res).toBeNull();
  });
});
