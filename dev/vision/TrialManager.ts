export interface TrialRecord {
  action: 'nod' | 'shake' | 'flick_up' | 'flick_down' | 'flick_left' | 'flick_right' | 'neutral_reading';
  expectedCount: number;
  hits: number;
  misses: number;
  falsePositives: number;
}

export interface TesterSessionData {
  testerId: string;
  lighting: 'normal' | 'low_light';
  timestamp: string;
  trials: TrialRecord[];
  accuracy: number;
  falsePositiveRate: number;
}

export class TrialManager {
  private currentTester = 'Tester 1';
  private currentLighting: 'normal' | 'low_light' = 'normal';
  private trials: TrialRecord[] = [];

  constructor(testerId = 'Tester 1', lighting: 'normal' | 'low_light' = 'normal') {
    this.currentTester = testerId;
    this.currentLighting = lighting;
  }

  public setTester(testerId: string): void {
    this.currentTester = testerId;
  }

  public setLighting(lighting: 'normal' | 'low_light'): void {
    this.currentLighting = lighting;
  }

  public addTrial(trial: TrialRecord): void {
    this.trials.push(trial);
  }

  public clearTrials(): void {
    this.trials = [];
  }

  public getTrials(): TrialRecord[] {
    return [...this.trials];
  }

  public calculateStats(): { accuracy: number; falsePositiveRate: number } {
    let totalExpected = 0;
    let totalHits = 0;
    let totalFalsePositives = 0;
    let totalAttempts = 0;

    for (const t of this.trials) {
      if (t.action !== 'neutral_reading') {
        totalExpected += t.expectedCount;
        totalHits += t.hits;
      }
      totalFalsePositives += t.falsePositives;
      totalAttempts += t.expectedCount;
    }

    const accuracy = totalExpected > 0 ? Math.min(1.0, totalHits / totalExpected) : 1.0;
    const falsePositiveRate = totalAttempts > 0 ? totalFalsePositives / totalAttempts : 0.0;

    return { accuracy, falsePositiveRate };
  }

  public exportSessionJSON(): string {
    const stats = this.calculateStats();
    const session: TesterSessionData = {
      testerId: this.currentTester,
      lighting: this.currentLighting,
      timestamp: new Date().toISOString(),
      trials: this.trials,
      accuracy: parseFloat(stats.accuracy.toFixed(4)),
      falsePositiveRate: parseFloat(stats.falsePositiveRate.toFixed(4)),
    };
    return JSON.stringify(session, null, 2);
  }
}
