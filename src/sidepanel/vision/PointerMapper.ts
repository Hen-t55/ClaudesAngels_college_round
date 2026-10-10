export interface PointerMapperConfig {
  deadzone: number; // Deadzone radius in radians (e.g. 0.02 rad = ~1.1 deg)
  gain: number;     // Sensitivity gain multiplier (e.g. 2.2)
}

export class PointerMapper {
  private pitch0 = 0;
  private yaw0 = 0;

  private deadzone: number;
  private gain: number;

  constructor(config: Partial<PointerMapperConfig> = {}) {
    this.deadzone = config.deadzone ?? 0.02;
    this.gain = config.gain ?? 2.2;
  }

  public setConfig(config: Partial<PointerMapperConfig>): void {
    if (config.deadzone !== undefined) this.deadzone = config.deadzone;
    if (config.gain !== undefined) this.gain = config.gain;
  }

  public getConfig(): PointerMapperConfig {
    return { deadzone: this.deadzone, gain: this.gain };
  }

  /**
   * Recenter the neutral reference pose to (pitch, yaw).
   */
  public recenter(pitch: number, yaw: number): void {
    this.pitch0 = pitch;
    this.yaw0 = yaw;
  }

  /**
   * Map raw filtered (pitch, yaw) to normalized screen pointer (x, y) in [0..1].
   */
  public map(pitch: number, yaw: number): { x: number; y: number } {
    let dPitch = pitch - this.pitch0;
    let dYaw = yaw - this.yaw0;

    // Apply deadzone: if delta is within deadzone, clamp to 0
    if (Math.abs(dPitch) < this.deadzone) {
      dPitch = 0;
    } else {
      dPitch = Math.sign(dPitch) * (Math.abs(dPitch) - this.deadzone);
    }

    if (Math.abs(dYaw) < this.deadzone) {
      dYaw = 0;
    } else {
      dYaw = Math.sign(dYaw) * (Math.abs(dYaw) - this.deadzone);
    }

    // Apply gain scaling
    // Default yaw range approx [-0.3, 0.3] -> map to [0, 1] center 0.5
    // Default pitch range approx [-0.2, 0.2] -> map to [0, 1] center 0.5
    const normX = 0.5 + (dYaw * this.gain);
    const normY = 0.5 + (dPitch * this.gain);

    const x = Math.max(0, Math.min(1, normX));
    const y = Math.max(0, Math.min(1, normY));

    return { x, y };
  }
}
