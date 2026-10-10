import type { Transport } from '../../shared/bus';
import type { SpeechEvent, Intent } from '../../shared/contract';
import { parseIntent, isSafeInterimGlobal } from './parser';
import { AudioLevelMonitor } from './audio';

export interface SpeechRecognitionOptions {
  lang?: string;
  enableAudioLevel?: boolean;
}

// Global interface extensions for webkitSpeechRecognition
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

export class SpeechModule {
  private transport: Transport;
  private recognition: SpeechRecognitionLike | null = null;
  private audioMonitor: AudioLevelMonitor | null = null;
  private lang = 'en-IN';
  private running = false;
  private utteranceStarted = false;
  private backoffDelayMs = 250;
  private maxBackoffDelayMs = 4000;
  private restartTimer: number | null = null;
  private mode: 'command' | 'dictation' = 'command';
  private onIntentCallback: ((intent: Intent, text: string) => void) | null = null;

  constructor(transport: Transport, options: SpeechRecognitionOptions = {}) {
    this.transport = transport;
    if (options.lang) {
      this.lang = options.lang;
    }

    if (options.enableAudioLevel) {
      this.audioMonitor = new AudioLevelMonitor();
      this.audioMonitor.onLevel(({ level, noiseFloor }) => {
        this.transport.send('speech', {
          t: 'speech.level',
          level,
          noiseFloor,
        });
      });
    }
  }

  public setLanguage(lang: string): void {
    this.lang = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public getLanguage(): string {
    return this.lang;
  }

  public setMode(mode: 'command' | 'dictation'): void {
    this.mode = mode;
  }

  public getMode(): 'command' | 'dictation' {
    return this.mode;
  }

  public onIntent(cb: (intent: Intent, text: string) => void): void {
    this.onIntentCallback = cb;
  }

  /**
   * Start recognition with auto-restart and onset detection
   */
  public start(): void {
    this.running = true;
    this.initAndStartRecognizer();
    if (this.audioMonitor) {
      this.audioMonitor.start().catch((e: any) => {
        console.warn('[SpeechModule] mic audio error:', e);
        const errName = e?.name === 'NotAllowedError' ? 'not-allowed'
          : e?.name === 'NotReadableError' ? 'audio-capture'
          : 'audio-capture';
        this.transport.send('speech', {
          t: 'speech.error',
          error: errName,
          message: e?.message || 'Microphone access failed',
        });
      });
    }
  }

  /**
   * Stop recognition and cancel auto-restart
   */
  public stop(): void {
    this.running = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }
    if (this.audioMonitor) {
      this.audioMonitor.stop();
    }
  }

  /**
   * Simulates a spoken utterance for tests, dev harnesses, or demo fallback.
   * Emits speech.onset, then speech.result, and parses intent.
   */
  public simulateUtterance(text: string, options: { interim?: boolean; confidence?: number } = {}): Intent | null {
    const isInterim = options.interim ?? false;
    const confidence = options.confidence ?? 0.95;

    // First interim or utterance always emits onset
    this.transport.send('speech', { t: 'speech.onset' });

    this.transport.send('speech', {
      t: 'speech.result',
      text,
      final: !isInterim,
      confidence,
    });

    if (isInterim) {
      // Safe interim globals may execute early
      if (isSafeInterimGlobal(text)) {
        const intent = parseIntent(text, { mode: this.mode });
        if (intent && this.onIntentCallback) {
          this.onIntentCallback(intent, text);
        }
        return intent;
      }
      return null;
    }

    const intent = parseIntent(text, { mode: this.mode });
    if (intent && this.onIntentCallback) {
      this.onIntentCallback(intent, text);
    }
    return intent;
  }

  private initAndStartRecognizer(): void {
    if (!this.running) return;

    // Check for webkitSpeechRecognition or SpeechRecognition
    const SpeechClass = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition ||
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;

    if (!SpeechClass) {
      console.warn('[SpeechModule] Web Speech API not supported in this browser context.');
      this.transport.send('speech', {
        t: 'speech.error',
        error: 'service-not-allowed',
        message: 'Web Speech API is not supported or unavailable in this browser context.',
      });
      return;
    }

    try {
      const recognition = new SpeechClass();
      this.recognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = this.lang;

      recognition.onstart = () => {
        this.backoffDelayMs = 250; // Reset backoff upon successful start
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const transcript = res[0]?.transcript?.trim() || '';
          const confidence = res[0]?.confidence || 0.8;
          const isFinal = res.isFinal;

          if (!transcript) continue;

          // Emit onset on the first interim or speech result of an utterance
          if (!this.utteranceStarted) {
            this.utteranceStarted = true;
            this.transport.send('speech', { t: 'speech.onset' });
          }

          this.transport.send('speech', {
            t: 'speech.result',
            text: transcript,
            final: isFinal,
            confidence,
          });

          if (isFinal) {
            this.utteranceStarted = false; // Reset for next utterance
            const intent = parseIntent(transcript, { mode: this.mode });
            if (intent && this.onIntentCallback) {
              this.onIntentCallback(intent, transcript);
            }
          } else {
            // Check for safe interim global commands
            if (isSafeInterimGlobal(transcript)) {
              const intent = parseIntent(transcript, { mode: this.mode });
              if (intent && this.onIntentCallback) {
                this.onIntentCallback(intent, transcript);
              }
            }
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        console.warn('[SpeechModule] Speech recognition error:', event.error, event.message);
        // Do not crash on 'no-speech' or 'aborted'
        if (event.error === 'no-speech' || event.error === 'audio-capture') {
          this.utteranceStarted = false;
        }

        // Emit speech.error for orchestrator error state handling
        this.transport.send('speech', {
          t: 'speech.error',
          error: event.error,
          message: event.message,
        });
      };

      recognition.onend = () => {
        this.utteranceStarted = false;
        if (!this.running) return;

        // Auto-restart with exponential backoff
        this.restartTimer = window.setTimeout(() => {
          this.backoffDelayMs = Math.min(this.backoffDelayMs * 1.5, this.maxBackoffDelayMs);
          this.initAndStartRecognizer();
        }, this.backoffDelayMs);
      };

      recognition.start();
    } catch (err) {
      console.warn('[SpeechModule] Error starting recognition:', err);
      if (this.running) {
        this.restartTimer = window.setTimeout(() => {
          this.backoffDelayMs = Math.min(this.backoffDelayMs * 1.5, this.maxBackoffDelayMs);
          this.initAndStartRecognizer();
        }, this.backoffDelayMs);
      }
    }
  }
}
