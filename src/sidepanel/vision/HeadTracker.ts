import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { OneEuroFilter } from './OneEuroFilter';
import type { HeadEvent, HeadMode, Quadrant, Dir, ImpairmentConfig } from '../../shared/contract';

export interface HeadTrackerOptions {
  wasmPath?: string;
  modelPath?: string;
  minCutoff?: number;
  beta?: number;
}

export class HeadTracker {
  private videoElement: HTMLVideoElement | null = null;
  private landmarker: FaceLandmarker | null = null;
  private animFrameId: number | null = null;
  private isRunning = false;

  private mode: HeadMode = 'quadrant';
  private listeners: Set<(evt: HeadEvent) => void> = new Set();

  // One Euro Filters for 5 degrees of freedom
  private pitchFilter = new OneEuroFilter();
  private yawFilter = new OneEuroFilter();
  private rollFilter = new OneEuroFilter();
  private pointerXFilter = new OneEuroFilter({ minCutoff: 1.5, beta: 0.01 });
  private pointerYFilter = new OneEuroFilter({ minCutoff: 1.5, beta: 0.01 });

  // Calibration neutral pose baseline
  private pitch0 = 0;
  private yaw0 = 0;

  // Quadrant tracking state
  private activeQuadrant: Quadrant | null = null;
  private lastFacingState = true;

  // FPS & Diagnostics
  private frameCount = 0;
  private lastFpsTime = 0;
  private currentFps = 0;

  // Velocity tracking for Flick, Nod, Shake
  private lastPitch = 0;
  private lastYaw = 0;
  private lastTimestamp = 0;
  private lastFlickTime = 0;
  private lastNodTime = 0;
  private lastShakeTime = 0;

  // Impairment hooks
  private impairment: ImpairmentConfig | null = null;

  constructor(private options: HeadTrackerOptions = {}) {
    const minCutoff = options.minCutoff ?? 1.0;
    const beta = options.beta ?? 0.007;
    this.setFilterParams(minCutoff, beta);
  }

  /**
   * Initialize MediaPipe FaceLandmarker with GPU delegate and CPU fallback.
   */
  public async initialize(): Promise<void> {
    const wasmPath = this.options.wasmPath || '/mediapipe';
    const modelPath = this.options.modelPath || '/mediapipe/face_landmarker.task';

    const fileset = await FilesetResolver.forVisionTasks(wasmPath);

    try {
      // Try GPU delegate first
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
      console.log('[HeadTracker] Initialized FaceLandmarker with GPU delegate.');
    } catch (gpuError) {
      console.warn('[HeadTracker] GPU delegate failed. Falling back to CPU delegate.', gpuError);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: modelPath,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
      console.log('[HeadTracker] Initialized FaceLandmarker with CPU delegate.');
    }
  }

