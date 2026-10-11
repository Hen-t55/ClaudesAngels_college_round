// Orchestrator State Machine (P3)
// Implements: SETUP -> IDLE <-> AIMING -> LOCKED -> RESOLVING -> (ACT | DISAMBIGUATE | ZOOM | CONFIRM) -> AIMING
// Includes: 2-gear auto-shifter with hysteresis, telemetry, settings, tab commands, dictation polish.
import type { Transport } from '../../shared/bus';
import type {
  Phase, Gear, Quadrant, Dir, Scope,
  Intent, MatchMeta, Important, OverlayState,
  HeadEvent, SpeechEvent, EngineRequest, EngineEvent, TabCommand,
} from '../../shared/contract';
import type { HandsfreeSettings } from '../../shared/settings';
import { parseIntent, isSafeInterimGlobal } from '../voice';
import { TelemetryEmitter } from './telemetry';

export interface OrchestratorDeps {
  transport: Transport;
  initialGear?: Gear;
  confirmTimeoutMs?: number;
  engineTimeoutMs?: number;
  /** Supply loaded settings; orchestrator listens for live patches on the settings channel. */
  settings?: Partial<HandsfreeSettings>;
}

// ---- Gear-shift hysteresis config ----
const GEAR_DOWN_MS  = 3_000;  // 3 s of bad signal → auto-shift
const GEAR_UP_MS    = 10_000; // 10 s of good signal → auto-shift back

export class Orchestrator {
  private transport: Transport;
  private phase: Phase = 'IDLE';
  private gear: Gear = 'hop';
  private gearReason?: string;
  private manualGearPinned = false;
  private paused = false;
  private listening = true;
  private quadrant: Quadrant | null = null;
  private quadrantLocked = false;
  private headDot?: { x: number; y: number };
  private matches: MatchMeta[] = [];
  private focusedMatchIndex = 0;
  private showNumbers = false;
  private zoomState?: OverlayState['zoom'];
  private banner?: OverlayState['banner'];
  private transcript?: string;

  // Resolving & action tracking
  private currentRequestId = 0;
  private pendingTargetAction?: { verb: any; query: any };
  private pendingConfirm?: { actionId: string; info: Important };
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmTimeoutMs: number;
  private isWidenedScope = false;
  private engineTimer: ReturnType<typeof setTimeout> | null = null;
  private engineTimeoutMs = 3000; // 3s recovery timeout if engine is silent

  // Latency benchmark metrics
  private speechFinalTs = 0;
  private lastSpeechToActionLatency = 0;
  private lastQuadrantLatency = 0;

  // Settings
  private settings: HandsfreeSettings = {
    preferredGear: 'hop',
    language: 'en-IN',
    importantKeywords: [],
    jitterThresholdHigh: 0.08,
    snrThresholdLow: 10,
    confidenceThresholdLow: 0.55,
    simulatorEnabled: false,
  };

  // ---- Auto-shifter hysteresis state ----
  // Tracks continuous runs of "bad" / "good" signals
  private badSignalSince: number | null = null;
  private goodSignalSince: number | null = null;
  private lastSpeechConfidence = 1.0;
  private lastNoiseFloor = 0.0;
  private lastSpeechLevel = 0.0;

  // Telemetry
  private telemetry: TelemetryEmitter;

  // Unbind callbacks
  private unbinds: (() => void)[] = [];

  constructor(deps: OrchestratorDeps) {
    this.transport = deps.transport;
    this.confirmTimeoutMs = deps.confirmTimeoutMs ?? 5000;
    this.engineTimeoutMs = deps.engineTimeoutMs ?? 3000;
    this.telemetry = new TelemetryEmitter(deps.transport);

    if (deps.initialGear) {
      this.gear = deps.initialGear;
    }
    if (deps.settings) {
      Object.assign(this.settings, deps.settings);
      if (deps.settings.preferredGear) this.gear = deps.settings.preferredGear;
    }

    this.bindTransport();
    this.setHeadMode('quadrant');
    this.broadcast();
  }

