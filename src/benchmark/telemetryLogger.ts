import type { Telemetry } from '../shared/contract';

const STORAGE_KEY = '__hf_chaos_lab_telemetry__';

export class TelemetryLogger {
  private session: string;
  private logs: Telemetry[] = [];

  constructor(session: string = `session_${Date.now()}`) {
    this.session = session;
    this.load();
    this.listenToWindowMessages();
  }

  public getSession(): string {
    return this.session;
  }

  public setSession(session: string): void {
    this.session = session;
  }

  public log(entry: Omit<Telemetry, 'session' | 'ts'> & { ts?: number }): void {
    const row: Telemetry = {
      session: this.session,
      ts: entry.ts ?? Date.now(),
      system: entry.system,
      task: entry.task,
      level: entry.level,
      trial: entry.trial,
      event: entry.event,
      target: entry.target,
      correct: entry.correct,
      extra: entry.extra,
    };
    this.logs.push(row);
    this.save();
  }

  public getAllLogs(): Telemetry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private save(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
      } catch (err) {
        console.warn('Failed to save telemetry to localStorage:', err);
      }
    }
  }

  private load(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.logs = JSON.parse(raw);
        }
      } catch {
        this.logs = [];
      }
    }
  }

  private listenToWindowMessages(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('message', (evt) => {
      if (evt.data && evt.data.type === 'HANDSFREE_TELEMETRY' && evt.data.payload) {
        const payload = evt.data.payload as Partial<Telemetry>;
        if (payload.event && payload.system && payload.task !== undefined) {
          this.log({
            system: payload.system as any,
            task: payload.task,
            level: (payload.level ?? 0) as any,
            trial: payload.trial ?? 1,
            event: payload.event,
            target: payload.target,
            correct: payload.correct,
            extra: payload.extra,
            ts: payload.ts,
          });
        }
      }
    });
  }
}
