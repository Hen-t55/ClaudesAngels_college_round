import type { ImpairmentConfig } from '../../shared/contract';

/**
 * Seeded PRNG (Mulberry32) for deterministic impairment generation.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export const RECOMMENDED_IMPAIRMENT_PRESETS: Record<1 | 2, Omit<ImpairmentConfig, 'seed'>> = {
  1: {
    // Level 1: Mild physiological tremor, slight underexposure, occasional frame drop
    tremorAmp: 0.035,
    tremorHz: [4, 7],
    brightness: 0.50,
    dropFramePct: 15,
  },
  2: {
    // Level 2: Severe tremor, dark room, heavy CPU frame throttling
    tremorAmp: 0.090,
    tremorHz: [5, 11],
    brightness: 0.25,
    dropFramePct: 40,
  },
};

export class ImpairmentInjector {
  private config: ImpairmentConfig | null = null;
  private prng: SeededPRNG | null = null;
  private startTimeMs = 0;

  public applyPreset(level: 1 | 2, seed = 42): void {
    const preset = RECOMMENDED_IMPAIRMENT_PRESETS[level];
    this.setConfig({
      seed,
      ...preset,
    });
  }

  public setConfig(cfg: ImpairmentConfig | null): void {
    this.config = cfg;
    if (cfg && cfg.seed !== undefined) {
      this.prng = new SeededPRNG(cfg.seed);
    } else {
      this.prng = null;
    }
  }

  public getConfig(): ImpairmentConfig | null {
    return this.config;
  }

  /**
   * Returns true if the current frame should be dropped based on dropFramePct.
   */
  public shouldDropFrame(): boolean {
    if (!this.config || this.config.dropFramePct <= 0) return false;
    const rand = this.prng ? this.prng.next() : Math.random();
    return rand * 100 < this.config.dropFramePct;
  }

  /**
   * Applies synthetic tremor noise to raw (pitch, yaw, roll) BEFORE filtering.
   */
  public applyTremor(
    raw: { pitch: number; yaw: number; roll: number },
    timestampMs: number
  ): { pitch: number; yaw: number; roll: number } {
    if (!this.config || this.config.tremorAmp <= 0) return raw;

    if (this.startTimeMs === 0) {
      this.startTimeMs = timestampMs;
    }

    const dt = (timestampMs - this.startTimeMs) / 1000.0;
    const [minHz, maxHz] = this.config.tremorHz || [6, 10];
    const midHz = (minHz + maxHz) / 2;

    const amp = this.config.tremorAmp;
    const noiseFactor = this.prng ? (this.prng.next() - 0.5) * 0.2 : 0;

    const phaseX = dt * midHz * 2 * Math.PI;
    const phaseY = dt * (midHz * 1.3) * 2 * Math.PI;

    const pitchNoise = Math.sin(phaseX) * amp + noiseFactor * amp;
    const yawNoise = Math.cos(phaseY) * amp + noiseFactor * amp;

    return {
      pitch: raw.pitch + pitchNoise,
      yaw: raw.yaw + yawNoise,
      roll: raw.roll,
    };
  }

  /**
   * Applies brightness dimming factor to image/luma (0.0 .. 1.0).
   */
  public applyBrightness(brightness: number): number {
    if (!this.config || this.config.brightness === undefined) return brightness;
    return Math.max(0, Math.min(1, brightness * this.config.brightness));
  }

  public reset(): void {
    if (this.config && this.config.seed !== undefined) {
      this.prng = new SeededPRNG(this.config.seed);
    }
    this.startTimeMs = 0;
  }
}
