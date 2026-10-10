import { describe, it, expect, beforeEach } from 'vitest';
import { FacingDetector } from '../../src/sidepanel/vision/FacingDetector';

describe('FacingDetector', () => {
  let detector: FacingDetector;

  beforeEach(() => {
    detector = new FacingDetector(35, 25); // 35 deg yaw, 25 deg pitch
  });

  it('initializes in facing=true state', () => {
    expect(detector.getFacing()).toBe(true);
  });

  it('requires 1.0s continuous out-of-bounds pose before setting facing=false', () => {
    let t = 1000;
    // Yaw at 45 deg (0.78 rad) > 35 deg threshold
    let changed = detector.update(0, 0.78, true, t);
    expect(changed).toBe(false);
    expect(detector.getFacing()).toBe(true);

    // 500ms out of bounds (still facing=true)
    t += 500;
    changed = detector.update(0, 0.78, true, t);
    expect(changed).toBe(false);
    expect(detector.getFacing()).toBe(true);

    // 1050ms out of bounds -> triggers facing=false
    t += 550;
    changed = detector.update(0, 0.78, true, t);
    expect(changed).toBe(true);
    expect(detector.getFacing()).toBe(false);

    // Subsequent updates out of bounds emit no further changes
    t += 100;
    changed = detector.update(0, 0.78, true, t);
    expect(changed).toBe(false);
  });

  it('requires 0.5s continuous in-bounds pose before restoring facing=true', () => {
    let t = 1000;
    // Trigger look-away (1050ms)
    detector.update(0, 0.8, true, t);
    t += 1050;
    detector.update(0, 0.8, true, t); // facing = false

    // Return facing screen (0, 0) for 200ms (not restored yet)
    t += 200;
    let changed = detector.update(0, 0, true, t);
    expect(changed).toBe(false);
    expect(detector.getFacing()).toBe(false);

    // Dwell facing screen for 500ms total -> restored facing=true
    t += 500;
    changed = detector.update(0, 0, true, t);
    expect(changed).toBe(true);
    expect(detector.getFacing()).toBe(true);
  });

  it('triggers facing=false if face is lost for > 1.0s', () => {
    let t = 1000;
    // Face lost (faceDetected = false)
    detector.update(0, 0, false, t);
    t += 1100;
    const changed = detector.update(0, 0, false, t);
    expect(changed).toBe(true);
    expect(detector.getFacing()).toBe(false);
  });
});