  // ---- Public API ----
  public getPhase(): Phase { return this.phase; }
  public getGear(): Gear  { return this.gear; }
  public getLog() { return this.telemetry.getLog(); }
  public getLatencyMetrics() {
    return {
      speechToActionMs: this.lastSpeechToActionLatency,
      quadrantHighlightMs: this.lastQuadrantLatency,
    };
  }

  public handleTabChanged(): void {
    if (this.engineTimer) {
      clearTimeout(this.engineTimer);
      this.engineTimer = null;
    }
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
    this.pendingTargetAction = undefined;
    this.pendingConfirm = undefined;
    this.matches = [];
    this.transport.send('engine.request', { t: 'engine.clear' });
    this.rearmToAiming();
    this.banner = { kind: 'info', text: 'Tab changed — re-armed to new page', timeoutMs: 2000 };
    this.broadcast();
  }

  public getOverlayState(): OverlayState {
    return {
      phase: this.phase,
      gear: this.gear,
      gearReason: this.gearReason,
      paused: this.paused,
      listening: this.listening,
      quadrant: this.quadrant,
      quadrantLocked: this.quadrantLocked,
      headDot: this.headDot,
      matches: this.matches.map((m, idx) => ({
        id: m.id,
        rect: m.rect,
        number: m.number ?? (this.gear === 'voice' || this.showNumbers ? idx + 1 : undefined),
        focused: idx === this.focusedMatchIndex,
      })),
      showNumbers: this.showNumbers,
      zoom: this.zoomState,
      banner: this.banner,
      transcript: this.transcript,
    };
  }

  public stop(): void {
    if (this.confirmTimer) { clearTimeout(this.confirmTimer); this.confirmTimer = null; }
    if (this.engineTimer) { clearTimeout(this.engineTimer); this.engineTimer = null; }
    for (const unbind of this.unbinds) unbind();
    this.unbinds = [];
  }

  // ---- Transport binding ----
  private bindTransport(): void {
    this.unbinds.push(this.transport.on('head.event',    (ev) => this.handleHeadEvent(ev)));
    this.unbinds.push(this.transport.on('speech',        (ev) => this.handleSpeechEvent(ev)));
    this.unbinds.push(this.transport.on('engine.event',  (ev) => this.handleEngineEvent(ev)));
    this.unbinds.push(this.transport.on('settings', (msg) => {
      if (msg.t === 'settings.get') {
        this.transport.send('settings', { t: 'settings.state', values: this.settings as unknown as Record<string, unknown> });
      } else if (msg.t === 'settings.set') {
        Object.assign(this.settings, msg.patch);
        // Re-apply preferred gear only if not manually pinned
        if (msg.patch['preferredGear'] && !this.manualGearPinned) {
          this.setGear(msg.patch['preferredGear'] as Gear, 'Preferred gear updated in settings');
        }
        // Broadcast current settings state back
        this.transport.send('settings', { t: 'settings.state', values: this.settings as unknown as Record<string, unknown> });
      }
    }));
  }

