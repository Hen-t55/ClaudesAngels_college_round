/**
 * OneEuroFilter: Adaptive Low-Pass Filter for Signal Smoothing with Low Latency
 *
 * Paper: Casiez et al., "1€ Filter: A Simple Speed-Based Low-Pass Filter for Noisy Input in Interactive Systems" (CHI 2012)
 *
 * Filters high-frequency jitter when stationary (low speed) while preserving low latency during rapid movement (high speed).
 */

export interface OneEuroFilterParams {
  minCutoff: number; // Minimum cutoff frequency in Hz (reduces jitter when stationary)
  beta: number;      // Speed coefficient (dynamically increases cutoff frequency during movement)
  dCutoff: number;   // Cutoff frequency for derivative filtering in Hz
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(params: Partial<OneEuroFilterParams> = {}) {
    this.minCutoff = params.minCutoff ?? 1.0;
    this.beta = params.beta ?? 0.007;
    this.dCutoff = params.dCutoff ?? 1.0;
  }

  /**
   * Filter a noisy input signal x at timestampMs (in milliseconds).
   */
  public filter(x: number, timestampMs: number): number {
    if (this.tPrev === null || this.xPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = timestampMs;
      return x;
    }

    const dt = (timestampMs - this.tPrev) / 1000.0; // convert to seconds
    this.tPrev = timestampMs;

    // Guard against zero or negative time deltas (e.g. duplicate frames)
    if (dt <= 1e-6) {
      return this.xPrev;
    }

    // 1. Calculate raw derivative dx
    const dx = (x - this.xPrev) / dt;

    // 2. Filter derivative dx using dCutoff
    const alphaD = this.alpha(this.dCutoff, dt);
    const dxHat = alphaD * dx + (1.0 - alphaD) * this.dxPrev;
    this.dxPrev = dxHat;

    // 3. Dynamically adjust cutoff frequency based on speed
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);

    // 4. Filter signal x using dynamic cutoff
    const alphaX = this.alpha(cutoff, dt);
    const xHat = alphaX * x + (1.0 - alphaX) * this.xPrev;
    this.xPrev = xHat;

    return xHat;
  }

  /**
   * Reset filter internal state.
   */
  public reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  /**
   * Update parameters at runtime.
   */
  public setParams(params: Partial<OneEuroFilterParams>): void {
    if (params.minCutoff !== undefined) this.minCutoff = params.minCutoff;
    if (params.beta !== undefined) this.beta = params.beta;
    if (params.dCutoff !== undefined) this.dCutoff = params.dCutoff;
  }

  public getParams(): OneEuroFilterParams {
    return {
      minCutoff: this.minCutoff,
      beta: this.beta,
      dCutoff: this.dCutoff,
    };
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }
}
