import { describe, it, expect } from 'vitest';
import { TrialManager } from '../../dev/vision/TrialManager';
import { RECOMMENDED_IMPAIRMENT_PRESETS } from '../../src/sidepanel/vision/ImpairmentInjector';

describe('TrialManager & Impairment Presets (Prompt 5)', () => {
  it('correctly calculates accuracy and false positive rates across trials', () => {
    const tm = new TrialManager('Tester 1', 'normal');

    tm.addTrial({ action: 'nod', expectedCount: 10, hits: 10, misses: 0, falsePositives: 0 });
    tm.addTrial({ action: 'shake', expectedCount: 10, hits: 9, misses: 1, falsePositives: 0 });
    tm.addTrial({ action: 'flick_up', expectedCount: 10, hits: 9, misses: 1, falsePositives: 1 });
    tm.addTrial({ action: 'neutral_reading', expectedCount: 0, hits: 0, misses: 0, falsePositives: 0 });

    const stats = tm.calculateStats();
    // 28 hits out of 30 expected = 93.3% accuracy
    expect(stats.accuracy).toBeCloseTo(28 / 30, 2);
    // 1 false positive out of 30 attempts = 3.3%
    expect(stats.falsePositiveRate).toBeCloseTo(1 / 30, 2);

    const jsonStr = tm.exportSessionJSON();
    expect(jsonStr).toContain('"testerId": "Tester 1"');
    expect(jsonStr).toContain('"accuracy": 0.9333');
  });

  it('verifies recommended impairment presets for Level 1 (mild) and Level 2 (severe)', () => {
    const l1 = RECOMMENDED_IMPAIRMENT_PRESETS[1];
    expect(l1.tremorAmp).toBe(0.035);
    expect(l1.tremorHz).toEqual([4, 7]);
    expect(l1.brightness).toBe(0.50);
    expect(l1.dropFramePct).toBe(15);

    const l2 = RECOMMENDED_IMPAIRMENT_PRESETS[2];
    expect(l2.tremorAmp).toBe(0.090);
    expect(l2.tremorHz).toEqual([5, 11]);
    expect(l2.brightness).toBe(0.25);
    expect(l2.dropFramePct).toBe(40);
  });
});