  // =========================================================
  // HEAD INPUT
  // =========================================================
  private handleHeadEvent(ev: HeadEvent): void {
    if (this.paused && ev.t !== 'head.facing') return;

    switch (ev.t) {
      case 'head.pointer':
        this.headDot = { x: ev.x, y: ev.y };
        this.broadcast();
        break;

      case 'head.quadrant':
        if (!this.quadrantLocked && this.phase !== 'PAUSED') {
          const t0 = performance.now();
          this.quadrant = ev.q;
          if (ev.q && this.phase === 'IDLE')         this.phase = 'AIMING';
          else if (!ev.q && this.phase === 'AIMING') this.phase = 'IDLE';
          this.broadcast();
          this.lastQuadrantLatency = performance.now() - t0;
        }
        break;

      case 'head.facing':
        if (!ev.facing && !this.paused) {
          this.telemetry.recordPause('look-away');
          this.pause('Look-away detected');
        } else if (ev.facing && this.paused) {
          this.telemetry.recordResume();
          this.resume();
        }
        break;

      case 'head.flick':
        if (this.phase === 'DISAMBIGUATE' && this.gear === 'hop') {
          this.handleHopFlick(ev.dir);
        }
        break;

      case 'head.nod':
        if (this.phase === 'CONFIRM')        this.confirmAction(true);
        else if (this.phase === 'DISAMBIGUATE' && this.gear === 'hop') this.activateFocusedMatch();
        break;

      case 'head.shake':
        if (this.phase === 'CONFIRM')        this.confirmAction(false);
        else if (this.phase === 'DISAMBIGUATE' || this.phase === 'ZOOM') this.cancelToAiming('Cancelled by head shake');
        break;

      case 'head.quality':
        this.autoShiftFromHeadQuality(ev);
        break;

      case 'head.setup':
        if (ev.step === 'done') {
          this.banner = { kind: 'info', text: 'Calibration complete!' };
          this.rearmToAiming();
        } else {
          this.phase = 'SETUP';
          this.banner = { kind: 'info', text: `Setup: ${ev.prompt} (${Math.round(ev.progress * 100)}%)` };
          this.broadcast();
        }
        break;
    }
  }

  // =========================================================
  // AUTO-SHIFTER — full hysteresis
  // =========================================================
  /**
   * Called on every head.quality event.
   * "bad signal" = high jitter (→ suggest voice) OR low speech confidence / high noise (→ suggest hop).
   * down after 3 s continuous bad signal; up after 10 s continuous good signal.
   * Never shifts mid-action (RESOLVING / DISAMBIGUATE / CONFIRM / ZOOM).
   */
  private autoShiftFromHeadQuality(ev: Extract<HeadEvent, { t: 'head.quality' }>): void {
    if (this.manualGearPinned) return;
    if (this.isActionPhase()) return; // never mid-action

    const now = Date.now();
    const snr = this.lastSpeechLevel > 0 && this.lastNoiseFloor > 0
      ? 20 * Math.log10(this.lastSpeechLevel / Math.max(this.lastNoiseFloor, 0.0001))
      : 99;

    const jitterHigh      = ev.jitter > this.settings.jitterThresholdHigh;
    const confidenceLow   = this.lastSpeechConfidence < this.settings.confidenceThresholdLow;
    const snrLow          = snr < this.settings.snrThresholdLow;
    const speechBad = confidenceLow || snrLow;  // → hop
    const headBad   = jitterHigh;               // → voice

    const isBadForCurrentGear =
      (this.gear === 'voice' && speechBad && !headBad) ||  // voice is bad, head is ok → hop
      (this.gear === 'hop'   && headBad  && !speechBad);   // hop is bad, speech is ok → voice

    const isGoodForCurrentGear = !isBadForCurrentGear;

    if (isBadForCurrentGear) {
      this.goodSignalSince = null;
      if (this.badSignalSince === null) {
        this.badSignalSince = now;
      } else if (now - this.badSignalSince >= GEAR_DOWN_MS) {
        this.badSignalSince = null;
        const newGear: Gear = (this.gear === 'voice') ? 'hop' : 'voice';
        const reason = headBad
          ? `High head jitter (${ev.jitter.toFixed(3)}) → switched to voice`
          : `Low speech quality (conf ${this.lastSpeechConfidence.toFixed(2)}, SNR ${snr.toFixed(0)}dB) → switched to hop`;
        this.setGear(newGear, reason);
      }
    } else if (isGoodForCurrentGear) {
      this.badSignalSince = null;
      if (this.goodSignalSince === null) {
        this.goodSignalSince = now;
      } else if (now - this.goodSignalSince >= GEAR_UP_MS) {
        this.goodSignalSince = null;
        // Shift back to the preferred gear if we drifted away
        const preferred = this.settings.preferredGear;
        if (this.gear !== preferred) {
          this.setGear(preferred, `Signal good for 10 s → restored preferred gear (${preferred})`);
        }
      }
    }
  }

