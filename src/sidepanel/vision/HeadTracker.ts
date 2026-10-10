import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { OneEuroFilter } from './OneEuroFilter';
import { PointerMapper } from './PointerMapper';
import { QuadrantClassifier } from './QuadrantClassifier';
import { GestureAnalyzer } from './GestureAnalyzer';
import { FacingDetector } from './FacingDetector';
import type { HeadEvent, HeadMode, Dir, ImpairmentConfig } from '../../shared/contract';

export interface HeadTrackerOptions {
  wasmPath?: string;
  modelPath?: string;
  minCutoff?: number;
  beta?: number;
  gain?: number;
  deadzone?: number;
}

export class HeadTracker {
  private videoElement: HTMLVideoElement | null = null;
  private landmarker: FaceLandmarker | null = null;
  private animFrameId: number | null = null;
  private isRunning = false;

  private mode: HeadMode = 'quadrant';
  private listeners: Set<(evt: HeadEvent) => void> = new Set();

  // Sub-modules
  private pitchFilter = new OneEuroFilter();
  private yawFilter = new OneEuroFilter();
  private rollFilter = new OneEuroFilter();

  public pointerMapper = new PointerMapper();
  public quadrantClassifier = new QuadrantClassifier();
  public gestureAnalyzer = new GestureAnalyzer();
  public facingDetector = new FacingDetector();

  // Diagnostics & Timing
  private frameCount = 0;
  private lastFpsTime = 0;
  private currentFps = 0;
  private lastPointerEmitTime = 0;

  private impairment: ImpairmentConfig | null = null;

  constructor(private options: HeadTrackerOptions = {}) {
    const minCutoff = options.minCutoff ?? 1.0;
    const beta = options.beta ?? 0.007;
    const gain = options.gain ?? 2.2;
    const deadzone = options.deadzone ?? 0.02;

    this.setFilterParams(minCutoff, beta);
    this.pointerMapper.setConfig({ gain, deadzone });
  }

  public async initialize(): Promise<void> {
    const wasmPath = this.options.wasmPath || '/mediapipe';
    const modelPath = this.options.modelPath || '/mediapipe/face_landmarker.task';

    const fileset = await FilesetResolver.forVisionTasks(wasmPath);

    try {
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
    this.quadrantClassifier.setMode(mode);
  }

  public recenter(pitch?: number, yaw?: number): void {
    if (pitch !== undefined && yaw !== undefined) {
      this.pointerMapper.recenter(pitch, yaw);
    }
  }

  public setFilterParams(minCutoff?: number, beta?: number, gain?: number, deadzone?: number): void {
    if (minCutoff !== undefined) {
      this.pitchFilter.setParams({ minCutoff });
      this.yawFilter.setParams({ minCutoff });
      this.rollFilter.setParams({ minCutoff });
    }
    if (beta !== undefined) {
      this.pitchFilter.setParams({ beta });
      this.yawFilter.setParams({ beta });
      this.rollFilter.setParams({ beta });
    }
    if (gain !== undefined || deadzone !== undefined) {
      this.pointerMapper.setConfig({ gain, deadzone });
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

  /**
   * Process a single timestamped frame (can be called by webcam loop or synthetic tests).
   */
  public processFrame(result: FaceLandmarkerResult, timestampMs: number): void {
    if (this.mode === 'off') return;

    const faceDetected = result.faceLandmarks && result.faceLandmarks.length > 0;

    // 1. Process Facing / Look-Away Detector (emits only on state change)
    let rawPitch = 0;
    let rawYaw = 0;
    let rawRoll = 0;

    if (faceDetected) {
      const angles = this.extractEulerAngles(result);
      rawPitch = angles.pitch;
      rawYaw = angles.yaw;
      rawRoll = angles.roll;
    }

    const facingChanged = this.facingDetector.update(rawPitch, rawYaw, faceDetected, timestampMs);
    if (facingChanged) {
      this.emit({ t: 'head.facing', facing: this.facingDetector.getFacing() });
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

    // 2. Inject tremor impairment if enabled
    const angles = this.injectTremor({ pitch: rawPitch, yaw: rawYaw, roll: rawRoll }, timestampMs);

    // 3. One Euro Filter smoothing
    const pitch = this.pitchFilter.filter(angles.pitch, timestampMs);
    const yaw = this.yawFilter.filter(angles.yaw, timestampMs);

    // 4. Relative Pointer Mapping
    const pointer = this.pointerMapper.map(pitch, yaw);

    // Emit head.pointer at ~30 Hz (interval >= 28ms)
    if (timestampMs - this.lastPointerEmitTime >= 28) {
      this.emit({ t: 'head.pointer', x: pointer.x, y: pointer.y });
      this.lastPointerEmitTime = timestampMs;
    }

    // 5. Quadrant Classifier (with hysteresis & 300ms stability dwell)
    const qResult = this.quadrantClassifier.update(pointer.x, pointer.y, timestampMs);
    if (qResult && qResult.changed) {
      this.emit({ t: 'head.quadrant', q: qResult.q, stable: qResult.stable });
    }

    // 6. Gesture Detector (Flick, Nod, Shake - active unless mode is 'off')
    const gestures = this.gestureAnalyzer.process(pitch, yaw, timestampMs);
    for (const g of gestures) {
      if (g.type === 'flick') {
        this.emit({ t: 'head.flick', dir: g.dir });
      } else if (g.type === 'nod') {
        this.emit({ t: 'head.nod' });
      } else if (g.type === 'shake') {
        this.emit({ t: 'head.shake' });
      }
    }

    // 7. Quality metrics
    this.emit({
      t: 'head.quality',
      jitter: Math.abs(pitch - rawPitch) + Math.abs(yaw - rawYaw),
      brightness: 0.8,
      faceConf: 0.95,
      fps: this.currentFps,
    });
  }

  private startFrameLoop(): void {
    const processFrame = (now: number) => {
      if (!this.isRunning) return;

      if (this.videoElement && this.videoElement.readyState >= 2 && this.landmarker) {
        if (!this.shouldDropFrame()) {
          this.frameCount++;
          if (now - this.lastFpsTime >= 1000) {
            this.currentFps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
            this.frameCount = 0;
            this.lastFpsTime = now;
          }

          const result = this.landmarker.detectForVideo(this.videoElement, now);
          this.processFrame(result, now);
        }
      }

      if (this.videoElement && 'requestVideoFrameCallback' in this.videoElement) {
        (this.videoElement as unknown as { requestVideoFrameCallback: (cb: (now: number) => void) => void })
          .requestVideoFrameCallback(() => processFrame(performance.now()));
      } else {
        this.animFrameId = requestAnimationFrame(processFrame);
      }
    };

    processFrame(performance.now());
  }

  private extractEulerAngles(result: FaceLandmarkerResult): { pitch: number; yaw: number; roll: number } {
    if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
      const mat = result.facialTransformationMatrixes[0].data;
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
