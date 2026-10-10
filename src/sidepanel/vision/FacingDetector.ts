export class FacingDetector {
  private isFacing = true;

  private outOfBoundsStartTime: number | null = null;
  private inBoundsStartTime: number | null = null;

  private yawThresholdRad = 0.61;   // ~35 degrees
  private pitchThresholdRad = 0.43; // ~25 degrees

  private awayDwellMs = 1000;       // 1.0 s required to trigger facing=false
  private returnDwellMs = 500;       // 0.5 s required to trigger facing=true

  constructor(yawDeg = 35, pitchDeg = 25) {
    this.yawThresholdRad = (yawDeg * Math.PI) / 180;
    this.pitchThresholdRad = (pitchDeg * Math.PI) / 180;
  }

  public setThresholds(yawDeg: number, pitchDeg: number): void {
    this.yawThresholdRad = (yawDeg * Math.PI) / 180;
    this.pitchThresholdRad = (pitchDeg * Math.PI) / 180;
  }

  /**
   * Update facing status.
   * Returns true ONLY when the facing state changes (emitted event trigger).
   */
  public update(
    pitch: number,
    yaw: number,
    faceDetected: boolean,
    timestampMs: number
  ): boolean {
    const isCurrentlyFacing =
      faceDetected &&
      Math.abs(yaw) <= this.yawThresholdRad &&
      Math.abs(pitch) <= this.pitchThresholdRad;

    let stateChanged = false;

    if (!isCurrentlyFacing) {
      // Facing out of bounds or face lost
      this.inBoundsStartTime = null;

      if (this.outOfBoundsStartTime === null) {
        this.outOfBoundsStartTime = timestampMs;
      } else if (timestampMs - this.outOfBoundsStartTime >= this.awayDwellMs) {
        if (this.isFacing) {
          this.isFacing = false;
          stateChanged = true;
        }
      }
    } else {
      // Facing in bounds
      this.outOfBoundsStartTime = null;

      if (this.inBoundsStartTime === null) {
        this.inBoundsStartTime = timestampMs;
      } else if (timestampMs - this.inBoundsStartTime >= this.returnDwellMs) {
        if (!this.isFacing) {
          this.isFacing = true;
          stateChanged = true;
        }
      }
    }

    return stateChanged;
  }

  public getFacing(): boolean {
    return this.isFacing;
  }

  public reset(): void {
    this.isFacing = true;
    this.outOfBoundsStartTime = null;
    this.inBoundsStartTime = null;
  }
}
