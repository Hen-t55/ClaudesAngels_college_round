import type { Quadrant, HeadMode } from '../../shared/contract';

export interface QuadrantResult {
  q: Quadrant | null;
  stable: boolean;
  changed: boolean;
}

export class QuadrantClassifier {
  private activeQuadrant: Quadrant | null = null;
  private candidateQuadrant: Quadrant | null = null;
  private candidateStartTime = 0;

  private isStable = false;
  private hysteresisMargin = 0.05; // 5% overlap zone around 0.5 boundary
  private dwellTimeMs = 300;       // 300 ms continuous dwell required for stability

  private mode: HeadMode = 'quadrant';

  constructor(dwellTimeMs = 300, hysteresisMargin = 0.05) {
    this.dwellTimeMs = dwellTimeMs;
    this.hysteresisMargin = hysteresisMargin;
  }

  public setMode(mode: HeadMode): void {
    this.mode = mode;
  }

  public getMode(): HeadMode {
    return this.mode;
  }

  public setHysteresisMargin(margin: number): void {
    this.hysteresisMargin = margin;
  }

  public setDwellTime(ms: number): void {
    this.dwellTimeMs = ms;
  }

  /**
   * Update classification with pointer (x, y) at timestampMs.
   * Returns result containing quadrant, stability flag, and whether state updated.
   */
  public update(x: number, y: number, timestampMs: number): QuadrantResult | null {
    if (this.mode === 'off') {
      return null;
    }

    if (this.mode === 'locked') {
      // Locked mode: freeze last active quadrant, stable: true
      return {
        q: this.activeQuadrant,
        stable: true,
        changed: false,
      };
    }

    // Determine target raw quadrant using hysteresis around 0.5 split
    let isRight = x >= 0.5;
    if (this.candidateQuadrant === 'TL' || this.candidateQuadrant === 'BL') {
      isRight = x >= 0.5 + this.hysteresisMargin;
    } else if (this.candidateQuadrant === 'TR' || this.candidateQuadrant === 'BR') {
      isRight = x >= 0.5 - this.hysteresisMargin;
    }

    let isBottom = y >= 0.5;
    if (this.candidateQuadrant === 'TL' || this.candidateQuadrant === 'TR') {
      isBottom = y >= 0.5 + this.hysteresisMargin;
    } else if (this.candidateQuadrant === 'BL' || this.candidateQuadrant === 'BR') {
      isBottom = y >= 0.5 - this.hysteresisMargin;
    }

    let detectedQ: Quadrant;
    if (!isRight && !isBottom) detectedQ = 'TL';
    else if (isRight && !isBottom) detectedQ = 'TR';
    else if (!isRight && isBottom) detectedQ = 'BL';
    else detectedQ = 'BR';

    // Quadrant candidate transition logic
    let stateChanged = false;

    if (detectedQ !== this.candidateQuadrant) {
      this.candidateQuadrant = detectedQ;
      this.candidateStartTime = timestampMs;
      this.isStable = false;
      stateChanged = true;
    } else {
      // Check if candidate has been dwelled in for >= dwellTimeMs
      const elapsed = timestampMs - this.candidateStartTime;
      if (elapsed >= this.dwellTimeMs && (!this.isStable || this.activeQuadrant !== this.candidateQuadrant)) {
        this.activeQuadrant = this.candidateQuadrant;
        this.isStable = true;
        stateChanged = true;
      }
    }

    return {
      q: this.isStable ? this.activeQuadrant : this.candidateQuadrant,
      stable: this.isStable,
      changed: stateChanged,
    };
  }

  public getActiveQuadrant(): Quadrant | null {
    return this.activeQuadrant;
  }

  public reset(): void {
    this.activeQuadrant = null;
    this.candidateQuadrant = null;
    this.candidateStartTime = 0;
    this.isStable = false;
  }
}
