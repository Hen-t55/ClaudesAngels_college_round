import type { Dir } from '../../shared/contract';

export interface GestureConfig {
  flickVelocityThreshold: number; // rad/s (e.g. 2.2)
  nodDeltaThreshold: number;      // rad (e.g. 0.08)
  shakeDeltaThreshold: number;    // rad (e.g. 0.10)
  refractoryMs: number;           // ms (e.g. 400)
}

export type GestureDetected =
  | { type: 'flick'; dir: Dir }
  | { type: 'nod' }
  | { type: 'shake' };

export class GestureAnalyzer {
  private config: GestureConfig;

  private lastPitch = 0;
  private lastYaw = 0;
  private lastTimeMs = 0;

  private lastFlickTimeMs = 0;
  private lastNodTimeMs = 0;
  private lastShakeTimeMs = 0;

  // Track recent history for displacement & peak velocity check
  private pitchHistory: { pitch: number; yaw: number; ts: number }[] = [];

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = {
      flickVelocityThreshold: config.flickVelocityThreshold ?? 2.2,
      nodDeltaThreshold: config.nodDeltaThreshold ?? 0.08,
      shakeDeltaThreshold: config.shakeDeltaThreshold ?? 0.10,
      refractoryMs: config.refractoryMs ?? 400,
    };
  }

  public setConfig(cfg: Partial<GestureConfig>): void {
    if (cfg.flickVelocityThreshold !== undefined) this.config.flickVelocityThreshold = cfg.flickVelocityThreshold;
    if (cfg.nodDeltaThreshold !== undefined) this.config.nodDeltaThreshold = cfg.nodDeltaThreshold;
    if (cfg.shakeDeltaThreshold !== undefined) this.config.shakeDeltaThreshold = cfg.shakeDeltaThreshold;
    if (cfg.refractoryMs !== undefined) this.config.refractoryMs = cfg.refractoryMs;
  }

  public getConfig(): GestureConfig {
    return { ...this.config };
  }

  /**
   * Process incoming filtered (pitch, yaw) at timestampMs.
   * Returns array of detected gestures.
   */
  public process(pitch: number, yaw: number, timestampMs: number): GestureDetected[] {
    const detected: GestureDetected[] = [];

    if (this.lastTimeMs === 0) {
      this.lastPitch = pitch;
      this.lastYaw = yaw;
      this.lastTimeMs = timestampMs;
      this.pitchHistory = [{ pitch, yaw, ts: timestampMs }];
      return detected;
    }

    const dt = (timestampMs - this.lastTimeMs) / 1000.0; // seconds
    if (dt <= 1e-4) return detected;

    const pitchVel = (pitch - this.lastPitch) / dt;
    const yawVel = (yaw - this.lastYaw) / dt;

    // Maintain sliding history window of last 500 ms
    this.pitchHistory.push({ pitch, yaw, ts: timestampMs });
    while (this.pitchHistory.length > 0 && timestampMs - this.pitchHistory[0].ts > 500) {
      this.pitchHistory.shift();
    }

    // 1. FLICK DETECTION: High velocity pulse + return check + refractory period
    if (timestampMs - this.lastFlickTimeMs >= this.config.refractoryMs) {
      const maxPitchVel = Math.abs(pitchVel);
      const maxYawVel = Math.abs(yawVel);

      if (maxPitchVel >= this.config.flickVelocityThreshold || maxYawVel >= this.config.flickVelocityThreshold) {
        // Return/reversal check over history window to ensure it's a quick impulse flick, not a steady turn
        const startPose = this.pitchHistory[0];
        const dPitchTotal = Math.abs(pitch - startPose.pitch);
        const dYawTotal = Math.abs(yaw - startPose.yaw);

        let dir: Dir | null = null;
        if (maxPitchVel > maxYawVel) {
          dir = pitchVel < 0 ? 'up' : 'down';
        } else {
          dir = yawVel > 0 ? 'right' : 'left';
        }

        if (dir !== null) {
          detected.push({ type: 'flick', dir });
          this.lastFlickTimeMs = timestampMs;
          this.lastPitch = pitch;
          this.lastYaw = yaw;
          this.lastTimeMs = timestampMs;
          return detected;
        }
      }
    }

    // 2. NOD DETECTION: Pitch downward stroke followed by upward recovery within 400ms
    if (timestampMs - this.lastNodTimeMs >= this.config.refractoryMs) {
      if (this.pitchHistory.length >= 3) {
        const minPitch = Math.min(...this.pitchHistory.map((p) => p.pitch));
        const maxPitch = Math.max(...this.pitchHistory.map((p) => p.pitch));
        const pitchSpan = maxPitch - minPitch;

        // Downward pulse followed by upward reversal
        if (pitchSpan >= this.config.nodDeltaThreshold && pitchVel < -1.0) {
          detected.push({ type: 'nod' });
          this.lastNodTimeMs = timestampMs;
        }
      }
    }

    // 3. SHAKE DETECTION: Yaw oscillation left-right within 500ms
    if (timestampMs - this.lastShakeTimeMs >= this.config.refractoryMs) {
      if (this.pitchHistory.length >= 3) {
        const minYaw = Math.min(...this.pitchHistory.map((p) => p.yaw));
        const maxYaw = Math.max(...this.pitchHistory.map((p) => p.yaw));
        const yawSpan = maxYaw - minYaw;

        if (yawSpan >= this.config.shakeDeltaThreshold && Math.abs(yawVel) > 1.8) {
          detected.push({ type: 'shake' });
          this.lastShakeTimeMs = timestampMs;
        }
      }
    }

    this.lastPitch = pitch;
    this.lastYaw = yaw;
    this.lastTimeMs = timestampMs;

    return detected;
  }

  public reset(): void {
    this.lastPitch = 0;
    this.lastYaw = 0;
    this.lastTimeMs = 0;
    this.pitchHistory = [];
  }
}
