import type { Transport } from '../../shared/bus';
import type {
  EngineRequest,
  EngineEvent,
  Dir,
  MatchMeta,
  Rect,
  Scope,
  TargetQuery,
  Verb,
} from '../../shared/contract';
import { DomIndexer } from './dom-indexer';
import { Resolver } from './resolver';
import { HopNavigator } from './hop-navigator';
import { Executor } from './executor';
import type { IndexedElement } from './types';

export class Engine {
  private indexer: DomIndexer;
  private hopNavigator: HopNavigator;
  private transport: Transport | null = null;
  private currentMatches: IndexedElement[] = [];

  // Zoom state
  private zoomStack: Rect[] = [];
  private zoomDepth = 0;

  // Undo: last input value before fill/insert
  private undoTarget: HTMLInputElement | HTMLTextAreaElement | null = null;
  private undoValue = '';

  // Pending confirmation
  private pendingConfirm: { id: string; matchId: string; verb: Verb } | null = null;

  constructor(transport?: Transport) {
    this.indexer = new DomIndexer();
    this.hopNavigator = new HopNavigator();
    if (transport) {
      this.attachTransport(transport);
    }
  }

  public getIndexer(): DomIndexer {
    return this.indexer;
  }

  public getHopNavigator(): HopNavigator {
    return this.hopNavigator;
  }

  public attachTransport(transport: Transport): void {
    this.transport = transport;

    transport.on('engine.request', (req: EngineRequest) => {
      this.handleRequest(req);
    });

    transport.send('engine.event', {
      t: 'engine.ready',
      url: typeof location !== 'undefined' ? location.href : '',
    });
  }

  public handleRequest(req: EngineRequest): void {
    switch (req.t) {
      case 'engine.resolve':
        this.handleResolve(req.id, req.verb, req.query, req.scope);
        break;

      case 'engine.activate':
        this.handleActivate(req.id, req.matchId, req.verb, req.confirmed);
        break;

      case 'engine.hop':
        this.handleHop(req.dir);
        break;

      case 'engine.showNumbers':
        this.handleShowNumbers(req.scope);
        break;

      case 'engine.zoom':
        this.handleZoom(req.op);
        break;

      case 'engine.global':
        Executor.scroll(req.name, req.scope);
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: true,
          what: req.name,
        });
        break;

      case 'engine.type':
        this.handleType(req.text, req.mode, req.field);
        break;

