import type { Telemetry } from '../shared/contract';

export interface AblationEntry {
  feature: string;
  enabledTimeMs: number;
  disabledTimeMs: number;
  enabledErrorRate: number; // 0..1
  disabledErrorRate: number; // 0..1
  impactSummary: string;
}

export const FIXTURE_ABLATIONS: AblationEntry[] = [
  {
    feature: 'Quadrant Scope (2x2 Screen Split)',
    enabledTimeMs: 1420,
    disabledTimeMs: 3680,
    enabledErrorRate: 0.04,
    disabledErrorRate: 0.28,
    impactSummary: 'Reduces search space and false positive matches by 73%.',
  },
  {
    feature: 'Look-Away Auto-Pause',
    enabledTimeMs: 1510,
    disabledTimeMs: 1890,
    enabledErrorRate: 0.02,
    disabledErrorRate: 0.22,
    impactSummary: 'Eliminates 91% of accidental selections when user turns head.',
  },
  {
    feature: 'Important Action Confirmation Policy',
    enabledTimeMs: 1650,
    disabledTimeMs: 1380,
    enabledErrorRate: 0.01,
    disabledErrorRate: 0.16,
    impactSummary: 'Prevents destructive actions (checkout, purchase, delete) with zero accidental submits.',
  },
  {
    feature: '2-Gear Shifter (Hop vs. Voice Badges)',
    enabledTimeMs: 1390,
    disabledTimeMs: 2750,
    enabledErrorRate: 0.03,
    disabledErrorRate: 0.19,
    impactSummary: 'Enables rapid head flick selection in high noise when voice SNR drops.',
  },
  {
    feature: 'Recursive 3x3 Zoom Grid & Fallbacks',
    enabledTimeMs: 1820,
    disabledTimeMs: 4400,
    enabledErrorRate: 0.05,
    disabledErrorRate: 0.35,
    impactSummary: 'Guarantees sub-pixel targeting on dense/unlabeled links without mouse.',
  },
];

export const FIXTURE_TELEMETRY_SESSIONS: Telemetry[] = [
  // Participant 1 - Level 0 Clean
  { session: 'P1_ses', system: 'mouse', task: 'T1', level: 0, trial: 1, event: 'trial_start', ts: 1000 },
  { session: 'P1_ses', system: 'mouse', task: 'T1', level: 0, trial: 1, event: 'trial_end', correct: true, ts: 1650, extra: { amplitude: 250, width: 40 } },
  { session: 'P1_ses', system: 'handsfree', task: 'T1', level: 0, trial: 1, event: 'trial_start', ts: 2000 },
  { session: 'P1_ses', system: 'handsfree', task: 'T1', level: 0, trial: 1, event: 'trial_end', correct: true, ts: 3120, extra: { amplitude: 250, width: 40 } },
  { session: 'P1_ses', system: 'naive', task: 'T1', level: 0, trial: 1, event: 'trial_start', ts: 4000 },
  { session: 'P1_ses', system: 'naive', task: 'T1', level: 0, trial: 1, event: 'trial_end', correct: true, ts: 4890, extra: { amplitude: 250, width: 40 } },

  // Level 1 Moderate Impairment
  { session: 'P1_ses', system: 'mouse', task: 'T1', level: 1, trial: 1, event: 'trial_start', ts: 6000 },
  { session: 'P1_ses', system: 'mouse', task: 'T1', level: 1, trial: 1, event: 'trial_end', correct: true, ts: 1820, extra: { amplitude: 250, width: 40 } },
  { session: 'P1_ses', system: 'handsfree', task: 'T1', level: 1, trial: 1, event: 'trial_start', ts: 8000 },
  { session: 'P1_ses', system: 'handsfree', task: 'T1', level: 1, trial: 1, event: 'trial_end', correct: true, ts: 9480, extra: { amplitude: 250, width: 40 } },
  { session: 'P1_ses', system: 'naive', task: 'T1', level: 1, trial: 1, event: 'trial_start', ts: 11000 },
  { session: 'P1_ses', system: 'naive', task: 'T1', level: 1, trial: 1, event: 'trial_end', correct: false, ts: 17200, extra: { amplitude: 250, width: 40 } },

  // Level 2 Severe Impairment
  { session: 'P1_ses', system: 'mouse', task: 'T1', level: 2, trial: 1, event: 'trial_start', ts: 19000 },
  { session: 'P1_ses', system: 'mouse', task: 'T1', level: 2, trial: 1, event: 'trial_end', correct: true, ts: 21100, extra: { amplitude: 250, width: 40 } },
  { session: 'P1_ses', system: 'handsfree', task: 'T1', level: 2, trial: 1, event: 'trial_start', ts: 23000 },
  { session: 'P1_ses', system: 'handsfree', task: 'T1', level: 2, trial: 1, event: 'trial_end', correct: true, ts: 25100, extra: { amplitude: 250, width: 40 } },
  { session: 'P1_ses', system: 'naive', task: 'T1', level: 2, trial: 1, event: 'trial_start', ts: 27000 },
  { session: 'P1_ses', system: 'naive', task: 'T1', level: 2, trial: 1, event: 'trial_end', correct: false, ts: 36800, extra: { amplitude: 250, width: 40 } },
];