  /** Update speech quality metrics used by the auto-shifter */
  private updateSpeechQuality(confidence: number, noiseFloor?: number, level?: number): void {
    this.lastSpeechConfidence = confidence;
    if (noiseFloor !== undefined) this.lastNoiseFloor = noiseFloor;
    if (level !== undefined) this.lastSpeechLevel = level;
  }

  private isActionPhase(): boolean {
    return (
      this.phase === 'RESOLVING' ||
      this.phase === 'DISAMBIGUATE' ||
      this.phase === 'CONFIRM' ||
      this.phase === 'ZOOM'
    );
  }

  /** Central gear setter — always goes through here so telemetry fires. */
  private setGear(gear: Gear, reason: string): void {
    this.gearReason = reason;
    if (this.gear !== gear) {
      this.telemetry.recordGearChange(gear, reason);
      this.gear = gear;
    }
    this.broadcast();
  }

  // =========================================================
  // SPEECH INPUT
  // =========================================================
  private handleSpeechEvent(ev: SpeechEvent): void {
    switch (ev.t) {
      case 'speech.onset':
        if (this.phase === 'AIMING' || this.phase === 'IDLE') {
          this.quadrantLocked = true;
          this.phase = 'LOCKED';
          this.setHeadMode('locked');
          this.broadcast();
        }
        break;

      case 'speech.result':
        this.transcript = ev.text;
        if (ev.final) {
          this.speechFinalTs = performance.now();
          this.updateSpeechQuality(ev.confidence);
          const intent = parseIntent(ev.text, { mode: this.phase === 'DICTATION' ? 'dictation' : 'command' });
          if (intent) this.handleIntent(intent);
        } else if (isSafeInterimGlobal(ev.text)) {
          const interimIntent = parseIntent(ev.text, { mode: 'command' });
          if (interimIntent) this.handleIntent(interimIntent);
        }
        this.broadcast();
        break;

      case 'speech.level':
        this.updateSpeechQuality(this.lastSpeechConfidence, ev.noiseFloor, ev.level);
        break;

      case 'speech.error':
        if (ev.error === 'not-allowed' || ev.error === 'audio-capture' || ev.error === 'service-not-allowed' || ev.error === 'network') {
          const reason = ev.error === 'not-allowed'
            ? 'Microphone permission denied. Switched to typed simulation input and Hop gear.'
            : ev.error === 'audio-capture'
            ? 'Microphone busy or unavailable. Switched to typed simulation input and Hop gear.'
            : 'Speech service offline or unavailable. Switched to typed simulation input and Hop gear.';

          this.manualGearPinned = false; // allow gear fallback
          this.setGear('hop', reason);
          this.transport.send('settings', { t: 'settings.set', patch: { simulatorEnabled: true } });
          this.banner = {
            kind: 'error',
            text: `⚠️ Voice unavailable (${ev.error}): ${reason}`,
            timeoutMs: 6000,
          };
          this.rearmToAiming();
        }
        break;
    }
  }

  // =========================================================
  // INTENT DISPATCHING
  // =========================================================
  public handleIntent(intent: Intent): void {
    if (this.paused && !(intent.k === 'control' && intent.name === 'resume')) return;

    switch (intent.k) {
      case 'global':  this.handleGlobalIntent(intent);  break;
      case 'control': this.handleControlIntent(intent); break;
      case 'target':  this.startResolving(intent);       break;
      case 'number':  this.handleNumberIntent(intent.n); break;
      case 'type':
        this.transport.send('engine.request', { t: 'engine.type', text: intent.text, field: intent.field, mode: 'fill' });
        this.rearmToAiming();
        break;
      case 'dictation':
        this.transport.send('engine.request', { t: 'engine.type', text: intent.text, mode: 'insert' });
        break;
    }
  }

