import { FilesetResolver, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { OneEuroFilter } from './OneEuroFilter';
import { PointerMapper } from './PointerMapper';
import { QuadrantClassifier } from './QuadrantClassifier';
import { GestureAnalyzer } from './GestureAnalyzer';
import { FacingDetector } from './FacingDetector';
import { ImpairmentInjector } from './ImpairmentInjector';
import { QualityMonitor } from './QualityMonitor';
import { SetupManager } from './SetupManager';
import { PoseRecorder } from './PoseRecorder';
import type { HeadEvent, HeadMode, ImpairmentConfig } from '../../shared/contract';

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
  public impairmentInjector = new ImpairmentInjector();
  public qualityMonitor = new QualityMonitor();
  public setupManager = new SetupManager();
  public poseRecorder = new PoseRecorder();

  // Timing
  private lastPointerEmitTime = 0;

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

  public startSetup(timestampMs: number): void {
    const sRes = this.setupManager.startSetup(timestampMs);
    this.emit({
      t: 'head.setup',
      step: sRes.step,
      progress: sRes.progress,
      prompt: sRes.prompt,
      ok: sRes.ok,
    });
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
    this.impairmentInjector.setConfig(cfg);
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

  public processFrame(result: FaceLandmarkerResult, timestampMs: number): void {
    if (this.mode === 'off') return;

    // Check dropped frames impairment
    if (this.impairmentInjector.shouldDropFrame()) {
      return;
    }

    const faceDetected = result.faceLandmarks && result.faceLandmarks.length > 0;
    const faceConf = faceDetected ? 0.95 : 0;

    let rawPitch = 0;
    let rawYaw = 0;
    let rawRoll = 0;

    if (faceDetected) {
      const angles = this.extractEulerAngles(result);
      rawPitch = angles.pitch;
      rawYaw = angles.yaw;
      rawRoll = angles.roll;
    }

    // 1. Process Impairment (Tremor noise) BEFORE filtering
    const impaired = this.impairmentInjector.applyTremor(
      { pitch: rawPitch, yaw: rawYaw, roll: rawRoll },
      timestampMs
    );

    // Record frame if PoseRecorder is active
    this.poseRecorder.recordFrame(
      impaired.pitch,
      impaired.yaw,
      impaired.roll,
      faceDetected,
      faceConf,
      timestampMs
    );

    // 2. Process Setup Wizard if active
    if (this.setupManager.isRunning()) {
      const sRes = this.setupManager.processSample(impaired.pitch, impaired.yaw, faceDetected, timestampMs);
      if (sRes) {
        this.emit({
          t: 'head.setup',
          step: sRes.step,
          progress: sRes.progress,
          prompt: sRes.prompt,
          ok: sRes.ok,
        });

        if (sRes.baselinePitch !== undefined && sRes.baselineYaw !== undefined) {
          this.pointerMapper.recenter(sRes.baselinePitch, sRes.baselineYaw);
        }
        if (sRes.derivedGain !== undefined) {
          this.pointerMapper.setConfig({ gain: sRes.derivedGain });
        }
      }
    }

    // 3. Process Facing / Look-Away
    const facingChanged = this.facingDetector.update(impaired.pitch, impaired.yaw, faceDetected, timestampMs);
    if (facingChanged) {
      this.emit({ t: 'head.facing', facing: this.facingDetector.getFacing() });
    }

    // 4. Quality Monitor (~500ms interval)
    const qEvent = this.qualityMonitor.process(
      rawPitch,
      rawYaw,
      faceDetected,
      faceConf,
      this.videoElement,
      timestampMs
    );
    if (qEvent) {
      this.emit(qEvent);
    }

    if (!faceDetected) return;

    // 5. One Euro Filter smoothing
    const pitch = this.pitchFilter.filter(impaired.pitch, timestampMs);
    const yaw = this.yawFilter.filter(impaired.yaw, timestampMs);

    // 6. Pointer mapping & emit (~30 Hz)
    const pointer = this.pointerMapper.map(pitch, yaw);
    if (timestampMs - this.lastPointerEmitTime >= 28) {
      this.emit({ t: 'head.pointer', x: pointer.x, y: pointer.y });
      this.lastPointerEmitTime = timestampMs;
    }

    // 7. Quadrant Classification (with hysteresis & 300ms dwell)
    const qResult = this.quadrantClassifier.update(pointer.x, pointer.y, timestampMs);
    if (qResult && qResult.changed) {
      this.emit({ t: 'head.quadrant', q: qResult.q, stable: qResult.stable });
    }

    // 8. Gesture Detection (Flick, Nod, Shake)
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
  }

  private startFrameLoop(): void {
    const processFrame = (now: number) => {
      if (!this.isRunning) return;

      if (this.videoElement && this.videoElement.readyState >= 2 && this.landmarker) {
        const result = this.landmarker.detectForVideo(this.videoElement, now);
        this.processFrame(result, now);
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
}
