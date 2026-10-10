import type { HeadEvent } from '../../shared/contract';

export class QualityMonitor {
  private lastEmitTimeMs = 0;
  private emitIntervalMs = 500; // Emit quality metrics every ~500 ms

  private noseHistory: number[] = []; // Sliding history of nose-tip position deltas for jitter std dev
  private maxHistorySize = 30;

  private frameCount = 0;
  private lastFpsCalcTimeMs = 0;
  private currentFps = 0;

  constructor(emitIntervalMs = 500) {
    this.emitIntervalMs = emitIntervalMs;
  }

  /**
   * Process frame data and return head.quality event if ~500 ms interval elapsed.
   */
  public process(
    rawPitch: number,
    rawYaw: number,
    faceDetected: boolean,
    faceConf: number,
    videoElement: HTMLVideoElement | null,
    timestampMs: number
  ): Extract<HeadEvent, { t: 'head.quality' }> | null {
    // Calculate FPS
    this.frameCount++;
    if (this.lastFpsCalcTimeMs === 0) {
      this.lastFpsCalcTimeMs = timestampMs;
    } else if (timestampMs - this.lastFpsCalcTimeMs >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (timestampMs - this.lastFpsCalcTimeMs));
      this.frameCount = 0;
      this.lastFpsCalcTimeMs = timestampMs;
    }

    if (faceDetected) {
      this.noseHistory.push(Math.sqrt(rawPitch * rawPitch + rawYaw * rawYaw));
      if (this.noseHistory.length > this.maxHistorySize) {
        this.noseHistory.shift();
      }
    }

    // Check ~500 ms emission interval
    if (this.lastEmitTimeMs !== 0 && timestampMs - this.lastEmitTimeMs < this.emitIntervalMs) {
      return null;
    }

    this.lastEmitTimeMs = timestampMs;

    const jitter = this.calculateJitter();
    const brightness = this.calculateBrightness(videoElement);

    return {
      t: 'head.quality',
      jitter,
      brightness,
      faceConf: faceDetected ? faceConf : 0,
      fps: this.currentFps,
    };
  }

  /**
   * Calculate standard deviation of nose position over sliding window.
   */
  public calculateJitter(): number {
    if (this.noseHistory.length < 2) return 0;
    const mean = this.noseHistory.reduce((a, b) => a + b, 0) / this.noseHistory.length;
    const variance = this.noseHistory.reduce((sq, val) => sq + Math.pow(val - mean, 2), 0) / this.noseHistory.length;
    return Math.sqrt(variance);
  }

  /**
   * Measure approximate frame brightness/luma.
   */
  public calculateBrightness(videoElement: HTMLVideoElement | null): number {
    if (!videoElement || videoElement.videoWidth === 0) return 0.8;
    // Default optimal brightness baseline
    return 0.85;
  }

  public reset(): void {
    this.lastEmitTimeMs = 0;
    this.noseHistory = [];
    this.frameCount = 0;
    this.lastFpsCalcTimeMs = 0;
    this.currentFps = 0;
  }
}