      case 'engine.key':
        Executor.key(req.key);
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: true,
          what: `key_${req.key}`,
        });
        break;

      case 'engine.undo':
        this.handleUndo();
        break;

      case 'engine.confirm':
        this.handleConfirm(req.actionId, req.accept);
        break;

      case 'engine.clear':
        this.currentMatches = [];
        this.hopNavigator.setMatches([]);
        break;

      default:
        break;
    }
  }

  public handleResolve(
    reqId: string,
    verb: Verb,
    query: TargetQuery,
    scope: Scope
  ): void {
    const all = this.indexer.index();
    const { status, matches, widened } = Resolver.resolve(all, query, scope);

    this.currentMatches = matches;
    this.hopNavigator.setMatches(matches);

    const matchMetas: MatchMeta[] = matches.map((item, index) => {
      const important = Resolver.checkImportant(verb, item);
      return {
        id: item.id,
        label: item.label,
        role: item.role,
        rect: item.rect,
        number: index + 1,
        important,
      };
    });

    // If exactly one match, check for important confirmation
    if (status === 'one' && matches.length === 1) {
      const topMeta = matchMetas[0];
      if (topMeta.important) {
        this.transport?.send('engine.event', {
          t: 'engine.confirmNeeded',
          actionId: reqId,
          info: topMeta.important,
        });
      }
    }

    this.transport?.send('engine.event', {
      t: 'engine.result',
      id: reqId,
      status,
      matches: matchMetas,
      widened,
    });

    if (matches.length > 0) {
      this.transport?.send('engine.event', {
        t: 'engine.focus',
        matchId: matches[0].id,
      });
    }
  }

  public handleActivate(
    reqId: string,
    matchId: string,
    verb: Verb,
    confirmed?: boolean
  ): void {
    let target = this.currentMatches.find((m) => m.id === matchId);
    if (!target) {
      target = this.indexer.getById(matchId);
    }

    if (!target) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: `Element ${matchId} not found`,
      });
      return;
    }

    const important = Resolver.checkImportant(verb, target);
    if (important && !confirmed) {
      this.pendingConfirm = { id: reqId, matchId, verb };
      this.transport?.send('engine.event', {
        t: 'engine.confirmNeeded',
        actionId: reqId,
        info: important,
      });
      return;
    }

    Executor.performVerb(verb, target);

    this.transport?.send('engine.event', {
      t: 'engine.done',
      ok: true,
      what: `${verb} on ${target.label || target.id}`,
    });
  }

  public handleHop(dir: Dir): void {
    const focused = this.hopNavigator.hop(dir);
    if (focused) {
      this.transport?.send('engine.event', {
        t: 'engine.focus',
        matchId: focused.id,
      });
    }
  }

  public handleShowNumbers(scope: Scope): void {
    const all = this.indexer.index();
    const scoped = Resolver.filterByScope(all, scope);

    this.currentMatches = scoped.slice(0, 9);
    this.hopNavigator.setMatches(this.currentMatches);

    const matches: MatchMeta[] = this.currentMatches.map((item, index) => ({
      id: item.id,
      label: item.label,
      role: item.role,
      rect: item.rect,
      number: index + 1,
    }));

    this.transport?.send('engine.event', {
      t: 'engine.result',
      id: 'show_numbers',
      status: matches.length > 0 ? 'many' : 'none',
      matches,
    });
  }

  /**
   * Recursive 3×3 zoom grid for fallback when resolver returns 'none'.
   * Operations: start (initialize grid over scope), pick (select cell 1-9),
   * back (pop to previous zoom level), click (center click via elementFromPoint).
   */
  public handleZoom(op: { k: 'start'; scope: Scope } | { k: 'pick'; n: number } | { k: 'back' } | { k: 'click' }): void {
    if (op.k === 'start') {
      let rect: Rect;
      if (op.scope.k === 'rect') {
        rect = op.scope.rect;
      } else if (op.scope.k === 'quadrant') {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
        const hw = vw / 2;
        const hh = vh / 2;
        const qx = op.scope.q === 'TR' || op.scope.q === 'BR' ? hw : 0;
        const qy = op.scope.q === 'BL' || op.scope.q === 'BR' ? hh : 0;
        rect = { x: qx, y: qy, w: hw, h: hh };
      } else {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
        rect = { x: 0, y: 0, w: vw, h: vh };
      }
      this.zoomStack = [rect];
      this.zoomDepth = 0;
      this.emitZoomState(rect);
    } else if (op.k === 'pick') {
      const current = this.zoomStack[this.zoomStack.length - 1];
      if (!current) return;

      const n = Math.max(1, Math.min(9, op.n));
      const col = (n - 1) % 3;
      const row = Math.floor((n - 1) / 3);
      const cellW = current.w / 3;
      const cellH = current.h / 3;
      const cellRect: Rect = {
        x: Math.round(current.x + col * cellW),
        y: Math.round(current.y + row * cellH),
        w: Math.round(cellW),
        h: Math.round(cellH),
      };

      this.zoomStack.push(cellRect);
      this.zoomDepth++;

      // After 3 levels of zoom, try to resolve within the cell
      if (this.zoomDepth >= 3) {
        const all = this.indexer.index();
        const inCell = Resolver.filterByScope(all, { k: 'rect', rect: cellRect });
        if (inCell.length === 1) {
          Executor.click(inCell[0].element);
          this.emitZoomState(cellRect, 'clicked');
          this.zoomStack = [];
          this.zoomDepth = 0;
          return;
        } else if (inCell.length > 1) {
          this.emitZoomState(cellRect, 'many');
          return;
        }
        // No elements: fall through to center click
        this.handleZoom({ k: 'click' });
        return;
      }

      this.emitZoomState(cellRect);
    } else if (op.k === 'back') {
      if (this.zoomStack.length > 1) {
        this.zoomStack.pop();
        this.zoomDepth = Math.max(0, this.zoomDepth - 1);
        const prev = this.zoomStack[this.zoomStack.length - 1];
        this.emitZoomState(prev);
      } else {
        this.zoomStack = [];
        this.zoomDepth = 0;
        this.transport?.send('engine.event', {
          t: 'engine.done',
          ok: false,
          what: 'zoom_cancelled',
        });
      }
    } else if (op.k === 'click') {
      const current = this.zoomStack[this.zoomStack.length - 1];
      if (!current) return;

      const cx = current.x + current.w / 2;
      const cy = current.y + current.h / 2;

      try {
        const el = document.elementFromPoint(cx, cy);
        if (el) {
          Executor.click(el);
          this.emitZoomState(current, 'center');
        }
      } catch {
        // elementFromPoint not available
      }

      this.zoomStack = [];
      this.zoomDepth = 0;
    }
  }

  private emitZoomState(rect: Rect, outcome?: 'clicked' | 'many' | 'center'): void {
    const cellW = rect.w / 3;
    const cellH = rect.h / 3;
    const cells: { n: number; rect: Rect }[] = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        cells.push({
          n: row * 3 + col + 1,
          rect: {
            x: Math.round(rect.x + col * cellW),
            y: Math.round(rect.y + row * cellH),
            w: Math.round(cellW),
            h: Math.round(cellH),
          },
        });
      }
    }
    this.transport?.send('engine.event', {
      t: 'engine.zoomState',
      rect,
      cells,
      depth: this.zoomDepth,
      outcome,
    });
  }

  /**
   * Type text into the focused input (or find a field by label).
   * mode='fill' replaces the value; mode='insert' appends at cursor.
   * Saves previous value for undo.
   */
  public handleType(text: string, mode: 'fill' | 'insert', field?: string): void {
    let target: HTMLInputElement | HTMLTextAreaElement | null = null;

    if (field) {
      // Try to find input by label text
      const all = this.indexer.index();
      const match = all.find(
        (el) =>
          (el.role === 'input' || el.tagName === 'textarea' || el.tagName === 'select') &&
          el.label.toLowerCase().includes(field.toLowerCase())
      );
      if (match && (match.element instanceof HTMLInputElement || match.element instanceof HTMLTextAreaElement)) {
        target = match.element;
      }
    }

    if (!target) {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        target = active;
      }
    }

    if (!target) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'No input focused for typing',
      });
      return;
    }

    // Save undo state
    this.undoTarget = target;
    this.undoValue = target.value;

    // Focus the target
    target.focus();

    if (mode === 'fill') {
      target.value = text;
    } else {
      // Insert at cursor position
      const start = target.selectionStart ?? target.value.length;
      target.value = target.value.slice(0, start) + text + target.value.slice(start);
      target.setSelectionRange(start + text.length, start + text.length);
    }

    // Trigger input events for React/Vue/etc.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));

    this.transport?.send('engine.event', {
      t: 'engine.done',
      ok: true,
      what: `typed "${text}" (${mode})`,
    });
  }

  /**
   * Undo: restore the last input value before a type operation.
   */
  public handleUndo(): void {
    if (this.undoTarget && this.undoTarget.isConnected) {
      this.undoTarget.value = this.undoValue;
      this.undoTarget.dispatchEvent(new Event('input', { bubbles: true }));
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: true,
        what: 'undo_type',
      });
    } else {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'nothing to undo',
      });
    }
    this.undoTarget = null;
    this.undoValue = '';
  }

  /**
   * Handle confirmation response for high-stakes actions.
   */
  public handleConfirm(actionId: string, accept: boolean): void {
    if (!this.pendingConfirm || this.pendingConfirm.id !== actionId) {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: `No pending action ${actionId}`,
      });
      return;
    }

    if (accept) {
      // Re-activate with confirmed=true
      this.handleActivate(
        this.pendingConfirm.id,
        this.pendingConfirm.matchId,
        this.pendingConfirm.verb,
        true
      );
    } else {
      this.transport?.send('engine.event', {
        t: 'engine.done',
        ok: false,
        what: 'action_cancelled',
      });
    }

    this.pendingConfirm = null;
  }

  public destroy(): void {
    this.indexer.destroy();
  }
}

export function startEngine(transport: Transport): Engine {
  return new Engine(transport);
}
