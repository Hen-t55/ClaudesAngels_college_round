import type { Telemetry } from '../shared/contract';

export interface BenchmarkMetricsSummary {
  session: string;
  system: 'mouse' | 'naive' | 'handsfree';
  level: 0 | 1 | 2;
  task: string;
  totalTrials: number;
  successfulTrials: number;
  accuracy: number; // 0..1
  meanCompletionTimeMs: number;
  fittsThroughputBps?: number; // bits per second (ISO 9241-9)
  selectionErrors: number;
  accidentalActivations: number;
}

export interface FittsTrialData {
  amplitude: number; // Distance D in px
  width: number; // Target diameter W in px
  movementTimeMs: number; // MT in ms
}

/**
 * Calculates Fitts' Law Throughput (TP) in bits per second (bps)
 * Index of Difficulty ID = log2(D / W + 1)
 * TP = ID / (MT_seconds)
 */
export function calculateFittsThroughput(trials: FittsTrialData[]): number {
  if (trials.length === 0) return 0;
  const valid = trials.filter(t => t.width > 0 && t.movementTimeMs > 0);
  if (valid.length === 0) return 0;

  const totalThroughput = valid.reduce((sum, t) => {
    const id = Math.log2(t.amplitude / t.width + 1);
    const mtSec = t.movementTimeMs / 1000;
    return sum + (id / mtSec);
  }, 0);

  return +(totalThroughput / valid.length).toFixed(3);
}

/**
 * Aggregates a series of raw Telemetry logs into benchmark performance metrics.
 */
export function calculateBenchmarkMetrics(rows: Telemetry[]): BenchmarkMetricsSummary[] {
  const groups = new Map<string, Telemetry[]>();

  for (const row of rows) {
    const key = `${row.session}_${row.system}_${row.level}_${row.task}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }

  const summaries: BenchmarkMetricsSummary[] = [];

  for (const [, items] of groups.entries()) {
    if (items.length === 0) continue;
    const first = items[0];
    const trialStarts = new Map<number, number>();
    const trialDurations: number[] = [];
    const fittsTrials: FittsTrialData[] = [];
    let successes = 0;
    let errors = 0;
    let accidental = 0;

    for (const item of items) {
      if (item.event === 'trial_start') {
        trialStarts.set(item.trial, item.ts);
      } else if (item.event === 'trial_end') {
        const startTs = trialStarts.get(item.trial);
        if (startTs !== undefined) {
          const duration = item.ts - startTs;
          trialDurations.push(duration);

          if (item.extra && typeof item.extra.amplitude === 'number' && typeof item.extra.width === 'number') {
            fittsTrials.push({
              amplitude: item.extra.amplitude as number,
              width: item.extra.width as number,
              movementTimeMs: duration,
            });
          }
        }
        if (item.correct === true) {
          successes++;
        } else if (item.correct === false) {
          errors++;
        }
      } else if (item.event === 'selection_error') {
        errors++;
      } else if (item.event === 'accidental_activation') {
        accidental++;
      }
    }

    const totalTrials = Math.max(1, successes + errors);
    const meanTime =
      trialDurations.length > 0
        ? trialDurations.reduce((a, b) => a + b, 0) / trialDurations.length
        : 0;

    summaries.push({
      session: first.session,
      system: first.system,
      level: first.level,
      task: first.task,
      totalTrials,
      successfulTrials: successes,
      accuracy: +(successes / totalTrials).toFixed(3),
      meanCompletionTimeMs: Math.round(meanTime),
      fittsThroughputBps: fittsTrials.length > 0 ? calculateFittsThroughput(fittsTrials) : undefined,
      selectionErrors: errors,
      accidentalActivations: accidental,
    });
  }

  return summaries;
}

/**
 * Generates counterbalanced Latin Square matrix for (systems x levels).
 * Ensures unbiased testing order across participants.
 */
export function generateCounterbalancedPlan(participantId: string | number): Array<{
  system: 'mouse' | 'naive' | 'handsfree';
  level: 0 | 1 | 2;
}> {
  const systems: Array<'mouse' | 'naive' | 'handsfree'> = ['mouse', 'naive', 'handsfree'];
  const levels: Array<0 | 1 | 2> = [0, 1, 2];

  const pid = typeof participantId === 'string' ? Math.abs(hashCode(participantId)) : Math.abs(participantId);
  const sysOffset = pid % systems.length;
  const lvlOffset = Math.floor(pid / systems.length) % levels.length;

  const plan: Array<{ system: 'mouse' | 'naive' | 'handsfree'; level: 0 | 1 | 2 }> = [];

  for (let s = 0; s < systems.length; s++) {
    const sys = systems[(s + sysOffset) % systems.length];
    for (let l = 0; l < levels.length; l++) {
      const lvl = levels[(l + lvlOffset) % levels.length];
      plan.push({ system: sys, level: lvl });
    }
  }

  return plan;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Converts telemetry logs to standard CSV string.
 */
export function exportTelemetryToCSV(rows: Telemetry[]): string {
  const headers = ['session', 'system', 'task', 'level', 'trial', 'event', 'ts', 'target', 'correct', 'extra_json'];
  const lines: string[] = [headers.join(',')];

  for (const r of rows) {
    const line = [
      escapeCsv(r.session),
      escapeCsv(r.system),
      escapeCsv(r.task),
      r.level,
      r.trial,
      escapeCsv(r.event),
      r.ts,
      escapeCsv(r.target || ''),
      r.correct !== undefined ? r.correct : '',
      escapeCsv(r.extra ? JSON.stringify(r.extra) : ''),
    ];
    lines.push(line.join(','));
  }

  return lines.join('\n');
}

/**
 * Converts telemetry logs to JSON string.
 */
export function exportTelemetryToJSON(rows: Telemetry[]): string {
  return JSON.stringify(rows, null, 2);
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
