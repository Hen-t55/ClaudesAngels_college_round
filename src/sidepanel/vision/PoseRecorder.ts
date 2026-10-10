export interface PoseRecordFrame {
  timestamp: number;
  pitch: number;
  yaw: number;
  roll: number;
  faceDetected: boolean;
  faceConf: number;
}

export interface PoseSessionData {
  version: string;
  durationMs: number;
  frameCount: number;
  frames: PoseRecordFrame[];
}

export class PoseRecorder {
  private isRecording = false;
  private frames: PoseRecordFrame[] = [];
  private startTimeMs = 0;

  public startRecording(timestampMs: number): void {
    this.isRecording = true;
    this.frames = [];
    this.startTimeMs = timestampMs;
  }

  public stopRecording(timestampMs: number): PoseSessionData {
    this.isRecording = false;
    const durationMs = timestampMs - this.startTimeMs;
    return {
      version: '1.0',
      durationMs,
      frameCount: this.frames.length,
      frames: [...this.frames],
    };
  }

  public recordFrame(
    pitch: number,
    yaw: number,
    roll: number,
    faceDetected: boolean,
    faceConf: number,
    timestampMs: number
  ): void {
    if (!this.isRecording) return;
    const relTime = timestampMs - this.startTimeMs;
    this.frames.push({
      timestamp: relTime,
      pitch,
      yaw,
      roll,
      faceDetected,
      faceConf,
    });
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }

  public exportJSON(timestampMs: number): string {
    const data = this.stopRecording(timestampMs);
    return JSON.stringify(data, null, 2);
  }
}

export class PoseReplayer {
  private session: PoseSessionData | null = null;
  private isPlaying = false;

  public loadJSON(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString) as PoseSessionData;
      if (parsed && Array.isArray(parsed.frames)) {
        this.session = parsed;
        return true;
      }
    } catch (e) {
      console.error('[PoseReplayer] Invalid JSON data', e);
    }
    return false;
  }

  public getSession(): PoseSessionData | null {
    return this.session;
  }

  public play(onFrame: (frame: PoseRecordFrame, timestampMs: number) => void): void {
    if (!this.session || this.session.frames.length === 0) return;

    this.isPlaying = true;
    const baseTime = performance.now();

    for (const frame of this.session.frames) {
      const targetTime = baseTime + frame.timestamp;
      onFrame(frame, targetTime);
    }

    this.isPlaying = false;
  }
}
