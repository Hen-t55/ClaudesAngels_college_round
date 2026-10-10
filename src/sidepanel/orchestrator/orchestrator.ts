// Orchestrator State Machine (P3)
// Implements the full lifecycle: SETUP -> IDLE <-> AIMING -> LOCKED -> RESOLVING -> (ACT | DISAMBIGUATE | ZOOM | CONFIRM) -> AIMING
import type { Transport } from '../../shared/bus';
import type {
  Phase,
  Gear,
  Quadrant,
  Dir,
  Rect,
  Scope,
  Intent,
  MatchMeta,
  Important,
  OverlayState,
  HeadEvent,
  SpeechEvent,
  EngineRequest,
  EngineEvent,
} from '../../shared/contract';

export interface OrchestratorDeps {
  transport: Transport;
  initialGear?: Gear;
  confirmTimeoutMs?: number;
}

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
  private zoomDepth = 0;
  private zoomState?: OverlayState['zoom'];
  private banner?: OverlayState['banner'];
  private transcript?: string;

  // Resolving & action tracking
  private currentRequestId = 0;
  private pendingTargetAction?: { verb: any; query: any };
  private pendingConfirm?: { actionId: string; info: Important };
  private confirmTimer: number | null = null;
  private confirmTimeoutMs: number;

  // Unbind callbacks
  private unbinds: (() => void)[] = [];

  constructor(deps: OrchestratorDeps) {
    this.transport = deps.transport;
    if (deps.initialGear) this.gear = deps.initialGear;
    this.confirmTimeoutMs = deps.confirmTimeoutMs ?? 5000;

    this.bindTransport();
    // Arm head tracking initially
    this.setHeadMode('quadrant');
    this.broadcast();
  }

  public getPhase(): Phase {
    return this.phase;
  }

  public getGear(): Gear {
    return this.gear;
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
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }
    for (const unbind of this.unbinds) unbind();
    this.unbinds = [];
  }

  private bindTransport(): void {
    // 1. Head Events
    this.unbinds.push(
      this.transport.on('head.event', (ev) => this.handleHeadEvent(ev))
    );

    // 2. Speech Events
    this.unbinds.push(
      this.transport.on('speech', (ev) => this.handleSpeechEvent(ev))
    );

    // 3. Engine Events
    this.unbinds.push(
      this.transport.on('engine.event', (ev) => this.handleEngineEvent(ev))
    );
  }

  // ---- Head Input Handling ----
  private handleHeadEvent(ev: HeadEvent): void {
    if (this.paused && ev.t !== 'head.facing') return;

    switch (ev.t) {
      case 'head.pointer':
        this.headDot = { x: ev.x, y: ev.y };
        this.broadcast();
        break;

      case 'head.quadrant':
        if (!this.quadrantLocked && this.phase !== 'PAUSED') {
          this.quadrant = ev.q;
          if (ev.q && this.phase === 'IDLE') {
            this.phase = 'AIMING';
          } else if (!ev.q && this.phase === 'AIMING') {
            this.phase = 'IDLE';
          }
          this.broadcast();
        }
        break;

      case 'head.facing':
        if (!ev.facing && !this.paused) {
          // Look-away auto-pause
          this.pause('Look-away detected');
        } else if (ev.facing && this.paused) {
          this.resume();
        }
        break;

      case 'head.flick':
        if (this.phase === 'DISAMBIGUATE' && this.gear === 'hop') {
          this.handleHopFlick(ev.dir);
        }
        break;

      case 'head.nod':
        if (this.phase === 'CONFIRM') {
          this.confirmAction(true);
        } else if (this.phase === 'DISAMBIGUATE' && this.gear === 'hop') {
          this.activateFocusedMatch();
        }
        break;

      case 'head.shake':
        if (this.phase === 'CONFIRM') {
          this.confirmAction(false);
        } else if (this.phase === 'DISAMBIGUATE' || this.phase === 'ZOOM') {
          this.cancelToAiming('Cancelled by head shake');
        }
        break;

      case 'head.quality':
        this.handleQualityAutoShifter(ev);
        break;
    }
  }

  // Auto-shift gear based on signal quality
  private handleQualityAutoShifter(ev: Extract<HeadEvent, { t: 'head.quality' }>): void {
    if (this.manualGearPinned || this.phase === 'RESOLVING' || this.phase === 'DISAMBIGUATE') {
      return;
    }
    // High head jitter -> suggest voice gear
    if (ev.jitter > 0.08 && this.gear !== 'voice') {
      this.gear = 'voice';
      this.gearReason = 'High head jitter detected -> switched to voice';
      this.broadcast();
    }
  }

  // ---- Speech Input Handling ----
  private handleSpeechEvent(ev: SpeechEvent): void {
    switch (ev.t) {
      case 'speech.onset':
        // When speech starts, LOCK quadrant
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
          // Handled via handleIntent or orchestrator dispatcher
        }
        this.broadcast();
        break;
    }
  }

  // ---- Intent Dispatching ----
  public handleIntent(intent: Intent): void {
    if (this.paused && !(intent.k === 'control' && intent.name === 'resume')) {
      return;
    }

    switch (intent.k) {
      case 'global':
        this.handleGlobalIntent(intent);
        break;

      case 'control':
        this.handleControlIntent(intent);
        break;

      case 'target':
        this.startResolving(intent);
        break;

      case 'number':
        this.handleNumberIntent(intent.n);
        break;

      case 'type':
        this.transport.send('engine.request', {
          t: 'engine.type',
          text: intent.text,
          field: intent.field,
          mode: 'fill',
        });
        this.rearmToAiming();
        break;

      case 'dictation':
        this.transport.send('engine.request', {
          t: 'engine.type',
          text: intent.text,
          mode: 'insert',
        });
        break;
    }
  }

  private handleGlobalIntent(intent: Extract<Intent, { k: 'global' }>): void {
    // Globals bypass quadrant
    switch (intent.name) {
      case 'scroll_down':
      case 'scroll_up':
      case 'scroll_top':
      case 'scroll_bottom':
        this.transport.send('engine.request', {
          t: 'engine.global',
          name: intent.name,
        });
        break;

      case 'back':
      case 'forward':
      case 'reload':
      case 'home':
      case 'new_tab':
      case 'close_tab':
      case 'next_tab':
      case 'prev_tab':
      case 'tab_n':
      case 'go_to':
        // Chrome browser global navigation commands
        break;
    }
    this.rearmToAiming();
  }

  private handleControlIntent(intent: Extract<Intent, { k: 'control' }>): void {
    switch (intent.name) {
      case 'pause':
        this.pause('User command');
        break;
      case 'resume':
        this.resume();
        break;
      case 'undo':
        this.transport.send('engine.request', { t: 'engine.undo' });
        this.rearmToAiming();
        break;
      case 'cancel':
        this.cancelToAiming('Cancelled by user');
        break;
      case 'yes':
        if (this.phase === 'CONFIRM') this.confirmAction(true);
        break;
      case 'no':
        if (this.phase === 'CONFIRM') this.confirmAction(false);
        break;
      case 'select':
        if (this.phase === 'DISAMBIGUATE' && this.gear === 'hop') {
          this.activateFocusedMatch();
        }
        break;
      case 'hop_mode':
        this.gear = 'hop';
        this.manualGearPinned = true;
        this.gearReason = 'Manual selection';
        this.broadcast();
        break;
      case 'voice_mode':
        this.gear = 'voice';
        this.manualGearPinned = true;
        this.gearReason = 'Manual selection';
        this.broadcast();
        break;
      case 'show_numbers':
        this.showNumbers = true;
        this.transport.send('engine.request', {
          t: 'engine.showNumbers',
          scope: this.getScope(),
        });
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
        if (this.phase === 'ZOOM') {
          this.transport.send('engine.request', {
            t: 'engine.zoom',
            op: { k: 'back' },
          });
        }
        break;
      case 'click_here':
        this.transport.send('engine.request', {
          t: 'engine.zoom',
          op: { k: 'click' },
        });
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
    }
  }

  private handleNumberIntent(n: number): void {
    if (this.phase === 'DISAMBIGUATE') {
      // Pick matching numbered badge
      const match = this.matches[n - 1];
      if (match) {
        this.activateMatch(match);
      }
    } else if (this.phase === 'ZOOM') {
      // Pick cell in 3x3 grid
      this.transport.send('engine.request', {
        t: 'engine.zoom',
        op: { k: 'pick', n },
      });
    }
  }

  // ---- Resolving & Shifter ----
  private startResolving(intent: Extract<Intent, { k: 'target' }>): void {
    this.phase = 'RESOLVING';
    this.pendingTargetAction = { verb: intent.verb, query: intent.query };
    const reqId = `res_${++this.currentRequestId}`;

    const scope: Scope = this.quadrant
      ? { k: 'quadrant', q: this.quadrant }
      : { k: 'page' };

    this.transport.send('engine.request', {
      t: 'engine.resolve',
      id: reqId,
      verb: intent.verb,
      query: intent.query,
      scope,
    });
    this.broadcast();
  }

  private handleEngineEvent(ev: EngineEvent): void {
    switch (ev.t) {
      case 'engine.result':
        this.handleResolveResult(ev);
        break;

      case 'engine.confirmNeeded':
        this.askConfirmation(ev.actionId, ev.info);
        break;

      case 'engine.zoomState':
        this.zoomState = {
          rect: ev.rect,
          cells: ev.cells,
          depth: ev.depth,
        };
        this.zoomDepth = ev.depth;
        if (ev.outcome === 'clicked' || ev.outcome === 'center') {
          this.rearmToAiming();
        } else {
          this.broadcast();
        }
        break;

      case 'engine.done':
        this.rearmToAiming();
        break;
    }
  }

  private handleResolveResult(ev: Extract<EngineEvent, { t: 'engine.result' }>): void {
    this.matches = ev.matches;
    this.focusedMatchIndex = 0;

    if (ev.status === 'one' && ev.matches.length > 0) {
      // ONE match -> directly activate
      const match = ev.matches[0];
      this.activateMatch(match);
    } else if (ev.status === 'many') {
      // MANY matches -> 2-gear shifter
      this.phase = 'DISAMBIGUATE';
      this.banner = {
        kind: 'info',
        text: this.gear === 'hop'
          ? 'Hop Mode: Flick head to move, nod or say "select"'
          : 'Voice Mode: Say the badge number',
      };
      this.broadcast();
    } else {
      // NONE matches -> Fallback Ladder
      this.handleFallbackLadder(ev.widened);
    }
  }

  private handleFallbackLadder(widened = false): void {
    if (!widened && this.quadrant) {
      // Ladder Step 2: widen scope to the whole page
      this.banner = { kind: 'info', text: 'No match in quadrant. Widening to page...' };
      this.broadcast();
      const reqId = `res_${++this.currentRequestId}`;
      this.transport.send('engine.request', {
        t: 'engine.resolve',
        id: reqId,
        verb: this.pendingTargetAction?.verb || 'click',
        query: this.pendingTargetAction?.query || { raw: '' },
        scope: { k: 'page' },
      });
    } else {
      // Ladder Step 3 & 4: Offer zoom grid
      this.banner = { kind: 'info', text: 'No matches found. Starting zoom grid fallback...' };
      this.startZoomGrid();
    }
  }

  private startZoomGrid(): void {
    this.phase = 'ZOOM';
    this.transport.send('engine.request', {
      t: 'engine.zoom',
      op: { k: 'start', scope: this.getScope() },
    });
    this.broadcast();
  }

  private handleHopFlick(dir: Dir): void {
    if (this.matches.length === 0) return;
    if (dir === 'right' || dir === 'down') {
      this.focusedMatchIndex = (this.focusedMatchIndex + 1) % this.matches.length;
    } else if (dir === 'left' || dir === 'up') {
      this.focusedMatchIndex = (this.focusedMatchIndex - 1 + this.matches.length) % this.matches.length;
    }
    this.transport.send('engine.request', { t: 'engine.hop', dir });
    this.broadcast();
  }

  private activateFocusedMatch(): void {
    const match = this.matches[this.focusedMatchIndex];
    if (match) this.activateMatch(match);
  }

  private activateMatch(match: MatchMeta): void {
    const verb = this.pendingTargetAction?.verb || 'click';
    if (match.important) {
      // Important action -> ask for confirmation
      this.askConfirmation(match.id, match.important);
    } else {
      // Routine action -> execute immediately
      this.phase = 'IDLE';
      this.transport.send('engine.request', {
        t: 'engine.activate',
        id: `act_${++this.currentRequestId}`,
        matchId: match.id,
        verb,
      });
      this.rearmToAiming();
    }
  }

  // ---- Confirmation Ladder ----
  private askConfirmation(actionId: string, info: Important): void {
    this.phase = 'CONFIRM';
    this.pendingConfirm = { actionId, info };
    this.banner = {
      kind: 'confirm',
      text: `Confirm: ${info.description} (Say "yes" or nod; "no" or shake to cancel)`,
      timeoutMs: this.confirmTimeoutMs,
    };
    this.broadcast();

    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.confirmTimer = window.setTimeout(() => {
      // 5 s timeout cancels
      this.confirmAction(false, 'Timeout expired');
    }, this.confirmTimeoutMs);
  }

  private confirmAction(accept: boolean, reason?: string): void {
    if (this.confirmTimer) {
      clearTimeout(this.confirmTimer);
      this.confirmTimer = null;
    }

    if (this.pendingConfirm) {
      this.transport.send('engine.request', {
        t: 'engine.confirm',
        actionId: this.pendingConfirm.actionId,
        accept,
      });
      this.pendingConfirm = undefined;
    }

    if (accept) {
      this.banner = { kind: 'info', text: 'Action confirmed' };
    } else {
      this.banner = { kind: 'error', text: reason || 'Action cancelled' };
    }
    this.rearmToAiming();
  }

  // ---- Pause / Resume / Re-arm ----
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
    this.quadrantLocked = false;
    this.phase = this.quadrant ? 'AIMING' : 'IDLE';
    this.matches = [];
    this.showNumbers = false;
    this.zoomState = undefined;
    this.setHeadMode('quadrant');
    this.broadcast();
  }

  private setHeadMode(mode: 'quadrant' | 'locked' | 'off'): void {
    this.transport.send('head.command', { t: 'head.setMode', mode });
  }

  private getScope(): Scope {
    return this.quadrant ? { k: 'quadrant', q: this.quadrant } : { k: 'page' };
  }

  private broadcast(): void {
    this.transport.send('overlay', this.getOverlayState());
  }
}

export function startOrchestrator(deps: OrchestratorDeps): Orchestrator {
  return new Orchestrator(deps);
}