  private handleGlobalIntent(intent: Extract<Intent, { k: 'global' }>): void {
    switch (intent.name) {
      // Scroll — goes to content engine
      case 'scroll_down':
      case 'scroll_up':
      case 'scroll_top':
      case 'scroll_bottom':
        this.transport.send('engine.request', { t: 'engine.global', name: intent.name });
        break;

      // Browser navigation — routed to background SW via tab.command channel
      case 'back':
      case 'forward':
      case 'reload':
      case 'home':
      case 'new_tab':
      case 'next_tab':
      case 'prev_tab':
        this.sendTabCommand({ t: 'tab.command', name: intent.name });
        break;

      // close_tab is IMPORTANT — must go through confirmation first
      case 'close_tab':
        this.askConfirmation('__close_tab__', {
          reason: 'close_tab',
          description: 'Close this tab?',
        });
        return; // confirmation will call rearmToAiming when done

      case 'tab_n':
        if (intent.n !== undefined) {
          this.sendTabCommand({ t: 'tab.command', name: 'tab_n', n: intent.n });
        }
        break;

      case 'go_to':
        this.sendTabCommand({ t: 'tab.command', name: 'go_to', url: intent.url });
        break;
    }
    this.rearmToAiming();
  }

  private handleControlIntent(intent: Extract<Intent, { k: 'control' }>): void {
    switch (intent.name) {
      case 'pause':
        this.telemetry.recordPause('user command');
        this.pause('User command');
        break;
      case 'resume':
        this.telemetry.recordResume();
        this.resume();
        break;
      case 'undo':
        this.transport.send('engine.request', { t: 'engine.undo' });
        this.rearmToAiming();
        break;
      case 'cancel':
        this.telemetry.recordCancel();
        this.cancelToAiming('Cancelled by user');
        break;
      case 'yes':
        if (this.phase === 'CONFIRM') this.confirmAction(true);
        break;
      case 'no':
        if (this.phase === 'CONFIRM') this.confirmAction(false);
        break;
      case 'select':
        if (this.phase === 'DISAMBIGUATE' && this.gear === 'hop') this.activateFocusedMatch();
        break;
      case 'hop_mode':
        this.manualGearPinned = true;
        this.badSignalSince = null;
        this.goodSignalSince = null;
        this.setGear('hop', 'Manual selection');
        break;
      case 'voice_mode':
        this.manualGearPinned = true;
        this.badSignalSince = null;
        this.goodSignalSince = null;
        this.setGear('voice', 'Manual selection');
        break;
      case 'show_numbers':
        this.showNumbers = true;
        this.transport.send('engine.request', { t: 'engine.showNumbers', scope: this.getScope() });
        this.broadcast();
        break;
      case 'hide_numbers':
        this.showNumbers = false;
        this.broadcast();
        break;
      case 'zoom':
        this.startZoomGrid();
        break;
      case 'zoom_back':
        if (this.phase === 'ZOOM') this.transport.send('engine.request', { t: 'engine.zoom', op: { k: 'back' } });
        break;
      case 'click_here':
        this.transport.send('engine.request', { t: 'engine.zoom', op: { k: 'click' } });
        this.rearmToAiming();
        break;
      case 'dictate_start':
        this.phase = 'DICTATION';
        this.setHeadMode('locked');
        this.broadcast();
        break;
      case 'dictate_stop':
        this.rearmToAiming();
        break;
      case 'recenter':
        this.transport.send('head.command', { t: 'head.recenter' });
        break;
      case 'help':
        this.banner = { kind: 'info', text: 'Say: click / double click / scroll / back / pause / hop mode / voice mode / type … / dictate' };
        this.broadcast();
        break;
    }
  }

  private handleNumberIntent(n: number): void {
    if (this.phase === 'DISAMBIGUATE') {
      const match = this.matches[n - 1];
      if (match) this.activateMatch(match);
    } else if (this.phase === 'ZOOM') {
      this.transport.send('engine.request', { t: 'engine.zoom', op: { k: 'pick', n } });
    }
  }

