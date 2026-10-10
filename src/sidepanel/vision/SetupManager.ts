import type { HeadEvent } from '../../shared/contract';

export type SetupStep = 'neutral' | 'corners' | 'done';

export interface SetupResult {
  step: SetupStep;
  progress: number;
  prompt: string;
  ok: boolean;
  baselinePitch?: number;
  baselineYaw?: number;
  derivedGain?: number;
}

export class SetupManager {
  private isActive = false;
  private currentStep: SetupStep = 'neutral';
  private startTimeMs = 0;

  private neutralSamples: { pitch: number; yaw: number }[] = [];
  private cornerExtremes = { minPitch: 0, maxPitch: 0, minYaw: 0, maxYaw: 0 };

  private neutralDurationMs = 3000; // 3 seconds neutral calibration
  private cornersDurationMs = 4000; // 4 seconds corners calibration

  public startSetup(timestampMs: number): SetupResult {
    this.isActive = true;
    this.currentStep = 'neutral';
    this.startTimeMs = timestampMs;
    this.neutralSamples = [];
    this.cornerExtremes = { minPitch: 0, maxPitch: 0, minYaw: 0, maxYaw: 0 };

    return {
      step: 'neutral',
      progress: 0.1,
      prompt: 'Keep your head centered and look straight ahead (3s)',
      ok: true,
    };
  }

  public isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Process frame sample during setup.
   */
  public processSample(
    pitch: number,
    yaw: number,
    faceDetected: boolean,
    timestampMs: number
  ): SetupResult | null {
    if (!this.isActive) return null;

    if (!faceDetected) {
      return {
        step: this.currentStep,
        progress: this.currentStep === 'neutral' ? 0.2 : 0.6,
        prompt: 'Face lost. Please align face with camera to continue.',
        ok: false,
      };
    }

    const elapsed = timestampMs - this.startTimeMs;

    // STEP 1: NEUTRAL POSE CALIBRATION (0 - 3000 ms)
    if (this.currentStep === 'neutral') {
      this.neutralSamples.push({ pitch, yaw });
      const progress = Math.min(0.5, 0.1 + (elapsed / this.neutralDurationMs) * 0.4);

      if (elapsed >= this.neutralDurationMs) {
        this.currentStep = 'corners';
        this.startTimeMs = timestampMs; // reset step timer for corners

        // Compute mean baseline
        const meanPitch = this.neutralSamples.reduce((sum, s) => sum + s.pitch, 0) / this.neutralSamples.length;
        const meanYaw = this.neutralSamples.reduce((sum, s) => sum + s.yaw, 0) / this.neutralSamples.length;

        return {
          step: 'corners',
          progress: 0.5,
          prompt: 'Look to the 4 screen corners to calibrate range of motion (4s)',
          ok: true,
          baselinePitch: meanPitch,
          baselineYaw: meanYaw,
        };
      }

      return {
        step: 'neutral',
        progress,
        prompt: `Keep head centered... ${Math.ceil((this.neutralDurationMs - elapsed) / 1000)}s`,
        ok: true,
      };
    }

    // STEP 2: CORNER RANGE CALIBRATION (3000 - 7000 ms)
    if (this.currentStep === 'corners') {
      this.cornerExtremes.minPitch = Math.min(this.cornerExtremes.minPitch, pitch);
      this.cornerExtremes.maxPitch = Math.max(this.cornerExtremes.maxPitch, pitch);
      this.cornerExtremes.minYaw = Math.min(this.cornerExtremes.minYaw, yaw);
      this.cornerExtremes.maxYaw = Math.max(this.cornerExtremes.maxYaw, yaw);

      const progress = Math.min(0.95, 0.5 + (elapsed / this.cornersDurationMs) * 0.45);

      if (elapsed >= this.cornersDurationMs) {
        this.currentStep = 'done';
        this.isActive = false;

        const pitchRange = this.cornerExtremes.maxPitch - this.cornerExtremes.minPitch;
        const yawRange = this.cornerExtremes.maxYaw - this.cornerExtremes.minYaw;

        // Derive optimal gain (default range ~0.4 rad -> gain ~2.5)
        const avgRange = (pitchRange + yawRange) / 2;
        const derivedGain = avgRange > 0.1 ? Math.max(1.5, Math.min(4.0, 0.8 / avgRange)) : 2.2;

        return {
          step: 'done',
          progress: 1.0,
          prompt: 'Setup complete! Dynamic gain calibrated.',
          ok: true,
          derivedGain,
        };
      }

      return {
        step: 'corners',
        progress,
        prompt: `Look to the 4 corners... ${Math.ceil((this.cornersDurationMs - elapsed) / 1000)}s`,
        ok: true,
      };
    }

    return null;
  }

  public cancel(): void {
    this.isActive = false;
    this.currentStep = 'neutral';
  }
}
