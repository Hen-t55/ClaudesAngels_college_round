import { describe, it, expect, beforeEach } from 'vitest';
import type { Telemetry } from '../shared/contract';
import {
  calculateFittsThroughput,
  calculateBenchmarkMetrics,
  generateCounterbalancedPlan,
  exportTelemetryToCSV,
  exportTelemetryToJSON,
} from './metrics';
import { BENCHMARK_IMPAIRMENT_PRESETS } from './presets';

describe('Chaos Lab Evaluation & Metrics Suite', () => {
  it('calculates Fitts throughput (bps) correctly using ISO 9241-9 formula', () => {
    // Distance D = 300px, Width W = 30px => ID = log2(300/30 + 1) = log2(11) = ~3.4594 bits
    // Movement time MT = 1000ms (1.0s) => Throughput = ~3.459 bps
    const trials = [
      { amplitude: 300, width: 30, movementTimeMs: 1000 },
      { amplitude: 300, width: 30, movementTimeMs: 1000 },
    ];

    const tp = calculateFittsThroughput(trials);
    expect(tp).toBeCloseTo(3.459, 2);
  });

  it('aggregates raw telemetry logs into summary performance metrics', () => {
    const logs: Telemetry[] = [
      // Trial 1: T1 Fitts target (success, 800ms)
      {
        session: 'ses_01',
        system: 'handsfree',
        level: 1,
        task: 'T1',
        trial: 1,
        event: 'trial_start',
        ts: 1000,
        extra: { amplitude: 200, width: 40 },
      },
      {
        session: 'ses_01',
        system: 'handsfree',
        level: 1,
        task: 'T1',
        trial: 1,
        event: 'trial_end',
        correct: true,
        ts: 1800,
        extra: { amplitude: 200, width: 40 },
      },
      // Trial 2: T1 Fitts target (error, 1200ms)
      {
        session: 'ses_01',
        system: 'handsfree',
        level: 1,
        task: 'T1',
        trial: 2,
        event: 'trial_start',
        ts: 2000,
        extra: { amplitude: 200, width: 40 },
      },
      {
        session: 'ses_01',
        system: 'handsfree',
        level: 1,
        task: 'T1',
        trial: 2,
        event: 'trial_end',
        correct: false,
        ts: 3200,
        extra: { amplitude: 200, width: 40 },
      },
      // Accidental activation
      {
        session: 'ses_01',
        system: 'handsfree',
        level: 1,
        task: 'T1',
        trial: 2,
        event: 'accidental_activation',
        ts: 3500,
      },
    ];

    const summaries = calculateBenchmarkMetrics(logs);
    expect(summaries.length).toBe(1);

    const s = summaries[0];
    expect(s.system).toBe('handsfree');
    expect(s.level).toBe(1);
    expect(s.task).toBe('T1');
    expect(s.totalTrials).toBe(2);
    expect(s.successfulTrials).toBe(1);
    expect(s.accuracy).toBe(0.5);
    expect(s.meanCompletionTimeMs).toBe(1000); // (800 + 1200) / 2
    expect(s.selectionErrors).toBe(1);
    expect(s.accidentalActivations).toBe(1);
    expect(s.fittsThroughputBps).toBeGreaterThan(0);
  });

  it('generates counterbalanced Latin square order across systems and levels', () => {
    const planP1 = generateCounterbalancedPlan('P-01');
    const planP2 = generateCounterbalancedPlan('P-02');

    expect(planP1.length).toBe(9); // 3 systems * 3 levels
    expect(planP2.length).toBe(9);

    // Ensure all 3 systems are represented
    const systemsP1 = new Set(planP1.map((p) => p.system));
    expect(systemsP1.size).toBe(3);

    // Ensure all 3 levels (0, 1, 2) are represented
    const levelsP1 = new Set(planP1.map((p) => p.level));
    expect(levelsP1.size).toBe(3);
  });

  it('exports telemetry rows to well-formatted CSV and JSON', () => {
    const logs: Telemetry[] = [
      {
        session: 'ses_01',
        system: 'mouse',
        task: 'T2',
        level: 0,
        trial: 1,
        event: 'trial_start',
        ts: 1680000000,
      },
      {
        session: 'ses_01',
        system: 'mouse',
        task: 'T2',
        level: 0,
        trial: 1,
        event: 'trial_end',
        correct: true,
        ts: 1680002500,
        target: 'submit_btn',
      },
    ];

    const csv = exportTelemetryToCSV(logs);
    expect(csv).toContain('session,system,task,level,trial,event,ts,target,correct,extra_json');
    expect(csv).toContain('ses_01,mouse,T2,0,1,trial_start,1680000000');
    expect(csv).toContain('ses_01,mouse,T2,0,1,trial_end,1680002500,submit_btn,true');

    const json = exportTelemetryToJSON(logs);
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(2);
    expect(parsed[0].system).toBe('mouse');
  });

  it('provides labeled simulated impairment presets for levels 0, 1, and 2', () => {
    expect(BENCHMARK_IMPAIRMENT_PRESETS[0].level).toBe(0);
    expect(BENCHMARK_IMPAIRMENT_PRESETS[0].config.tremorAmp).toBe(0.0);

    expect(BENCHMARK_IMPAIRMENT_PRESETS[1].level).toBe(1);
    expect(BENCHMARK_IMPAIRMENT_PRESETS[1].config.tremorAmp).toBeGreaterThan(0);
    expect(BENCHMARK_IMPAIRMENT_PRESETS[1].noiseVolume).toBeGreaterThan(0);

    expect(BENCHMARK_IMPAIRMENT_PRESETS[2].level).toBe(2);
    expect(BENCHMARK_IMPAIRMENT_PRESETS[2].config.tremorAmp).toBeGreaterThan(
      BENCHMARK_IMPAIRMENT_PRESETS[1].config.tremorAmp
    );
    expect(BENCHMARK_IMPAIRMENT_PRESETS[2].noiseVolume).toBeGreaterThan(
      BENCHMARK_IMPAIRMENT_PRESETS[1].noiseVolume
    );
  });
});