  // =========================================================
  // RESOLVING & SHIFTER
  // =========================================================
  private startResolving(intent: Extract<Intent, { k: 'target' }>): void {
    this.phase = 'RESOLVING';
    this.isWidenedScope = !this.quadrant;
    this.pendingTargetAction = { verb: intent.verb, query: intent.query };
    const reqId = `res_${++this.currentRequestId}`;
    const scope: Scope = this.quadrant ? { k: 'quadrant', q: this.quadrant } : { k: 'page' };
    this.transport.send('engine.request', { t: 'engine.resolve', id: reqId, verb: intent.verb, query: intent.query, scope });
    this.broadcast();

    // Start engine response recovery watchdog
    if (this.engineTimer) clearTimeout(this.engineTimer);
    this.engineTimer = setTimeout(() => {
      this.handleEngineTimeout('Content script not responding or unavailable on this page');
    }, this.engineTimeoutMs);
  }

  private handleEngineTimeout(reason: string): void {
    if (this.phase === 'RESOLVING') {
      this.transport.send('engine.request', { t: 'engine.clear' });
      this.rearmToAiming();
      this.banner = {
        kind: 'error',
        text: `⚠️ Page unavailable: ${reason}. Check if this is a restricted chrome:// page.`,
        timeoutMs: 4000,
      };
      this.broadcast();
    }
  }

  private handleEngineEvent(ev: EngineEvent): void {
    if (this.engineTimer) {
      clearTimeout(this.engineTimer);
      this.engineTimer = null;
    }

    switch (ev.t) {
      case 'engine.result':    this.handleResolveResult(ev);  break;
      case 'engine.confirmNeeded': this.askConfirmation(ev.actionId, ev.info); break;
      case 'engine.zoomState':
        this.zoomState = { rect: ev.rect, cells: ev.cells, depth: ev.depth };
        this.zoomDepth = ev.depth;
        if (ev.outcome === 'clicked' || ev.outcome === 'center') this.rearmToAiming();
        else this.broadcast();
        break;
      case 'engine.done':
        if (!ev.ok) this.telemetry.recordCancel(ev.what);
        this.rearmToAiming();
        break;
    }
  }

  private zoomDepth = 0;

  private handleResolveResult(ev: Extract<EngineEvent, { t: 'engine.result' }>): void {
    this.matches = ev.matches;
    this.focusedMatchIndex = 0;

    if (ev.status === 'one' && ev.matches.length > 0) {
      this.activateMatch(ev.matches[0]);
    } else if (ev.status === 'many') {
      this.phase = 'DISAMBIGUATE';
      this.banner = {
        kind: 'info',
        text: this.gear === 'hop'
          ? 'Hop: flick head to move, nod or say "select"'
          : 'Voice: say the badge number',
      };
      this.broadcast();
    } else {
      this.handleFallbackLadder(ev.widened);
    }
  }

  private handleFallbackLadder(widened = false): void {
    if (!widened && !this.isWidenedScope && this.quadrant) {
      this.isWidenedScope = true;
      this.telemetry.recordFallback('widen');
      this.banner = { kind: 'info', text: 'No match in quadrant — widening to page…' };
      this.broadcast();
      const reqId = `res_${++this.currentRequestId}`;
      this.transport.send('engine.request', {
        t: 'engine.resolve', id: reqId,
        verb: this.pendingTargetAction?.verb || 'click',
        query: this.pendingTargetAction?.query || { raw: '' },
        scope: { k: 'page' },
      });
    } else {
      this.telemetry.recordFallback('zoom');
      this.banner = { kind: 'info', text: 'No matches — starting zoom grid…' };
      this.startZoomGrid();
    }
  }

  private startZoomGrid(): void {
    this.phase = 'ZOOM';
    this.transport.send('engine.request', { t: 'engine.zoom', op: { k: 'start', scope: this.getScope() } });
    this.broadcast();
  }

  private handleHopFlick(dir: Dir): void {
    if (this.matches.length === 0) return;
    if (dir === 'right' || dir === 'down')
      this.focusedMatchIndex = (this.focusedMatchIndex + 1) % this.matches.length;
    else
      this.focusedMatchIndex = (this.focusedMatchIndex - 1 + this.matches.length) % this.matches.length;
    this.transport.send('engine.request', { t: 'engine.hop', dir });
    this.broadcast();
  }

  private activateFocusedMatch(): void {
    const match = this.matches[this.focusedMatchIndex];
    if (match) this.activateMatch(match);
  }