  /**
   * Start webcam video acquisition and tracking loop.
   */
  public async start(videoElement?: HTMLVideoElement): Promise<void> {
    if (this.isRunning) return;

    if (!this.landmarker) {
      await this.initialize();
    }

    if (videoElement) {
      this.videoElement = videoElement;
    } else if (!this.videoElement) {
      this.videoElement = document.createElement('video');
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      this.videoElement.style.display = 'none';
      document.body.appendChild(this.videoElement);
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: { ideal: 30 } },
    });

    this.videoElement.srcObject = stream;
    await new Promise((resolve) => {
      this.videoElement!.onloadedmetadata = () => {
        this.videoElement!.play();
        resolve(true);
      };
    });

    this.isRunning = true;
    this.lastFpsTime = performance.now();
    this.startFrameLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      for (const track of stream.getTracks()) {
        track.stop();
      }
      this.videoElement.srcObject = null;
    }
  }

  public setMode(mode: HeadMode): void {
    this.mode = mode;
  }

  public recenter(): void {
    this.pitch0 = this.lastPitch;
    this.yaw0 = this.lastYaw;
  }

  public setFilterParams(minCutoff?: number, beta?: number): void {
    if (minCutoff !== undefined) {
      this.pitchFilter.setParams({ minCutoff });
      this.yawFilter.setParams({ minCutoff });
      this.rollFilter.setParams({ minCutoff });
      this.pointerXFilter.setParams({ minCutoff: minCutoff * 1.5 });
      this.pointerYFilter.setParams({ minCutoff: minCutoff * 1.5 });
    }
    if (beta !== undefined) {
      this.pitchFilter.setParams({ beta });
      this.yawFilter.setParams({ beta });
      this.rollFilter.setParams({ beta });
      this.pointerXFilter.setParams({ beta });
      this.pointerYFilter.setParams({ beta });
    }
  }

  public setImpairment(cfg: ImpairmentConfig | null): void {
    this.impairment = cfg;
  }

  public onEvent(callback: (evt: HeadEvent) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public emit(evt: HeadEvent): void {
    for (const listener of this.listeners) {
      listener(evt);
    }
  }

  public getLandmarker(): FaceLandmarker | null {
    return this.landmarker;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  private startFrameLoop(): void {
    const processFrame = (now: number) => {
      if (!this.isRunning) return;

      if (this.videoElement && this.videoElement.readyState >= 2 && this.landmarker) {
        // Dropped frame simulation check
        if (!this.shouldDropFrame()) {
          this.processLandmarks(now);
        }
      }

      // requestVideoFrameCallback if available, fallback to requestAnimationFrame
      if (this.videoElement && 'requestVideoFrameCallback' in this.videoElement) {
        (this.videoElement as unknown as { requestVideoFrameCallback: (cb: (now: number) => void) => void })
          .requestVideoFrameCallback(() => processFrame(performance.now()));
      } else {
        this.animFrameId = requestAnimationFrame(processFrame);
      }
    };

    processFrame(performance.now());
  }

  private processLandmarks(timestampMs: number): void {
    if (!this.videoElement || !this.landmarker) return;

    // Calculate FPS
    this.frameCount++;
    if (timestampMs - this.lastFpsTime >= 1000) {
      this.currentFps = Math.round((this.frameCount * 1000) / (timestampMs - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = timestampMs;
    }

    if (this.mode === 'off') return;

    const result: FaceLandmarkerResult = this.landmarker.detectForVideo(this.videoElement, timestampMs);

    const faceDetected = result.faceLandmarks.length > 0;
    const facing = faceDetected && this.checkFacing(result);

    // Emit facing status
    if (facing !== this.lastFacingState) {
      this.lastFacingState = facing;
      this.emit({ t: 'head.facing', facing });
    }

    if (!faceDetected) {
      this.emit({
        t: 'head.quality',
        jitter: 0,
        brightness: 0.5,
        faceConf: 0,
        fps: this.currentFps,
      });
      return;
    }

    // 1. Extract raw Euler angles (pitch, yaw, roll)
    const rawAngles = this.extractEulerAngles(result);

    // 2. Inject tremor impairment if active
    const angles = this.injectTremor(rawAngles, timestampMs);

    // 3. Filter raw pose angles through One Euro Filters
    const pitch = this.pitchFilter.filter(angles.pitch, timestampMs);
    const yaw = this.yawFilter.filter(angles.yaw, timestampMs);
    const roll = this.rollFilter.filter(angles.roll, timestampMs);

    // 4. Calculate relative pointer coordinates (0..1)
    const relPitch = pitch - this.pitch0;
    const relYaw = yaw - this.yaw0;

    // Yaw range [-0.3, +0.3] rad -> X [0, 1]
    // Pitch range [-0.2, +0.2] rad -> Y [0, 1]
    const rawPx = Math.max(0, Math.min(1, 0.5 + relYaw / 0.6));
    const rawPy = Math.max(0, Math.min(1, 0.5 + relPitch / 0.4));

    const px = this.pointerXFilter.filter(rawPx, timestampMs);
    const py = this.pointerYFilter.filter(rawPy, timestampMs);

    // Emit filtered pointer
    this.emit({ t: 'head.pointer', x: px, y: py });

    // 5. Quadrant tracking (active in 'quadrant' mode)
    if (this.mode === 'quadrant') {
      this.updateQuadrant(px, py);
    }

    // 6. Detect motion gestures (Flick, Nod, Shake)
    this.detectGestures(pitch, yaw, timestampMs);

    // 7. Emit quality metric
    this.emit({
      t: 'head.quality',
      jitter: Math.abs(pitch - rawAngles.pitch) + Math.abs(yaw - rawAngles.yaw),
      brightness: 0.8,
      faceConf: 0.95,
      fps: this.currentFps,
    });

    this.lastPitch = pitch;
    this.lastYaw = yaw;
    this.lastTimestamp = timestampMs;
  }

  private extractEulerAngles(result: FaceLandmarkerResult): { pitch: number; yaw: number; roll: number } {
    if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
      const mat = result.facialTransformationMatrixes[0].data;
      // 4x4 column-major matrix
      const r21 = mat[9];
      const r22 = mat[10];
      const r20 = mat[8];
      const r10 = mat[4];
      const r00 = mat[0];

      const pitch = Math.atan2(r21, r22);
      const yaw = Math.atan2(-r20, Math.sqrt(r21 * r21 + r22 * r22));
      const roll = Math.atan2(r10, r00);

      return { pitch, yaw, roll };
    }

    // Geometry fallback from landmarks: Nose tip (#1), Chin (#152), Left Eye (#33), Right Eye (#263)
    const lm = result.faceLandmarks[0];
    const nose = lm[1];
    const chin = lm[152];
    const leftEye = lm[33];
    const rightEye = lm[263];

    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    const roll = Math.atan2(dy, dx);

    const yaw = (nose.x - (leftEye.x + rightEye.x) / 2) * 2.5;
    const pitch = (nose.y - (leftEye.y + chin.y) / 2) * 2.5;

    return { pitch, yaw, roll };
  }

  private checkFacing(result: FaceLandmarkerResult): boolean {
    const raw = this.extractEulerAngles(result);
    const absYaw = Math.abs(raw.yaw);
    const absPitch = Math.abs(raw.pitch);

    // Facing threshold: yaw < 35 deg (0.61 rad), pitch < 25 deg (0.43 rad)
    return absYaw < 0.61 && absPitch < 0.43;
  }

  private updateQuadrant(x: number, y: number): void {
    const hysteresis = 0.04;
    let newQ: Quadrant;

    // Apply hysteresis margin around 0.5
    let isRight = x >= 0.5;
    if (this.activeQuadrant === 'TL' || this.activeQuadrant === 'BL') {
      isRight = x >= 0.5 + hysteresis;
    } else if (this.activeQuadrant === 'TR' || this.activeQuadrant === 'BR') {
      isRight = x >= 0.5 - hysteresis;
    }

    let isBottom = y >= 0.5;
    if (this.activeQuadrant === 'TL' || this.activeQuadrant === 'TR') {
      isBottom = y >= 0.5 + hysteresis;
    } else if (this.activeQuadrant === 'BL' || this.activeQuadrant === 'BR') {
      isBottom = y >= 0.5 - hysteresis;
    }

    if (!isRight && !isBottom) newQ = 'TL';
    else if (isRight && !isBottom) newQ = 'TR';
    else if (!isRight && isBottom) newQ = 'BL';
    else newQ = 'BR';

    if (newQ !== this.activeQuadrant) {
      this.activeQuadrant = newQ;
      this.emit({ t: 'head.quadrant', q: this.activeQuadrant, stable: true });
    }
  }

  private detectGestures(pitch: number, yaw: number, nowMs: number): void {
    if (this.lastTimestamp === 0) return;

    const dt = (nowMs - this.lastTimestamp) / 1000.0;
    if (dt <= 1e-4) return;

    const pitchVel = (pitch - this.lastPitch) / dt;
    const yawVel = (yaw - this.lastYaw) / dt;

    // Flick Detection: High angular velocity (> 2.8 rad/s)
    if (nowMs - this.lastFlickTime > 400) {
      if (Math.abs(pitchVel) > 2.8 || Math.abs(yawVel) > 2.8) {
        let dir: Dir;
        if (Math.abs(pitchVel) > Math.abs(yawVel)) {
          dir = pitchVel < 0 ? 'up' : 'down';
        } else {
          dir = yawVel > 0 ? 'right' : 'left';
        }
        this.emit({ t: 'head.flick', dir });
        this.lastFlickTime = nowMs;
      }
    }

    // Nod Detection: Downward pitch velocity followed by quick upward reversal
    if (nowMs - this.lastNodTime > 800) {
      if (pitchVel > 2.0 && this.lastPitch - this.pitch0 > 0.08) {
        this.emit({ t: 'head.nod' });
        this.lastNodTime = nowMs;
      }
    }

    // Shake Detection: Rapid yaw oscillations left-right
    if (nowMs - this.lastShakeTime > 800) {
      if (Math.abs(yawVel) > 2.5 && Math.abs(this.lastYaw - this.yaw0) > 0.12) {
        this.emit({ t: 'head.shake' });
        this.lastShakeTime = nowMs;
      }
    }
  }

  private shouldDropFrame(): boolean {
    if (!this.impairment || this.impairment.dropFramePct <= 0) return false;
    return Math.random() < this.impairment.dropFramePct / 100;
  }

  private injectTremor(
    raw: { pitch: number; yaw: number; roll: number },
    timestampMs: number
  ): { pitch: number; yaw: number; roll: number } {
    if (!this.impairment || this.impairment.tremorAmp <= 0) return raw;

    const hz = this.impairment.tremorHz[0] || 6;
    const amp = this.impairment.tremorAmp;
    const phase = (timestampMs / 1000.0) * hz * 2 * Math.PI;

    return {
      pitch: raw.pitch + Math.sin(phase) * amp,
      yaw: raw.yaw + Math.cos(phase) * amp,
      roll: raw.roll,
    };
  }
}
