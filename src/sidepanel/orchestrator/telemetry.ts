// Telemetry emitter (P3). Emits Telemetry rows for the benchmark (P4).
import type { Transport } from '../../shared/bus';
import type { Telemetry, Gear } from '../../shared/contract';

/** Short in-session action log entry */
export interface ActionLogEntry {
  ts: number;
  event: string;
  target?: string;
  ok?: boolean;
}

export class TelemetryEmitter {
  private transport: Transport;
  private session: string;
  private system: Telemetry['system'] = 'handsfree';
  private task = 'default';
  private level: Telemetry['level'] = 0;
  private trial = 0;

  /** Rolling in-memory action log (last 100 entries) */
  private actionLog: ActionLogEntry[] = [];

  /** Per-gear time accounting */
  private gearEnteredAt: number = Date.now();
  private currentGear: Gear = 'hop';
  private gearDurations: Record<Gear, number> = { hop: 0, voice: 0 };

  constructor(transport: Transport, session?: string) {
    this.transport = transport;
    this.session = session ?? `s_${Date.now()}`;
  }

  // ---- Configuration ----
  setTask(task: string, level: Telemetry['level'] = 0, trial = 0): void {
    this.task = task;
    this.level = level;
    this.trial = trial;
  }

  setSystem(system: Telemetry['system']): void {
    this.system = system;
  }

  // ---- Gear tracking ----
  recordGearChange(newGear: Gear, reason: string): void {
    const now = Date.now();
    const elapsed = now - this.gearEnteredAt;
    this.gearDurations[this.currentGear] += elapsed;
    this.gearEnteredAt = now;
    this.currentGear = newGear;
    this.emit('gear_shift', undefined, undefined, { newGear, reason, hopMs: this.gearDurations.hop, voiceMs: this.gearDurations.voice });
  }

  gearSnapshot(): Record<Gear, number> {
    // Finalize current gear without committing
    const now = Date.now();
    const snap = { ...this.gearDurations };
    snap[this.currentGear] += now - this.gearEnteredAt;
    return snap;
  }

  // ---- Event row emitters ----
  recordActivation(target: string, correct?: boolean): void {
    this.emit('activation', target, correct);
    this.log({ ts: Date.now(), event: 'activation', target, ok: correct });
  }

  recordCancel(target?: string): void {
    this.emit('cancel', target);
    this.log({ ts: Date.now(), event: 'cancel', target });
  }

  recordConfirmation(target: string, accepted: boolean): void {
    this.emit(accepted ? 'confirm_accept' : 'confirm_cancel', target, accepted);
    this.log({ ts: Date.now(), event: accepted ? 'confirm_accept' : 'confirm_cancel', target, ok: accepted });
  }

  recordFallback(step: string): void {
    this.emit(`fallback_${step}`, step);
    this.log({ ts: Date.now(), event: `fallback_${step}` });
  }

  recordPause(reason: string): void {
    this.emit('pause', undefined, undefined, { reason });
    this.log({ ts: Date.now(), event: 'pause' });
  }

  recordResume(): void {
    this.emit('resume');
    this.log({ ts: Date.now(), event: 'resume' });
  }

  // ---- Action log ----
  getLog(): ActionLogEntry[] {
    return [...this.actionLog];
  }

  clearLog(): void {
    this.actionLog = [];
  }

  // ---- Private helpers ----
  private emit(
    event: string,
    target?: string,
    correct?: boolean,
    extra?: Record<string, unknown>
  ): void {
    const row: Telemetry = {
      session: this.session,
      system: this.system,
      task: this.task,
      level: this.level,
      trial: this.trial,
      event,
      ts: Date.now(),
      ...(target !== undefined && { target }),
      ...(correct !== undefined && { correct }),
      ...(extra !== undefined && { extra }),
    };
    this.transport.send('telemetry', row);
  }

  private log(entry: ActionLogEntry): void {
    this.actionLog.push(entry);
    if (this.actionLog.length > 100) this.actionLog.shift();
  }
}