  private activateMatch(match: MatchMeta): void {
    const verb = this.pendingTargetAction?.verb || 'click';
    if (this.speechFinalTs > 0) {
      this.lastSpeechToActionLatency = performance.now() - this.speechFinalTs;
    }
    if (match.important) {
      this.askConfirmation(match.id, match.important);
    } else {
      this.telemetry.recordActivation(match.label || match.id, true, {
        speechToActionMs: this.lastSpeechToActionLatency,
      });
      this.phase = 'IDLE';
      this.transport.send('engine.request', {
        t: 'engine.activate', id: `act_${++this.currentRequestId}`, matchId: match.id, verb,
      });
      this.rearmToAiming();
    }
  }

  // =========================================================
  // CONFIRMATION
  // =========================================================
  private askConfirmation(actionId: string, info: Important): void {
    this.phase = 'CONFIRM';
    this.pendingConfirm = { actionId, info };
    this.banner = {
      kind: 'confirm',
      text: `Confirm: ${info.description} (say "yes" or nod; "no" or shake to cancel)`,
      timeoutMs: this.confirmTimeoutMs,
    };
    this.broadcast();

    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => {
      this.confirmAction(false, 'Timeout');
    }, this.confirmTimeoutMs);
  }

  private confirmAction(accept: boolean, reason?: string): void {
    if (this.confirmTimer) { clearTimeout(this.confirmTimer); this.confirmTimer = null; }

    if (this.pendingConfirm) {
      const { actionId, info } = this.pendingConfirm;
      this.telemetry.recordConfirmation(info.description, accept);

      if (actionId === '__close_tab__') {
        // close_tab special case — route to background SW
        if (accept) this.sendTabCommand({ t: 'tab.command', name: 'close_tab' });
      } else {
        this.transport.send('engine.request', { t: 'engine.confirm', actionId, accept });
      }
      this.pendingConfirm = undefined;
    }

    this.banner = accept
      ? { kind: 'info', text: 'Action confirmed' }
      : { kind: 'error', text: reason || 'Action cancelled' };
    this.rearmToAiming();
  }

  // =========================================================
  // PAUSE / RESUME / RE-ARM
  // =========================================================
  private pause(reason: string): void {
    this.paused = true;
    this.phase = 'PAUSED';
    this.banner = { kind: 'info', text: `Paused (${reason})` };
    this.setHeadMode('locked');
    this.broadcast();
  }

  private resume(): void {
    this.paused = false;
    this.banner = undefined;
    this.rearmToAiming();
  }

  private cancelToAiming(reason: string): void {
    this.banner = { kind: 'error', text: reason };
    this.transport.send('engine.request', { t: 'engine.clear' });
    this.rearmToAiming();
  }

  private rearmToAiming(): void {
    if (this.engineTimer) {
      clearTimeout(this.engineTimer);
      this.engineTimer = null;
    }
    this.quadrantLocked = false;
    this.isWidenedScope = false;
    this.phase = this.quadrant ? 'AIMING' : 'IDLE';
    this.matches = [];
    this.showNumbers = false;
    this.zoomState = undefined;
    this.setHeadMode('quadrant');
    this.broadcast();
  }

  // =========================================================
  // HELPERS
  // =========================================================
  private setHeadMode(mode: 'quadrant' | 'locked' | 'off'): void {
    this.transport.send('head.command', { t: 'head.setMode', mode });
  }

  private getScope(): Scope {
    return this.quadrant ? { k: 'quadrant', q: this.quadrant } : { k: 'page' };
  }

  private broadcast(): void {
    this.transport.send('overlay', this.getOverlayState());
  }

  private sendTabCommand(cmd: TabCommand): void {
    // Dispatch over chrome.runtime.sendMessage wrapped in the bus envelope.
    // In tests / non-extension context the 'tab.command' channel listeners handle it.
    this.transport.send('tab.command', cmd);
  }
}

export function startOrchestrator(deps: OrchestratorDeps): Orchestrator {
  return new Orchestrator(deps);
}
