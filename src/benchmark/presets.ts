import type { ImpairmentConfig } from '../shared/contract';

export interface ImpairmentPreset {
  level: 0 | 1 | 2;
  label: string;
  description: string;
  config: ImpairmentConfig;
  noiseVolume: number; // 0..1 audio gain
  noiseDesc: string;
}

/**
 * Benchmark Impairment presets (Level 0, 1, 2)
 * Note: Labeled as simulated impairments for Chaos Lab evaluation.
 * P1 placeholder values; calibrated parameters can be pasted here.
 */
export const BENCHMARK_IMPAIRMENT_PRESETS: Record<0 | 1 | 2, ImpairmentPreset> = {
  0: {
    level: 0,
    label: 'Level 0: Clean / Baseline (Simulated)',
    description: 'Optimal conditions. No simulated tremor, standard lighting, zero frame drops, quiet environment.',
    config: {
      seed: 100,
      tremorAmp: 0.0,
      tremorHz: [0, 0],
      brightness: 1.0,
      dropFramePct: 0,
    },
    noiseVolume: 0.0,
    noiseDesc: 'Quiet ambient background (< 35 dB)',
  },
  1: {
    level: 1,
    label: 'Level 1: Moderate Impairment & Office Noise (Simulated)',
    description: 'Simulates moderate motor tremor (4-6 Hz, ~0.08 amplitude), mild lighting reduction, and typical background conversation noise.',
    config: {
      seed: 101,
      tremorAmp: 0.08,
      tremorHz: [4, 6],
      brightness: 0.65,
      dropFramePct: 10,
    },
    noiseVolume: 0.35,
    noiseDesc: 'Moderate cafeteria / open office chatter (~55 dB)',
  },
  2: {
    level: 2,
    label: 'Level 2: Severe Ataxia & High Noise (Simulated)',
    description: 'Simulates severe irregular ataxia tremor (3-8 Hz, ~0.18 amplitude), low light exposure, frame drop latency, and loud background noise.',
    config: {
      seed: 102,
      tremorAmp: 0.18,
      tremorHz: [3, 8],
      brightness: 0.3,
      dropFramePct: 30,
    },
    noiseVolume: 0.75,
    noiseDesc: 'Loud background noise & multi-speaker babble (~70 dB)',
  },
};
