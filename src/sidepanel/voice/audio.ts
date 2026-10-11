// Audio level and noise floor analyzer using Web Audio API
export interface AudioLevelConfig {
  sampleIntervalMs?: number;
  noiseAlpha?: number; // Smoothing factor for noise floor tracking
}

export class AudioLevelMonitor {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private timer: number | null = null;
  private noiseFloor = 0.05;
  private noiseAlpha: number;
  private onLevelCallback: ((data: { level: number; noiseFloor: number }) => void) | null = null;

  constructor(config: AudioLevelConfig = {}) {
    this.noiseAlpha = config.noiseAlpha ?? 0.05;
  }

  public async start(stream?: MediaStream): Promise<void> {
    try {
      this.stream = stream || await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.timer = window.setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        // Calculate root mean square (RMS)
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);
        const normalized = Math.min(1, rms / 255);

        // Update adaptive noise floor (slow tracker)
        if (normalized < this.noiseFloor) {
          this.noiseFloor = normalized;
        } else {
          this.noiseFloor = (1 - this.noiseAlpha) * this.noiseFloor + this.noiseAlpha * normalized;
        }

        if (this.onLevelCallback) {
          this.onLevelCallback({
            level: Number(normalized.toFixed(3)),
            noiseFloor: Number(this.noiseFloor.toFixed(3)),
          });
        }
      }, 100);
    } catch (err) {
      console.warn('[AudioLevelMonitor] could not initialize audio analyser:', err);
    }
  }

  public onLevel(cb: (data: { level: number; noiseFloor: number }) => void): void {
    this.onLevelCallback = cb;
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
